from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ModifierType = Literal["single", "multiple"]
OrderStatus = Literal["Placed", "Confirmed", "Preparing", "Out for delivery", "Delivered"]


class ModifierOption(BaseModel):
    id: str
    name: str
    price_delta_cents: int = Field(ge=0)


class ModifierGroup(BaseModel):
    id: str
    name: str
    type: ModifierType
    required: bool = False
    min_selected: Optional[int] = Field(default=None, ge=0)
    max_selected: Optional[int] = Field(default=None, ge=1)
    options: List[ModifierOption]


class MenuItem(BaseModel):
    id: str
    name: str
    description: str
    price_cents: int = Field(gt=0)
    image_emoji: str
    popular: bool = False
    modifier_groups: List[ModifierGroup]


class Restaurant(BaseModel):
    id: str
    name: str
    cuisine: str
    rating: float = Field(ge=0, le=5)
    delivery_minutes: str
    delivery_fee_cents: int = Field(ge=0)
    image_emoji: str
    tags: List[str]
    menu: List[MenuItem]


class CartItemModifier(BaseModel):
    group_id: str
    option_ids: List[str]


class CartItem(BaseModel):
    id: str
    restaurant_id: str
    menu_item_id: str
    name: str
    quantity: int = Field(ge=1)
    base_price_cents: int = Field(gt=0)
    modifiers: List[CartItemModifier]


class Cart(BaseModel):
    session_id: str
    items: List[CartItem] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CartUpsertRequest(BaseModel):
    items: List[CartItem]


class OrderCreateRequest(BaseModel):
    session_id: str
    cart_items: List[CartItem]
    subtotal_cents: int = Field(ge=0)


class Order(BaseModel):
    id: str
    session_id: str
    cart_items: List[CartItem]
    subtotal_cents: int = Field(ge=0)
    status: OrderStatus = "Placed"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    ok: bool
    service: str
    version: str
    dependencies: Dict[str, str] = Field(default_factory=dict)
