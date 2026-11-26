"""Resolve the real Compose model with synthetic credentials; never start containers."""
import json
import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
OWNER = "postgresql://migration_owner:synthetic@postgres:5432/orderlyapp"
RUNTIME = "postgresql://restricted_runtime:synthetic@postgres:5432/orderlyapp"


@pytest.mark.parametrize("runtime", [RUNTIME, None, ""])
def test_compose_database_credentials_are_service_scoped(runtime):
    env = os.environ.copy()
    env.update(ORDERLY_COMPOSE_DATABASE_URL=OWNER, ORDERLY_SESSION_SECRET="synthetic-test-secret-" + "x" * 32)
    env.pop("ORDERLY_COMPOSE_RUNTIME_DATABASE_URL", None)
    if runtime is not None:
        env["ORDERLY_COMPOSE_RUNTIME_DATABASE_URL"] = runtime
    command = ["docker", "compose", "--env-file", "/dev/null", "-f",
               str(ROOT / "docker-compose.yml"), "--profile", "seed", "config", "--format", "json"]
    try:
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        if os.getenv("CI", "").lower() == "true":
            pytest.fail("Hosted CI requires the Docker Compose CLI")
        pytest.skip("Docker Compose CLI is required for this test")
    assert result.returncode == 0, "Docker Compose config resolution failed"
    services = json.loads(result.stdout)["services"]
    assert services["migrate"]["environment"]["DATABASE_URL"] == OWNER
    assert services["seed"]["environment"]["DATABASE_URL"] == OWNER
    assert services["api"]["environment"]["DATABASE_URL"] == (runtime or OWNER)
