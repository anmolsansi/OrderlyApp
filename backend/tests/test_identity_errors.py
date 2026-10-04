from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import app.identity as identity_module
from app.identity import COOKIE_NAME, create_signed_token, utc_now
from app.main import app


TEST_ORIGIN = "https://orderly.test"
TEST_SECRET = "st02-error-test-secret-that-is-longer-than-32-bytes"


def configure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", TEST_SECRET)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", TEST_ORIGIN)


def test_expired_cookie_returns_stable_401(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch)
    expired = create_signed_token(
        TEST_SECRET.encode("utf-8"),
        utc_now() - timedelta(seconds=1),
        nonce="expired-fixture",
    )

    response = TestClient(app, base_url=TEST_ORIGIN).get(
        "/v1/cart",
        headers={"Cookie": f"{COOKIE_NAME}={expired}"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_expired"
    assert response.json()["error"]["message"] == "Guest session has expired"
    assert response.json()["error"]["request_id"]


def test_session_bootstrap_fails_closed_when_storage_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure(monkeypatch)

    def unavailable_connection():
        raise RuntimeError("synthetic storage outage")

    monkeypatch.setattr(identity_module, "get_connection", unavailable_connection)
    response = TestClient(app, base_url=TEST_ORIGIN).post(
        "/v1/session",
        headers={"Origin": TEST_ORIGIN},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "storage_unavailable"
    assert response.json()["error"]["message"] == "Guest session storage is unavailable"
    assert "synthetic storage outage" not in response.text
