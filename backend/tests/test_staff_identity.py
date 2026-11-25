"""RS-05 conformance: synthetic RSA only, no live Clerk calls."""
from __future__ import annotations

import json
from pathlib import Path
from time import time
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
    state = {"payload": {"keys": [jwk(signers, "one")]}, "calls": [], "outage": False}

    class Opener:
        def open(self, req, timeout):
            state["calls"].append((req.full_url, timeout))
            if state["outage"]:
                raise URLError("private transport detail")
            return FakeResponse(state["payload"])

    def opener(*handlers):
        assert any(isinstance(h, identity._NoRedirect) for h in handlers)
        return Opener()

    monkeypatch.setattr(identity, "build_opener", opener)
    yield state
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
    token = jwt.encode({"sub": SUBJECT}, signers["two"], algorithm="RS256", headers={"kid": "one"})
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
