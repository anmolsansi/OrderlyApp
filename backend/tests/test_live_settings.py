"""RS-09 synthetic acceptance through restricted PostgreSQL runtime login."""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from threading import Barrier, Event
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

from test_staff_memberships import auth, client, tenants, staff_runtime_url, error
from app import live_settings
from app.staff_identity import StaffPrincipal
from app.staff_memberships import MembershipError
from app.staff_db_security import assert_staff_runtime_role
from scripts.configure_staff_runtime import grant_staff_runtime

ROOT = Path(__file__).resolve().parents[2]


def endpoint(rid):
    return f"/v1/live/staff/restaurants/{rid}/settings"


def update(version=1, **changes):
    return dict(expected_version=version, name="New Restaurant", brand_label="New Brand",
                timezone="Asia/Kolkata", is_open=True,
                hours=[dict(day=7, opens_minute=1380, closes_minute=1440),
                       dict(day=1, opens_minute=0, closes_minute=60)], **{}) | changes


def test_sunday_and_midnight_half_open_intervals():
    value = live_settings.SettingsUpdate.model_validate(update())
    for stamp, expected in (
        ("2026-11-29T17:29:00+00:00", False),
        ("2026-11-29T17:30:00+00:00", True),
        ("2026-11-29T18:29:00+00:00", True),
        ("2026-11-29T18:30:00+00:00", True),
        ("2026-11-29T19:29:00+00:00", True),
        ("2026-11-29T19:30:00+00:00", False),
    ):
        instant = datetime.fromisoformat(stamp)
        assert live_settings.within_ordering_hours(value, instant) is expected
    assert not live_settings.within_ordering_hours(value.model_copy(update={"is_open": False}), datetime(2026, 11, 29, 18, 30, tzinfo=timezone.utc))
    assert not live_settings.within_ordering_hours(value.model_copy(update={"hours": []}), datetime(2026, 11, 29, 18, 30, tzinfo=timezone.utc))


def snapshot(url, rid):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute("""SELECT to_jsonb(r) AS compatibility, to_jsonb(l) AS live
            FROM restaurants r JOIN live_restaurants l ON l.restaurant_id=r.id WHERE r.id=%s""", (rid,)).fetchone()


def test_round_trip_noop_conflict_and_fixture(client, auth, tenants, postgres_database_url):
    rid = tenants["a"]
    path = endpoint(rid)
    headers = auth(tenants["owner"])
    fixture = json.loads((ROOT / "tests/fixtures/restaurant-service/v1.json").read_text())
    wire = next(case for case in fixture["wire_cases"] if case["id"] == "CON-09-1")
    with psycopg.connect(postgres_database_url) as conn:
        conn.execute("UPDATE restaurants SET name=%s,is_open=%s WHERE id=%s",
                     (wire["request"]["name"], wire["request"]["is_open"], rid))
        conn.execute("UPDATE live_restaurants SET brand_label=%s WHERE restaurant_id=%s",
                     (wire["request"]["brand_label"], rid))
    before = client.get(path, headers=headers)
    assert before.status_code == 200
    assert before.json() == dict(wire["response"], id=rid)
    noop = client.put(path, headers=headers, json=wire["request"])
    assert noop.status_code == 200 and noop.json() == before.json()
    changed = client.put(path, headers=headers, json=update())
    assert changed.status_code == 200, changed.text
    result = changed.json()
    assert result["version"] == 2 and not result["ordering_enabled"]
    assert result["hours"] == list(reversed(update()["hours"]))
    assert client.get(path, headers=headers).json() == result
    error(client.put(path, headers=headers, json=update()), 409, "version_conflict", ["expected_version"])
    assert client.get(path, headers=headers).json() == result


@pytest.mark.parametrize("changes", [
    {"timezone": "UTC"}, {"name": " "}, {"brand_label": "x" * 61},
    {"ordering_enabled": True}, {"expected_version": True}, {"is_open": 1},
    {"hours": [{"day": 0, "opens_minute": 0, "closes_minute": 1}]},
    {"hours": [{"day": True, "opens_minute": 0, "closes_minute": 1}]},
    {"hours": [{"day": 1, "opens_minute": 100, "closes_minute": 100}]},
    {"hours": [{"day": 1, "opens_minute": 0, "closes_minute": 1441}]},
    {"hours": [{"day": 1, "opens_minute": 0, "closes_minute": 60},
               {"day": 1, "opens_minute": 59, "closes_minute": 70}]},
    {"hours": [{"day": 1, "opens_minute": i, "closes_minute": i+1} for i in range(15)]},
])
def test_invalid_settings_preserve_previous_state(client, auth, tenants, postgres_database_url, changes):
    rid = tenants["a"]
    headers = auth(tenants["owner"])
    accepted = client.put(endpoint(rid), headers=headers, json=update())
    assert accepted.status_code == 200
    before = snapshot(postgres_database_url, rid)
    error(client.put(endpoint(rid), headers=headers, json=update(2, **changes) if "expected_version" not in changes else update(**changes)), 422, "invalid_input")
    assert snapshot(postgres_database_url, rid) == before


def test_role_scope_revocation_and_disabled_gate(client, auth, tenants, postgres_database_url, monkeypatch):
    rid = tenants["a"]
    before = snapshot(postgres_database_url, rid)
    for actor, target, code, status in (
        ("staff", rid, "permission_denied", 403), ("cashier", rid, "permission_denied", 403),
        ("foreign", rid, "not_found", 404), ("owner", tenants["demo"], "not_found", 404),
    ):
        error(client.get(endpoint(target), headers=auth(tenants[actor])), status, code)
        error(client.put(endpoint(target), headers=auth(tenants[actor]), json=update()), status, code)
    token = auth(tenants["owner"])
    with psycopg.connect(postgres_database_url) as conn:
        conn.execute("UPDATE live_memberships SET active=false WHERE restaurant_id=%s AND clerk_user_id=%s", (rid, tenants["owner"]))
    error(client.put(endpoint(rid), headers=token, json=update()), 404, "not_found")
    assert snapshot(postgres_database_url, rid) == before
    monkeypatch.setenv("ORDERLY_LIVE_ENABLED", "0")
    error(client.get(endpoint(rid), headers=token), 503, "storage_unavailable")


def test_concurrent_owner_edits_one_wins(tenants, staff_runtime_url, postgres_database_url):
    rid = tenants["a"]
    barrier = Barrier(2)

    def writer(actor):
        with psycopg.connect(staff_runtime_url, row_factory=dict_row) as conn:
            barrier.wait(timeout=5)
            try:
                result = live_settings.put_settings(conn, StaffPrincipal(sub=tenants[actor]), rid,
                                                    live_settings.SettingsUpdate.model_validate(update(name=actor)))
                return result.version
            except MembershipError as exc:
                return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(writer, ["owner", "second"]))
    assert 2 in results and "version_conflict" in results
    assert snapshot(postgres_database_url, rid)["live"]["version"] == 2


def test_queued_write_rechecks_revocation(tenants, staff_runtime_url, postgres_database_url, monkeypatch):
    rid = tenants["a"]
    reached = Event()
    real_lock = live_settings._lock_restaurant

    def observed_lock(*args, **kwargs):
        reached.set()
        return real_lock(*args, **kwargs)
    monkeypatch.setattr(live_settings, "_lock_restaurant", observed_lock)

    def writer():
        with psycopg.connect(staff_runtime_url, row_factory=dict_row) as conn:
            try:
                live_settings.put_settings(conn, StaffPrincipal(sub=tenants["owner"]), rid,
                                           live_settings.SettingsUpdate.model_validate(update()))
            except MembershipError as exc:
                return exc.code
        return "unexpected_success"

    before = snapshot(postgres_database_url, rid)
    with ThreadPoolExecutor(max_workers=1) as pool:
        with psycopg.connect(postgres_database_url) as admin:
            admin.execute("SELECT restaurant_id FROM live_restaurants WHERE restaurant_id=%s FOR UPDATE", (rid,))
            admin.execute("UPDATE live_memberships SET active=false WHERE restaurant_id=%s AND clerk_user_id=%s", (rid, tenants["owner"]))
            future = pool.submit(writer)
            assert reached.wait(timeout=5)
        assert future.result(timeout=5) == "not_found"
    assert snapshot(postgres_database_url, rid) == before


def test_atomic_rollback_on_second_write_failure(client, auth, tenants, postgres_database_url):
    rid = tenants["a"]
    before = snapshot(postgres_database_url, rid)
    constraint = sql.Identifier("rs09_fail_" + uuid4().hex)
    # Dedicated synthetic row constraint, not a global failing trigger.
    with psycopg.connect(postgres_database_url) as admin:
        admin.execute(sql.SQL("ALTER TABLE live_restaurants ADD CONSTRAINT {} CHECK (restaurant_id <> {} OR brand_label <> 'New Brand')").format(constraint, sql.Literal(rid)))
    try:
        error(client.put(endpoint(rid), headers=auth(tenants["owner"]), json=update()), 503, "storage_unavailable")
        assert snapshot(postgres_database_url, rid) == before
    finally:
        with psycopg.connect(postgres_database_url) as admin:
            admin.execute(sql.SQL("ALTER TABLE live_restaurants DROP CONSTRAINT {}").format(constraint))


def test_settings_grants_exclude_scope_and_regrant_revokes_excess(client, auth, tenants, staff_runtime_url, postgres_database_url):
    rid = tenants["a"]
    role = conninfo_to_dict(staff_runtime_url)["user"]
    forbidden = [("live_restaurants", "ordering_enabled"), ("live_restaurants", "synthetic"),
                 ("live_restaurants", "pricing_version"), ("live_restaurants", "catalog_version"),
                 ("live_restaurants", "demo_owner_id"), ("restaurants", "cuisine")]
    with psycopg.connect(staff_runtime_url, row_factory=dict_row) as runtime:
        assert_staff_runtime_role(runtime)
        for table, column in forbidden:
            assert not runtime.execute("SELECT has_column_privilege(current_user, %s, %s, 'UPDATE') AS allowed",
                                       ("public." + table, column)).fetchone()["allowed"]
            with pytest.raises(psycopg.errors.InsufficientPrivilege), runtime.transaction():
                key = "restaurant_id" if table == "live_restaurants" else "id"
                runtime.execute(sql.SQL("UPDATE {} SET {}={} WHERE {}=%s").format(
                    sql.Identifier(table), sql.Identifier(column), sql.Identifier(column), sql.Identifier(key)), (rid,))
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as admin:
        admin.execute(sql.SQL("GRANT UPDATE (cuisine) ON public.restaurants TO {}").format(sql.Identifier(role)))
    error(client.get(endpoint(rid), headers=auth(tenants["owner"])), 503, "storage_unavailable")
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as admin:
        grant_staff_runtime(admin, role)
        grant_staff_runtime(admin, role)
    assert client.get(endpoint(rid), headers=auth(tenants["owner"])).status_code == 200


def test_existing_receipt_and_other_restaurant_unchanged(client, auth, tenants, postgres_database_url):
    from psycopg.types.json import Jsonb

    rid = tenants["a"]
    oid = uuid4()
    receipt = {"id": str(oid), "restaurant_id": rid, "name": "Original Name", "currency": "INR", "total_minor": 100}
    with psycopg.connect(postgres_database_url) as admin:
        admin.execute("""INSERT INTO live_orders(restaurant_id,id,status,created_at,updated_at)
                         VALUES (%s,%s,'Completed',now(),now())""", (rid, oid))
        admin.execute("INSERT INTO live_receipts(restaurant_id,id,snapshot) VALUES (%s,%s,%s)",
                      (rid, oid, Jsonb(receipt)))
    foreign = snapshot(postgres_database_url, tenants["b"])
    response = client.put(endpoint(rid), headers=auth(tenants["owner"]), json=update())
    assert response.status_code == 200
    assert snapshot(postgres_database_url, tenants["b"]) == foreign
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as admin:
        assert admin.execute("SELECT snapshot FROM live_receipts WHERE restaurant_id=%s AND id=%s",
                             (rid, oid)).fetchone()["snapshot"] == receipt
