from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .database import get_connection, postgres_available
from .models import Cart, CartItem, MenuItem, Order, Restaurant
from .redis_store import cart_key, redis_client

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
RESTAURANTS_FILE = DATA_DIR / "restaurants.json"
CARTS_FILE = DATA_DIR / "carts.json"
ORDERS_FILE = DATA_DIR / "orders.json"


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any) -> Any:
    ensure_data_dir()
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return default


def write_json(path: Path, payload: Any) -> None:
    ensure_data_dir()
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2, default=str))
    temp_path.replace(path)


def _restaurant_from_row(row: Dict[str, Any], menu_items: List[MenuItem]) -> Restaurant:
    return Restaurant(
        id=row["id"],
        name=row["name"],
        cuisine=row["cuisine"],
        rating=float(row["rating"]),
        delivery_minutes=row["delivery_minutes"],
        delivery_fee_cents=row["delivery_fee_cents"],
        image_emoji=row["image_emoji"],
        tags=row.get("tags") or [],
        menu=menu_items,
    )


def _menu_item_from_row(row: Dict[str, Any]) -> MenuItem:
    return MenuItem(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        price_cents=row["price_cents"],
        image_emoji=row["image_emoji"],
        popular=row.get("popular", False),
        modifier_groups=row.get("modifier_groups") or [],
    )


def list_restaurants() -> List[Restaurant]:
    if postgres_available():
        with get_connection() as conn:
            restaurants = conn.execute("SELECT * FROM restaurants ORDER BY name").fetchall()
            menu_rows = conn.execute("SELECT * FROM menu_items ORDER BY restaurant_id, name").fetchall()
        grouped: Dict[str, List[MenuItem]] = {}
        for row in menu_rows:
            grouped.setdefault(row["restaurant_id"], []).append(_menu_item_from_row(row))
        return [_restaurant_from_row(row, grouped.get(row["id"], [])) for row in restaurants]

    return [Restaurant(**item) for item in read_json(RESTAURANTS_FILE, [])]


def get_restaurant(restaurant_id: str) -> Optional[Restaurant]:
    return next((restaurant for restaurant in list_restaurants() if restaurant.id == restaurant_id), None)


def write_restaurants(restaurants: List[Restaurant]) -> None:
    if postgres_available():
        with get_connection() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM menu_items")
                conn.execute("DELETE FROM restaurants")
                for restaurant in restaurants:
                    conn.execute(
                        """
                        INSERT INTO restaurants (id, name, cuisine, rating, delivery_minutes, delivery_fee_cents, image_emoji, tags)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (
                            restaurant.id,
                            restaurant.name,
                            restaurant.cuisine,
                            restaurant.rating,
                            restaurant.delivery_minutes,
                            restaurant.delivery_fee_cents,
                            restaurant.image_emoji,
                            json.dumps(restaurant.tags),
                        ),
                    )
                    for item in restaurant.menu:
                        conn.execute(
                            """
                            INSERT INTO menu_items (id, restaurant_id, name, description, price_cents, image_emoji, popular, modifier_groups)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                            """,
                            (
                                item.id,
                                restaurant.id,
                                item.name,
                                item.description,
                                item.price_cents,
                                item.image_emoji,
                                item.popular,
                                json.dumps([group.model_dump(mode="json") for group in item.modifier_groups]),
                            ),
                        )
        return

    write_json(RESTAURANTS_FILE, [restaurant.model_dump(mode="json") for restaurant in restaurants])


def get_cart(session_id: str) -> Cart:
    client = redis_client()
    if client is not None:
        payload = client.get(cart_key(session_id))
        if payload:
            return Cart(**json.loads(payload))
        return Cart(session_id=session_id, items=[])

    if postgres_available():
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM carts WHERE session_id = %s", (session_id,)).fetchone()
        if row:
            return Cart(session_id=row["session_id"], items=row["items"], updated_at=row["updated_at"])
        return Cart(session_id=session_id, items=[])

    carts: Dict[str, Any] = read_json(CARTS_FILE, {})
    if session_id not in carts:
        return Cart(session_id=session_id, items=[])
    return Cart(**carts[session_id])


def write_cart(session_id: str, items: List[CartItem]) -> Cart:
    cart = Cart(session_id=session_id, items=items)
    client = redis_client()
    if client is not None:
        client.setex(cart_key(session_id), 60 * 60 * 24, json.dumps(cart.model_dump(mode="json"), default=str))
        return cart

    if postgres_available():
        with get_connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO carts (session_id, items, updated_at)
                    VALUES (%s, %s::jsonb, %s)
                    ON CONFLICT (session_id)
                    DO UPDATE SET items = EXCLUDED.items, updated_at = EXCLUDED.updated_at
                    """,
                    (
                        session_id,
                        json.dumps([item.model_dump(mode="json") for item in items]),
                        cart.updated_at,
                    ),
                )
        return cart

    carts: Dict[str, Any] = read_json(CARTS_FILE, {})
    carts[session_id] = cart.model_dump(mode="json")
    write_json(CARTS_FILE, carts)
    return cart


def clear_cart(session_id: str) -> Cart:
    client = redis_client()
    if client is not None:
        client.delete(cart_key(session_id))
        return Cart(session_id=session_id, items=[])

    if postgres_available():
        with get_connection() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM carts WHERE session_id = %s", (session_id,))
        return Cart(session_id=session_id, items=[])

    return write_cart(session_id, [])


def list_orders() -> List[Order]:
    if postgres_available():
        with get_connection() as conn:
            rows = conn.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
        return [Order(**_order_row_to_payload(row)) for row in rows]

    return [Order(**item) for item in read_json(ORDERS_FILE, [])]


def create_order(session_id: str, cart_items: List[CartItem], subtotal_cents: int) -> Order:
    order = Order(
        id=f"ORD-{uuid4().hex[:8].upper()}",
        session_id=session_id,
        cart_items=cart_items,
        subtotal_cents=subtotal_cents,
    )

    if postgres_available():
        with get_connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO orders (id, session_id, cart_items, subtotal_cents, status, created_at)
                    VALUES (%s, %s, %s::jsonb, %s, %s, %s)
                    """,
                    (
                        order.id,
                        order.session_id,
                        json.dumps([item.model_dump(mode="json") for item in order.cart_items]),
                        order.subtotal_cents,
                        order.status,
                        order.created_at,
                    ),
                )
        clear_cart(session_id)
        return order

    orders = list_orders()
    orders.append(order)
    write_json(ORDERS_FILE, [item.model_dump(mode="json") for item in orders])
    clear_cart(session_id)
    return order


def get_order(order_id: str) -> Optional[Order]:
    return next((order for order in list_orders() if order.id == order_id), None)


def _order_row_to_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "cart_items": row["cart_items"],
        "subtotal_cents": row["subtotal_cents"],
        "status": row["status"],
        "created_at": row["created_at"],
    }
