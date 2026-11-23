"""RS-03 / CON-03: real PostgreSQL integration tests for additive DB-B ledgers.

Run against a disposable, fully migrated ORDERLY_TEST_DATABASE_URL/DATABASE_URL.
Each fixture leaves inserts uncommitted and rolls back on teardown. This packet
owns schema/constraint tests, not future live service authorization or payments.
"""
from __future__ import annotations

import hashlib
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
MIGRATION = ROOT / "backend" / "migrations" / "008_live_orders.sql"
FROZEN = ROOT / "tests" / "fixtures" / "restaurant-service" / "v1.json"


@pytest.fixture
def db(postgres_database_url: str):
    """Never commit synthetic business data into the selected test database."""
    with psycopg.connect(postgres_database_url) as connection:
        try:
            yield connection
        finally:
            connection.rollback()


def add_restaurant(db, rid=None):
    rid = rid or f"rs03-r-{uuid4().hex}"
    db.execute(
        """INSERT INTO restaurants
           (id, name, cuisine, rating, delivery_minutes, delivery_fee_cents, image_emoji)
           VALUES (%s,%s,'Synthetic',4.0,'10-20 min',0,'R')""",
        (rid, f"RS-03 {rid}"),
    )
    db.execute(
        "INSERT INTO live_restaurants (restaurant_id,brand_label) VALUES (%s,%s)",
        (rid, "RS-03 Synthetic"),
    )
    return rid


def add_guest(db, *, expired=False):
    gid = f"rs03-g-{uuid4().hex}"
    expiry = datetime.now(timezone.utc) + timedelta(days=-1 if expired else 1)
    db.execute(
        "INSERT INTO guest_sessions (id,token_hash,expires_at) VALUES (%s,%s,%s)",
        (gid, uuid4().hex, expiry),
    )
    return gid


def add_order(db, rid, *, oid=None, status="Submitted"):
    oid = oid or uuid4()
    db.execute(
        """INSERT INTO live_orders
           (restaurant_id,id,status,created_at,updated_at)
           VALUES (%s,%s,%s,now(),now())""",
        (rid, oid, status),
    )
    return oid


def add_receipt(db, rid, oid, *, snapshot=None):
    snapshot = snapshot if snapshot is not None else {
        "schema_version": 1, "id": str(oid), "restaurant_id": rid,
        "currency": "INR", "total_minor": 123,
    }
    db.execute(
        """INSERT INTO live_receipts (restaurant_id,id,snapshot)
           VALUES (%s,%s,%s::jsonb)""",
        (rid, oid, json.dumps(snapshot)),
    )
    return snapshot


def add_order_event(db, rid, oid, *, version=1, event_id=None):
    eid = event_id or uuid4()
    db.execute(
        """INSERT INTO live_order_events
           (restaurant_id,order_id,id,version,from_status,to_status,actor,created_at)
           VALUES (%s,%s,%s,%s,NULL,'Submitted','synthetic-actor',now())""",
        (rid, oid, eid, version),
    )
    return eid


def add_payment(db, rid, oid, *, event_id=None, kind="recorded",
                reverses_id=None, amount_minor=123, method="cash"):
    eid = event_id or uuid4()
    db.execute(
        """INSERT INTO live_payment_events
           (restaurant_id,order_id,id,kind,reverses_id,amount_minor,
            currency,method,actor,created_at)
           VALUES (%s,%s,%s,%s,%s,%s,'INR',%s,'synthetic-cashier',now())""",
        (rid, oid, eid, kind, reverses_id, amount_minor, method),
    )
    return eid


def rejects(db, error_type, statement, parameters=()):
    """A nested transaction provides a savepoint after expected SQL failure."""
    with pytest.raises(error_type):
        with db.transaction():
            db.execute(statement, parameters)


def test_db_b_exact_columns(db):
    expected = {
        "live_carts": {
            "restaurant_id", "guest_id", "revision", "items", "updated_at",
        },
        "live_orders": {
            "restaurant_id", "id", "status", "version", "created_at", "updated_at",
        },
        "live_receipts": {"restaurant_id", "id", "snapshot"},
        "live_guest_access": {
            "restaurant_id", "order_id", "guest_id", "revoked_at",
        },
        "live_order_events": {
            "restaurant_id", "order_id", "id", "version", "from_status",
            "to_status", "actor", "reason", "created_at",
        },
        "live_payment_events": {
            "restaurant_id", "order_id", "id", "kind", "reverses_id",
            "amount_minor", "currency", "method", "actor", "reason",
            "created_at",
        },
        "live_commands": {
            "restaurant_id", "actor_kind", "actor_id", "key",
            "payload_sha256", "response", "response_status", "created_at",
        },
    }
    for name, columns in expected.items():
        actual = {
            row[0] for row in db.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema=current_schema() AND table_name=%s""",
                (name,),
            ).fetchall()
        }
        assert actual == columns, name

