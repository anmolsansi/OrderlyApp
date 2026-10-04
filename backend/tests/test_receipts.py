from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.cart_service import put_cart
from app.database import get_connection
from app.identity import VerifiedGuest, verify_request_guest
from app.main import app
from app.models import CartItemInput, CartItemModifier, CheckoutDetails, CheckoutQuoteRequest
from app.pricing import (
    InvalidCheckoutError,
    PricingStorageUnavailableError,
    build_receipt_snapshot,
    calculate_mock_v1_totals,
    catalog_fingerprint,
    promotion_discount_cents,
    quote_current_cart,
    round_half_up_fraction,
)
from app.store import (
    get_catalog_snapshot,
    get_guest_cart_row,
    get_order_snapshot_for_owner,
    insert_order_snapshot,
    list_order_snapshots_for_owner,
)


TEST_ORIGIN = "https://orderly.test"
TEST_SECRET = "st06-integration-secret-that-is-longer-than-32-bytes"
CONTRACT_PATH = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "contracts" / "c5.json"


@pytest.fixture
def receipt_environment(
    monkeypatch: pytest.MonkeyPatch,
    postgres_database_url: str,
    postgres_connection,
) -> Iterator[dict[str, str]]:
    suffix = uuid4().hex[:10]
    owner_id = f"guest-st06-{suffix}"
    other_owner_id = f"guest-st06-other-{suffix}"
    restaurant_id = f"st06-r-{suffix}"
    item_id = f"st06-i-{suffix}"

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
        (restaurant_id, f"ST06 Restaurant {suffix}"),
    )
    postgres_connection.execute(
        """
        INSERT INTO menu_items (
            id, restaurant_id, name, description, price_cents,
            image_emoji, popular, available, modifier_groups
        ) VALUES (%s, %s, %s, 'Synthetic receipt item', 900, 'M', FALSE, TRUE, %s::jsonb)
        """,
        (item_id, restaurant_id, f"Canonical Meal {suffix}", json.dumps(modifier_groups)),
    )
    postgres_connection.commit()

    cart_line = CartItemInput(
        id="line-1",
        restaurant_id=restaurant_id,
        menu_item_id=item_id,
        quantity=1,
        modifiers=[CartItemModifier(group_id="size", option_ids=["large"])],
        special_instructions="Synthetic fixture only",
    )
    put_cart(owner_id, 0, [cart_line])

    context = {
        "owner_id": owner_id,
        "other_owner_id": other_owner_id,
        "restaurant_id": restaurant_id,
        "item_id": item_id,
        "canonical_name": f"Canonical Meal {suffix}",
    }
    try:
        yield context
    finally:
        app.dependency_overrides.clear()
        postgres_connection.execute("DELETE FROM guest_orders WHERE owner_id IN (%s, %s)", (owner_id, other_owner_id))
        postgres_connection.execute("DELETE FROM orders WHERE session_id IN (%s, %s)", (owner_id, other_owner_id))
        postgres_connection.execute("DELETE FROM guest_carts WHERE owner_id IN (%s, %s)", (owner_id, other_owner_id))
        postgres_connection.execute("DELETE FROM guest_sessions WHERE id IN (%s, %s)", (owner_id, other_owner_id))
        postgres_connection.execute("DELETE FROM menu_items WHERE id = %s", (item_id,))
        postgres_connection.execute("DELETE FROM restaurants WHERE id = %s", (restaurant_id,))
        postgres_connection.commit()


def checkout_details() -> CheckoutDetails:
    return CheckoutDetails(
        name="Demo Visitor",
        phone="+1-555-0100",
        email="demo@example.test",
        street="100 Demo Street",
        apartment="5A",
        city="Demo City",
        state="CA",
        postal_code="94105",
        delivery_instructions="Synthetic fixture only",
        payment_method="mock",
        tip_cents=200,
    )


def current_cart_and_catalog(owner_id: str):
    with get_connection() as conn:
        with conn.transaction():
            return get_guest_cart_row(conn, owner_id), get_catalog_snapshot(connection=conn)


def make_receipt(owner_id: str, *, created_at: datetime, order_id: str | None = None):
    cart, snapshot = current_cart_and_catalog(owner_id)
    return build_receipt_snapshot(
        order_id=order_id or str(uuid4()),
        created_at=created_at,
        snapshot=snapshot,
        items=cart.items,
        checkout=checkout_details(),
        promotion_code="DEMO5",
    )


def persist_receipt(owner_id: str, receipt) -> None:
    with get_connection() as conn:
        with conn.transaction():
            insert_order_snapshot(conn, owner_id, receipt)


def test_mock_v1_fixture_totals_are_exact(receipt_environment: dict[str, str]) -> None:
    fixture = json.loads(CONTRACT_PATH.read_text())
    cart, snapshot = current_cart_and_catalog(receipt_environment["owner_id"])

    totals = calculate_mock_v1_totals(
        snapshot,
        cart.items,
        tip_cents=200,
        promotion_code="DEMO5",
    )

    assert totals.model_dump(mode="json") == fixture["positive"]["quote"]["totals"]
    assert totals.total_cents == 1192


def test_money_rounding_promotion_and_tip_boundaries(receipt_environment: dict[str, str]) -> None:
    assert round_half_up_fraction(40 * 875, 10_000) == 4
    assert promotion_discount_cents(1000, "DEMO5") == 500
    assert promotion_discount_cents(300, "DEMO5") == 300
    assert promotion_discount_cents(1000, None) == 0

    with pytest.raises(InvalidCheckoutError):
        promotion_discount_cents(1000, "NOTREAL")

    valid = {"expected_revision": 1, "tip_cents": 0, "promotion_code": None}
    assert CheckoutQuoteRequest.model_validate(valid).tip_cents == 0
    assert CheckoutQuoteRequest.model_validate({**valid, "tip_cents": 10_000}).tip_cents == 10_000

    for invalid_tip in (-1, 10_001, 1.5, True, "200"):
        with pytest.raises(ValidationError):
            CheckoutQuoteRequest.model_validate({**valid, "tip_cents": invalid_tip})
    with pytest.raises(ValidationError):
        CheckoutQuoteRequest.model_validate({**valid, "promotion_code": "SAVE5"})


def test_catalog_fingerprint_covers_menu_policy_not_cart_only_fields(
    receipt_environment: dict[str, str],
    postgres_connection,
) -> None:
    owner_id = receipt_environment["owner_id"]
    cart, snapshot = current_cart_and_catalog(owner_id)
    original = catalog_fingerprint(snapshot, cart.items)

    changed_cart_only = cart.items[0].model_copy(
        update={
            "id": "different-line-id",
            "quantity": 2,
            "special_instructions": "Different cart-only note",
        }
    )
    assert catalog_fingerprint(snapshot, [changed_cart_only]) == original

    postgres_connection.execute(
        "UPDATE menu_items SET price_cents = price_cents + 1 WHERE id = %s",
        (receipt_environment["item_id"],),
    )
    postgres_connection.commit()
    _cart, changed_snapshot = current_cart_and_catalog(owner_id)
    assert catalog_fingerprint(changed_snapshot, cart.items) != original


def test_quote_uses_current_revision_and_maps_failures(receipt_environment: dict[str, str]) -> None:
    owner_id = receipt_environment["owner_id"]
    quote = quote_current_cart(
        owner_id,
        CheckoutQuoteRequest(expected_revision=1, tip_cents=200, promotion_code="DEMO5"),
    )
    assert quote.cart_revision == 1
    assert len(quote.catalog_fingerprint) == 64
    assert quote.totals.total_cents == 1192

    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(
        guest_id=owner_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    client = TestClient(app, base_url=TEST_ORIGIN)

    response = client.post(
        "/v1/checkout/quote",
        headers={"Origin": TEST_ORIGIN},
        json={"expected_revision": 1, "tip_cents": 200, "promotion_code": "DEMO5"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["totals"]["total_cents"] == 1192

    conflict = client.post(
        "/v1/checkout/quote",
        headers={"Origin": TEST_ORIGIN},
        json={"expected_revision": 0, "tip_cents": 200, "promotion_code": "DEMO5"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "cart_conflict"
    assert conflict.json()["current_cart"]["revision"] == 1

    invalid = client.post(
        "/v1/checkout/quote",
        headers={"Origin": TEST_ORIGIN},
        json={"expected_revision": 1, "tip_cents": -1, "promotion_code": "DEMO5"},
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "invalid_checkout"
    assert invalid.json()["error"]["fields"] == ["tip_cents"]

    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(
        guest_id=receipt_environment["other_owner_id"],
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    empty = client.post(
        "/v1/checkout/quote",
        headers={"Origin": TEST_ORIGIN},
        json={"expected_revision": 0, "tip_cents": 0},
    )
    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "invalid_checkout"
    assert empty.json()["error"]["fields"] == ["cart"]


def test_quote_fails_closed_without_postgres(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    with pytest.raises(PricingStorageUnavailableError):
        quote_current_cart(
            "guest-no-postgres",
            CheckoutQuoteRequest(expected_revision=0, tip_cents=0),
        )


def test_snapshot_roundtrip_is_immutable_after_catalog_change(
    receipt_environment: dict[str, str],
    postgres_connection,
) -> None:
    owner_id = receipt_environment["owner_id"]
    created_at = datetime(2030, 1, 1, tzinfo=timezone.utc)
    receipt = make_receipt(owner_id, created_at=created_at)
    persist_receipt(owner_id, receipt)

    first = get_order_snapshot_for_owner(receipt.id, owner_id)
    assert first is not None
    assert first.model_dump(mode="json") == receipt.model_dump(mode="json")
    assert first.checkout.model_dump(mode="json") == checkout_details().model_dump(mode="json")
    assert first.items[0].name == receipt_environment["canonical_name"]
    assert first.items[0].modifiers[0].name == "Size"
    assert first.items[0].modifiers[0].options[0].name == "Large"

    changed_groups = [
        {
            "id": "size",
            "name": "Renamed size",
            "type": "single",
            "required": True,
            "min_selected": 1,
            "max_selected": 1,
            "default_option_id": "large",
            "options": [
                {
                    "id": "large",
                    "name": "Renamed large",
                    "price_delta_cents": 700,
                    "available": True,
                }
            ],
        }
    ]
    postgres_connection.execute(
        "UPDATE menu_items SET name = 'Changed tomorrow', price_cents = 2500, modifier_groups = %s::jsonb WHERE id = %s",
        (json.dumps(changed_groups), receipt_environment["item_id"]),
    )
    postgres_connection.commit()

    reread = get_order_snapshot_for_owner(receipt.id, owner_id)
    assert reread is not None
    assert reread.model_dump(mode="json") == receipt.model_dump(mode="json")
    assert reread.totals.total_cents == 1192


def test_owner_scoped_order_reads_are_newest_first_and_cursor_bounded(
    receipt_environment: dict[str, str],
) -> None:
    owner_id = receipt_environment["owner_id"]
    other_owner_id = receipt_environment["other_owner_id"]
    base = datetime(2030, 1, 1, tzinfo=timezone.utc)

    receipts = [
        make_receipt(owner_id, created_at=base + timedelta(minutes=index)) for index in range(3)
    ]
    for receipt in receipts:
        persist_receipt(owner_id, receipt)

    foreign = make_receipt(owner_id, created_at=base + timedelta(minutes=10))
    persist_receipt(other_owner_id, foreign)

    first_page = list_order_snapshots_for_owner(owner_id, limit=2)
    assert [receipt.id for receipt in first_page] == [receipts[2].id, receipts[1].id]
    second_page = list_order_snapshots_for_owner(owner_id, cursor=receipts[1].id, limit=2)
    assert [receipt.id for receipt in second_page] == [receipts[0].id]
    assert get_order_snapshot_for_owner(foreign.id, owner_id) is None
    with pytest.raises(ValueError):
        list_order_snapshots_for_owner(owner_id, limit=51)

    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(
        guest_id=owner_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    client = TestClient(app, base_url=TEST_ORIGIN)
    listed = client.get("/v1/orders?limit=2")
    assert listed.status_code == 200
    assert [receipt["id"] for receipt in listed.json()] == [receipts[2].id, receipts[1].id]

    over_limit = client.get("/v1/orders?limit=51")
    assert over_limit.status_code == 422

    missing = client.get(f"/v1/orders/{foreign.id}")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "order_not_found"
    assert missing.json()["error"]["message"] == "Order not found"

    malformed = client.get("/v1/orders/ORD-LEGACY-NOT-A-UUID")
    assert malformed.status_code == 404
    assert malformed.json()["error"]["code"] == "order_not_found"

    foreign_cursor = client.get(f"/v1/orders?cursor={foreign.id}")
    assert foreign_cursor.status_code == 422
    assert foreign_cursor.json()["error"]["code"] == "invalid_cursor"


def test_legacy_incomplete_order_is_preserved_but_not_exposed_as_c5_receipt(
    receipt_environment: dict[str, str],
    postgres_connection,
) -> None:
    owner_id = receipt_environment["owner_id"]
    cart, _snapshot = current_cart_and_catalog(owner_id)
    postgres_connection.execute(
        """
        INSERT INTO orders (id, session_id, cart_items, subtotal_cents, status)
        VALUES (%s, %s, %s::jsonb, %s, 'Placed')
        """,
        (
            "ORD-LEGACY-ST06",
            owner_id,
            json.dumps([item.model_dump(mode="json") for item in cart.items]),
            1000,
        ),
    )
    postgres_connection.commit()

    assert list_order_snapshots_for_owner(owner_id) == []
    assert get_order_snapshot_for_owner("ORD-LEGACY-ST06", owner_id) is None
    legacy_row = postgres_connection.execute(
        "SELECT id, subtotal_cents FROM orders WHERE id = 'ORD-LEGACY-ST06'"
    ).fetchone()
    assert legacy_row == ("ORD-LEGACY-ST06", 1000)
