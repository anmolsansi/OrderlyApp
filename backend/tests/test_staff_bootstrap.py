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


def test_first_bootstrap_matches_frozen_membership_contract(db):
    rid = provision(db)
    fixture = json.loads((ROOT / "tests/fixtures/restaurant-service/v1.json").read_text())
    expected = dict(fixture["contracts"]["CON-04"]["positive"]["payload"])
    expected["restaurant_id"] = rid
    assert cli.bootstrap_owner(db, rid, SUBJECT) == {
        "restaurant_id": rid, "clerk_user_id": SUBJECT,
    }
    assert memberships(db, rid) == [expected]
    assert audits(db, rid) == [{
        "restaurant_id": rid, "subject": SUBJECT, "actor": "operator:bootstrap",
        "old_role": None, "new_role": "owner", "old_active": None, "new_active": True,
    }]
    assert_disabled(db, rid)


def test_identical_bootstrap_is_a_true_noop(db):
    rid = provision(db)
    cli.bootstrap_owner(db, rid, SUBJECT)
    before = db.execute(
        "SELECT * FROM live_memberships WHERE restaurant_id=%s", (rid,),
    ).fetchall()
    audit_before = db.execute(
        "SELECT * FROM live_membership_audit WHERE restaurant_id=%s", (rid,),
    ).fetchall()
    assert cli.bootstrap_owner(db, rid, SUBJECT) == {
        "restaurant_id": rid, "clerk_user_id": SUBJECT,
    }
    assert db.execute(
        "SELECT * FROM live_memberships WHERE restaurant_id=%s", (rid,),
    ).fetchall() == before
    assert db.execute(
        "SELECT * FROM live_membership_audit WHERE restaurant_id=%s", (rid,),
    ).fetchall() == audit_before


def test_different_owner_cannot_replace_initial_owner(db):
    rid = provision(db)
    cli.bootstrap_owner(db, rid, SUBJECT)
    before = memberships(db, rid)
    with pytest.raises(cli.BootstrapError, match="conflicting"):
        cli.bootstrap_owner(db, rid, "clerk-other")
    assert memberships(db, rid) == before
    assert len(audits(db, rid)) == 1
    assert_disabled(db, rid)


@pytest.mark.parametrize("role,active,existing_subject", [
    ("order_staff", True, SUBJECT), ("cashier", True, SUBJECT),
    ("owner", False, SUBJECT), ("owner", False, "clerk-other"),
])
def test_incompatible_membership_not_elevated_or_reactivated(db, role, active, existing_subject):
    rid = provision(db)
    db.execute(
        """INSERT INTO live_memberships (restaurant_id, clerk_user_id, role, active)
           VALUES (%s,%s,%s,%s)""", (rid, existing_subject, role, active),
    )
    before = memberships(db, rid)
    with pytest.raises(cli.BootstrapError, match="conflicting"):
        cli.bootstrap_owner(db, rid, SUBJECT)
    assert memberships(db, rid) == before
    assert audits(db, rid) == []


def test_unknown_restaurant_fails_without_writes(db):
    rid = f"missing-{uuid4().hex}"
    with pytest.raises(cli.BootstrapError, match="not found"):
        cli.bootstrap_owner(db, rid, SUBJECT)
    assert memberships(db, rid) == audits(db, rid) == []


@pytest.mark.parametrize("enabled,synthetic", [(True, False), (False, True)])
def test_bootstrap_refuses_enabled_or_demo_restaurant(db, enabled, synthetic):
    rid = provision(db, enabled=enabled, synthetic=synthetic)
    with pytest.raises(cli.BootstrapError, match="disabled non-demo"):
        cli.bootstrap_owner(db, rid, SUBJECT)
    assert memberships(db, rid) == audits(db, rid) == []
    assert db.execute(
        "SELECT ordering_enabled, synthetic FROM live_restaurants WHERE restaurant_id=%s", (rid,),
    ).fetchone() == {"ordering_enabled": enabled, "synthetic": synthetic}


def test_subject_can_have_membership_in_independent_restaurants(db):
    first, second = provision(db), provision(db)
    cli.bootstrap_owner(db, first, SUBJECT)
    cli.bootstrap_owner(db, second, SUBJECT)
    assert len(memberships(db, first)) == len(memberships(db, second)) == 1
    assert len(audits(db, first)) == len(audits(db, second)) == 1
    assert_disabled(db, first)
    assert_disabled(db, second)
