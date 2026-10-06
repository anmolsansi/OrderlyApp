from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from typing import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.cart_service import CartConflictError, put_cart
from app.database import get_connection
from app.identity import VerifiedGuest, verify_request_guest
from app.main import app
from app.models import (
    CartItemInput,
    CartItemModifier,
    CheckoutDetails,
    CheckoutQuoteRequest,
    OrderSubmissionRequest,
)
from app.order_service import (
    IdempotencyConflictError,
    OrderSubmissionResult,
    canonical_order_payload,
    normalize_idempotency_key,
    order_request_digest,
    submit_order,
)
from app.pricing import InvalidCheckoutError, quote_current_cart
from app.store import get_guest_cart_row


TEST_ORIGIN = "https://orderly.test"
TEST_SECRET = "st07-integration-secret-that-is-longer-than-32-bytes"
IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def checkout_environment(
    monkeypatch: pytest.MonkeyPatch,
    postgres_database_url: str,
    postgres_connection,
) -> Iterator[dict[str, str]]:
    suffix = uuid4().hex[:10]
    owner_id = f"guest-st07-{suffix}"
    other_owner_id = f"guest-st07-other-{suffix}"
    restaurant_id = f"st07-r-{suffix}"
    item_id = f"st07-i-{suffix}"

    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", TEST_SECRET)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", TEST_ORIGIN)

    now = datetime.now(timezone.utc)
    for guest_id in (owner_id, other_owner_id):
        postgres_connection.execute(
            """
            INSERT INTO guest_sessions (id, token_hash, created_at, expires_at)
            VALUES (%s, %s, %s, %s)
            """,
            (guest_id, f"hash-{guest_id}", now, now + timedelta(days=1)),
        )

    modifier_groups = [
        {
            "id": "size",
            "name": "Size",
            "type": "single",
            "required": True,
            "min_selected": 1,
            "max_selected": 1,
            "default_option_id": "large",
            "options": [
                {
                    "id": "large",
                    "name": "Large",
                    "price_delta_cents": 100,
                    "available": True,
                }
            ],
        }
    ]
    postgres_connection.execute(
        """
        INSERT INTO restaurants (
            id, name, cuisine, rating, delivery_minutes,
            delivery_fee_cents, image_emoji, is_open, tags
        ) VALUES (%s, %s, 'Synthetic', 4.8, '10-20 min', 199, 'R', TRUE, '[]'::jsonb)
        """,
        (restaurant_id, f"ST07 Restaurant {suffix}"),
    )
    postgres_connection.execute(
        """
        INSERT INTO menu_items (
            id, restaurant_id, name, description, price_cents,
            image_emoji, popular, available, modifier_groups
        ) VALUES (%s, %s, %s, 'Synthetic checkout item', 900, 'M', FALSE, TRUE, %s::jsonb)
        """,
        (item_id, restaurant_id, f"Canonical Meal {suffix}", json.dumps(modifier_groups)),
    )
    postgres_connection.commit()

    for guest_id, line_id in ((owner_id, "line-1"), (other_owner_id, "line-other")):
        put_cart(
            guest_id,
            0,
            [
                CartItemInput(
                    id=line_id,
                    restaurant_id=restaurant_id,
                    menu_item_id=item_id,
                    quantity=1,
                    modifiers=[CartItemModifier(group_id="size", option_ids=["large"])],
                    special_instructions="Synthetic fixture only",
                )
            ],
        )

    context = {
        "owner_id": owner_id,
        "other_owner_id": other_owner_id,
        "restaurant_id": restaurant_id,
        "item_id": item_id,
    }
    try:
        yield context
    finally:
        app.dependency_overrides.clear()
        postgres_connection.execute(
            "DELETE FROM order_idempotency WHERE owner_id IN (%s, %s)",
            (owner_id, other_owner_id),
        )
        postgres_connection.execute(
            "DELETE FROM guest_orders WHERE owner_id IN (%s, %s)",
            (owner_id, other_owner_id),
        )
        postgres_connection.execute(
            "DELETE FROM guest_carts WHERE owner_id IN (%s, %s)",
            (owner_id, other_owner_id),
        )
        postgres_connection.execute(
            "DELETE FROM guest_sessions WHERE id IN (%s, %s)",
            (owner_id, other_owner_id),
        )
        postgres_connection.execute("DELETE FROM menu_items WHERE id = %s", (item_id,))
        postgres_connection.execute("DELETE FROM restaurants WHERE id = %s", (restaurant_id,))
        postgres_connection.commit()


def checkout_details(*, instructions: str = "Synthetic fixture only") -> CheckoutDetails:
    return CheckoutDetails(
        name="Demo Visitor",
        phone="+1-555-0100",
        email="demo@example.test",
        street="100 Demo Street",
        apartment="5A",
        city="Demo City",
        state="CA",
        postal_code="94105",
        delivery_instructions=instructions,
        payment_method="mock",
        tip_cents=200,
    )


def submission_for(owner_id: str) -> OrderSubmissionRequest:
    quote = quote_current_cart(
        owner_id,
        CheckoutQuoteRequest(expected_revision=1, tip_cents=200, promotion_code="DEMO5"),
    )
    return OrderSubmissionRequest(
        expected_revision=1,
        catalog_fingerprint=quote.catalog_fingerprint,
        checkout=checkout_details(),
        promotion_code="DEMO5",
    )


def current_cart(owner_id: str):
    with get_connection() as conn:
        with conn.transaction():
            return get_guest_cart_row(conn, owner_id)


def c6_counts(owner_id: str) -> tuple[int, int]:
    with get_connection() as conn:
        order_count = conn.execute(
            "SELECT count(*) AS count FROM guest_orders WHERE owner_id = %s",
            (owner_id,),
        ).fetchone()["count"]
        key_count = conn.execute(
            "SELECT count(*) AS count FROM order_idempotency WHERE owner_id = %s",
            (owner_id,),
        ).fetchone()["count"]
    return int(order_count), int(key_count)


def static_submission() -> OrderSubmissionRequest:
    return OrderSubmissionRequest(
        expected_revision=1,
        catalog_fingerprint="A" * 64,
        checkout=checkout_details(),
        promotion_code="DEMO5",
    )


def concurrent_submit(
    owner_id: str,
    request: OrderSubmissionRequest,
    keys: list[str],
) -> list[OrderSubmissionResult | Exception]:
    barrier = Barrier(len(keys))

    def worker(key: str) -> OrderSubmissionResult | Exception:
        barrier.wait()
        try:
            return submit_order(owner_id, key, request)
        except Exception as exc:  # Test harness captures the competing outcome for assertions.
            return exc

    with ThreadPoolExecutor(max_workers=len(keys)) as executor:
        return list(executor.map(worker, keys))


def test_c6_request_digest_and_key_validation_are_canonical() -> None:
    request = static_submission()
    explicit_none = request.model_copy(update={"promotion_code": None})
    implicit_none = OrderSubmissionRequest(
        expected_revision=1,
        catalog_fingerprint="a" * 64,
        checkout=checkout_details(),
    )

    assert request.catalog_fingerprint == "a" * 64
    assert len(order_request_digest(request)) == 64
    assert canonical_order_payload(explicit_none) == canonical_order_payload(implicit_none)
    assert order_request_digest(explicit_none) == order_request_digest(implicit_none)
    assert order_request_digest(request) != order_request_digest(
        request.model_copy(update={"checkout": checkout_details(instructions="Changed")})
    )
    assert normalize_idempotency_key(IDEMPOTENCY_KEY.upper()) == IDEMPOTENCY_KEY

    for bad_key in ("", " not-a-uuid ", "x" * 65, "not-a-uuid"):
        with pytest.raises(InvalidCheckoutError) as exc_info:
            normalize_idempotency_key(bad_key)
        assert exc_info.value.fields == ["idempotency_key"]

    for payload in (
        {**request.model_dump(mode="json"), "expected_revision": -1},
        {**request.model_dump(mode="json"), "expected_revision": 1.5},
        {**request.model_dump(mode="json"), "catalog_fingerprint": "short"},
        {**request.model_dump(mode="json"), "unexpected": True},
    ):
        with pytest.raises(ValidationError):
            OrderSubmissionRequest.model_validate(payload)


def test_first_submit_is_201_and_exact_same_key_replay_is_200(
    checkout_environment: dict[str, str],
) -> None:
    owner_id = checkout_environment["owner_id"]
    payload = submission_for(owner_id)
    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(
        guest_id=owner_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    client = TestClient(app, base_url=TEST_ORIGIN)

    first = client.post(
        "/v1/orders",
        headers={"Origin": TEST_ORIGIN, "Idempotency-Key": IDEMPOTENCY_KEY},
        json=payload.model_dump(mode="json"),
    )
    assert first.status_code == 201, first.text
    assert first.json()["totals"]["total_cents"] == 1192

    replay = client.post(
        "/v1/orders",
        headers={"Origin": TEST_ORIGIN, "Idempotency-Key": IDEMPOTENCY_KEY},
        json=payload.model_dump(mode="json"),
    )
    assert replay.status_code == 200, replay.text
    assert replay.json() == first.json()

    cart = current_cart(owner_id)
    assert cart.revision == 2
    assert cart.items == []
    assert c6_counts(owner_id) == (1, 1)


def test_same_key_changed_payload_conflicts_and_key_scope_is_per_owner(
    checkout_environment: dict[str, str],
) -> None:
    owner_id = checkout_environment["owner_id"]
    other_owner_id = checkout_environment["other_owner_id"]
    request = submission_for(owner_id)

    first = submit_order(owner_id, IDEMPOTENCY_KEY, request)
    assert first.replayed is False

    changed = request.model_copy(
        update={"checkout": checkout_details(instructions="Changed after accepted checkout")}
    )
    with pytest.raises(IdempotencyConflictError):
        submit_order(owner_id, IDEMPOTENCY_KEY, changed)

    assert c6_counts(owner_id) == (1, 1)
    assert current_cart(owner_id).revision == 2

    other_request = submission_for(other_owner_id)
    other = submit_order(other_owner_id, IDEMPOTENCY_KEY, other_request)
    assert other.replayed is False
    assert other.receipt.id != first.receipt.id
    assert c6_counts(other_owner_id) == (1, 1)


def test_concurrent_identical_key_creates_at_most_one_order(
    checkout_environment: dict[str, str],
) -> None:
    owner_id = checkout_environment["owner_id"]
    request = submission_for(owner_id)
    outcomes = concurrent_submit(owner_id, request, [IDEMPOTENCY_KEY, IDEMPOTENCY_KEY])

    assert all(isinstance(outcome, OrderSubmissionResult) for outcome in outcomes)
    results = [outcome for outcome in outcomes if isinstance(outcome, OrderSubmissionResult)]
    assert sorted(result.replayed for result in results) == [False, True]
    assert len({result.receipt.id for result in results}) == 1
    assert c6_counts(owner_id) == (1, 1)
    assert current_cart(owner_id).revision == 2
    assert current_cart(owner_id).items == []


def test_different_keys_same_revision_yield_one_commit_and_one_cart_conflict(
    checkout_environment: dict[str, str],
) -> None:
    owner_id = checkout_environment["owner_id"]
    request = submission_for(owner_id)
    other_key = "22222222-2222-4222-8222-222222222222"
    outcomes = concurrent_submit(owner_id, request, [IDEMPOTENCY_KEY, other_key])

    successes = [outcome for outcome in outcomes if isinstance(outcome, OrderSubmissionResult)]
    conflicts = [outcome for outcome in outcomes if isinstance(outcome, CartConflictError)]
    assert len(successes) == 1
    assert successes[0].replayed is False
    assert len(conflicts) == 1
    assert conflicts[0].current_cart.revision == 2
    assert conflicts[0].current_cart.items == []
    assert c6_counts(owner_id) == (1, 1)
    assert current_cart(owner_id).revision == 2


@pytest.mark.parametrize(
    "failure_stage",
    ["insert_order_snapshot", "insert_order_idempotency_record", "update_guest_cart_row"],
)
def test_checkout_precommit_failure_rolls_back_all_writes(
    checkout_environment: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    failure_stage: str,
) -> None:
    import app.order_service as order_service

    owner_id = checkout_environment["owner_id"]
    request = submission_for(owner_id)

    def fail(*_args, **_kwargs):
        raise RuntimeError(f"injected failure at {failure_stage}")

    monkeypatch.setattr(order_service, failure_stage, fail)

    with pytest.raises(order_service.OrderStorageUnavailableError):
        order_service.submit_order(owner_id, IDEMPOTENCY_KEY, request)

    cart = current_cart(owner_id)
    assert cart.revision == 1
    assert len(cart.items) == 1
    assert c6_counts(owner_id) == (0, 0)


def test_unknown_outcome_retry_returns_stored_receipt_without_second_cart_clear(
    checkout_environment: dict[str, str],
) -> None:
    from app.store import get_order_snapshot_for_owner

    owner_id = checkout_environment["owner_id"]
    request = submission_for(owner_id)

    # Simulate a response that was lost after the database commit by intentionally
    # discarding the service return value, then reconstructing evidence from storage.
    submit_order(owner_id, IDEMPOTENCY_KEY, request)
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT order_id
            FROM order_idempotency
            WHERE owner_id = %s AND idempotency_key = %s
            """,
            (owner_id, IDEMPOTENCY_KEY),
        ).fetchone()
    assert row is not None
    stored = get_order_snapshot_for_owner(str(row["order_id"]), owner_id)
    assert stored is not None
    cart_after_commit = current_cart(owner_id)

    replay = submit_order(owner_id, IDEMPOTENCY_KEY, request)
    cart_after_replay = current_cart(owner_id)

    assert replay.replayed is True
    assert replay.receipt.model_dump(mode="json") == stored.model_dump(mode="json")
    assert cart_after_commit.revision == 2
    assert cart_after_replay.revision == 2
    assert cart_after_replay.items == []
    assert cart_after_replay.updated_at == cart_after_commit.updated_at
    assert c6_counts(owner_id) == (1, 1)


def test_stale_revision_catalog_change_and_empty_cart_never_create_partial_order(
    checkout_environment: dict[str, str],
) -> None:
    from app.cart_service import delete_cart
    from app.pricing import CatalogChangedError

    owner_id = checkout_environment["owner_id"]
    request = submission_for(owner_id)

    with pytest.raises(CartConflictError):
        submit_order(
            owner_id,
            IDEMPOTENCY_KEY,
            request.model_copy(update={"expected_revision": 0}),
        )
    assert c6_counts(owner_id) == (0, 0)
    assert current_cart(owner_id).revision == 1

    with pytest.raises(CatalogChangedError):
        submit_order(
            owner_id,
            IDEMPOTENCY_KEY,
            request.model_copy(update={"catalog_fingerprint": "0" * 64}),
        )
    assert c6_counts(owner_id) == (0, 0)
    assert current_cart(owner_id).revision == 1

    cleared = delete_cart(owner_id, 1)
    assert cleared.revision == 2
    assert cleared.items == []
    with pytest.raises(InvalidCheckoutError) as exc_info:
        submit_order(
            owner_id,
            IDEMPOTENCY_KEY,
            request.model_copy(update={"expected_revision": 2}),
        )
    assert exc_info.value.fields == ["cart"]
    assert c6_counts(owner_id) == (0, 0)
    assert current_cart(owner_id).revision == 2


def test_order_api_rejects_missing_and_malformed_idempotency_key(
    checkout_environment: dict[str, str],
) -> None:
    owner_id = checkout_environment["owner_id"]
    payload = submission_for(owner_id)
    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(
        guest_id=owner_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    client = TestClient(app, base_url=TEST_ORIGIN)

    missing = client.post(
        "/v1/orders",
        headers={"Origin": TEST_ORIGIN},
        json=payload.model_dump(mode="json"),
    )
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "invalid_checkout"
    assert missing.json()["error"]["fields"] == ["idempotency_key"]

    malformed = client.post(
        "/v1/orders",
        headers={"Origin": TEST_ORIGIN, "Idempotency-Key": "not-a-uuid"},
        json=payload.model_dump(mode="json"),
    )
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "invalid_checkout"
    assert malformed.json()["error"]["fields"] == ["idempotency_key"]
    assert c6_counts(owner_id) == (0, 0)


def test_checkout_fails_closed_without_postgres(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.order_service as order_service

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("ORDERLY_TEST_DATABASE_URL", raising=False)

    with pytest.raises(order_service.OrderStorageUnavailableError):
        order_service.submit_order("guest-no-postgres", IDEMPOTENCY_KEY, static_submission())


@pytest.mark.parametrize('stage', ['insert_order_snapshot', 'insert_order_idempotency_record', 'update_guest_cart_row'])
def test_failure_after_each_checkout_write_rolls_back_exact_accepted_state(checkout_environment, monkeypatch, stage):
    from app import order_service
    owner = checkout_environment['owner_id']
    request = submission_for(owner)
    before = current_cart(owner).model_dump(mode='json')
    write = getattr(order_service, stage)

    def fail_after_write(*args, **kwargs):
        write(*args, **kwargs)
        raise RuntimeError('synthetic failure after SQL write')

    monkeypatch.setattr(order_service, stage, fail_after_write)
    with pytest.raises(order_service.OrderStorageUnavailableError):
        submit_order(owner, IDEMPOTENCY_KEY, request)
    assert c6_counts(owner) == (0, 0)
    assert current_cart(owner).model_dump(mode='json') == before


def test_replay_preserves_newer_basket_and_original_receipt_after_catalog_change(checkout_environment, postgres_connection):
    owner = checkout_environment['owner_id']
    request = submission_for(owner)
    first = submit_order(owner, IDEMPOTENCY_KEY, request)
    postgres_connection.execute('UPDATE menu_items SET price_cents = 2500, name = %s WHERE id = %s', ('Changed catalog meal', checkout_environment['item_id']))
    postgres_connection.commit()
    next_cart = put_cart(owner, 2, [CartItemInput(id='next-line', restaurant_id=checkout_environment['restaurant_id'], menu_item_id=checkout_environment['item_id'], quantity=2, modifiers=[CartItemModifier(group_id='size', option_ids=['large'])])])
    replay = submit_order(owner, IDEMPOTENCY_KEY, request)
    assert replay.replayed
    assert replay.receipt.model_dump(mode='json') == first.receipt.model_dump(mode='json')
    assert current_cart(owner).revision == next_cart.revision == 3
    assert current_cart(owner).items == next_cart.items
    assert c6_counts(owner) == (1, 1)
