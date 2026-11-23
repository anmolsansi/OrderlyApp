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

