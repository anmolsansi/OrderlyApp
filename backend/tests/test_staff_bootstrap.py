from __future__ import annotations

from contextlib import contextmanager, nullcontext
import json
from pathlib import Path
import sys
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from scripts import bootstrap_live_owner as cli
from scripts.provision_live_restaurant import provision_restaurant, validate_input_object


SUBJECT = "clerk-synthetic-owner"


def args_for(rid="r-test", subject=SUBJECT):
    return ["--restaurant-id", rid, "--clerk-user-id", subject]


@pytest.fixture
def target(monkeypatch):
    monkeypatch.setenv("ORDERLY_ENVIRONMENT", "test")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test-only")
    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)


@pytest.mark.parametrize("args", [[], ["--restaurant-id", "r-test"], ["--clerk-user-id", SUBJECT]])
def test_missing_cli_arguments_fail_before_connecting(args, monkeypatch):
    monkeypatch.setattr(cli, "get_connection", lambda: pytest.fail("must not connect"))
    with pytest.raises(SystemExit) as error:
        cli.main(args)
    assert error.value.code == 2


@pytest.mark.parametrize("rid,subject", [
    ("", SUBJECT), ("r" * 101, SUBJECT), ("   ", SUBJECT),
    ("r-test", ""), ("r-test", "  "), ("r-test", "private\nvalue"),
    ("r\x00test", SUBJECT),
])
def test_invalid_identity_rejected_before_connection(rid, subject, target, monkeypatch, capsys):
    monkeypatch.setattr(cli, "get_connection", lambda: pytest.fail("must not connect"))
    assert cli.main(args_for(rid, subject)) == 2
    output = capsys.readouterr()
    assert not output.out
    assert "error:" in output.err
    assert "private" not in output.err


@pytest.mark.parametrize("field,value,expected", [
    ("ORDERLY_ENVIRONMENT", None, "ORDERLY_ENVIRONMENT"),
    ("ORDERLY_ENVIRONMENT", "  ", "ORDERLY_ENVIRONMENT"),
    ("DATABASE_URL", None, "DATABASE_URL"),
    ("DATABASE_URL", "  ", "DATABASE_URL"),
    ("ORDERLY_FORCE_JSON_STORE", "1", "JSON store mode disabled"),
])
def test_target_must_be_explicit(field, value, expected, target, monkeypatch, capsys):
    if value is None:
        monkeypatch.delenv(field, raising=False)
    else:
        monkeypatch.setenv(field, value)
    monkeypatch.setattr(cli, "get_connection", lambda: pytest.fail("must not connect"))
    assert cli.main(args_for()) == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert expected in output.err


def test_database_failure_is_redacted(target, monkeypatch, capsys):
    def unavailable():
        raise psycopg.OperationalError("postgresql://private:secret@hidden/db")

    monkeypatch.setattr(cli, "get_connection", unavailable)
    assert cli.main(args_for()) == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "error: PostgreSQL is unavailable\n"


@pytest.fixture
def db(postgres_database_url):
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as connection:
        connection.execute("SELECT 1")
        try:
            yield connection
        finally:
            connection.rollback()


def provision(db, *, enabled=False, synthetic=False):
    rid = f"rs04-{uuid4().hex}"
    provision_restaurant(db, validate_input_object({
        "restaurant_id": rid, "name": "Test Restaurant", "cuisine": "Indian",
        "brand_label": "Synthetic Test", "timezone": "Asia/Kolkata", "hours": [],
    }))
    if enabled or synthetic:
        db.execute(
            "UPDATE live_restaurants SET ordering_enabled=%s, synthetic=%s WHERE restaurant_id=%s",
            (enabled, synthetic, rid),
        )
    return rid


def memberships(db, rid):
    return db.execute(
        """SELECT restaurant_id, clerk_user_id, role, active, version FROM live_memberships
           WHERE restaurant_id=%s ORDER BY clerk_user_id""", (rid,),
    ).fetchall()


def audits(db, rid):
    return db.execute(
        """SELECT restaurant_id, subject, actor, old_role, new_role, old_active, new_active
           FROM live_membership_audit WHERE restaurant_id=%s""", (rid,),
    ).fetchall()


def assert_disabled(db, rid):
    assert db.execute(
        "SELECT ordering_enabled FROM live_restaurants WHERE restaurant_id=%s", (rid,),
    ).fetchone() == {"ordering_enabled": False}
