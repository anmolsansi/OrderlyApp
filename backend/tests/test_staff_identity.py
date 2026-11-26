"""RS-05 conformance: synthetic RSA only, no live Clerk calls."""
from __future__ import annotations

import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from time import monotonic, time
from urllib.error import URLError

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Request

from app import staff_identity as identity

ISSUER = "https://clerk.example.test"
JWKS_URL = ISSUER + "/.well-known/jwks.json"
PARTY = "https://orderly.example.test"
SUBJECT = "clerk-synthetic-owner"


@pytest.fixture(scope="module")
def signers():
    return {
        name: rsa.generate_private_key(public_exponent=65537, key_size=2048)
        for name in ("one", "two")
    }


def jwk(signers, kid):
    value = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(signers[kid].public_key()))
    return dict(value, kid=kid, alg="RS256", use="sig")


def make_token(signers, *, kid="one", changes=None, headers=None, missing=None):
    now = int(time())
    claims = {"iss": ISSUER, "azp": PARTY, "sub": SUBJECT, "exp": now + 120, "nbf": now - 5}
    claims.update(changes or {})
    if missing:
        claims.pop(missing)
    return jwt.encode(claims, signers[kid], algorithm="RS256", headers={"kid": kid, **(headers or {})})


def request(token=None, *, headers=None):
    raw = headers if headers is not None else ([] if token is None else [(b"authorization", f"Bearer {token}".encode())])
    return Request({"type": "http", "headers": raw, "method": "GET", "path": "/v1/live/staff/memberships"})


class FakeResponse:
    def __init__(self, payload):
        self.body = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size):
        return self.body[:size]


@pytest.fixture
def transport(monkeypatch, signers):
    """Fake only the fixed HTTPS transport; exercise parsing, RSA and cache code."""
    monkeypatch.setenv("ORDERLY_CLERK_ISSUER", ISSUER)
    monkeypatch.setenv("ORDERLY_CLERK_JWKS_URL", JWKS_URL)
    monkeypatch.setenv("ORDERLY_CLERK_AUTHORIZED_PARTIES", PARTY)
    identity._cache.cache_clear()
    state = {"payload": {"keys": [jwk(signers, "one")]}, "calls": [], "outage": False,
             "block_stage": None, "entered": Event(), "release": Event()}

    def maybe_block(stage):
        if state["block_stage"] == stage:
            state["entered"].set()
            if not state["release"].wait(3):
                raise URLError("test transport release timeout")

    class BlockingResponse(FakeResponse):
        def read(self, size):
            maybe_block("body")
            return super().read(size)

    class Opener:
        def open(self, req, timeout):
            state["calls"].append((req.full_url, timeout))
            if state["outage"]:
                raise URLError("private transport detail")
            maybe_block("open")
            return BlockingResponse(state["payload"])

    def opener(*handlers):
        assert any(isinstance(h, identity._NoRedirect) for h in handlers)
        return Opener()

    monkeypatch.setattr(identity, "build_opener", opener)
    yield state
    state["release"].set()
    identity._cache.cache_clear()


def denied(req, status=401, code="staff_auth_required"):
    with pytest.raises(identity.StaffIdentityError) as caught:
        identity.verify_staff_token(req)
    assert (caught.value.status_code, caught.value.code, caught.value.fields) == (status, code, [])
    assert "private transport detail" not in str(caught.value)


def test_valid_signed_subject_matches_contract_fixture(transport, signers):
    fixture_path = Path(__file__).resolve().parents[2] / "tests/fixtures/restaurant-service/v1.json"
    expected = json.loads(fixture_path.read_text())["contracts"]["CON-05"]["positive"]["payload"]
    principal = identity.verify_staff_token(request(make_token(signers, changes={"role": "owner", "restaurant_id": "ignored"})))
    assert vars(principal) == expected
    assert transport["calls"] == [(JWKS_URL, 5)]


@pytest.mark.parametrize("changes", [
    {"iss": "https://other.example.test"},
    {"azp": "https://untrusted.example.test"},
    {"azp": ["https://orderly.example.test"]},
    {"sub": ""},
    {"sub": "   "},
    {"sub": 123},
    {"sub": "owner\nsubject"},
])
def test_invalid_verified_claims(transport, signers, changes):
    denied(request(make_token(signers, changes=changes)))


@pytest.mark.parametrize("missing", ["iss", "azp", "exp", "nbf", "sub"])
def test_required_claims(transport, signers, missing):
    denied(request(make_token(signers, missing=missing)))


@pytest.mark.parametrize("changes", [
    {"exp": 1},
    {"nbf": 4102444800},
    {"exp": "4102444800"},
    {"nbf": False},
    {"nbf": None},
])
def test_invalid_token_times(transport, signers, changes):
    denied(request(make_token(signers, changes=changes)))


def test_altered_signature(transport, signers):
    good = make_token(signers)
    assert identity.verify_staff_token(request(good)).sub == SUBJECT
    token = make_token(signers, kid="two", headers={"kid": "one"})
    # All required claims are valid; only the signing key mismatches the kid.
    assert jwt.decode(token, signers["two"].public_key(), algorithms=["RS256"],
                      issuer=ISSUER, options={"verify_aud": False})["sub"] == SUBJECT
    denied(request(token))


@pytest.mark.parametrize("algorithm,key", [("HS256", "synthetic-test-secret-not-a-real-key"), ("none", None)])
def test_algorithm_confusion_rejected_before_fetch(transport, algorithm, key):
    token = jwt.encode({"sub": SUBJECT}, key, algorithm=algorithm, headers={"kid": "one"})
    denied(request(token))
    assert transport["calls"] == []


@pytest.mark.parametrize("headers", [{"jku": "https://attacker.example.test"}, {"jwk": {}}, {"x5u": "https://attacker.example.test"}, {"crit": ["unknown"]}])
def test_token_controlled_key_selection_rejected(transport, signers, headers):
    denied(request(make_token(signers, headers=headers)))
    assert transport["calls"] == []


def test_missing_invalid_and_duplicate_authorization(transport, signers):
    token = make_token(signers)
    for req in (
        request(),
        request(headers=[(b"cookie", b"orderly_guest=demo")]),
        request(headers=[(b"authorization", b"Basic token")]),
        request(headers=[(b"authorization", b"Bearer a.b.c"), (b"authorization", f"Bearer {token}".encode())]),
        request(headers=[(b"authorization", b"Bearer malformed")]),
    ):
        denied(req)
    assert transport["calls"] == []


def test_cache_reuse_and_unknown_kid_rotation(transport, signers):
    one = request(make_token(signers))
    two = request(make_token(signers, kid="two"))
    assert identity.verify_staff_token(one).sub == SUBJECT
    assert identity.verify_staff_token(one).sub == SUBJECT
    assert len(transport["calls"]) == 1
    transport["payload"] = {"keys": [jwk(signers, "two")]}
    assert identity.verify_staff_token(two).sub == SUBJECT
    assert len(transport["calls"]) == 2
    denied(one)
    assert len(transport["calls"]) == 2


def test_unknown_kid_cold_cache_refreshes_only_once(transport, signers):
    denied(request(make_token(signers, kid="two")))
    assert transport["calls"] == [(JWKS_URL, 5)]


def test_cache_expiry_and_outage_never_use_stale_keys(transport, signers, monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(identity, "monotonic", lambda: clock[0])
    req = request(make_token(signers))
    assert identity.verify_staff_token(req).sub == SUBJECT
    clock[0] += 299
    assert identity.verify_staff_token(req).sub == SUBJECT
    assert len(transport["calls"]) == 1
    clock[0] += 1
    transport["outage"] = True
    denied(req, 503, "identity_unavailable")
    assert len(transport["calls"]) == 2
    denied(req, 503, "identity_unavailable")
    assert len(transport["calls"]) == 2
    transport["outage"] = False
    clock[0] += identity.JWKS_REFRESH_COOLDOWN_SECONDS
    assert identity.verify_staff_token(req).sub == SUBJECT
    assert len(transport["calls"]) == 3


def test_rotation_outage_invalidates_cached_keys(transport, signers):
    one = request(make_token(signers))
    assert identity.verify_staff_token(one).sub == SUBJECT
    transport["outage"] = True
    denied(request(make_token(signers, kid="two")), 503, "identity_unavailable")
    denied(one, 503, "identity_unavailable")
    assert len(transport["calls"]) == 2


@pytest.mark.parametrize("payload", [{}, {"keys": []}, {"keys": [None]}, {"keys": [{}] * 65}, {"keys": [{"kty": "RSA", "kid": "one"}]}])
def test_invalid_jwks_is_unavailable(transport, signers, payload):
    transport["payload"] = payload
    denied(request(make_token(signers)), 503, "identity_unavailable")


def test_duplicate_jwks_key_id_rejected(transport, signers):
    transport["payload"] = {"keys": [jwk(signers, "one"), jwk(signers, "one")]}
    denied(request(make_token(signers)), 503, "identity_unavailable")


def test_jwks_size_cap(transport, signers):
    transport["payload"] = {"keys": [jwk(signers, "one")], "padding": "a" * 65536}
    denied(request(make_token(signers)), 503, "identity_unavailable")


@pytest.mark.parametrize("name,value", [
    ("ORDERLY_CLERK_ISSUER", ""),
    ("ORDERLY_CLERK_JWKS_URL", "http://clerk.example.test/jwks"),
    ("ORDERLY_CLERK_AUTHORIZED_PARTIES", ""),
    ("ORDERLY_CLERK_AUTHORIZED_PARTIES", "*"),
])
def test_invalid_config_fails_closed_without_fetch(transport, signers, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    denied(request(make_token(signers)), 503, "identity_unavailable")
    assert transport["calls"] == []


def test_redirect_handler_refuses_redirect():
    assert identity._NoRedirect().redirect_request(None, None, 302, "", {}, "https://attacker.example.test") is None


def test_unknown_kid_flood_is_globally_throttled_per_cache(transport, signers, monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(identity, "monotonic", lambda: clock[0])
    known = request(make_token(signers))
    assert identity.verify_staff_token(known).sub == SUBJECT
    for index in range(20):
        denied(request(make_token(signers, headers={"kid": f"unknown-{index}"})))
    assert len(transport["calls"]) == 2
    assert identity.verify_staff_token(known).sub == SUBJECT
    transport["payload"] = {"keys": [jwk(signers, "two")]}
    rotated = request(make_token(signers, kid="two"))
    denied(rotated)
    clock[0] += identity.JWKS_REFRESH_COOLDOWN_SECONDS
    assert identity.verify_staff_token(rotated).sub == SUBJECT
    assert len(transport["calls"]) == 3


def test_cold_unknown_kid_does_not_trigger_second_immediate_refresh(transport, signers):
    denied(request(make_token(signers, kid="two")))
    denied(request(make_token(signers, headers={"kid": "other"})))
    assert len(transport["calls"]) == 1


def test_concurrent_cold_requests_share_one_refresh(transport, signers):
    transport["block_stage"] = "open"
    req = request(make_token(signers))
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(identity.verify_staff_token, req) for _ in range(8)]
        try:
            assert transport["entered"].wait(1)
        finally:
            transport["release"].set()
        assert all(future.result(timeout=2).sub == SUBJECT for future in futures)
    assert len(transport["calls"]) == 1


@pytest.mark.parametrize("stage", ["open", "body"])
def test_total_deadline_discards_late_keys_and_bounds_inflight_work(
    transport, signers, monkeypatch, stage
):
    monkeypatch.setattr(identity, "JWKS_TIMEOUT_SECONDS", 0.15)
    transport["block_stage"] = stage
    req = request(make_token(signers))
    cache = identity._cache(identity.load_staff_settings())
    started = monotonic()
    try:
        denied(req, 503, "identity_unavailable")
        assert monotonic() - started < 1
        assert transport["entered"].is_set()
        flight = cache.flight
        assert flight is not None
        for _ in range(10):
            denied(req, 503, "identity_unavailable")
        assert len(transport["calls"]) == 1
    finally:
        transport["release"].set()
    assert flight.done.wait(2)
    assert not flight.succeeded
    denied(req, 503, "identity_unavailable")
    assert len(transport["calls"]) == 1
