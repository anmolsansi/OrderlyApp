from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from uuid import UUID

from .models import OrderSubmissionRequest, ReceiptResponse
from .pricing import InvalidCheckoutError


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
