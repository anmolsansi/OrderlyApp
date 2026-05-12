from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import database_url, get_connection
from .models import Cart, CartPricingRequest, CartPricingResponse, CartUpsertRequest, HealthResponse, Order, OrderCreateRequest, Restaurant
from .redis_store import redis_client, redis_url
from .store import calculate_cart_pricing, clear_cart, create_order, get_cart, get_order, get_restaurant, list_orders, search_restaurants, validate_cart_items, write_cart

app = FastAPI(title="OrderlyApp API", version="0.2.0")

def cors_origins() -> List[str]:
    configured = os.getenv("ORDERLY_CORS_ORIGINS")
    if not configured:
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    code = "not_found" if exc.status_code == 404 else "bad_request"
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": message}})


@app.exception_handler(RequestValidationError)
def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = {".".join(str(part) for part in error["loc"]): error["msg"] for error in exc.errors()}
    return JSONResponse(status_code=422, content={"error": {"code": "validation_error", "message": "Invalid request payload", "fields": fields}})


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    dependencies = {"postgres": "not_configured", "redis": "not_configured"}

    if database_url():
        try:
            with get_connection() as conn:
                conn.execute("SELECT 1")
            dependencies["postgres"] = "ok"
        except Exception as exc:
            dependencies["postgres"] = f"error: {exc.__class__.__name__}"

    if redis_url():
        dependencies["redis"] = "ok" if redis_client() is not None else "error"

    return HealthResponse(ok=True, service="orderlyapp-api", version="0.2.0", dependencies=dependencies)


@app.get("/restaurants", response_model=List[Restaurant])
def restaurants_index(
    query: str = "",
    cuisine: str = "",
    sort: str = Query(default="recommended", pattern="^(recommended|rating|fee)$"),
    open_now: bool = False,
) -> List[Restaurant]:
    return search_restaurants(query=query, cuisine=cuisine, sort=sort, open_now=open_now)


@app.get("/restaurants/{restaurant_id}", response_model=Restaurant)
def restaurants_show(restaurant_id: str) -> Restaurant:
    restaurant = get_restaurant(restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant


@app.get("/sessions/{session_id}/cart", response_model=Cart)
def carts_show(session_id: str) -> Cart:
    return get_cart(session_id)


@app.put("/sessions/{session_id}/cart", response_model=Cart)
def carts_upsert(session_id: str, request: CartUpsertRequest) -> Cart:
    errors = validate_cart_items(request.items)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    return write_cart(session_id, request.items)


@app.delete("/sessions/{session_id}/cart", response_model=Cart)
def carts_clear(session_id: str) -> Cart:
    return clear_cart(session_id)


@app.post("/orders", response_model=Order, status_code=201)
def orders_create(request: OrderCreateRequest) -> Order:
    if not request.cart_items:
        raise HTTPException(status_code=400, detail="Cannot create order from an empty cart")
    errors = validate_cart_items(request.cart_items)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    pricing = calculate_cart_pricing(request.cart_items, discount_cents=0, tip_cents=request.tip_cents)
    if pricing.subtotal_cents != request.subtotal_cents:
        raise HTTPException(status_code=400, detail="Submitted subtotal does not match authoritative pricing")
    return create_order(request.session_id, request.cart_items, request.subtotal_cents)


@app.post("/cart/pricing", response_model=CartPricingResponse)
def cart_pricing(request: CartPricingRequest) -> CartPricingResponse:
    errors = validate_cart_items(request.cart_items)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    return calculate_cart_pricing(request.cart_items, request.restaurant_id, request.discount_cents, request.tip_cents)


@app.get("/orders", response_model=List[Order])
def orders_index() -> List[Order]:
    return list_orders()


@app.get("/orders/{order_id}", response_model=Order)
def orders_show(order_id: str) -> Order:
    order = get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
