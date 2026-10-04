from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .catalog import (
    CatalogConfigurationError,
    CatalogSnapshot,
    CatalogValidationResult,
    calculate_canonical_item_unit_cents,
    canonicalize_cart_items,
    search_snapshot,
)
from .database import database_url, get_connection, postgres_available
from .models import (
    Cart,
    CartItem,
    CartItemInput,
    CartPricingResponse,
    MenuItem,
    Order,
    ReceiptResponse,
    Restaurant,
    RevisionedCart,
)
from .redis_store import cart_key, redis_client

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
RESTAURANTS_FILE = DATA_DIR / "restaurants.json"
CARTS_FILE = DATA_DIR / "carts.json"
ORDERS_FILE = DATA_DIR / "orders.json"


class ReceiptStorageUnavailableError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Receipt storage is unavailable")


class InvalidReceiptCursorError(ValueError):
    def __init__(self) -> None:
        super().__init__("Receipt cursor is invalid")


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
        is_open=row.get("is_open", True),
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
        available=row.get("available", True),
        modifier_groups=row.get("modifier_groups") or [],
    )


def _catalog_uses_postgres() -> bool:
    if database_url():
        return True
    if os.getenv("ORDERLY_FORCE_JSON_STORE") == "1":
        return False
    if os.getenv("ORDERLY_DATA_MODE", "").strip().lower() == "api":
        raise CatalogConfigurationError("DATABASE_URL is required for the API-mode canonical catalog")
    return False


def _restaurants_from_connection(conn: Any) -> List[Restaurant]:
    restaurants = conn.execute("SELECT * FROM restaurants ORDER BY name").fetchall()
    menu_rows = conn.execute("SELECT * FROM menu_items ORDER BY restaurant_id, name").fetchall()
    grouped: Dict[str, List[MenuItem]] = {}
    for row in menu_rows:
        grouped.setdefault(row["restaurant_id"], []).append(_menu_item_from_row(row))
    return [_restaurant_from_row(row, grouped.get(row["id"], [])) for row in restaurants]


def list_restaurants(connection: Any | None = None) -> List[Restaurant]:
    if connection is not None:
        return _restaurants_from_connection(connection)

    if _catalog_uses_postgres():
        try:
            with get_connection() as conn:
                return _restaurants_from_connection(conn)
        except CatalogConfigurationError:
            raise
        except Exception as exc:
            raise CatalogConfigurationError("Canonical catalog storage is unavailable") from exc

    return [Restaurant(**item) for item in read_json(RESTAURANTS_FILE, [])]


def get_catalog_snapshot(connection: Any | None = None) -> CatalogSnapshot:
    """Read and normalize the catalog once for one logical operation."""
    try:
        return CatalogSnapshot.build(list_restaurants(connection=connection))
    except CatalogConfigurationError:
        raise
    except Exception as exc:
        if connection is not None:
            raise
        raise CatalogConfigurationError("Canonical catalog data is invalid") from exc


def search_restaurants(
    query: str = "",
    cuisine: str = "",
    sort: str = "recommended",
    open_now: bool = False,
    snapshot: Optional[CatalogSnapshot] = None,
) -> List[Restaurant]:
    catalog = snapshot or get_catalog_snapshot()
    return search_snapshot(catalog, query=query, cuisine=cuisine, sort=sort, open_now=open_now)


def get_restaurant(
    restaurant_id: str,
    snapshot: Optional[CatalogSnapshot] = None,
) -> Optional[Restaurant]:
    catalog = snapshot or get_catalog_snapshot()
    return catalog.restaurant(restaurant_id)


def get_menu_item(
    restaurant_id: str,
    menu_item_id: str,
    snapshot: Optional[CatalogSnapshot] = None,
) -> Optional[MenuItem]:
    catalog = snapshot or get_catalog_snapshot()
    return catalog.menu_item(restaurant_id, menu_item_id)


def calculate_item_total(
    item: MenuItem,
    cart_item: CartItem,
    snapshot: Optional[CatalogSnapshot] = None,
) -> int:
    catalog = snapshot or get_catalog_snapshot()
    canonical_item = catalog.menu_item(cart_item.restaurant_id, item.id)
    if canonical_item is None:
        raise ValueError("Menu item is not present in canonical catalog")
    return calculate_canonical_item_unit_cents(catalog, cart_item)


def validate_cart_items(
    cart_items: List[CartItem],
    snapshot: Optional[CatalogSnapshot] = None,
) -> CatalogValidationResult:
    catalog = snapshot or get_catalog_snapshot()
    return canonicalize_cart_items(cart_items, catalog)


def validate_cart_input_items(
    cart_items: List[CartItemInput],
    snapshot: CatalogSnapshot,
) -> CatalogValidationResult:
    """Adapt C4 write inputs to the existing C3 validator without trusting client labels/prices."""
    validation_items: List[CartItem] = []
    for item in cart_items:
        canonical_item = snapshot.menu_item(item.restaurant_id, item.menu_item_id)
        validation_items.append(
            CartItem(
                id=item.id,
                restaurant_id=item.restaurant_id,
                menu_item_id=item.menu_item_id,
                name=canonical_item.name if canonical_item is not None else "",
                quantity=item.quantity,
                base_price_cents=canonical_item.price_cents if canonical_item is not None else 1,
                modifiers=item.modifiers,
                special_instructions=item.special_instructions,
            )
        )
    return canonicalize_cart_items(validation_items, snapshot)


def calculate_cart_pricing(
    cart_items: List[CartItem],
    restaurant_id: Optional[str] = None,
    discount_cents: int = 0,
    tip_cents: int = 0,
    snapshot: Optional[CatalogSnapshot] = None,
) -> CartPricingResponse:
    catalog = snapshot or get_catalog_snapshot()
    subtotal_cents = sum(
        calculate_canonical_item_unit_cents(catalog, cart_item) * cart_item.quantity
        for cart_item in cart_items
    )

    resolved_restaurant_id = restaurant_id or (cart_items[0].restaurant_id if cart_items else "")
    restaurant = catalog.restaurant(resolved_restaurant_id)
    delivery_fee_cents = restaurant.delivery_fee_cents if restaurant and subtotal_cents > 0 else 0
    service_fee_cents = 249 if subtotal_cents > 0 else 0
    taxable_cents = max(subtotal_cents - discount_cents, 0)
    tax_cents = round(taxable_cents * 0.0875)
    total_cents = taxable_cents + delivery_fee_cents + service_fee_cents + tax_cents + tip_cents
    return CartPricingResponse(
        subtotal_cents=subtotal_cents,
        discount_cents=discount_cents,
        delivery_fee_cents=delivery_fee_cents,
        service_fee_cents=service_fee_cents,
        tax_cents=tax_cents,
        tip_cents=tip_cents,
        total_cents=total_cents,
    )


def write_restaurants(restaurants: List[Restaurant]) -> None:
    normalized_restaurants = CatalogSnapshot.build(restaurants).restaurants

    if _catalog_uses_postgres():
        with get_connection() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM menu_items")
                conn.execute("DELETE FROM restaurants")
                for restaurant in normalized_restaurants:
                    conn.execute(
                        """
                        INSERT INTO restaurants (
                            id, name, cuisine, rating, delivery_minutes,
                            delivery_fee_cents, image_emoji, is_open, tags
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (
                            restaurant.id,
                            restaurant.name,
                            restaurant.cuisine,
                            restaurant.rating,
                            restaurant.delivery_minutes,
                            restaurant.delivery_fee_cents,
                            restaurant.image_emoji,
                            restaurant.is_open,
                            json.dumps(restaurant.tags),
                        ),
                    )
                    for item in restaurant.menu:
                        conn.execute(
                            """
                            INSERT INTO menu_items (
                                id, restaurant_id, name, description, price_cents,
                                image_emoji, popular, available, modifier_groups
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                            """,
                            (
                                item.id,
                                restaurant.id,
                                item.name,
                                item.description,
                                item.price_cents,
                                item.image_emoji,
                                item.popular,
                                item.available,
                                json.dumps([group.model_dump(mode="json") for group in item.modifier_groups]),
                            ),
                        )
        return

    write_json(
        RESTAURANTS_FILE,
        [restaurant.model_dump(mode="json") for restaurant in normalized_restaurants],
    )


def ensure_guest_cart_row(conn: Any, owner_id: str) -> None:
    conn.execute(
        """
        INSERT INTO guest_carts (owner_id, revision, items)
        VALUES (%s, 0, '[]'::jsonb)
        ON CONFLICT (owner_id) DO NOTHING
        """,
        (owner_id,),
    )


def get_guest_cart_row(conn: Any, owner_id: str, *, for_update: bool = False) -> RevisionedCart:
    ensure_guest_cart_row(conn, owner_id)
    query = "SELECT owner_id, revision, items, updated_at FROM guest_carts WHERE owner_id = %s"
    if for_update:
        query += " FOR UPDATE"
    row = conn.execute(query, (owner_id,)).fetchone()
    if row is None:
        raise RuntimeError("guest cart row could not be established")
    return RevisionedCart(
        owner_id=row["owner_id"],
        revision=int(row["revision"]),
        items=[CartItem.model_validate(item) for item in row["items"]],
        updated_at=row["updated_at"],
    )


def update_guest_cart_row(
    conn: Any,
    owner_id: str,
    next_revision: int,
    items: List[CartItem],
) -> RevisionedCart:
    row = conn.execute(
        """
        UPDATE guest_carts
        SET revision = %s, items = %s::jsonb, updated_at = now()
        WHERE owner_id = %s
        RETURNING owner_id, revision, items, updated_at
        """,
        (
            next_revision,
            json.dumps([item.model_dump(mode="json") for item in items]),
            owner_id,
        ),
    ).fetchone()
    if row is None:
        raise RuntimeError("guest cart row disappeared during update")
    return RevisionedCart(
        owner_id=row["owner_id"],
        revision=int(row["revision"]),
        items=[CartItem.model_validate(item) for item in row["items"]],
        updated_at=row["updated_at"],
    )


def insert_order_snapshot(conn: Any, owner_id: str, receipt: ReceiptResponse) -> ReceiptResponse:
    """Insert one immutable C5 receipt inside the caller's transaction."""
    conn.execute(
        """
        INSERT INTO guest_orders (id, owner_id, snapshot, created_at)
        VALUES (%s::uuid, %s, %s::jsonb, %s)
        """,
        (
            receipt.id,
            owner_id,
            json.dumps(receipt.model_dump(mode="json")),
            receipt.created_at,
        ),
    )
    return receipt


def _receipt_from_row(row: Dict[str, Any]) -> ReceiptResponse:
    return ReceiptResponse.model_validate(row["snapshot"])


def get_order_snapshot_for_owner_in_connection(
    conn: Any,
    order_id: str,
    owner_id: str,
) -> Optional[ReceiptResponse]:
    """Read one immutable C5 receipt without leaving the caller's transaction."""
    row = conn.execute(
        "SELECT snapshot FROM guest_orders WHERE id::text = %s AND owner_id = %s",
        (order_id, owner_id),
    ).fetchone()
    return _receipt_from_row(row) if row else None


def get_order_idempotency_record(
    conn: Any,
    owner_id: str,
    idempotency_key: str,
) -> Optional[Dict[str, Any]]:
    """Return the guest-scoped C6 key mapping and its already-stored receipt."""
    row = conn.execute(
        """
        SELECT payload_sha256, order_id
        FROM order_idempotency
        WHERE owner_id = %s AND idempotency_key = %s
        """,
        (owner_id, idempotency_key),
    ).fetchone()
    if row is None:
        return None

    order_id = str(row["order_id"])
    receipt = get_order_snapshot_for_owner_in_connection(conn, order_id, owner_id)
    if receipt is None:
        raise RuntimeError("idempotency record references a missing guest order")
    return {
        "payload_sha256": row["payload_sha256"],
        "order_id": order_id,
        "receipt": receipt,
    }


def insert_order_idempotency_record(
    conn: Any,
    owner_id: str,
    idempotency_key: str,
    payload_sha256: str,
    order_id: str,
) -> None:
    """Record one accepted C6 key inside the caller's checkout transaction."""
    conn.execute(
        """
        INSERT INTO order_idempotency (owner_id, idempotency_key, payload_sha256, order_id)
        VALUES (%s, %s, %s, %s::uuid)
        """,
        (owner_id, idempotency_key, payload_sha256, order_id),
    )


def get_order_snapshot_for_owner(order_id: str, owner_id: str) -> Optional[ReceiptResponse]:
    if not database_url():
        raise ReceiptStorageUnavailableError()
    try:
        with get_connection() as conn:
            return get_order_snapshot_for_owner_in_connection(conn, order_id, owner_id)
    except ReceiptStorageUnavailableError:
        raise
    except Exception as exc:
        raise ReceiptStorageUnavailableError() from exc


def list_order_snapshots_for_owner(
    owner_id: str,
    *,
    cursor: Optional[str] = None,
    limit: int = 50,
) -> List[ReceiptResponse]:
    if not database_url():
        raise ReceiptStorageUnavailableError()
    if not 1 <= limit <= 50:
        raise ValueError("Receipt list limit must be between 1 and 50")

    try:
        with get_connection() as conn:
            params: list[Any] = [owner_id]
            where = "owner_id = %s"
            if cursor:
                cursor_row = conn.execute(
                    "SELECT id, created_at FROM guest_orders WHERE id::text = %s AND owner_id = %s",
                    (cursor, owner_id),
                ).fetchone()
                if cursor_row is None:
                    raise InvalidReceiptCursorError()
                where += " AND (created_at, id) < (%s, %s::uuid)"
                params.extend([cursor_row["created_at"], str(cursor_row["id"])])

            params.append(limit)
            rows = conn.execute(
                f"""
                SELECT snapshot
                FROM guest_orders
                WHERE {where}
                ORDER BY created_at DESC, id DESC
                LIMIT %s
                """,
                tuple(params),
            ).fetchall()
        return [_receipt_from_row(row) for row in rows]
    except InvalidReceiptCursorError:
        raise
    except Exception as exc:
        raise ReceiptStorageUnavailableError() from exc


# Legacy pre-C4 cart helpers remain for old offline/order compatibility only.
# The versioned /v1/cart API no longer calls them after ST-05.
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


def list_orders_for_session(session_id: str) -> List[Order]:
    if postgres_available():
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM orders WHERE session_id = %s ORDER BY created_at DESC",
                (session_id,),
            ).fetchall()
        return [Order(**_order_row_to_payload(row)) for row in rows]

    return [order for order in list_orders() if order.session_id == session_id]


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


def get_order_for_session(order_id: str, session_id: str) -> Optional[Order]:
    if postgres_available():
        with get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM orders WHERE id = %s AND session_id = %s",
                (order_id, session_id),
            ).fetchone()
        return Order(**_order_row_to_payload(row)) if row else None

    return next(
        (order for order in list_orders() if order.id == order_id and order.session_id == session_id),
        None,
    )


def _order_row_to_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "cart_items": row["cart_items"],
        "subtotal_cents": row["subtotal_cents"],
        "status": row["status"],
        "created_at": row["created_at"],
    }
