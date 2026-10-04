from __future__ import annotations

import os
from collections.abc import Iterator

import pytest


@pytest.fixture
def isolated_environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Keep unit-style baseline requests away from developer services and secrets."""
    monkeypatch.setenv("ORDERLY_FORCE_JSON_STORE", "1")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("ORDERLY_CORS_ORIGINS", "http://127.0.0.1:3200")
    yield


@pytest.fixture
def postgres_database_url() -> str:
    """Require real Postgres in hosted CI, but allow local unit runs without Docker."""
    url = os.getenv("ORDERLY_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if url:
        return url
    if os.getenv("CI", "").lower() == "true":
        pytest.fail("Hosted backend baseline requires ORDERLY_TEST_DATABASE_URL or DATABASE_URL")
    pytest.skip("Postgres baseline requires ORDERLY_TEST_DATABASE_URL or DATABASE_URL")
