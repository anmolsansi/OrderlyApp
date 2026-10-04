from __future__ import annotations

import os
from typing import List
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import database_url, get_connection
from .identity import (
    COOKIE_NAME,
    IdentityError,
    VerifiedGuest,
    bootstrap_guest,
    require_allowed_origin,
    reset_guest,
    set_guest_cookie,
    verify_request_guest,
)
from .models import (
    CartPricingRequest,
    CartPricingResponse,
    CartResponse,
    CartUpsertRequest,
    HealthResponse,
    OrderCreateRequest,
    OrderResponse,
    Restaurant,
    SessionResponse,
)
from .redis_store import redis_client, redis_url
from .store import (
    calculate_cart_pricing,
    clear_cart,
    create_order,
    get_cart,
    get_order_for_session,
    get_restaurant,
    list_orders_for_session,
    search_restaurants,
    validate_cart_items,
    write_cart,
)

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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request.state.request_id = uuid4().hex
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", uuid4().hex)


def _error_response(request: Request, status_code: int, code: str, message: str, fields: list[str] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": _request_id(request),
                "fields": fields or [],
            }
        },
    )


@app.exception_handler(IdentityError)
def identity_exception_handler(request: Request, exc: IdentityError) -> JSONResponse:
    return _error_response(request, exc.status_code, exc.code, exc.message, exc.fields)


@app.exception_handler(HTTPException)
def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    code = "not_found" if exc.status_code == 404 else "bad_request"
    return _error_response(request, exc.status_code, code, message)


@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [
        f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
        for error in exc.errors()
    ]
    return _error_response(request, 422, "validation_error", "Invalid request payload", fields)


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


@app.post("/v1/session", response_model=SessionResponse)
def session_bootstrap(request: Request, response: Response) -> SessionResponse:
    require_allowed_origin(request)
    issued = bootstrap_guest(request.cookies.get(COOKIE_NAME))
    set_guest_cookie(response, request, issued)
    return SessionResponse(expires_at=issued.expires_at)


@app.post("/v1/session/reset", response_model=SessionResponse)
def session_reset(request: Request, response: Response) -> SessionResponse:
    require_allowed_origin(request)
    issued = reset_guest(request.cookies.get(COOKIE_NAME))
    set_guest_cookie(response, request, issued)
    return SessionResponse(expires_at=issued.expires_at)


@app.get("/restaurants", response_model=List[Restaurant])
@app.get("/v1/restaurants", response_model=List[Restaurant])
def restaurants_index(
    query: str = "",
    cuisine: str = "",
    sort: str = Query(default="recommended", pattern="^(recommended|rating|fee)$"),
    open_now: bool = False,
) -> List[Restaurant]:
    return search_restaurants(query=query, cuisine=cuisine, sort=sort, open_now=open_now)


@app.get("/restaurants/{restaurant_id}", response_model=Restaurant)
@app.get("/v1/restaurants/{restaurant_id}", response_model=Restaurant)
def restaurants_show(restaurant_id: str) -> Restaurant:
    restaurant = get_restaurant(restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant


@app.get("/v1/cart", response_model=CartResponse)
def carts_show(guest: VerifiedGuest = Depends(verify_request_guest)) -> CartResponse:
    return CartResponse.model_validate(get_cart(guest.guest_id), from_attributes=True)


@app.put("/v1/cart", response_model=CartResponse)
def carts_upsert(
    request: Request,
    payload: CartUpsertRequest,
    guest: VerifiedGuest = Depends(verify_request_guest),
) -> CartResponse:
    require_allowed_origin(request)
    errors = validate_cart_items(payload.items)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    return CartResponse.model_validate(write_cart(guest.guest_id, payload.items), from_attributes=True)


@app.delete("/v1/cart", response_model=CartResponse)
def carts_clear(
    request: Request,
    guest: VerifiedGuest = Depends(verify_request_guest),
) -> CartResponse:
    require_allowed_origin(request)
    return CartResponse.model_validate(clear_cart(guest.guest_id), from_attributes=True)


@app.post("/v1/orders", response_model=OrderResponse, status_code=201)
def orders_create(
    request: Request,
    payload: OrderCreateRequest,
    guest: VerifiedGuest = Depends(verify_request_guest),
) -> OrderResponse:
    require_allowed_origin(request)
    if not payload.cart_items:
        raise HTTPException(status_code=400, detail="Cannot create order from an empty cart")
    errors = validate_cart_items(payload.cart_items)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    pricing = calculate_cart_pricing(payload.cart_items, discount_cents=0, tip_cents=payload.tip_cents)
    if pricing.subtotal_cents != payload.subtotal_cents:
        raise HTTPException(status_code=400, detail="Submitted subtotal does not match authoritative pricing")
    order = create_order(guest.guest_id, payload.cart_items, payload.subtotal_cents)
    return OrderResponse.model_validate(order, from_attributes=True)


@app.post("/v1/cart/pricing", response_model=CartPricingResponse)
def cart_pricing(
    request: Request,
    payload: CartPricingRequest,
    _guest: VerifiedGuest = Depends(verify_request_guest),
) -> CartPricingResponse:
    require_allowed_origin(request)
    errors = validate_cart_items(payload.cart_items)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    return calculate_cart_pricing(payload.cart_items, payload.restaurant_id, payload.discount_cents, payload.tip_cents)


@app.get("/v1/orders", response_model=List[OrderResponse])
def orders_index(guest: VerifiedGuest = Depends(verify_request_guest)) -> List[OrderResponse]:
    return [OrderResponse.model_validate(order, from_attributes=True) for order in list_orders_for_session(guest.guest_id)]


@app.get("/v1/orders/{order_id}", response_model=OrderResponse)
def orders_show(order_id: str, guest: VerifiedGuest = Depends(verify_request_guest)) -> OrderResponse:
    order = get_order_for_session(order_id, guest.guest_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse.model_validate(order, from_attributes=True)
