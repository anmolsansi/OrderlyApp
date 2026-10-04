from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import app


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_FIXTURE_DIR = REPOSITORY_ROOT / "tests" / "fixtures" / "contracts"
CONTRACT_NAMES = tuple(f"C{index}" for index in range(9))
FORBIDDEN_FIXTURE_TERMS = ("password", "card_number", "cvv", "authorization")


def load_contract_fixture(contract: str) -> dict[str, Any]:
    path = CONTRACT_FIXTURE_DIR / f"{contract.lower()}.json"
    with path.open(encoding="utf-8") as fixture_file:
        payload = json.load(fixture_file)
    assert payload["contract"] == contract
    assert payload["synthetic"] is True
    return payload


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


def test_contract_negative_envelopes_are_explicit() -> None:
    for contract in CONTRACT_NAMES:
        fixture = load_contract_fixture(contract)
        assert fixture["negative"], f"{contract} must define at least one negative case"
        for case in fixture["negative"]:
            assert case["name"]
            error = case["error"]
            assert error["code"]
            assert error["message"]
            assert error["request_id"].startswith("synthetic-request-")
            assert isinstance(error["fields"], list)


def test_contract_schema_versions_are_stable() -> None:
    for contract in CONTRACT_NAMES:
        fixture = load_contract_fixture(contract)
        assert fixture["schema_version"] == 1
        positive = fixture["positive"]
        if "schema_version" in positive:
            assert positive["schema_version"] == 1


def test_contract_fixtures_are_marked_synthetic_and_contain_no_secrets() -> None:
    for contract in CONTRACT_NAMES:
        fixture = load_contract_fixture(contract)
        serialized = json.dumps(fixture).lower()
        for forbidden in FORBIDDEN_FIXTURE_TERMS:
            assert forbidden not in serialized, f"{contract} contains forbidden term: {forbidden}"
