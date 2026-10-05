from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, Iterator

from fastapi.testclient import TestClient

from app import main as main_module
from app.main import app


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


def _configure_ready_environment(monkeypatch, *, source_sha: str = "abc123") -> None:
    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://hidden-user:hidden-pass@db/orderly")
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", "x" * 32)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", "https://example.test")
    monkeypatch.setenv("ORDERLY_SOURCE_SHA", source_sha)


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
