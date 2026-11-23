"""RS-02 / CON-02 PostgreSQL integration checks for additive live-v1 storage.

Only the two DB-A tables are in scope. Hours are validated at the future
Pydantic write boundary; this migration deliberately does not add a live API.
CI must supply a migrated real PostgreSQL database, never a fake connector.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import errors, sql

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "backend" / "migrations" / "007_live_restaurants.sql"
FROZEN_FIXTURE = ROOT / "tests" / "fixtures" / "restaurant-service" / "v1.json"


@pytest.fixture
def db(postgres_database_url: str):
    """Isolate synthetic inserts with an outer transaction that is never committed."""
    with psycopg.connect(postgres_database_url) as connection:
        try:
            yield connection
        finally:
            connection.rollback()


def mock_restaurant(db, *, restaurant_id: str | None = None) -> str:
    rid = restaurant_id or f"rs02-r-{uuid4().hex}"
    db.execute(
        """INSERT INTO restaurants
           (id, name, cuisine, rating, delivery_minutes, delivery_fee_cents, image_emoji)
           VALUES (%s, %s, 'Synthetic', 4.0, '10-20 min', 0, 'R')""",
        (rid, f"RS-02 {rid}"),
    )
    return rid


def mock_guest(db) -> str:
    guest_id = f"rs02-g-{uuid4().hex}"
    db.execute(
        """INSERT INTO guest_sessions (id, token_hash, expires_at)
           VALUES (%s, %s, %s)""",
        (guest_id, uuid4().hex, datetime.now(timezone.utc) + timedelta(days=1)),
    )
    return guest_id


def add_live(db, restaurant_id: str, **changes) -> None:
    fields = {"restaurant_id": restaurant_id, "brand_label": "RS-02 Demo", **changes}
    columns = sql.SQL(", ").join(sql.Identifier(column) for column in fields)
    values = sql.SQL(", ").join(
        sql.SQL("%s::jsonb") if column in {"hours", "pricing_profile"}
        else sql.Placeholder()
        for column in fields
    )
    db.execute(
        sql.SQL("INSERT INTO live_restaurants ({}) VALUES ({})").format(columns, values),
        tuple(fields.values()),
    )


def add_table(db, restaurant_id: str, label: str = "T1", *, table_id=None):
    tid = table_id or uuid4()
    db.execute(
        "INSERT INTO live_tables (restaurant_id, id, label) VALUES (%s, %s, %s)",
        (restaurant_id, tid, label),
    )
    return tid


def rejects(db, error_class, statement: str, args: tuple) -> None:
    """Roll back only the failed mutation, keeping the positive fixture intact."""
    with pytest.raises(error_class):
        with db.transaction():
            db.execute(statement, args)


def test_schema_exposes_exact_db_a_columns(db):
    expected = {
        "live_restaurants": {
            "restaurant_id", "version", "catalog_version", "brand_label",
            "timezone", "hours", "ordering_enabled", "pricing_version",
            "pricing_profile", "synthetic", "demo_owner_id",
            "created_at", "updated_at",
        },
        "live_tables": {"restaurant_id", "id", "label", "active", "version"},
    }
    for table, names in expected.items():
        rows = db.execute(
            """SELECT column_name FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = %s""",
            (table,),
        ).fetchall()
        assert {row[0] for row in rows} == names, table


def test_primary_keys_uniques_and_on_delete_contract(db):
    keys = db.execute(
        """SELECT conrelid::regclass::text, contype, pg_get_constraintdef(oid)
           FROM pg_constraint WHERE conrelid IN
           ('live_restaurants'::regclass, 'live_tables'::regclass)"""
    ).fetchall()
    assert any(table == "live_restaurants" and kind == "p" and
               "PRIMARY KEY (restaurant_id)" in definition
               for table, kind, definition in keys)
    assert any(table == "live_tables" and kind == "p" and
               "PRIMARY KEY (restaurant_id, id)" in definition
               for table, kind, definition in keys)
    assert any(table == "live_tables" and kind == "u" and
               "UNIQUE (restaurant_id, label)" in definition
               for table, kind, definition in keys)
    fks = db.execute(
        """SELECT conrelid::regclass::text, confrelid::regclass::text,
                  confdeltype
           FROM pg_constraint WHERE contype = 'f'
           AND conrelid IN ('live_restaurants'::regclass, 'live_tables'::regclass)"""
    ).fetchall()
    assert ("live_restaurants", "restaurants", "r") in fks
    assert ("live_restaurants", "guest_sessions", "n") in fks
    assert ("live_tables", "live_restaurants", "r") in fks


def test_unconfigured_restaurant_stays_disabled_and_defaults_are_safe(db):
    rid = mock_restaurant(db)
    assert db.execute(
        "SELECT ordering_enabled FROM live_restaurants WHERE restaurant_id = %s",
        (rid,),
    ).fetchone() is None
    add_live(db, rid)
    row = db.execute(
        """SELECT version, catalog_version, brand_label, timezone, hours,
                  ordering_enabled, pricing_version, pricing_profile, synthetic,
                  demo_owner_id, created_at, updated_at
           FROM live_restaurants WHERE restaurant_id = %s""",
        (rid,),
    ).fetchone()
    assert row[:5] == (1, 1, "RS-02 Demo", "Asia/Kolkata", [])
    assert row[5:10] == (False, 1, None, False, None)
    assert all(value.tzinfo is not None for value in row[10:])
    assert db.execute(
        """SELECT COALESCE(ordering_enabled, FALSE)
           FROM restaurants LEFT JOIN live_restaurants
           ON restaurants.id = live_restaurants.restaurant_id
           WHERE restaurants.id = %s""",
        (rid,),
    ).fetchone() == (False,)


def test_table_ids_and_labels_are_tenant_scoped(db):
    rid_a, rid_b = mock_restaurant(db), mock_restaurant(db)
    add_live(db, rid_a)
    add_live(db, rid_b)
    shared_id = uuid4()
    add_table(db, rid_a, "T1", table_id=shared_id)
    add_table(db, rid_b, "T1", table_id=shared_id)
    assert db.execute(
        "SELECT COUNT(*) FROM live_tables WHERE id = %s", (shared_id,)
    ).fetchone()[0] == 2
    rejects(
        db, errors.UniqueViolation,
        "INSERT INTO live_tables (restaurant_id,id,label) VALUES (%s,%s,%s)",
        (rid_a, uuid4(), "T1"),
    )
    rejects(
        db, errors.UniqueViolation,
        "INSERT INTO live_tables (restaurant_id,id,label) VALUES (%s,%s,%s)",
        (rid_a, shared_id, "Another"),
    )
    assert db.execute(
        "SELECT COUNT(*) FROM live_tables WHERE id = %s", (shared_id,)
    ).fetchone()[0] == 2


@pytest.mark.parametrize("invalid_label", ["", "x" * 31])
def test_table_label_length_bounds_reject_invalid_values(db, invalid_label):
    rid = mock_restaurant(db)
    add_live(db, rid)
    rejects(
        db, errors.CheckViolation,
        "INSERT INTO live_tables (restaurant_id,id,label) VALUES (%s,%s,%s)",
        (rid, uuid4(), invalid_label),
    )
    assert db.execute(
        "SELECT COUNT(*) FROM live_tables WHERE restaurant_id = %s", (rid,)
    ).fetchone()[0] == 0


def test_table_defaults_and_maximum_label(db):
    rid = mock_restaurant(db)
    add_live(db, rid)
    tid = add_table(db, rid, "X" * 30)
    assert db.execute(
        "SELECT label, active, version FROM live_tables WHERE restaurant_id=%s AND id=%s",
        (rid, tid),
    ).fetchone() == ("X" * 30, True, 1)
    rejects(
        db, errors.CheckViolation,
        "INSERT INTO live_tables(restaurant_id,id,label,version) VALUES (%s,%s,%s,%s)",
        (rid, uuid4(), "T2", 0),
    )


@pytest.mark.parametrize("field, bad", [
    ("version", 0),
    ("catalog_version", -1),
    ("timezone", "UTC"),
])
def test_invalid_restaurant_config_is_rejected(db, field, bad):
    rid = mock_restaurant(db)
    rejects(
        db, errors.CheckViolation,
        f"INSERT INTO live_restaurants (restaurant_id, brand_label, {field}) VALUES (%s,%s,%s)",
        (rid, "Invalid config", bad),
    )
    assert db.execute(
        "SELECT COUNT(*) FROM live_restaurants WHERE restaurant_id=%s", (rid,)
    ).fetchone()[0] == 0


def test_unknown_restaurant_or_demo_guest_rejected(db):
    rid = mock_restaurant(db)
    rejects(
        db, errors.ForeignKeyViolation,
        "INSERT INTO live_restaurants (restaurant_id,brand_label) VALUES (%s,%s)",
        (f"unknown-{uuid4().hex}", "Ghost"),
    )
    rejects(
        db, errors.ForeignKeyViolation,
        """INSERT INTO live_restaurants
           (restaurant_id,brand_label,demo_owner_id) VALUES (%s,%s,%s)""",
        (rid, "Invalid owner", f"unknown-guest-{uuid4().hex}"),
    )
    add_live(db, rid)
    rejects(
        db, errors.ForeignKeyViolation,
        "INSERT INTO live_tables(restaurant_id,id,label) VALUES (%s,%s,%s)",
        (f"unknown-live-{uuid4().hex}", uuid4(), "T1"),
    )
    assert db.execute(
        "SELECT COUNT(*) FROM live_tables WHERE restaurant_id=%s", (rid,)
    ).fetchone()[0] == 0


def test_parent_deletes_restricted_and_existing_live_rows_survive(db):
    rid = mock_restaurant(db)
    add_live(db, rid)
    tid = add_table(db, rid)
    rejects(
        db, errors.ForeignKeyViolation,
        "DELETE FROM restaurants WHERE id=%s",
        (rid,),
    )
    rejects(
        db, errors.ForeignKeyViolation,
        "DELETE FROM live_restaurants WHERE restaurant_id=%s",
        (rid,),
    )
    assert db.execute("SELECT id FROM restaurants WHERE id=%s", (rid,)).fetchone() == (rid,)
    assert db.execute(
        "SELECT id FROM live_tables WHERE restaurant_id=%s AND id=%s", (rid, tid)
    ).fetchone() == (tid,)


def test_guest_deletion_nulls_demo_owner_without_deleting_restaurant(db):
    rid = mock_restaurant(db)
    owner_id = mock_guest(db)
    add_live(db, rid, synthetic=True, demo_owner_id=owner_id)
    db.execute("DELETE FROM guest_sessions WHERE id=%s", (owner_id,))
    assert db.execute(
        "SELECT synthetic,demo_owner_id,ordering_enabled FROM live_restaurants WHERE restaurant_id=%s",
        (rid,),
    ).fetchone() == (True, None, False)
    assert db.execute("SELECT id FROM restaurants WHERE id=%s", (rid,)).fetchone() == (rid,)


def test_valid_india_hours_and_pricing_profile_round_trip_without_activation(db):
    rid = mock_restaurant(db)
    hours = [
        {"day": 1, "opens_minute": 1380, "closes_minute": 1440},
        {"day": 2, "opens_minute": 0, "closes_minute": 60},
    ]
    profile = {"display_only": "U1 approval required"}
    db.execute(
        """INSERT INTO live_restaurants
           (restaurant_id,brand_label,hours,pricing_profile,synthetic)
           VALUES (%s,%s,%s::jsonb,%s::jsonb,%s)""",
        (rid, "Café का नाम", json.dumps(hours), json.dumps(profile), True),
    )
    row = db.execute(
        """SELECT brand_label,timezone,hours,pricing_profile,synthetic,ordering_enabled
           FROM live_restaurants WHERE restaurant_id=%s""",
        (rid,),
    ).fetchone()
    assert row == ("Café का नाम", "Asia/Kolkata", hours, profile, True, False)


def test_007_additive_upgrade_preserves_existing_catalog_and_receipt(db):
    """Apply 007 to a transaction-local legacy schema, not a real deployed DB."""
    schema_name = f"rs02_upgrade_{uuid4().hex[:12]}"
    db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema_name)))
    db.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema_name)))
    db.execute("CREATE TABLE restaurants (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
    db.execute("CREATE TABLE guest_sessions (id TEXT PRIMARY KEY)")
    db.execute("CREATE TABLE guest_orders (id UUID PRIMARY KEY, snapshot JSONB NOT NULL)")
    db.execute("CREATE TABLE orders (id TEXT PRIMARY KEY, status TEXT NOT NULL)")
    restaurant_id, receipt_id = f"legacy-{uuid4().hex}", uuid4()
    receipt = {"id": str(receipt_id), "kind": "mock-v1", "total_cents": 1192}
    db.execute(
        "INSERT INTO restaurants(id,name) VALUES (%s,%s)",
        (restaurant_id, "Original mock catalog"),
    )
    db.execute(
        "INSERT INTO guest_orders(id,snapshot) VALUES (%s,%s::jsonb)",
        (receipt_id, json.dumps(receipt)),
    )
    db.execute("INSERT INTO orders(id,status) VALUES (%s,%s)", ("legacy-order", "Placed"))
    db.execute(MIGRATION.read_text(encoding="utf-8"))
    assert db.execute(
        "SELECT id,name FROM restaurants WHERE id=%s", (restaurant_id,)
    ).fetchone() == (restaurant_id, "Original mock catalog")
    assert db.execute(
        "SELECT snapshot FROM guest_orders WHERE id=%s", (receipt_id,)
    ).fetchone() == (receipt,)
    assert db.execute(
        "SELECT status FROM orders WHERE id='legacy-order'"
    ).fetchone() == ("Placed",)
    assert db.execute("SELECT COUNT(*) FROM live_restaurants").fetchone() == (0,)
    assert db.execute("SELECT COUNT(*) FROM live_tables").fetchone() == (0,)
    add_live(db, restaurant_id)
    assert db.execute(
        "SELECT ordering_enabled FROM live_restaurants WHERE restaurant_id=%s",
        (restaurant_id,),
    ).fetchone() == (False,)

