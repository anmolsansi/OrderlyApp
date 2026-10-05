from __future__ import annotations

import hashlib
import os
from pathlib import Path
import time
from typing import List, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .cart_service import (
    CartConflictError,
    CartStorageUnavailableError,
    CartValidationError,
    delete_cart,
    get_cart,
    put_cart,
)
from .catalog import CatalogConfigurationError, CatalogValidationResult
from .database import database_url, get_connection
from .identity import (
    COOKIE_NAME,
    IdentityError,
    VerifiedGuest,
    bootstrap_guest,
    load_identity_settings,
    require_allowed_origin,
    reset_guest,
    set_guest_cookie,
    verify_request_guest,
)
from .models import (
    CartDeleteRequest,
    CartPricingRequest,
    CartPricingResponse,
    CartResponse,
    CartUpsertRequest,
    CheckoutQuoteRequest,
    CheckoutQuoteResponse,
    HealthResponse,
    OrderSubmissionRequest,
    ReceiptResponse,
    Restaurant,
    SessionResponse,
)
from .order_service import (
    IdempotencyConflictError,
    OrderStorageUnavailableError,
    submit_order,
)
from .pricing import (
    CatalogChangedError,
    InvalidCheckoutError,
    PricingStorageUnavailableError,
    quote_current_cart,
)
from .redis_store import redis_client, redis_url
from .store import (
    InvalidReceiptCursorError,
    ReceiptStorageUnavailableError,
    calculate_cart_pricing,
    get_catalog_snapshot,
    get_order_snapshot_for_owner,
    get_restaurant,
    list_order_snapshots_for_owner,
    search_restaurants,
    validate_cart_items,
)

app = FastAPI(title="OrderlyApp API", version="0.2.0")

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"
DEFAULT_CHECKOUT_RATE_WINDOW_SECONDS = 60
DEFAULT_CHECKOUT_RATE_PER_GUEST = 10
DEFAULT_CHECKOUT_RATE_AGGREGATE = 120


class ApiContractError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        fields: Optional[List[str]] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields or []


class CheckoutRateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Checkout rate limit exceeded")
        self.retry_after_seconds = retry_after_seconds


class CheckoutRateLimitUnavailable(Exception):
    pass


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
    allow_headers=["Accept", "Content-Type", "Idempotency-Key"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request.state.request_id = uuid4().hex
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", uuid4().hex)


def _source_sha() -> str:
    for name in ("ORDERLY_SOURCE_SHA", "RENDER_GIT_COMMIT", "GITHUB_SHA"):
        value = os.getenv(name, "").strip()
        if value:
            return value[:64]
    return "unknown"


def _expected_migration_versions() -> set[str]:
    return {migration.name for migration in MIGRATIONS_DIR.glob("*.sql") if migration.is_file()}


def _positive_int_setting(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a positive integer") from exc
    if value < 1:
        raise ValueError(f"{name} must be a positive integer")
    return value


def checkout_rate_limit_settings() -> tuple[int, int, int]:
    window_seconds = _positive_int_setting(
        "ORDERLY_CHECKOUT_RATE_WINDOW_SECONDS",
        DEFAULT_CHECKOUT_RATE_WINDOW_SECONDS,
    )
    per_guest = _positive_int_setting(
        "ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST",
        DEFAULT_CHECKOUT_RATE_PER_GUEST,
    )
    aggregate = _positive_int_setting(
        "ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE",
        DEFAULT_CHECKOUT_RATE_AGGREGATE,
    )
    if aggregate < per_guest:
        raise ValueError(
            "ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE must be at least the per-guest limit"
        )
    return window_seconds, per_guest, aggregate


def _enforce_checkout_rate_limit(owner_id: str) -> None:
    window_seconds, per_guest_limit, aggregate_limit = checkout_rate_limit_settings()
    client = redis_client()
    if client is None:
        raise CheckoutRateLimitUnavailable()

    now_epoch = int(time.time())
    bucket = now_epoch // window_seconds
    retry_after = max(1, window_seconds - (now_epoch % window_seconds))
    owner_hash = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()[:32]
    guest_key = f"orderly:checkout-rate:guest:{owner_hash}:{bucket}"
    aggregate_key = f"orderly:checkout-rate:aggregate:{bucket}"

    try:
        pipeline = client.pipeline(transaction=True)
        pipeline.incr(guest_key)
        pipeline.expire(guest_key, window_seconds * 2)
        pipeline.incr(aggregate_key)
        pipeline.expire(aggregate_key, window_seconds * 2)
        results = pipeline.execute()
        guest_count = int(results[0])
        aggregate_count = int(results[2])
    except Exception as exc:
        raise CheckoutRateLimitUnavailable() from exc

    if guest_count > per_guest_limit or aggregate_count > aggregate_limit:
        raise CheckoutRateLimitExceeded(retry_after)


def _c8_status(*, ready: bool, dependencies: dict[str, str]) -> dict[str, object]:
    return {
        "schema_version": 1,
        "ready": ready,
        "mode": os.getenv("ORDERLY_DATA_MODE", "").strip() or "unknown",
        "source_sha": _source_sha(),
        "dependencies": dependencies,
    }


def _error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    fields: Optional[List[str]] = None,
) -> JSONResponse:
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


def _invalid_cart(result: CatalogValidationResult) -> None:
    if result.issues:
        raise ApiContractError(
            422,
            "invalid_cart",
            "Cart contains invalid catalog choices",
            result.fields,
        )


def _validation_field(error: dict) -> str:
    location = [str(part) for part in error.get("loc", ())]
    if location and location[0] in {"body", "query", "path", "header"}:
        location = location[1:]
    if location and location[0] == "cart_items":
        location[0] = "items"
    if len(location) == 1 and location[0].lower() == "idempotency-key":
        location[0] = "idempotency_key"
    return ".".join(location)


@app.exception_handler(IdentityError)
def identity_exception_handler(request: Request, exc: IdentityError) -> JSONResponse:
    return _error_response(request, exc.status_code, exc.code, exc.message, exc.fields)


@app.exception_handler(ApiContractError)
def api_contract_exception_handler(request: Request, exc: ApiContractError) -> JSONResponse:
    return _error_response(request, exc.status_code, exc.code, exc.message, exc.fields)


@app.exception_handler(CartConflictError)
def cart_conflict_exception_handler(request: Request, exc: CartConflictError) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "error": {
                "code": "cart_conflict",
                "message": "Basket changed in another tab",
                "request_id": _request_id(request),
                "fields": [],
            },
            "current_cart": exc.current_cart.model_dump(mode="json"),
        },
    )


@app.exception_handler(CartValidationError)
def cart_validation_exception_handler(request: Request, exc: CartValidationError) -> JSONResponse:
    return _error_response(
        request,
        422,
        "invalid_cart",
        "Cart contains invalid catalog choices",
        exc.fields,
    )


@app.exception_handler(CartStorageUnavailableError)
def cart_storage_exception_handler(
    request: Request,
    _exc: CartStorageUnavailableError,
) -> JSONResponse:
    return _error_response(
        request,
        503,
        "storage_unavailable",
        "Cart storage is unavailable",
    )


@app.exception_handler(InvalidCheckoutError)
def invalid_checkout_exception_handler(request: Request, exc: InvalidCheckoutError) -> JSONResponse:
    return _error_response(
        request,
        422,
        "invalid_checkout",
        "Checkout details are invalid",
        exc.fields,
    )


@app.exception_handler(IdempotencyConflictError)
def idempotency_conflict_exception_handler(
    request: Request,
    _exc: IdempotencyConflictError,
) -> JSONResponse:
    return _error_response(
        request,
        409,
        "idempotency_conflict",
        "Idempotency key was reused with a different payload",
    )


@app.exception_handler(OrderStorageUnavailableError)
def order_storage_exception_handler(
    request: Request,
    _exc: OrderStorageUnavailableError,
) -> JSONResponse:
    return _error_response(
        request,
        503,
        "storage_unavailable",
        "Order storage is unavailable",
    )


@app.exception_handler(CheckoutRateLimitExceeded)
def checkout_rate_limit_exception_handler(
    request: Request,
    exc: CheckoutRateLimitExceeded,
) -> JSONResponse:
    response = _error_response(
        request,
        429,
        "checkout_rate_limited",
        "Checkout is temporarily rate limited",
    )
    response.headers["Retry-After"] = str(exc.retry_after_seconds)
    return response


@app.exception_handler(CheckoutRateLimitUnavailable)
def checkout_rate_limit_unavailable_exception_handler(
    request: Request,
    _exc: CheckoutRateLimitUnavailable,
) -> JSONResponse:
    return _error_response(
        request,
        503,
        "rate_limit_unavailable",
        "Checkout is temporarily unavailable",
    )


@app.exception_handler(CatalogChangedError)
def catalog_changed_exception_handler(request: Request, _exc: CatalogChangedError) -> JSONResponse:
    return _error_response(
        request,
        409,
        "catalog_changed",
        "Catalog changed after the quote",
    )


@app.exception_handler(PricingStorageUnavailableError)
def pricing_storage_exception_handler(
    request: Request,
    _exc: PricingStorageUnavailableError,
) -> JSONResponse:
    return _error_response(
        request,
        503,
        "storage_unavailable",
        "Receipt pricing storage is unavailable",
    )


@app.exception_handler(ReceiptStorageUnavailableError)
def receipt_storage_exception_handler(
    request: Request,
    _exc: ReceiptStorageUnavailableError,
) -> JSONResponse:
    return _error_response(
        request,
        503,
        "storage_unavailable",
        "Receipt storage is unavailable",
    )


@app.exception_handler(InvalidReceiptCursorError)
def invalid_receipt_cursor_exception_handler(
    request: Request,
    _exc: InvalidReceiptCursorError,
) -> JSONResponse:
    return _error_response(
        request,
        422,
        "invalid_cursor",
        "Receipt cursor is invalid",
        ["cursor"],
    )


@app.exception_handler(CatalogConfigurationError)
def catalog_configuration_exception_handler(
    request: Request,
    _exc: CatalogConfigurationError,
) -> JSONResponse:
    return _error_response(
        request,
        503,
        "catalog_unavailable",
        "Canonical catalog is unavailable",
    )


@app.exception_handler(HTTPException)
def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    code = "not_found" if exc.status_code == 404 else "bad_request"
    return _error_response(request, exc.status_code, code, message)


@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = list(
        dict.fromkeys(
            field
            for field in (_validation_field(error) for error in exc.errors())
            if field
        )
    )
    if request.url.path in {"/v1/checkout/quote", "/v1/orders"}:
        return _error_response(
            request,
            422,
            "invalid_checkout",
            "Checkout details are invalid",
            fields,
        )
    cart_fields = [
        field
        for field in fields
        if field == "expected_revision" or field == "items" or field.startswith("items.")
    ]
    if cart_fields and len(cart_fields) == len(fields):
        return _error_response(
            request,
            422,
            "invalid_cart",
            "Cart contains invalid catalog choices",
            cart_fields,
        )
    return _error_response(request, 422, "validation_error", "Invalid request payload", fields)


@app.get("/health/live")
def health_live() -> dict[str, object]:
    return {
        "schema_version": 1,
        "live": True,
        "source_sha": _source_sha(),
    }


@app.get("/health/ready")
def health_ready(request: Request) -> JSONResponse:
    dependencies = {
        "configuration": "unknown",
        "postgres": "unknown",
        "schema": "unknown",
        "rate_limit_configuration": "unknown",
    }
    fields: list[str] = []

    try:
        load_identity_settings()
        dependencies["configuration"] = "ok"
    except IdentityError as exc:
        dependencies["configuration"] = "invalid"
        fields.extend(exc.fields)

    try:
        checkout_rate_limit_settings()
        dependencies["rate_limit_configuration"] = "ok"
    except ValueError:
        dependencies["rate_limit_configuration"] = "invalid"
        fields.extend(
            [
                "ORDERLY_CHECKOUT_RATE_WINDOW_SECONDS",
                "ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST",
                "ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE",
            ]
        )

    if not database_url():
        dependencies["postgres"] = "not_configured"
        dependencies["schema"] = "unchecked"
        fields.append("DATABASE_URL")
    else:
        try:
            with get_connection(connect_timeout_seconds=2) as conn:
                conn.execute("SELECT 1")
                dependencies["postgres"] = "ok"

                relation = conn.execute(
                    "SELECT to_regclass('public.schema_migrations') AS relation"
                ).fetchone()
                if not relation or relation["relation"] is None:
                    dependencies["schema"] = "missing_ledger"
                    fields.append("schema_migrations")
                else:
                    applied = {
                        row["version"]
                        for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
                    }
                    expected = _expected_migration_versions()
                    if expected and expected.issubset(applied):
                        dependencies["schema"] = "ok"
                    else:
                        dependencies["schema"] = "missing_migrations"
                        fields.append("schema_migrations")
        except Exception:
            dependencies["postgres"] = "unavailable"
            dependencies["schema"] = "unchecked"
            fields.append("DATABASE_URL")

    ready = all(
        dependencies[key] == "ok"
        for key in ("configuration", "postgres", "schema", "rate_limit_configuration")
    )
    payload = _c8_status(ready=ready, dependencies=dependencies)
    if ready:
        return JSONResponse(status_code=200, content=payload)

    payload["error"] = {
        "code": "not_ready",
        "message": "Required application dependencies are not ready",
        "request_id": _request_id(request),
        "fields": list(dict.fromkeys(fields)),
    }
    return JSONResponse(status_code=503, content=payload)


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
    q: str = Query(default="", max_length=100),
    query: Optional[str] = Query(default=None, max_length=100),
    cuisine: str = Query(default="", max_length=100),
    sort: str = Query(default="recommended", pattern="^(recommended|rating|fee)$"),
    open_now: bool = False,
) -> List[Restaurant]:
    snapshot = get_catalog_snapshot()
    effective_query = q if q else (query or "")
    return search_restaurants(
        query=effective_query,
        cuisine=cuisine,
        sort=sort,
        open_now=open_now,
        snapshot=snapshot,
    )


@app.get("/restaurants/{restaurant_id}", response_model=Restaurant)
@app.get("/v1/restaurants/{restaurant_id}", response_model=Restaurant)
def restaurants_show(restaurant_id: str) -> Restaurant:
    snapshot = get_catalog_snapshot()
    restaurant = get_restaurant(restaurant_id, snapshot=snapshot)
    if not restaurant:
        raise ApiContractError(
            404,
            "restaurant_not_found",
            "Restaurant was not found",
            [],
        )
    return restaurant


@app.get("/v1/cart", response_model=CartResponse)
def carts_show(guest: VerifiedGuest = Depends(verify_request_guest)) -> CartResponse:
    return get_cart(guest.guest_id)


@app.put("/v1/cart", response_model=CartResponse)
def carts_upsert(
    request: Request,
    payload: CartUpsertRequest,
    guest: VerifiedGuest = Depends(verify_request_guest),
) -> CartResponse:
    require_allowed_origin(request)
    return put_cart(guest.guest_id, payload.expected_revision, payload.items)


@app.delete("/v1/cart", response_model=CartResponse)
def carts_clear(
    request: Request,
    payload: CartDeleteRequest,
    guest: VerifiedGuest = Depends(verify_request_guest),
) -> CartResponse:
    require_allowed_origin(request)
    return delete_cart(guest.guest_id, payload.expected_revision)


@app.post("/v1/checkout/quote", response_model=CheckoutQuoteResponse)
def checkout_quote(
    request: Request,
    payload: CheckoutQuoteRequest,
    guest: VerifiedGuest = Depends(verify_request_guest),
) -> CheckoutQuoteResponse:
    require_allowed_origin(request)
    return quote_current_cart(guest.guest_id, payload)


@app.post("/v1/orders", response_model=ReceiptResponse, status_code=201)
def orders_create(
    request: Request,
    response: Response,
    payload: OrderSubmissionRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=64),
    guest: VerifiedGuest = Depends(verify_request_guest),
) -> ReceiptResponse:
    require_allowed_origin(request)
    _enforce_checkout_rate_limit(guest.guest_id)
    result = submit_order(guest.guest_id, idempotency_key, payload)
    if result.replayed:
        response.status_code = 200
    return result.receipt


@app.post("/v1/cart/pricing", response_model=CartPricingResponse)
def cart_pricing(
    request: Request,
    payload: CartPricingRequest,
    _guest: VerifiedGuest = Depends(verify_request_guest),
) -> CartPricingResponse:
    """Legacy pre-C5 pricing endpoint retained for existing web consumers until ST-09."""
    require_allowed_origin(request)
    snapshot = get_catalog_snapshot()
    validation = validate_cart_items(payload.cart_items, snapshot=snapshot)
    _invalid_cart(validation)

    if (
        payload.restaurant_id
        and validation.items
        and payload.restaurant_id != validation.items[0].restaurant_id
    ):
        raise ApiContractError(
            422,
            "invalid_cart",
            "Pricing restaurant does not match cart restaurant",
            ["restaurant_id"],
        )

    return calculate_cart_pricing(
        validation.items,
        validation.items[0].restaurant_id if validation.items else None,
        payload.discount_cents,
        payload.tip_cents,
        snapshot=snapshot,
    )


@app.get("/v1/orders", response_model=List[ReceiptResponse])
def orders_index(
    cursor: Optional[str] = Query(default=None, max_length=36),
    limit: int = Query(default=50, ge=1, le=50),
    guest: VerifiedGuest = Depends(verify_request_guest),
) -> List[ReceiptResponse]:
    return list_order_snapshots_for_owner(guest.guest_id, cursor=cursor, limit=limit)


@app.get("/v1/orders/{order_id}", response_model=ReceiptResponse)
def orders_show(order_id: str, guest: VerifiedGuest = Depends(verify_request_guest)) -> ReceiptResponse:
    receipt = get_order_snapshot_for_owner(order_id, guest.guest_id)
    if not receipt:
        raise ApiContractError(404, "order_not_found", "Order not found", [])
    return receipt
