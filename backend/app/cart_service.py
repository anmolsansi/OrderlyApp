from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .catalog import CatalogConfigurationError
from .database import database_url, get_connection
from .models import CartItemInput, CartResponse, RevisionedCart
from .store import (
    get_catalog_snapshot,
    get_guest_cart_row,
    update_guest_cart_row,
    validate_cart_input_items,
)


class CartServiceError(RuntimeError):
    """Base class for typed C4 cart-domain failures."""


@dataclass
class CartConflictError(CartServiceError):
    current_cart: CartResponse

    def __str__(self) -> str:
        return "Basket changed in another tab"


@dataclass
class CartValidationError(CartServiceError):
    fields: List[str]

    def __str__(self) -> str:
        return "Cart contains invalid catalog choices"


class CartStorageUnavailableError(CartServiceError):
    def __init__(self) -> None:
        super().__init__("Cart storage is unavailable")


def _response(cart: RevisionedCart) -> CartResponse:
    return CartResponse(revision=cart.revision, items=cart.items)


def _require_postgres() -> None:
    if not database_url():
        raise CartStorageUnavailableError()


def get_cart(owner_id: str) -> CartResponse:
    _require_postgres()
    try:
        with get_connection() as conn:
            with conn.transaction():
                return _response(get_guest_cart_row(conn, owner_id))
    except CartServiceError:
        raise
    except Exception as exc:
        raise CartStorageUnavailableError() from exc


def put_cart(
    owner_id: str,
    expected_revision: int,
    items: List[CartItemInput],
) -> CartResponse:
    _require_postgres()
    try:
        with get_connection() as conn:
            with conn.transaction():
                current = get_guest_cart_row(conn, owner_id, for_update=True)
                if current.revision != expected_revision:
                    raise CartConflictError(_response(current))

                snapshot = get_catalog_snapshot(connection=conn)
                validation = validate_cart_input_items(items, snapshot)
                if validation.issues:
                    raise CartValidationError(validation.fields)

                updated = update_guest_cart_row(
                    conn,
                    owner_id,
                    current.revision + 1,
                    validation.items,
                )
                return _response(updated)
    except (CartServiceError, CatalogConfigurationError):
        raise
    except Exception as exc:
        raise CartStorageUnavailableError() from exc


def delete_cart(owner_id: str, expected_revision: int) -> CartResponse:
    _require_postgres()
    try:
        with get_connection() as conn:
            with conn.transaction():
                current = get_guest_cart_row(conn, owner_id, for_update=True)
                if current.revision != expected_revision:
                    raise CartConflictError(_response(current))

                updated = update_guest_cart_row(
                    conn,
                    owner_id,
                    current.revision + 1,
                    [],
                )
                return _response(updated)
    except CartServiceError:
        raise
    except Exception as exc:
        raise CartStorageUnavailableError() from exc
