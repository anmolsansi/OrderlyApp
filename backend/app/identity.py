from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import Request, Response

from .database import get_connection
from .redis_store import delete_cart_keys

COOKIE_NAME = "orderly_guest"
COOKIE_PATH = "/v1"
SESSION_TTL = timedelta(days=30)
TOKEN_VERSION = "v1"
MAX_CLEANUP_BATCH_SIZE = 100


class IdentityError(Exception):
    def __init__(self, status_code: int, code: str, message: str, fields: Iterable[str] = ()) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = list(fields)


@dataclass(frozen=True)
class IdentitySettings:
    mode: str
    secret: bytes
    allowed_origins: frozenset[str]


@dataclass(frozen=True)
class VerifiedGuest:
    guest_id: str
    expires_at: datetime


@dataclass(frozen=True)
class IssuedGuest:
    guest_id: str
    token: str
    expires_at: datetime
    created: bool


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _canonical_origin(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("origin must be an absolute http(s) origin")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError("origin must not contain a path, credentials, query, or fragment")
    return f"{parsed.scheme}://{parsed.netloc}"


def load_identity_settings() -> IdentitySettings:
    mode = os.getenv("ORDERLY_DATA_MODE", "").strip()
    if mode != "api":
        raise IdentityError(
            503,
            "invalid_config",
            "ORDERLY_DATA_MODE must be api for server guest sessions",
            ["ORDERLY_DATA_MODE"],
        )

    secret_value = os.getenv("ORDERLY_SESSION_SECRET", "")
    if len(secret_value.encode("utf-8")) < 32:
        raise IdentityError(
            503,
            "invalid_config",
            "ORDERLY_SESSION_SECRET must contain at least 32 bytes",
            ["ORDERLY_SESSION_SECRET"],
        )

    raw_origins = os.getenv("ORDERLY_ALLOWED_ORIGINS") or os.getenv("ORDERLY_CORS_ORIGINS", "")
    origin_values = [value.strip() for value in raw_origins.split(",") if value.strip()]
    if not origin_values:
        raise IdentityError(
            503,
            "invalid_config",
            "At least one allowed Origin must be configured",
            ["ORDERLY_ALLOWED_ORIGINS"],
        )

    try:
        allowed_origins = frozenset(_canonical_origin(value) for value in origin_values)
    except ValueError as exc:
        raise IdentityError(
            503,
            "invalid_config",
            "Allowed origins must be exact http(s) origins",
            ["ORDERLY_ALLOWED_ORIGINS"],
        ) from exc

    return IdentitySettings(mode=mode, secret=secret_value.encode("utf-8"), allowed_origins=allowed_origins)


def require_allowed_origin(request: Request) -> None:
    settings = load_identity_settings()
    origin = request.headers.get("origin", "")
    if origin not in settings.allowed_origins:
        raise IdentityError(403, "origin_forbidden", "Request origin is not allowed")


def _base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _signature(secret: bytes, signed_part: str) -> str:
    return _base64url(hmac.new(secret, signed_part.encode("ascii"), hashlib.sha256).digest())


def create_signed_token(secret: bytes, expires_at: datetime, *, nonce: str | None = None) -> str:
    token_nonce = nonce or secrets.token_urlsafe(32)
    expires_epoch = int(expires_at.timestamp())
    signed_part = f"{TOKEN_VERSION}.{token_nonce}.{expires_epoch}"
    return f"{signed_part}.{_signature(secret, signed_part)}"


def token_nonce_from_signed_token(token: str, secret: bytes, *, now: datetime | None = None) -> tuple[str, datetime]:
    parts = token.split(".")
    if len(parts) != 4 or parts[0] != TOKEN_VERSION:
        raise IdentityError(401, "session_invalid", "Guest session is invalid")

    version, nonce, expires_value, supplied_signature = parts
    if not nonce or len(nonce) > 128:
        raise IdentityError(401, "session_invalid", "Guest session is invalid")

    signed_part = f"{version}.{nonce}.{expires_value}"
    expected_signature = _signature(secret, signed_part)
    if not hmac.compare_digest(supplied_signature, expected_signature):
        raise IdentityError(401, "session_invalid", "Guest session is invalid")

    try:
        expires_at = datetime.fromtimestamp(int(expires_value), tz=timezone.utc)
    except (OverflowError, TypeError, ValueError) as exc:
        raise IdentityError(401, "session_invalid", "Guest session is invalid") from exc

    current_time = now or utc_now()
    if expires_at <= current_time:
        raise IdentityError(401, "session_expired", "Guest session has expired")

    return nonce, expires_at


def token_hash(nonce: str) -> str:
    return hashlib.sha256(nonce.encode("utf-8")).hexdigest()


def _storage_unavailable() -> IdentityError:
    return IdentityError(503, "storage_unavailable", "Guest session storage is unavailable")


def _lookup_guest(nonce: str, token_expires_at: datetime) -> VerifiedGuest:
    try:
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT id, expires_at, revoked_at
                FROM guest_sessions
                WHERE token_hash = %s
                """,
                (token_hash(nonce),),
            ).fetchone()
    except Exception as exc:
        raise _storage_unavailable() from exc

    if not row or row["revoked_at"] is not None:
        raise IdentityError(401, "session_invalid", "Guest session is invalid")

    db_expires_at = row["expires_at"]
    if db_expires_at.tzinfo is None:
        db_expires_at = db_expires_at.replace(tzinfo=timezone.utc)
    if db_expires_at <= utc_now() or abs((db_expires_at - token_expires_at).total_seconds()) > 1:
        raise IdentityError(401, "session_expired", "Guest session has expired")

    return VerifiedGuest(guest_id=row["id"], expires_at=db_expires_at)


def verify_guest_token(token: str, *, now: datetime | None = None) -> VerifiedGuest:
    settings = load_identity_settings()
    nonce, token_expires_at = token_nonce_from_signed_token(token, settings.secret, now=now)
    return _lookup_guest(nonce, token_expires_at)


def verify_request_guest(request: Request) -> VerifiedGuest:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise IdentityError(401, "session_required", "Guest session is required")
    return verify_guest_token(token)


def _insert_guest(conn: object, secret: bytes, now: datetime) -> IssuedGuest:
    guest_id = f"guest-{uuid4()}"
    expires_at = now + SESSION_TTL
    token = create_signed_token(secret, expires_at)
    nonce, _ = token_nonce_from_signed_token(token, secret, now=now)
    conn.execute(  # type: ignore[attr-defined]
        """
        INSERT INTO guest_sessions (id, token_hash, created_at, expires_at)
        VALUES (%s, %s, %s, %s)
        """,
        (guest_id, token_hash(nonce), now, expires_at),
    )
    return IssuedGuest(guest_id=guest_id, token=token, expires_at=expires_at, created=True)


def cleanup_expired_guests(
    *,
    now: datetime | None = None,
    batch_size: int = MAX_CLEANUP_BATCH_SIZE,
) -> int:
    if batch_size < 1 or batch_size > MAX_CLEANUP_BATCH_SIZE:
        raise ValueError(f"batch_size must be between 1 and {MAX_CLEANUP_BATCH_SIZE}")

    current_time = now or utc_now()
    guest_ids: list[str] = []
    try:
        with get_connection() as conn:
            with conn.transaction():
                rows = conn.execute(
                    """
                    SELECT id
                    FROM guest_sessions
                    WHERE expires_at <= %s OR revoked_at IS NOT NULL
                    ORDER BY expires_at ASC, id ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT %s
                    """,
                    (current_time, batch_size),
                ).fetchall()
                guest_ids = [row["id"] for row in rows]
                if not guest_ids:
                    return 0

                # Legacy rows do not have cascade ownership. New guest_carts,
                # guest_orders, and idempotency rows are removed by guest FK cascades.
                conn.execute("DELETE FROM carts WHERE session_id = ANY(%s)", (guest_ids,))
                conn.execute("DELETE FROM orders WHERE session_id = ANY(%s)", (guest_ids,))
                conn.execute("DELETE FROM guest_sessions WHERE id = ANY(%s)", (guest_ids,))
    except Exception as exc:
        raise _storage_unavailable() from exc

    # Redis is non-authoritative. Purge stale cache keys after the database commit.
    # A Redis outage cannot resurrect authorization because the guest row is gone.
    delete_cart_keys(guest_ids)
    return len(guest_ids)


def bootstrap_guest(existing_token: str | None) -> IssuedGuest:
    settings = load_identity_settings()

    if existing_token:
        try:
            verified = verify_guest_token(existing_token)
            return IssuedGuest(
                guest_id=verified.guest_id,
                token=existing_token,
                expires_at=verified.expires_at,
                created=False,
            )
        except IdentityError as exc:
            if exc.code not in {"session_invalid", "session_expired"}:
                raise

    now = utc_now()
    try:
        with get_connection() as conn:
            with conn.transaction():
                return _insert_guest(conn, settings.secret, now)
    except IdentityError:
        raise
    except Exception as exc:
        raise _storage_unavailable() from exc


def reset_guest(existing_token: str | None) -> IssuedGuest:
    if not existing_token:
        raise IdentityError(401, "session_required", "Guest session is required")

    settings = load_identity_settings()
    nonce, token_expires_at = token_nonce_from_signed_token(existing_token, settings.secret)
    verified = _lookup_guest(nonce, token_expires_at)
    now = utc_now()

    try:
        with get_connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    UPDATE guest_sessions
                    SET revoked_at = %s
                    WHERE id = %s AND revoked_at IS NULL
                    RETURNING id
                    """,
                    (now, verified.guest_id),
                ).fetchone()
                if not row:
                    raise IdentityError(401, "session_invalid", "Guest session is invalid")
                conn.execute("DELETE FROM carts WHERE session_id = %s", (verified.guest_id,))
                conn.execute("DELETE FROM orders WHERE session_id = %s", (verified.guest_id,))
                issued = _insert_guest(conn, settings.secret, now)
    except IdentityError:
        raise
    except Exception as exc:
        raise _storage_unavailable() from exc

    delete_cart_keys([verified.guest_id])
    return issued


def _request_is_https(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", maxsplit=1)[0].strip()
    return forwarded_proto == "https"


def set_guest_cookie(response: Response, request: Request, issued: IssuedGuest) -> None:
    max_age = max(0, int((issued.expires_at - utc_now()).total_seconds()))
    response.set_cookie(
        key=COOKIE_NAME,
        value=issued.token,
        max_age=max_age,
        expires=issued.expires_at,
        path=COOKIE_PATH,
        httponly=True,
        secure=_request_is_https(request),
        samesite="lax",
    )
