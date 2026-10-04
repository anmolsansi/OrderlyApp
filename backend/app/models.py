from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

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
    session_id: str
    items: List[CartItem] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CartResponse(BaseModel):
    items: List[CartItem] = Field(default_factory=list)
    updated_at: datetime


class CartUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: List[CartItem] = Field(max_length=50)


class OrderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cart_items: List[CartItem] = Field(max_length=50)
    subtotal_cents: int = Field(ge=0)
    delivery_address: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    tip_cents: int = Field(default=0, ge=0)


class CartPricingRequest(BaseModel):
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


class Order(BaseModel):
    id: str
    session_id: str
    cart_items: List[CartItem]
    subtotal_cents: int = Field(ge=0)
    status: OrderStatus = "Placed"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OrderResponse(BaseModel):
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
