from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.cart_service import put_cart
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
