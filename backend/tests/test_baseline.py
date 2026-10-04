from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.main import app


def test_health_request_runs_without_external_services(isolated_environment: None) -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["service"] == "orderlyapp-api"
    assert payload["dependencies"] == {
        "postgres": "not_configured",
        "redis": "not_configured",
    }


def test_real_postgres_connection(postgres_connection: Any) -> None:
    row = postgres_connection.execute("SELECT 1 AS value").fetchone()

    assert row is not None
    assert row[0] == 1
