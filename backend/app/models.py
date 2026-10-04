from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

ModifierType = Literal["single", "multiple"]
OrderStatus = Literal["Placed", "Confirmed", "Preparing", "Out for delivery", "Delivered"]


class ModifierOption(BaseModel):
    id: str
    name: str
    price_delta_cents: int = Field(ge=0)
    available: bool = True


class ModifierGroup(BaseModel):
    id: str
    name: str
    type: ModifierType
    required: bool = False
    min_selected: Optional[int] = Field(default=None, ge=0)
    max_selected: Optional[int] = Field(default=None, ge=1)
    default_option_id: Optional[str] = None
    options: List[ModifierOption]


class MenuItem(BaseModel):
    id: str
    name: str
    description: str
    price_cents: int = Field(gt=0)
    image_emoji: str
    popular: bool = False
    available: bool = True
    modifier_groups: List[ModifierGroup]


class Restaurant(BaseModel):
    id: str
    name: str
    cuisine: str
    rating: float = Field(ge=0, le=5)
    delivery_minutes: str
    delivery_fee_cents: int = Field(ge=0)
    image_emoji: str
    is_open: bool = True
    tags: List[str]
    menu: List[MenuItem]


class CartItemModifier(BaseModel):
    model_config = ConfigDict(extra="forbid")

    group_id: str
    option_ids: List[str]


class CartItemInput(BaseModel):
    """Client-authorized C4 cart fields. Catalog labels/prices are output-only."""

    model_config = ConfigDict(extra="forbid")

    id: str
    restaurant_id: str
    menu_item_id: str
    quantity: int = Field(ge=1, le=10, strict=True)
    modifiers: List[CartItemModifier]
    special_instructions: Optional[str] = Field(default=None, max_length=500)


class CartItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    restaurant_id: str
    menu_item_id: str
    name: str
    quantity: int = Field(ge=1, le=10, strict=True)
    base_price_cents: int = Field(gt=0)
    modifiers: List[CartItemModifier]
    special_instructions: Optional[str] = Field(default=None, max_length=500)


class Cart(BaseModel):
    """Legacy pre-C4 cart representation retained for offline compatibility."""

    session_id: str
    items: List[CartItem] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RevisionedCart(BaseModel):
    owner_id: str
    revision: int = Field(ge=0, strict=True)
    items: List[CartItem] = Field(default_factory=list)
    updated_at: datetime


class CartResponse(BaseModel):
    schema_version: Literal[1] = 1
    revision: int = Field(ge=0, strict=True)
    items: List[CartItem] = Field(default_factory=list)


class CartUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0, strict=True)
    items: List[CartItemInput] = Field(max_length=50)


class CartDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0, strict=True)


class OrderCreateRequest(BaseModel):
    """Legacy pre-C6 order submission shape retained until ST-07."""

    model_config = ConfigDict(extra="forbid")

    cart_items: List[CartItem] = Field(max_length=50)
    subtotal_cents: int = Field(ge=0)
    delivery_address: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    tip_cents: int = Field(default=0, ge=0)


class CartPricingRequest(BaseModel):
    """Legacy pre-C5 pricing shape retained until frontend cutover."""

    model_config = ConfigDict(extra="forbid")

    cart_items: List[CartItem] = Field(max_length=50)
    restaurant_id: Optional[str] = None
    discount_cents: int = Field(default=0, ge=0)
    tip_cents: int = Field(default=0, ge=0)


class CartPricingResponse(BaseModel):
    subtotal_cents: int = Field(ge=0)
    discount_cents: int = Field(ge=0)
    delivery_fee_cents: int = Field(ge=0)
    service_fee_cents: int = Field(ge=0)
    tax_cents: int = Field(ge=0)
    tip_cents: int = Field(ge=0)
    total_cents: int = Field(ge=0)


class CheckoutQuoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0, strict=True)
    tip_cents: int = Field(ge=0, le=10_000, strict=True)
    promotion_code: Optional[Literal["DEMO5"]] = None


class PricingTotals(BaseModel):
    subtotal_cents: int = Field(ge=0, strict=True)
    discount_cents: int = Field(ge=0, strict=True)
    delivery_fee_cents: int = Field(ge=0, strict=True)
    service_fee_cents: int = Field(ge=0, strict=True)
    tax_cents: int = Field(ge=0, strict=True)
    tip_cents: int = Field(ge=0, le=10_000, strict=True)
    total_cents: int = Field(ge=0, strict=True)


class CheckoutQuoteResponse(BaseModel):
    schema_version: Literal[1] = 1
    cart_revision: int = Field(ge=0, strict=True)
    catalog_fingerprint: str = Field(min_length=1, max_length=128)
    totals: PricingTotals


class CheckoutDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=30)
    email: str = Field(min_length=3, max_length=254)
    street: str = Field(min_length=1, max_length=200)
    apartment: Optional[str] = Field(default=None, max_length=50)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(pattern=r"^[A-Z]{2}$")
    postal_code: str = Field(pattern=r"^\d{5}(?:-\d{4})?$")
    delivery_instructions: Optional[str] = Field(default=None, max_length=500)
    payment_method: Literal["mock"]
    tip_cents: int = Field(ge=0, le=10_000, strict=True)

    @field_validator("email")
    @classmethod
    def validate_email_shape(cls, value: str) -> str:
        if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) is None:
            raise ValueError("email must have a valid shape")
        return value


class OrderSubmissionRequest(BaseModel):
    """C6 checkout submission. Ownership and idempotency key come from trusted request context."""

    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0, strict=True)
    catalog_fingerprint: str = Field(
        min_length=64,
        max_length=64,
        pattern=r"^[0-9A-Fa-f]{64}$",
    )
    checkout: CheckoutDetails
    promotion_code: Optional[Literal["DEMO5"]] = None

    @field_validator("catalog_fingerprint")
    @classmethod
    def normalize_catalog_fingerprint(cls, value: str) -> str:
        return value.lower()


class ReceiptModifierOptionSnapshot(BaseModel):
    id: str
    name: str
    price_delta_cents: int = Field(ge=0, strict=True)


class ReceiptModifierSnapshot(BaseModel):
    group_id: str
    name: str
    options: List[ReceiptModifierOptionSnapshot]


class ReceiptItemSnapshot(BaseModel):
    id: str
    restaurant_id: str
    menu_item_id: str
    name: str
    unit_price_cents: int = Field(gt=0, strict=True)
    quantity: int = Field(ge=1, le=10, strict=True)
    line_total_cents: int = Field(gt=0, strict=True)
    modifiers: List[ReceiptModifierSnapshot]
    special_instructions: Optional[str] = Field(default=None, max_length=500)


class ReceiptResponse(BaseModel):
    schema_version: Literal[1] = 1
    id: str
    status: Literal["Placed"] = "Placed"
    created_at: datetime
    items: List[ReceiptItemSnapshot]
    checkout: CheckoutDetails
    totals: PricingTotals
    pricing_version: Literal["mock-v1"] = "mock-v1"


class Order(BaseModel):
    """Legacy pre-C5 order record retained offline until its migration policy is complete."""

    id: str
    session_id: str
    cart_items: List[CartItem]
    subtotal_cents: int = Field(ge=0)
    status: OrderStatus = "Placed"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OrderResponse(BaseModel):
    """Legacy pre-C5 immediate POST response retained until ST-07 replaces submission."""

    id: str
    cart_items: List[CartItem]
    subtotal_cents: int = Field(ge=0)
    status: OrderStatus = "Placed"
    created_at: datetime


class SessionResponse(BaseModel):
    schema_version: Literal[1] = 1
    expires_at: datetime


class HealthResponse(BaseModel):
    ok: bool
    service: str
    version: str
    dependencies: Dict[str, str] = Field(default_factory=dict)


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str
    fields: List[str] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody
