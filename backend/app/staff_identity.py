"""CON-05: verified Clerk identity only; membership authorization belongs to RS-06."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from threading import Lock
from time import monotonic
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request as URLRequest, build_opener

import jwt
from fastapi import Request

JWKS_TIMEOUT_SECONDS = 5
JWKS_TTL_SECONDS = 300
MAX_JWKS_BYTES = 65536
MAX_JWKS_KEYS = 64
MAX_TOKEN_LENGTH = 16384
KEY_HEADERS = frozenset({"jku", "jwk", "x5u", "x5c", "jwks"})


class StaffIdentityError(Exception):
    """Safe contract error for the RS-06 HTTP boundary."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields: list[str] = []


def _invalid() -> StaffIdentityError:
    return StaffIdentityError(401, "staff_auth_required", "Valid staff authentication required")


def _unavailable() -> StaffIdentityError:
    return StaffIdentityError(503, "identity_unavailable", "Staff identity unavailable")


@dataclass(frozen=True)
class StaffPrincipal:
    sub: str


@dataclass(frozen=True)
class StaffSettings:
    issuer: str
    jwks_url: str
    authorized_parties: frozenset[str]


def _https_url(value: str, *, origin: bool = False) -> str:
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https" or not parsed.hostname
        or parsed.username is not None or parsed.password is not None
        or parsed.query or parsed.fragment or any(c.isspace() for c in value)
        or (origin and parsed.path not in ("", "/"))
    ):
        raise ValueError("Invalid trusted HTTPS URL")
    # Validate the port as well; urlsplit otherwise defers malformed ports.
    _ = parsed.port
    return value


def load_staff_settings() -> StaffSettings:
    """Read server-only configuration lazily; guest routes need no Clerk settings."""
    try:
        issuer = _https_url(os.environ["ORDERLY_CLERK_ISSUER"].strip())
        jwks_url = _https_url(os.environ["ORDERLY_CLERK_JWKS_URL"].strip())
        parties = frozenset(
            _https_url(p.strip(), origin=True)
            for p in os.environ["ORDERLY_CLERK_AUTHORIZED_PARTIES"].split(",")
            if p.strip()
        )
        if not parties:
            raise ValueError("Missing authorized parties")
        return StaffSettings(issuer, jwks_url, parties)
    except (KeyError, ValueError):
        raise _unavailable() from None


def _bearer(request: Request) -> str:
    values = request.headers.getlist("authorization")
    if len(values) != 1:
        raise _invalid()
    parts = values[0].split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise _invalid()
    token = parts[1]
    if len(token) > MAX_TOKEN_LENGTH or token.count(".") != 2:
        raise _invalid()
    return token


def _key_id(token: str) -> str:
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if (
            header.get("alg") != "RS256" or KEY_HEADERS.intersection(header)
            or "crit" in header or not isinstance(kid, str)
            or not kid.strip() or len(kid) > 256
        ):
            raise _invalid()
        return kid
    except (jwt.PyJWTError, ValueError, TypeError):
        raise _invalid() from None


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _fetch_keys(url: str) -> dict[str, jwt.PyJWK]:
    """Only the configured endpoint is contacted; never follow redirects."""
    try:
        request = URLRequest(url, headers={"Accept": "application/json"})
        with build_opener(_NoRedirect()).open(request, timeout=JWKS_TIMEOUT_SECONDS) as response:
            body = response.read(MAX_JWKS_BYTES + 1)
        if len(body) > MAX_JWKS_BYTES:
            raise ValueError("Oversized JWKS")
        raw = json.loads(body)
        entries = raw["keys"]
        if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_JWKS_KEYS:
            raise ValueError("Invalid JWKS size")
        keys: dict[str, jwt.PyJWK] = {}
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError("Invalid JWK")
            if (entry.get("kty") != "RSA" or entry.get("alg", "RS256") != "RS256"
                    or entry.get("use", "sig") != "sig"):
                continue
            kid = entry.get("kid")
            if not isinstance(kid, str) or not kid.strip() or len(kid) > 256 or kid in keys:
                raise ValueError("Invalid or duplicate key ID")
            key = jwt.PyJWK.from_dict(entry, algorithm="RS256")
            if key.key.key_size < 2048:
                raise ValueError("Unsafe RSA key size")
            keys[kid] = key
        if not keys:
            raise ValueError("No signing keys")
        return keys
    except Exception:
        # Transport, JSON and key parsing errors are all dependency failures.
        # Never expose endpoint, exception detail, keys or token.
        raise _unavailable() from None


class _KeyCache:
    def __init__(self, url: str) -> None:
        self.url = url
        self.keys: dict[str, jwt.PyJWK] = {}
        self.expires_at = 0.0
        self.lock = Lock()

    def get(self, kid: str) -> jwt.PyJWK:
        with self.lock:
            if monotonic() >= self.expires_at or kid not in self.keys:
                # Refresh at most once per lookup, including a cold/expired cache.
                # Invalidate first so a failed refresh cannot retain stale keys.
                self.keys = {}
                self.expires_at = 0.0
                started = monotonic()
                self.keys = _fetch_keys(self.url)
                self.expires_at = started + JWKS_TTL_SECONDS
            key = self.keys.get(kid)
            if key is None:
                raise _invalid()
            return key


@lru_cache(maxsize=1)
def _cache(settings: StaffSettings) -> _KeyCache:
    return _KeyCache(settings.jwks_url)


def verify_staff_token(request: Request) -> StaffPrincipal:
    """Return only the authenticated subject; no local profile/role fallback."""
    token = _bearer(request)
    kid = _key_id(token)
    settings = load_staff_settings()
    key = _cache(settings).get(kid)
    try:
        claims = jwt.decode(
            token, key.key, algorithms=["RS256"], issuer=settings.issuer,
            options={"require": ["iss", "exp", "nbf", "sub", "azp"],
                     "verify_aud": False, "verify_exp": True, "verify_nbf": True},
        )
        # Clerk uses azp (authorized browser party), not a configured audience.
        if (
            type(claims["exp"]) is not int or type(claims["nbf"]) is not int
            or not isinstance(claims["azp"], str)
            or claims["azp"] not in settings.authorized_parties
            or not isinstance(claims["sub"], str) or not claims["sub"].strip()
            or not claims["sub"].isprintable() or KEY_HEADERS.intersection(claims)
        ):
            raise _invalid()
        return StaffPrincipal(sub=claims["sub"])
    except (jwt.PyJWTError, ValueError, TypeError, OverflowError):
        raise _invalid() from None
