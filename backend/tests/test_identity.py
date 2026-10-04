from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.identity import IdentityError, create_signed_token, load_identity_settings, token_nonce_from_signed_token


TEST_SECRET = "st02-test-secret-that-is-longer-than-32-bytes"


def configure_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", TEST_SECRET)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", "https://orderly.test,http://127.0.0.1:3200")


def test_identity_config_requires_api_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ORDERLY_DATA_MODE", "local_demo")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", TEST_SECRET)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", "https://orderly.test")

    with pytest.raises(IdentityError) as exc_info:
        load_identity_settings()

    assert exc_info.value.status_code == 503
    assert exc_info.value.code == "invalid_config"
    assert exc_info.value.fields == ["ORDERLY_DATA_MODE"]


def test_identity_config_requires_long_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", "too-short")
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", "https://orderly.test")

    with pytest.raises(IdentityError) as exc_info:
        load_identity_settings()

    assert exc_info.value.code == "invalid_config"
    assert exc_info.value.fields == ["ORDERLY_SESSION_SECRET"]


def test_identity_config_rejects_origin_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", TEST_SECRET)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", "https://orderly.test/not-an-origin")

    with pytest.raises(IdentityError) as exc_info:
        load_identity_settings()

    assert exc_info.value.code == "invalid_config"
    assert exc_info.value.fields == ["ORDERLY_ALLOWED_ORIGINS"]


def test_signed_token_round_trip_and_tamper_detection(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_identity(monkeypatch)
    now = datetime(2030, 1, 1, tzinfo=timezone.utc)
    expires_at = now + timedelta(days=30)
    secret = TEST_SECRET.encode("utf-8")
    token = create_signed_token(secret, expires_at, nonce="fixture-nonce")

    nonce, parsed_expiry = token_nonce_from_signed_token(token, secret, now=now)

    assert nonce == "fixture-nonce"
    assert parsed_expiry == expires_at

    tampered = f"{token[:-1]}{'A' if token[-1] != 'A' else 'B'}"
    with pytest.raises(IdentityError) as exc_info:
        token_nonce_from_signed_token(tampered, secret, now=now)
    assert exc_info.value.code == "session_invalid"


def test_signed_token_expiry_is_not_sliding(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_identity(monkeypatch)
    now = datetime(2030, 1, 1, tzinfo=timezone.utc)
    expires_at = now + timedelta(seconds=1)
    secret = TEST_SECRET.encode("utf-8")
    token = create_signed_token(secret, expires_at, nonce="expiring-nonce")

    with pytest.raises(IdentityError) as exc_info:
        token_nonce_from_signed_token(token, secret, now=now + timedelta(seconds=2))

    assert exc_info.value.code == "session_expired"
