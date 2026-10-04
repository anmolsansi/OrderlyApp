from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main as main_module
from app import store
from app.catalog import CatalogSnapshot, canonicalize_cart_items, search_snapshot
from app.identity import VerifiedGuest, verify_request_guest
from app.models import (
    CartItem,
    MenuItem,
    ModifierGroup,
    ModifierOption,
    Restaurant,
)


def option(option_id: str, *, available: bool = True, delta: int = 0) -> ModifierOption:
    return ModifierOption(
        id=option_id,
        name=option_id.replace("-", " ").title(),
        price_delta_cents=delta,
        available=available,
    )


def restaurant(
    restaurant_id: str = "r1",
    *,
    is_open: bool = True,
    item_available: bool = True,
) -> Restaurant:
    return Restaurant(
        id=restaurant_id,
        name=f"Restaurant {restaurant_id}",
        cuisine="Pizza",
        rating=4.5,
        delivery_minutes="20-30 min",
        delivery_fee_cents=199,
        image_emoji="R",
        is_open=is_open,
        tags=["Popular"],
        menu=[
            MenuItem(
                id=f"{restaurant_id}-item",
                name="Canonical Meal",
                description="Synthetic catalog meal",
                price_cents=1000,
                image_emoji="M",
                popular=True,
                available=item_available,
                modifier_groups=[
                    ModifierGroup(
                        id="size",
                        name="Size",
                        type="single",
                        required=True,
                        options=[option("small"), option("large", delta=300)],
                    ),
                    ModifierGroup(
                        id="extras",
                        name="Extras",
                        type="multiple",
                        min_selected=0,
                        max_selected=2,
                        options=[
                            option("sauce", delta=100),
                            option("cheese", delta=150),
                            option("sold-out", available=False, delta=200),
                        ],
                    ),
                ],
            )
        ],
    )


def snapshot(*restaurants: Restaurant) -> CatalogSnapshot:
    return CatalogSnapshot.build(restaurants or (restaurant(),))


def cart_item(
    *,
    line_id: str = "line-1",
    restaurant_id: str = "r1",
    menu_item_id: str = "r1-item",
    name: str = "Spoofed client name",
    base_price_cents: int = 1,
    quantity: int = 1,
    modifiers: list[dict[str, Any]] | None = None,
    special_instructions: str | None = None,
) -> CartItem:
    return CartItem(
        id=line_id,
        restaurant_id=restaurant_id,
        menu_item_id=menu_item_id,
        name=name,
        base_price_cents=base_price_cents,
        quantity=quantity,
        modifiers=modifiers if modifiers is not None else [
            {"group_id": "size", "option_ids": ["small"]}
        ],
        special_instructions=special_instructions,
    )


def test_required_single_group_gets_explicit_bounds_and_default() -> None:
    catalog = snapshot()
    group = catalog.menu_item("r1", "r1-item").modifier_groups[0]  # type: ignore[union-attr]

    assert group.min_selected == 1
    assert group.max_selected == 1
    assert group.default_option_id == "small"


@pytest.mark.parametrize("quantity", [1, 10])
def test_cart_quantity_accepts_contract_boundaries(quantity: int) -> None:
    assert cart_item(quantity=quantity).quantity == quantity


@pytest.mark.parametrize("quantity", [0, 11, 1.5])
def test_cart_quantity_rejects_out_of_range_or_fractional_values(quantity: Any) -> None:
    payload = cart_item().model_dump(mode="json")
    payload["quantity"] = quantity

    with pytest.raises(ValidationError):
        CartItem.model_validate(payload)


def test_special_instructions_are_bounded() -> None:
    payload = cart_item().model_dump(mode="json")
    payload["special_instructions"] = "x" * 501

    with pytest.raises(ValidationError):
        CartItem.model_validate(payload)


def test_spoofed_name_and_price_are_replaced_by_canonical_values() -> None:
    result = canonicalize_cart_items([cart_item()], snapshot())

    assert result.ok is True
    assert result.items[0].name == "Canonical Meal"
    assert result.items[0].base_price_cents == 1000
    assert result.items[0].modifiers[0].option_ids == ["small"]


def test_duplicate_line_ids_have_stable_field_path() -> None:
    result = canonicalize_cart_items(
        [cart_item(), cart_item(line_id="line-1")],
        snapshot(),
    )

    assert "items.1.id" in result.fields


def test_mixed_restaurants_have_stable_field_path() -> None:
    result = canonicalize_cart_items(
        [
            cart_item(),
            cart_item(
                line_id="line-2",
                restaurant_id="r2",
                menu_item_id="r2-item",
            ),
        ],
        snapshot(restaurant("r1"), restaurant("r2")),
    )

    assert "items.1.restaurant_id" in result.fields


@pytest.mark.parametrize(
    ("catalog", "item", "expected_field"),
    [
        (snapshot(restaurant(is_open=False)), cart_item(), "items.0.restaurant_id"),
        (snapshot(restaurant(item_available=False)), cart_item(), "items.0.menu_item_id"),
        (snapshot(), cart_item(menu_item_id="missing"), "items.0.menu_item_id"),
        (snapshot(), cart_item(restaurant_id="missing", menu_item_id="missing"), "items.0.restaurant_id"),
    ],
)
def test_closed_unknown_and_unavailable_catalog_choices_are_rejected(
    catalog: CatalogSnapshot,
    item: CartItem,
    expected_field: str,
) -> None:
    result = canonicalize_cart_items([item], catalog)

    assert expected_field in result.fields


@pytest.mark.parametrize(
    ("modifiers", "expected_field"),
    [
        (
            [
                {"group_id": "size", "option_ids": ["small"]},
                {"group_id": "size", "option_ids": ["large"]},
            ],
            "items.0.modifiers.1.group_id",
        ),
        (
            [{"group_id": "unknown", "option_ids": ["x"]}],
            "items.0.modifiers.0.group_id",
        ),
        (
            [{"group_id": "size", "option_ids": ["small", "small"]}],
            "items.0.modifiers.0.option_ids.1",
        ),
        (
            [{"group_id": "size", "option_ids": ["unknown"]}],
            "items.0.modifiers.0.option_ids.0",
        ),
        (
            [
                {"group_id": "size", "option_ids": ["small"]},
                {"group_id": "extras", "option_ids": ["sold-out"]},
            ],
            "items.0.modifiers.1.option_ids.0",
        ),
    ],
)
def test_duplicate_unknown_and_unavailable_modifiers_use_stable_paths(
    modifiers: list[dict[str, Any]],
    expected_field: str,
) -> None:
    result = canonicalize_cart_items([cart_item(modifiers=modifiers)], snapshot())

    assert expected_field in result.fields


def test_required_single_selection_and_multiple_max_are_enforced() -> None:
    missing_required = canonicalize_cart_items([cart_item(modifiers=[])], snapshot())
    too_many_extras = canonicalize_cart_items(
        [
            cart_item(
                modifiers=[
                    {"group_id": "size", "option_ids": ["small"]},
                    {"group_id": "extras", "option_ids": ["sauce", "cheese", "sold-out"]},
                ]
            )
        ],
        snapshot(),
    )

    assert "items.0.modifiers" in missing_required.fields
    assert "items.0.modifiers.1.option_ids" in too_many_extras.fields


def test_search_preserves_query_cuisine_sort_and_explicit_open_filter() -> None:
    open_restaurant = restaurant("open", is_open=True)
    open_restaurant = open_restaurant.model_copy(
        update={"name": "Alpha Pizza", "rating": 4.2, "delivery_fee_cents": 299}
    )
    closed_restaurant = restaurant("closed", is_open=False)
    closed_restaurant = closed_restaurant.model_copy(
        update={"name": "Beta Pizza", "rating": 4.9, "delivery_fee_cents": 99}
    )
    catalog = snapshot(open_restaurant, closed_restaurant)

    assert [item.id for item in search_snapshot(catalog, query="alpha")] == ["open"]
    assert [item.id for item in search_snapshot(catalog, cuisine="Pizza")] == ["open", "closed"]
    assert [item.id for item in search_snapshot(catalog, sort="rating")] == ["closed", "open"]
    assert [item.id for item in search_snapshot(catalog, sort="fee")] == ["closed", "open"]
    assert [item.id for item in search_snapshot(catalog, open_now=True)] == ["open"]


def test_store_search_loads_catalog_once(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    def load_once() -> list[Restaurant]:
        nonlocal calls
        calls += 1
        return [restaurant()]

    monkeypatch.setattr(store, "list_restaurants", load_once)

    result = store.search_restaurants(query="canonical")

    assert calls == 1
    assert [item.id for item in result] == ["r1"]


def _configure_route_test(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    catalog: CatalogSnapshot,
) -> TestClient:
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", "st04-test-secret-value-that-is-longer-than-32-bytes")
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", "http://127.0.0.1:3200")
    monkeypatch.setenv("ORDERLY_FORCE_JSON_STORE", "1")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setattr(store, "CARTS_FILE", tmp_path / "carts.json")
    monkeypatch.setattr(main_module, "get_catalog_snapshot", lambda: catalog)
    main_module.app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(
        guest_id="guest-st04",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    return TestClient(main_module.app)


def test_cart_route_persists_canonical_values_not_client_spoofs(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    client = _configure_route_test(monkeypatch, tmp_path, snapshot())
    try:
        response = client.put(
            "/v1/cart",
            headers={"Origin": "http://127.0.0.1:3200"},
            json={"items": [cart_item().model_dump(mode="json")]},
        )
    finally:
        main_module.app.dependency_overrides.clear()

    assert response.status_code == 200
    saved = json.loads((tmp_path / "carts.json").read_text())
    persisted_item = saved["guest-st04"]["items"][0]
    assert persisted_item["name"] == "Canonical Meal"
    assert persisted_item["base_price_cents"] == 1000


def test_invalid_cart_route_has_no_write_side_effect(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    client = _configure_route_test(monkeypatch, tmp_path, snapshot())
    payload = cart_item(
        modifiers=[{"group_id": "size", "option_ids": ["missing"]}]
    ).model_dump(mode="json")
    try:
        response = client.put(
            "/v1/cart",
            headers={"Origin": "http://127.0.0.1:3200"},
            json={"items": [payload]},
        )
    finally:
        main_module.app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_cart"
    assert response.json()["error"]["fields"] == ["items.0.modifiers.0.option_ids.0"]
    assert not (tmp_path / "carts.json").exists()


def test_restaurant_not_found_uses_c3_error_code(
    monkeypatch: pytest.MonkeyPatch,
    isolated_environment: None,
) -> None:
    monkeypatch.setattr(main_module, "get_catalog_snapshot", lambda: snapshot())
    response = TestClient(main_module.app).get("/v1/restaurants/missing")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "restaurant_not_found"
    assert response.json()["error"]["fields"] == []


def test_postgres_catalog_search_reads_authoritative_availability(
    monkeypatch: pytest.MonkeyPatch,
    postgres_database_url: str,
) -> None:
    suffix = uuid4().hex[:8]
    open_id = f"st04-open-{suffix}"
    closed_id = f"st04-closed-{suffix}"
    open_item_id = f"st04-item-{suffix}"

    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)

    from app.database import get_connection

    try:
        with get_connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO restaurants (
                        id, name, cuisine, rating, delivery_minutes,
                        delivery_fee_cents, image_emoji, is_open, tags
                    ) VALUES (%s, %s, 'Synthetic', 4.7, '10-20 min', 123, 'R', TRUE, '[]'::jsonb)
                    """,
                    (open_id, f"ST04 Open {suffix}"),
                )
                conn.execute(
                    """
                    INSERT INTO restaurants (
                        id, name, cuisine, rating, delivery_minutes,
                        delivery_fee_cents, image_emoji, is_open, tags
                    ) VALUES (%s, %s, 'Synthetic', 4.9, '10-20 min', 99, 'R', FALSE, '[]'::jsonb)
                    """,
                    (closed_id, f"ST04 Closed {suffix}"),
                )
                conn.execute(
                    """
                    INSERT INTO menu_items (
                        id, restaurant_id, name, description, price_cents,
                        image_emoji, popular, available, modifier_groups
                    ) VALUES (%s, %s, %s, 'Synthetic', 777, 'M', FALSE, TRUE, '[]'::jsonb)
                    """,
                    (open_item_id, open_id, f"Searchable {suffix}"),
                )

        results = store.search_restaurants(query=f"Searchable {suffix}", open_now=True)
        assert [item.id for item in results] == [open_id]
        assert results[0].menu[0].available is True
        assert results[0].is_open is True
    finally:
        with get_connection() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM menu_items WHERE id = %s", (open_item_id,))
                conn.execute("DELETE FROM restaurants WHERE id IN (%s, %s)", (open_id, closed_id))
