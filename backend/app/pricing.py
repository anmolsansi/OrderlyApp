from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from .cart_service import CartConflictError
from .catalog import CatalogConfigurationError, CatalogSnapshot, calculate_canonical_item_unit_cents
from .database import database_url, get_connection
from .models import (
    CartItem,
    CartResponse,
    CheckoutDetails,
    CheckoutQuoteRequest,
    CheckoutQuoteResponse,
    PricingTotals,
    ReceiptItemSnapshot,
    ReceiptModifierOptionSnapshot,
    ReceiptModifierSnapshot,
    ReceiptResponse,
)
from .store import get_catalog_snapshot, get_guest_cart_row, validate_cart_items

PRICING_VERSION = "mock-v1"
SERVICE_FEE_CENTS = 249
TAX_RATE_NUMERATOR = 875
TAX_RATE_DENOMINATOR = 10_000
DEMO5_DISCOUNT_CAP_CENTS = 500


class PricingError(RuntimeError):
    """Base class for typed C5 quote/snapshot failures."""


@dataclass
class InvalidCheckoutError(PricingError):
    fields: List[str]

    def __str__(self) -> str:
        return "Checkout details are invalid"


class CatalogChangedError(PricingError):
    def __init__(self) -> None:
        super().__init__("Catalog changed after the cart was saved")


class PricingStorageUnavailableError(PricingError):
    def __init__(self) -> None:
        super().__init__("Receipt pricing storage is unavailable")


def _cart_response(cart) -> CartResponse:
    return CartResponse(revision=cart.revision, items=cart.items)


def _require_postgres() -> None:
    if not database_url():
        raise PricingStorageUnavailableError()


def promotion_discount_cents(subtotal_cents: int, promotion_code: Optional[str]) -> int:
    if promotion_code is None:
        return 0
    if promotion_code != "DEMO5":
        raise InvalidCheckoutError(["promotion_code"])
    return min(DEMO5_DISCOUNT_CAP_CENTS, subtotal_cents)


def round_half_up_fraction(numerator: int, denominator: int) -> int:
    if numerator < 0 or denominator <= 0:
        raise ValueError("half-up rounding requires a nonnegative numerator and positive denominator")
    return (numerator + denominator // 2) // denominator


def calculate_mock_v1_totals(
    snapshot: CatalogSnapshot,
    items: List[CartItem],
    *,
    tip_cents: int,
    promotion_code: Optional[str] = None,
) -> PricingTotals:
    if type(tip_cents) is not int or not 0 <= tip_cents <= 10_000:
        raise InvalidCheckoutError(["tip_cents"])
    if not items:
        raise InvalidCheckoutError(["cart"])

    subtotal_cents = sum(
        calculate_canonical_item_unit_cents(snapshot, item) * item.quantity for item in items
    )
    discount_cents = promotion_discount_cents(subtotal_cents, promotion_code)

    restaurant = snapshot.restaurant(items[0].restaurant_id)
    if restaurant is None:
        raise CatalogChangedError()

    delivery_fee_cents = restaurant.delivery_fee_cents
    taxable_cents = subtotal_cents - discount_cents
    tax_cents = round_half_up_fraction(
        taxable_cents * TAX_RATE_NUMERATOR,
        TAX_RATE_DENOMINATOR,
    )
    total_cents = (
        taxable_cents
        + delivery_fee_cents
        + SERVICE_FEE_CENTS
        + tax_cents
        + tip_cents
    )
    return PricingTotals(
        subtotal_cents=subtotal_cents,
        discount_cents=discount_cents,
        delivery_fee_cents=delivery_fee_cents,
        service_fee_cents=SERVICE_FEE_CENTS,
        tax_cents=tax_cents,
        tip_cents=tip_cents,
        total_cents=total_cents,
    )


def build_receipt_items(snapshot: CatalogSnapshot, items: List[CartItem]) -> List[ReceiptItemSnapshot]:
    receipt_items: List[ReceiptItemSnapshot] = []
    for cart_item in items:
        menu_item = snapshot.menu_item(cart_item.restaurant_id, cart_item.menu_item_id)
        if menu_item is None:
            raise CatalogChangedError()

        selected_by_group = {modifier.group_id: set(modifier.option_ids) for modifier in cart_item.modifiers}
        modifiers: List[ReceiptModifierSnapshot] = []
        for group in menu_item.modifier_groups:
            selected_ids = selected_by_group.get(group.id)
            if not selected_ids:
                continue
            options = [
                ReceiptModifierOptionSnapshot(
                    id=option.id,
                    name=option.name,
                    price_delta_cents=option.price_delta_cents,
                )
                for option in group.options
                if option.id in selected_ids
            ]
            modifiers.append(
                ReceiptModifierSnapshot(
                    group_id=group.id,
                    name=group.name,
                    options=options,
                )
            )

        unit_price_cents = calculate_canonical_item_unit_cents(snapshot, cart_item)
        receipt_items.append(
            ReceiptItemSnapshot(
                id=cart_item.id,
                restaurant_id=cart_item.restaurant_id,
                menu_item_id=cart_item.menu_item_id,
                name=menu_item.name,
                unit_price_cents=unit_price_cents,
                quantity=cart_item.quantity,
                line_total_cents=unit_price_cents * cart_item.quantity,
                modifiers=modifiers,
                special_instructions=cart_item.special_instructions,
            )
        )
    return receipt_items


def _fingerprint_menu_item(menu_item) -> dict:
    return {
        "id": menu_item.id,
        "name": menu_item.name,
        "price_cents": menu_item.price_cents,
        "available": menu_item.available,
        "modifier_groups": [
            {
                "id": group.id,
                "name": group.name,
                "type": group.type,
                "required": group.required,
                "min_selected": group.min_selected,
                "max_selected": group.max_selected,
                "default_option_id": group.default_option_id,
                "options": [
                    {
                        "id": option.id,
                        "name": option.name,
                        "price_delta_cents": option.price_delta_cents,
                        "available": option.available,
                    }
                    for option in group.options
                ],
            }
            for group in menu_item.modifier_groups
        ],
    }


def catalog_fingerprint(snapshot: CatalogSnapshot, items: List[CartItem]) -> str:
    """Hash authoritative menu and fee policy, not mutable cart-only fields."""
    if not items:
        raise InvalidCheckoutError(["cart"])
    restaurant = snapshot.restaurant(items[0].restaurant_id)
    if restaurant is None:
        raise CatalogChangedError()

    menu_item_ids = sorted({item.menu_item_id for item in items})
    menu_items = []
    for menu_item_id in menu_item_ids:
        menu_item = snapshot.menu_item(restaurant.id, menu_item_id)
        if menu_item is None:
            raise CatalogChangedError()
        menu_items.append(_fingerprint_menu_item(menu_item))

    payload = {
        "pricing_version": PRICING_VERSION,
        "restaurant": {
            "id": restaurant.id,
            "is_open": restaurant.is_open,
            "delivery_fee_cents": restaurant.delivery_fee_cents,
        },
        "service_fee_cents": SERVICE_FEE_CENTS,
        "tax_rate": [TAX_RATE_NUMERATOR, TAX_RATE_DENOMINATOR],
        "promotion": {"code": "DEMO5", "cap_cents": DEMO5_DISCOUNT_CAP_CENTS},
        "menu_items": menu_items,
    }
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_receipt_snapshot(
    *,
    order_id: str,
    created_at: datetime,
    snapshot: CatalogSnapshot,
    items: List[CartItem],
    checkout: CheckoutDetails,
    promotion_code: Optional[str] = None,
) -> ReceiptResponse:
    totals = calculate_mock_v1_totals(
        snapshot,
        items,
        tip_cents=checkout.tip_cents,
        promotion_code=promotion_code,
    )
    return ReceiptResponse(
        id=order_id,
        created_at=created_at,
        items=build_receipt_items(snapshot, items),
        checkout=checkout,
        totals=totals,
    )


def quote_current_cart(owner_id: str, request: CheckoutQuoteRequest) -> CheckoutQuoteResponse:
    _require_postgres()
    try:
        with get_connection() as conn:
            with conn.transaction():
                cart = get_guest_cart_row(conn, owner_id)
                if cart.revision != request.expected_revision:
                    raise CartConflictError(_cart_response(cart))
                if not cart.items:
                    raise InvalidCheckoutError(["cart"])

                snapshot = get_catalog_snapshot(connection=conn)
                validation = validate_cart_items(cart.items, snapshot=snapshot)
                if validation.issues:
                    raise CatalogChangedError()

                canonical_items = validation.items
                return CheckoutQuoteResponse(
                    cart_revision=cart.revision,
                    catalog_fingerprint=catalog_fingerprint(snapshot, canonical_items),
                    totals=calculate_mock_v1_totals(
                        snapshot,
                        canonical_items,
                        tip_cents=request.tip_cents,
                        promotion_code=request.promotion_code,
                    ),
                )
    except (CartConflictError, InvalidCheckoutError, CatalogChangedError, CatalogConfigurationError):
        raise
    except PricingStorageUnavailableError:
        raise
    except Exception as exc:
        raise PricingStorageUnavailableError() from exc
