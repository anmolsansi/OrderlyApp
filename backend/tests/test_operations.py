from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator
from uuid import uuid4

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app import main as main_module
from app.identity import cleanup_expired_guests
from app.main import app
from app.order_service import _lock_active_guest


class _Rows:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def fetchone(self) -> dict[str, Any] | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self._rows


class _ReadyConnection:
    def __init__(self, *, missing_version: str | None = None) -> None:
        self.missing_version = missing_version

    def execute(self, query: str, _params: object = None) -> _Rows:
        normalized = " ".join(query.split())
        if normalized == "SELECT 1":
            return _Rows([{"?column?": 1}])
        if "to_regclass('public.schema_migrations')" in normalized:
            return _Rows([{"relation": "schema_migrations"}])
        if normalized == "SELECT version FROM schema_migrations":
            versions = sorted(main_module._expected_migration_versions())
            return _Rows(
                [
                    {"version": version}
                    for version in versions
                    if version != self.missing_version
                ]
            )
        raise AssertionError(f"Unexpected readiness query: {normalized}")


class _RatePipeline:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses

    def incr(self, _key: str) -> "_RatePipeline":
        return self

    def expire(self, _key: str, _seconds: int) -> "_RatePipeline":
        return self

    def execute(self) -> list[object]:
        return self.responses


class _RateClient:
    def __init__(self, response_batches: list[list[object]]) -> None:
        self.response_batches = list(response_batches)

    def pipeline(self, *, transaction: bool) -> _RatePipeline:
        assert transaction is True
        if not self.response_batches:
            raise AssertionError("Unexpected rate-limit pipeline call")
        return _RatePipeline(self.response_batches.pop(0))


def _configure_ready_environment(monkeypatch, *, source_sha: str = "abc123") -> None:
    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://hidden-user:hidden-pass@db/orderly")
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", "x" * 32)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", "https://example.test")
    monkeypatch.setenv("ORDERLY_SOURCE_SHA", source_sha)
    monkeypatch.delenv("ORDERLY_CHECKOUT_RATE_WINDOW_SECONDS", raising=False)
    monkeypatch.delenv("ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST", raising=False)
    monkeypatch.delenv("ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE", raising=False)


def test_liveness_is_process_only_and_redacted(isolated_environment, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://hidden-user:hidden-pass@db/orderly")
    monkeypatch.setenv("ORDERLY_SOURCE_SHA", "live-sha")

    response = TestClient(app).get("/health/live")

    assert response.status_code == 200
    assert response.json() == {
        "schema_version": 1,
        "live": True,
        "source_sha": "live-sha",
    }
    serialized = json.dumps(response.json()).lower()
    assert "postgresql://" not in serialized
    assert "hidden-pass" not in serialized
    assert "dependencies" not in response.json()


def test_readiness_rejects_missing_required_configuration(isolated_environment) -> None:
    response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    payload = response.json()
    assert payload["schema_version"] == 1
    assert payload["ready"] is False
    assert payload["dependencies"]["configuration"] == "invalid"
    assert payload["dependencies"]["postgres"] == "not_configured"
    assert payload["error"]["code"] == "not_ready"
    assert payload["error"]["request_id"]


def test_readiness_passes_only_with_required_schema(monkeypatch) -> None:
    _configure_ready_environment(monkeypatch, source_sha="candidate-sha")
    observed_timeout: list[int | None] = []

    @contextmanager
    def fake_connection(*, connect_timeout_seconds: int | None = None) -> Iterator[_ReadyConnection]:
        observed_timeout.append(connect_timeout_seconds)
        yield _ReadyConnection()

    monkeypatch.setattr(main_module, "get_connection", fake_connection)

    response = TestClient(app).get("/health/ready")

    assert response.status_code == 200
    assert observed_timeout == [2]
    assert response.json() == {
        "schema_version": 1,
        "ready": True,
        "mode": "api",
        "source_sha": "candidate-sha",
        "dependencies": {
            "configuration": "ok",
            "postgres": "ok",
            "schema": "ok",
            "rate_limit_configuration": "ok",
        },
    }


def test_readiness_fails_when_a_required_migration_is_missing(monkeypatch) -> None:
    _configure_ready_environment(monkeypatch)
    missing_version = sorted(main_module._expected_migration_versions())[-1]

    @contextmanager
    def fake_connection(*, connect_timeout_seconds: int | None = None) -> Iterator[_ReadyConnection]:
        assert connect_timeout_seconds == 2
        yield _ReadyConnection(missing_version=missing_version)

    monkeypatch.setattr(main_module, "get_connection", fake_connection)

    response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    payload = response.json()
    assert payload["ready"] is False
    assert payload["dependencies"]["postgres"] == "ok"
    assert payload["dependencies"]["schema"] == "missing_migrations"
    assert payload["error"]["fields"] == ["schema_migrations"]


def test_readiness_rejects_invalid_rate_limit_configuration(monkeypatch) -> None:
    _configure_ready_environment(monkeypatch)
    monkeypatch.setenv("ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST", "10")
    monkeypatch.setenv("ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE", "2")

    @contextmanager
    def fake_connection(*, connect_timeout_seconds: int | None = None) -> Iterator[_ReadyConnection]:
        assert connect_timeout_seconds == 2
        yield _ReadyConnection()

    monkeypatch.setattr(main_module, "get_connection", fake_connection)

    response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    payload = response.json()
    assert payload["dependencies"]["rate_limit_configuration"] == "invalid"
    assert "ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE" in payload["error"]["fields"]


def test_readiness_dependency_failure_never_exposes_connection_details(monkeypatch) -> None:
    _configure_ready_environment(monkeypatch)

    @contextmanager
    def failing_connection(*, connect_timeout_seconds: int | None = None):
        assert connect_timeout_seconds == 2
        raise RuntimeError("postgresql://hidden-user:hidden-pass@db/orderly")
        yield

    monkeypatch.setattr(main_module, "get_connection", failing_connection)

    response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    serialized = json.dumps(response.json()).lower()
    assert "postgresql://" not in serialized
    assert "hidden-user" not in serialized
    assert "hidden-pass" not in serialized
    assert response.json()["dependencies"]["postgres"] == "unavailable"


def test_checkout_rate_limit_rejects_per_guest_excess(monkeypatch) -> None:
    monkeypatch.setenv("ORDERLY_CHECKOUT_RATE_WINDOW_SECONDS", "60")
    monkeypatch.setenv("ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST", "1")
    monkeypatch.setenv("ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE", "100")
    monkeypatch.setattr(main_module.time, "time", lambda: 120)
    client = _RateClient(
        [
            [1, True, 1, True],
            [2, True, 2, True],
        ]
    )
    monkeypatch.setattr(main_module, "redis_client", lambda: client)

    main_module._enforce_checkout_rate_limit("guest-a")
    with pytest.raises(main_module.CheckoutRateLimitExceeded) as exc_info:
        main_module._enforce_checkout_rate_limit("guest-a")

    assert exc_info.value.retry_after_seconds == 60


def test_checkout_rate_limit_rejects_aggregate_excess(monkeypatch) -> None:
    monkeypatch.setenv("ORDERLY_CHECKOUT_RATE_WINDOW_SECONDS", "60")
    monkeypatch.setenv("ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST", "10")
    monkeypatch.setenv("ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE", "1")
    monkeypatch.setattr(main_module.time, "time", lambda: 121)
    client = _RateClient(
        [
            [1, True, 1, True],
            [1, True, 2, True],
        ]
    )
    monkeypatch.setattr(main_module, "redis_client", lambda: client)

    main_module._enforce_checkout_rate_limit("guest-a")
    with pytest.raises(main_module.CheckoutRateLimitExceeded):
        main_module._enforce_checkout_rate_limit("guest-b")


def test_checkout_rate_limit_fails_closed_when_redis_is_unavailable(monkeypatch) -> None:
    monkeypatch.delenv("ORDERLY_CHECKOUT_RATE_WINDOW_SECONDS", raising=False)
    monkeypatch.delenv("ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST", raising=False)
    monkeypatch.delenv("ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE", raising=False)
    monkeypatch.setattr(main_module, "redis_client", lambda: None)

    with pytest.raises(main_module.CheckoutRateLimitUnavailable):
        main_module._enforce_checkout_rate_limit("guest-a")


def test_checkout_rate_limit_response_has_retry_after() -> None:
    request = Request({"type": "http", "method": "POST", "path": "/v1/orders", "headers": []})
    request.state.request_id = "request-123"

    response = main_module.checkout_rate_limit_exception_handler(
        request,
        main_module.CheckoutRateLimitExceeded(17),
    )

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "17"
    assert json.loads(response.body)["error"] == {
        "code": "checkout_rate_limited",
        "message": "Checkout is temporarily rate limited",
        "request_id": "request-123",
        "fields": [],
    }


def test_cleanup_purges_expired_guest_and_preserves_active_guest(
    postgres_connection: Any,
    postgres_database_url: str,
    monkeypatch,
) -> None:
    now = datetime.now(timezone.utc)
    expired_id = f"guest-{uuid4()}"
    active_id = f"guest-{uuid4()}"
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    monkeypatch.delenv("REDIS_URL", raising=False)

    postgres_connection.execute(
        """
        INSERT INTO guest_sessions (id, token_hash, created_at, expires_at)
        VALUES (%s, %s, %s, %s), (%s, %s, %s, %s)
        """,
        (
            expired_id,
            uuid4().hex,
            now - timedelta(days=31),
            now - timedelta(seconds=1),
            active_id,
            uuid4().hex,
            now,
            now + timedelta(days=30),
        ),
    )
    postgres_connection.execute(
        "INSERT INTO guest_carts (owner_id, revision, items) VALUES (%s, 0, '[]'::jsonb), (%s, 0, '[]'::jsonb)",
        (expired_id, active_id),
    )
    postgres_connection.commit()

    cleanup_expired_guests(now=now, batch_size=100)

    expired = postgres_connection.execute(
        "SELECT id FROM guest_sessions WHERE id = %s",
        (expired_id,),
    ).fetchone()
    active = postgres_connection.execute(
        "SELECT id FROM guest_sessions WHERE id = %s",
        (active_id,),
    ).fetchone()
    expired_cart = postgres_connection.execute(
        "SELECT owner_id FROM guest_carts WHERE owner_id = %s",
        (expired_id,),
    ).fetchone()
    active_cart = postgres_connection.execute(
        "SELECT owner_id FROM guest_carts WHERE owner_id = %s",
        (active_id,),
    ).fetchone()

    assert expired is None
    assert expired_cart is None
    assert active is not None
    assert active_cart is not None

    postgres_connection.execute("DELETE FROM guest_sessions WHERE id = %s", (active_id,))
    postgres_connection.commit()


def test_cleanup_skips_guest_locked_by_checkout(
    postgres_connection: Any,
    postgres_database_url: str,
    monkeypatch,
) -> None:
    import psycopg

    now = datetime.now(timezone.utc)
    guest_id = f"guest-{uuid4()}"
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    monkeypatch.delenv("REDIS_URL", raising=False)

    postgres_connection.execute(
        """
        INSERT INTO guest_sessions (id, token_hash, created_at, expires_at)
        VALUES (%s, %s, %s, %s)
        """,
        (guest_id, uuid4().hex, now, now + timedelta(minutes=5)),
    )
    postgres_connection.commit()

    with psycopg.connect(postgres_database_url) as checkout_connection:
        with checkout_connection.transaction():
            _lock_active_guest(checkout_connection, guest_id)
            cleanup_expired_guests(now=now + timedelta(minutes=10), batch_size=100)
            still_present = postgres_connection.execute(
                "SELECT id FROM guest_sessions WHERE id = %s",
                (guest_id,),
            ).fetchone()
            assert still_present is not None

    cleanup_expired_guests(now=now + timedelta(minutes=10), batch_size=100)
    removed = postgres_connection.execute(
        "SELECT id FROM guest_sessions WHERE id = %s",
        (guest_id,),
    ).fetchone()
    assert removed is None
