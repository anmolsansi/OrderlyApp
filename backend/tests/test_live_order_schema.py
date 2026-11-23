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


def test_primary_keys_uniques_and_fk_delete_policies(db):
    relation_names = [
        "live_carts", "live_orders", "live_receipts", "live_guest_access",
        "live_order_events", "live_payment_events", "live_commands",
    ]
    constraints = db.execute(
        """SELECT conrelid::regclass::text, contype,
                  confrelid::regclass::text, confdeltype, pg_get_constraintdef(oid)
           FROM pg_constraint WHERE conrelid=ANY(%s::regclass[])""",
        (relation_names,),
    ).fetchall()
    keys = {(table, definition) for table, kind, _, _, definition in constraints
            if kind in {"p", "u"}}
    assert any(table == "live_orders" and "PRIMARY KEY (restaurant_id, id)" in d
               for table, d in keys)
    assert any(table == "live_commands" and
               "PRIMARY KEY (restaurant_id, actor_kind, actor_id, key)" in d
               for table, d in keys)
    assert any(table == "live_order_events" and
               "UNIQUE (restaurant_id, order_id, version)" in d
               for table, d in keys)
    fks = {(table, target, deletion, definition)
           for table, kind, target, deletion, definition in constraints if kind == "f"}
    for table, target in (
        ("live_carts", "guest_sessions"),
        ("live_guest_access", "guest_sessions"),
    ):
        assert any(src == table and dst == target and deletion == "c"
                   for src, dst, deletion, _ in fks)
    for table, target in (
        ("live_carts", "live_restaurants"),
        ("live_orders", "live_restaurants"),
        ("live_receipts", "live_orders"),
        ("live_guest_access", "live_orders"),
        ("live_order_events", "live_orders"),
        ("live_payment_events", "live_orders"),
        ("live_commands", "live_restaurants"),
    ):
        assert any(src == table and dst == target and deletion == "r"
                   for src, dst, deletion, _ in fks)
    assert any(src == "live_payment_events" and dst == "live_payment_events"
               and deletion == "r" and
               "FOREIGN KEY (restaurant_id, order_id, reverses_id)" in definition
               for src, dst, deletion, definition in fks)


def test_guest_cart_revision_defaults_tenant_isolation_and_cascade(db):
    a, b = add_restaurant(db), add_restaurant(db)
    guest = add_guest(db)
    for rid in (a, b):
        db.execute(
            "INSERT INTO live_carts (restaurant_id,guest_id) VALUES (%s,%s)",
            (rid, guest),
        )
    assert db.execute(
        "SELECT revision,items FROM live_carts WHERE restaurant_id=%s AND guest_id=%s",
        (a, guest),
    ).fetchone() == (0, [])
    rejects(
        db, errors.UniqueViolation,
        "INSERT INTO live_carts (restaurant_id,guest_id) VALUES (%s,%s)",
        (a, guest),
    )
    rejects(
        db, errors.CheckViolation,
        "UPDATE live_carts SET revision=-1 WHERE restaurant_id=%s AND guest_id=%s",
        (a, guest),
    )
    db.execute("DELETE FROM guest_sessions WHERE id=%s", (guest,))
    assert db.execute(
        "SELECT COUNT(*) FROM live_carts WHERE guest_id=%s", (guest,)
    ).fetchone()[0] == 0
    assert db.execute(
        "SELECT COUNT(*) FROM live_restaurants WHERE restaurant_id=ANY(%s)",
        ([a, b],),
    ).fetchone()[0] == 2


def test_order_status_version_defaults_and_queue_index(db):
    rid = add_restaurant(db)
    oid = add_order(db, rid)
    assert db.execute(
        "SELECT status,version FROM live_orders WHERE restaurant_id=%s AND id=%s",
        (rid, oid),
    ).fetchone() == ("Submitted", 1)
    for status in ("Accepted", "Preparing", "Ready", "Completed", "Rejected", "Cancelled"):
        assert add_order(db, rid, status=status)
    rejects(
        db, errors.CheckViolation,
        "INSERT INTO live_orders(restaurant_id,id,status,created_at,updated_at) "
        "VALUES (%s,%s,%s,now(),now())",
        (rid, uuid4(), "Paid"),
    )
    rejects(
        db, errors.CheckViolation,
        "UPDATE live_orders SET version=0 WHERE restaurant_id=%s AND id=%s",
        (rid, oid),
    )
    indexes = {
        row[0]: row[1] for row in db.execute(
            "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema()"
        ).fetchall()
    }
    assert "live_orders_queue" in indexes
    assert "(restaurant_id, status, created_at DESC, id DESC)" in indexes["live_orders_queue"]


def test_receipt_snapshot_is_bound_to_exact_order_and_json_object(db):
    rid = add_restaurant(db)
    oid = add_order(db, rid)
    snapshot = add_receipt(db, rid, oid)
    assert db.execute(
        "SELECT snapshot FROM live_receipts WHERE restaurant_id=%s AND id=%s",
        (rid, oid),
    ).fetchone()[0] == snapshot
    rejects(
        db, errors.CheckViolation,
        "INSERT INTO live_receipts(restaurant_id,id,snapshot) VALUES (%s,%s,%s::jsonb)",
        (rid, add_order(db, rid), json.dumps([1, 2])),
    )
    oid2 = add_order(db, rid)
    rejects(
        db, errors.CheckViolation,
        "INSERT INTO live_receipts(restaurant_id,id,snapshot) VALUES (%s,%s,%s::jsonb)",
        (rid, oid2, json.dumps({"id": str(oid), "restaurant_id": rid})),
    )
    rejects(
        db, errors.CheckViolation,
        "INSERT INTO live_receipts(restaurant_id,id,snapshot) VALUES (%s,%s,%s::jsonb)",
        (rid, oid2, json.dumps({"id": str(oid2), "restaurant_id": "other-tenant"})),
    )


def test_receipts_reject_update_and_delete(db):
    rid = add_restaurant(db)
    oid = add_order(db, rid)
    original = add_receipt(db, rid, oid)
    rejects(
        db, errors.CheckViolation,
        "UPDATE live_receipts SET snapshot=%s::jsonb WHERE restaurant_id=%s AND id=%s",
        (json.dumps({**original, "total_minor": 999}), rid, oid),
    )
    rejects(
        db, errors.CheckViolation,
        "DELETE FROM live_receipts WHERE restaurant_id=%s AND id=%s",
        (rid, oid),
    )
    assert db.execute(
        "SELECT snapshot FROM live_receipts WHERE restaurant_id=%s AND id=%s",
        (rid, oid),
    ).fetchone()[0] == original


def test_cross_restaurant_order_references_are_rejected(db):
    a, b = add_restaurant(db), add_restaurant(db)
    oid_a, oid_b = add_order(db, a), add_order(db, b)
    rejects(
        db, errors.ForeignKeyViolation,
        "INSERT INTO live_receipts(restaurant_id,id,snapshot) VALUES (%s,%s,%s::jsonb)",
        (a, oid_b, json.dumps({"id": str(oid_b), "restaurant_id": a})),
    )
    rejects(
        db, errors.ForeignKeyViolation,
        """INSERT INTO live_order_events
           (restaurant_id,order_id,id,version,to_status,actor,created_at)
           VALUES (%s,%s,%s,2,'Ready','synthetic-staff',now())""",
        (a, oid_b, uuid4()),
    )
    rejects(
        db, errors.ForeignKeyViolation,
        """INSERT INTO live_guest_access
           (restaurant_id,order_id,guest_id) VALUES (%s,%s,%s)""",
        (a, oid_b, add_guest(db)),
    )
    add_receipt(db, a, oid_a)
    assert db.execute(
        "SELECT COUNT(*) FROM live_receipts WHERE restaurant_id=%s", (a,)
    ).fetchone()[0] == 1


def test_guest_deletion_retains_restaurant_order_receipt_and_events(db):
    rid, guest = add_restaurant(db), add_guest(db, expired=True)
    oid = add_order(db, rid)
    receipt = add_receipt(db, rid, oid)
    event_id = add_order_event(db, rid, oid, version=1)
    payment_id = add_payment(db, rid, oid)
    db.execute(
        "INSERT INTO live_carts (restaurant_id,guest_id) VALUES (%s,%s)",
        (rid, guest),
    )
    db.execute(
        """INSERT INTO live_guest_access (restaurant_id,order_id,guest_id)
           VALUES (%s,%s,%s)""",
        (rid, oid, guest),
    )
    # The existing cleanup path deletes guest_sessions; only access/cart may
    # cascade. This is the FK step inside a rollback-isolated synthetic test.
    db.execute("DELETE FROM guest_sessions WHERE id=%s", (guest,))
    assert db.execute(
        "SELECT COUNT(*) FROM live_carts WHERE guest_id=%s", (guest,)
    ).fetchone()[0] == 0
    assert db.execute(
        "SELECT COUNT(*) FROM live_guest_access WHERE guest_id=%s", (guest,)
    ).fetchone()[0] == 0
    assert db.execute(
        "SELECT snapshot FROM live_receipts WHERE restaurant_id=%s AND id=%s",
        (rid, oid),
    ).fetchone()[0] == receipt
    assert db.execute(
        "SELECT id FROM live_orders WHERE restaurant_id=%s AND id=%s",
        (rid, oid),
    ).fetchone() == (oid,)
    assert db.execute(
        "SELECT id FROM live_order_events WHERE restaurant_id=%s AND id=%s",
        (rid, event_id),
    ).fetchone() == (event_id,)
    assert db.execute(
        "SELECT id,amount_minor FROM live_payment_events WHERE restaurant_id=%s AND id=%s",
        (rid, payment_id),
    ).fetchone() == (payment_id, 123)


def test_operational_event_version_is_unique_and_not_contiguous(db):
    rid = add_restaurant(db)
    oid = add_order(db, rid)
    first = add_order_event(db, rid, oid, version=1)
    later = add_order_event(db, rid, oid, version=3)
    rejects(
        db, errors.UniqueViolation,
        """INSERT INTO live_order_events
           (restaurant_id,order_id,id,version,to_status,actor,created_at)
           VALUES (%s,%s,%s,3,'Ready','synthetic-staff',now())""",
        (rid, oid, uuid4()),
    )
    assert db.execute(
        "SELECT id FROM live_order_events WHERE restaurant_id=%s AND order_id=%s "
        "ORDER BY version",
        (rid, oid),
    ).fetchall() == [(first,), (later,)]


def test_order_events_are_append_only(db):
    rid = add_restaurant(db)
    oid = add_order(db, rid)
    event_id = add_order_event(db, rid, oid)
    rejects(
        db, errors.CheckViolation,
        "UPDATE live_order_events SET reason='changed' WHERE restaurant_id=%s AND id=%s",
        (rid, event_id),
    )
    rejects(
        db, errors.CheckViolation,
        "DELETE FROM live_order_events WHERE restaurant_id=%s AND id=%s",
        (rid, event_id),
    )
    assert db.execute(
        "SELECT reason FROM live_order_events WHERE restaurant_id=%s AND id=%s",
        (rid, event_id),
    ).fetchone() == (None,)


@pytest.mark.parametrize("field,value", [
    ("kind", "online-settled"),
    ("amount_minor", -1),
    ("currency", "USD"),
    ("method", "bitcoin"),
])
def test_invalid_payment_fields_are_rejected(db, field, value):
    rid = add_restaurant(db)
    oid = add_order(db, rid)
    fields = {
        "kind": "recorded", "amount_minor": 123,
        "currency": "INR", "method": "upi",
    }
    fields[field] = value
    rejects(
        db, errors.CheckViolation,
        """INSERT INTO live_payment_events
           (restaurant_id,order_id,id,kind,amount_minor,currency,
            method,actor,created_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,'synthetic-cashier',now())""",
        (rid, oid, uuid4(), fields["kind"], fields["amount_minor"],
         fields["currency"], fields["method"]),
    )
    assert db.execute(
        "SELECT COUNT(*) FROM live_payment_events WHERE restaurant_id=%s",
        (rid,),
    ).fetchone()[0] == 0


def test_payment_inr_max_minor_unit_and_optional_method(db):
    rid = add_restaurant(db)
    oid = add_order(db, rid)
    eid = add_payment(db, rid, oid, amount_minor=2_147_483_647, method=None)
    assert db.execute(
        "SELECT amount_minor,currency,method FROM live_payment_events "
        "WHERE restaurant_id=%s AND id=%s",
        (rid, eid),
    ).fetchone() == (2_147_483_647, "INR", None)


def test_reversals_must_reference_same_order_and_cannot_repeat(db):
    rid = add_restaurant(db)
    first_order, second_order = add_order(db, rid), add_order(db, rid)
    original = add_payment(db, rid, first_order)
    reversed_id = add_payment(
        db, rid, first_order, kind="reversed",
        reverses_id=original, method=None,
    )
    rejects(
        db, errors.UniqueViolation,
        """INSERT INTO live_payment_events
           (restaurant_id,order_id,id,kind,reverses_id,amount_minor,currency,
            actor,created_at)
           VALUES (%s,%s,%s,'reversed',%s,123,'INR','synthetic-cashier',now())""",
        (rid, first_order, uuid4(), original),
    )
    rejects(
        db, errors.ForeignKeyViolation,
        """INSERT INTO live_payment_events
           (restaurant_id,order_id,id,kind,reverses_id,amount_minor,currency,
            actor,created_at)
           VALUES (%s,%s,%s,'reversed',%s,123,'INR','synthetic-cashier',now())""",
        (rid, second_order, uuid4(), original),
    )
    other = add_restaurant(db)
    other_oid = add_order(db, other)
    rejects(
        db, errors.ForeignKeyViolation,
        """INSERT INTO live_payment_events
           (restaurant_id,order_id,id,kind,reverses_id,amount_minor,currency,
            actor,created_at)
           VALUES (%s,%s,%s,'reversed',%s,123,'INR','synthetic-cashier',now())""",
        (other, other_oid, uuid4(), original),
    )
    assert db.execute(
        "SELECT reverses_id FROM live_payment_events WHERE restaurant_id=%s AND id=%s",
        (rid, reversed_id),
    ).fetchone() == (original,)

