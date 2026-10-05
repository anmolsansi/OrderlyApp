from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

from .cart_service import CartConflictError
from .catalog import CatalogConfigurationError
from .database import database_url, get_connection
from .models import CartResponse, OrderSubmissionRequest, ReceiptResponse
from .pricing import (
    CatalogChangedError,
    InvalidCheckoutError,
    build_receipt_snapshot,
    catalog_fingerprint,
)
from .store import (
    get_catalog_snapshot,
    get_guest_cart_row,
    get_order_idempotency_record,
    insert_order_idempotency_record,
    insert_order_snapshot,
    update_guest_cart_row,
    validate_cart_items,
)


class OrderServiceError(RuntimeError):
    """Base class for typed C6 checkout-domain failures."""


class IdempotencyConflictError(OrderServiceError):
    def __init__(self) -> None:
        super().__init__("Idempotency key was reused with a different payload")


class OrderStorageUnavailableError(OrderServiceError):
    def __init__(self) -> None:
        super().__init__("Order storage is unavailable")


@dataclass(frozen=True)
class OrderSubmissionResult:
    receipt: ReceiptResponse
    replayed: bool


def normalize_idempotency_key(value: str) -> str:
    """Validate the C6 header and return its canonical UUID representation."""
    if not value or len(value) > 64 or value != value.strip():
        raise InvalidCheckoutError(["idempotency_key"])
    try:
        return str(UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise InvalidCheckoutError(["idempotency_key"]) from exc


def canonical_order_payload(request: OrderSubmissionRequest) -> bytes:
    """Serialize only the validated C6 body so semantically equal requests hash equally."""
    payload = request.model_dump(mode="json", exclude_none=False)
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def order_request_digest(request: OrderSubmissionRequest) -> str:
    return hashlib.sha256(canonical_order_payload(request)).hexdigest()


def _cart_response(cart) -> CartResponse:
    return CartResponse(revision=cart.revision, items=cart.items)


def _replay_or_conflict(record: dict, payload_sha256: str) -> OrderSubmissionResult:
    if record["payload_sha256"] != payload_sha256:
        raise IdempotencyConflictError()
    return OrderSubmissionResult(receipt=record["receipt"], replayed=True)


def _require_postgres() -> None:
    if not database_url():
        raise OrderStorageUnavailableError()


def _lock_active_guest(conn: object, owner_id: str) -> None:
    """Serialize checkout with ST-11 retention cleanup for the same guest."""
    row = conn.execute(  # type: ignore[attr-defined]
        """
        SELECT id
        FROM guest_sessions
        WHERE id = %s
          AND revoked_at IS NULL
          AND expires_at > now()
        FOR UPDATE
        """,
        (owner_id,),
    ).fetchone()
    if row is None:
        raise OrderStorageUnavailableError()


def submit_order(
    owner_id: str,
    idempotency_key: str,
    request: OrderSubmissionRequest,
) -> OrderSubmissionResult:
    """Accept or replay one C6 checkout using one PostgreSQL transaction."""
    _require_postgres()
    normalized_key = normalize_idempotency_key(idempotency_key)
    payload_sha256 = order_request_digest(request)

    try:
        with get_connection() as conn:
            with conn.transaction():
                # Retention cleanup locks the same guest row. If cleanup won the race
                # after request authentication, this transaction fails safely before
                # touching idempotency, receipts, or the cart.
                _lock_active_guest(conn, owner_id)

                # Replay must be checked before cart validation because a successful first
                # request has already cleared the cart when an unknown-outcome retry arrives.
                existing = get_order_idempotency_record(conn, owner_id, normalized_key)
                if existing is not None:
                    return _replay_or_conflict(existing, payload_sha256)

                # All new submissions for one guest serialize on the cart row. This makes
                # different keys against the same expected revision resolve to one commit.
                cart = get_guest_cart_row(conn, owner_id, for_update=True)

                # A same-key concurrent request may have been waiting on the cart lock while
                # the first transaction committed. Re-read the ledger after acquiring it.
                existing = get_order_idempotency_record(conn, owner_id, normalized_key)
                if existing is not None:
                    return _replay_or_conflict(existing, payload_sha256)

                if cart.revision != request.expected_revision:
                    raise CartConflictError(_cart_response(cart))
                if not cart.items:
                    raise InvalidCheckoutError(["cart"])

                snapshot = get_catalog_snapshot(connection=conn)
                validation = validate_cart_items(cart.items, snapshot=snapshot)
                if validation.issues:
                    raise CatalogChangedError()
                canonical_items = validation.items

                current_fingerprint = catalog_fingerprint(snapshot, canonical_items)
                if current_fingerprint != request.catalog_fingerprint:
                    raise CatalogChangedError()

                receipt = build_receipt_snapshot(
                    order_id=str(uuid4()),
                    created_at=datetime.now(timezone.utc),
                    snapshot=snapshot,
                    items=canonical_items,
                    checkout=request.checkout,
                    promotion_code=request.promotion_code,
                )

                # The receipt, key ledger, and consumed cart are one sealed state change.
                # Any exception before commit rolls all three writes back together.
                insert_order_snapshot(conn, owner_id, receipt)
                insert_order_idempotency_record(
                    conn,
                    owner_id,
                    normalized_key,
                    payload_sha256,
                    receipt.id,
                )
                update_guest_cart_row(conn, owner_id, cart.revision + 1, [])

                return OrderSubmissionResult(receipt=receipt, replayed=False)
    except (
        CartConflictError,
        CatalogChangedError,
        CatalogConfigurationError,
        IdempotencyConflictError,
        InvalidCheckoutError,
        OrderStorageUnavailableError,
    ):
        raise
    except Exception as exc:
        raise OrderStorageUnavailableError() from exc
