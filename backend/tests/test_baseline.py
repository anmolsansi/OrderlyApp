from __future__ import annotations

import json
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


def test_health_baseline_does_not_expose_connection_secrets(isolated_environment: None) -> None:
    response = TestClient(app).get("/health")
    serialized = json.dumps(response.json()).lower()

    assert "database_url" not in serialized
    assert "redis_url" not in serialized
    assert "postgresql://" not in serialized
    assert "redis://" not in serialized
