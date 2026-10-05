from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import pytest
from fastapi.testclient import TestClient

import app.identity as identity_module
from app.identity import COOKIE_NAME, token_hash, token_nonce_from_signed_token
from app.main import app


TEST_ORIGIN = "https://orderly.test"
TEST_SECRET = "st02-integration-secret-that-is-longer-than-32-bytes"


@pytest.fixture
def identity_environment(monkeypatch: pytest.MonkeyPatch, postgres_database_url: str) -> None:
    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", TEST_SECRET)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", TEST_ORIGIN)


def bootstrap(client: TestClient) -> str:
    response = client.post("/v1/session", headers={"Origin": TEST_ORIGIN})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["schema_version"] == 1
    assert "guest" not in payload
    token = client.cookies.get(COOKIE_NAME)
    assert token
    return token


def guest_id_for_token(postgres_connection, token: str) -> str:
    nonce, _ = token_nonce_from_signed_token(token, TEST_SECRET.encode("utf-8"))
    row = postgres_connection.execute(
        "SELECT id FROM guest_sessions WHERE token_hash = %s",
        (token_hash(nonce),),
    ).fetchone()
    assert row is not None
    return row[0]


def cleanup_guest_rows(postgres_connection) -> None:
    postgres_connection.execute("DELETE FROM guest_orders WHERE owner_id LIKE 'guest-%'")
    postgres_connection.execute("DELETE FROM guest_carts WHERE owner_id LIKE 'guest-%'")
    postgres_connection.execute("DELETE FROM carts WHERE session_id LIKE 'guest-%'")
    postgres_connection.execute("DELETE FROM orders WHERE session_id LIKE 'guest-%'")
    postgres_connection.execute("DELETE FROM guest_sessions")
    postgres_connection.commit()


def test_returning_guest_bootstrap_formats_non_utc_database_expiry(
    identity_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TestClient(app, base_url=TEST_ORIGIN)
    token = bootstrap(client)
    _, expires_at = token_nonce_from_signed_token(token, TEST_SECRET.encode("utf-8"))
    original_connection = identity_module.get_connection

    @contextmanager
    def non_utc_connection():
        with original_connection() as conn:
            conn.execute("SET TIME ZONE 'America/New_York'")
            yield conn

    monkeypatch.setattr(identity_module, "get_connection", non_utc_connection)
    response = client.post("/v1/session", headers={"Origin": TEST_ORIGIN})
    assert response.status_code == 200
    assert client.cookies.get(COOKIE_NAME) == token
    cookie = response.headers["set-cookie"]
    expiry_header = cookie.split("expires=", 1)[1].split(";", 1)[0]
    assert expiry_header.endswith(" GMT")
    assert parsedate_to_datetime(expiry_header) == expires_at
    assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=lax" in cookie


@pytest.mark.parametrize("replacement_fails", [False, True])
def test_two_guest_cookie_jars_are_isolated_and_reset_revokes_old_scope(
    identity_environment: None,
    postgres_connection,
    monkeypatch: pytest.MonkeyPatch,
    replacement_fails: bool,
) -> None:
    cleanup_guest_rows(postgres_connection)
    client_a = TestClient(app, base_url=TEST_ORIGIN)
    client_b = TestClient(app, base_url=TEST_ORIGIN)

    token_a = bootstrap(client_a)
    token_b = bootstrap(client_b)
    assert token_a != token_b

    # Repeating bootstrap keeps the existing guest and expiry instead of creating a new owner.
    assert bootstrap(client_a) == token_a
    count = postgres_connection.execute("SELECT count(*) FROM guest_sessions").fetchone()[0]
    assert count == 2

    guest_a = guest_id_for_token(postgres_connection, token_a)
    guest_b = guest_id_for_token(postgres_connection, token_b)
    assert guest_a != guest_b

    cart_item = {
        "id": "line-a",
        "restaurant_id": "fixture-restaurant",
        "menu_item_id": "fixture-item",
        "name": "Synthetic item",
        "quantity": 1,
        "base_price_cents": 500,
        "modifiers": [],
    }
    postgres_connection.execute(
        "INSERT INTO guest_carts (owner_id, revision, items) VALUES (%s, 1, %s::jsonb)",
        (guest_a, json.dumps([cart_item])),
    )

    receipt_id = "11111111-1111-4111-8111-111111111113"
    created_at = datetime(2030, 1, 1, tzinfo=timezone.utc)
    receipt = {
        "schema_version": 1,
        "id": receipt_id,
        "status": "Placed",
        "created_at": created_at.isoformat(),
        "items": [
            {
                "id": "line-a",
                "restaurant_id": "fixture-restaurant",
                "menu_item_id": "fixture-item",
                "name": "Synthetic item",
                "unit_price_cents": 500,
                "quantity": 1,
                "line_total_cents": 500,
                "modifiers": [],
                "special_instructions": None,
            }
        ],
        "checkout": {
            "name": "Demo Visitor",
            "phone": "+1-555-0100",
            "email": "demo@example.test",
            "street": "100 Demo Street",
            "apartment": None,
            "city": "Demo City",
            "state": "CA",
            "postal_code": "94105",
            "delivery_instructions": None,
            "payment_method": "mock",
            "tip_cents": 0,
        },
        "totals": {
            "subtotal_cents": 500,
            "discount_cents": 0,
            "delivery_fee_cents": 199,
            "service_fee_cents": 249,
            "tax_cents": 44,
            "tip_cents": 0,
            "total_cents": 992,
        },
        "pricing_version": "mock-v1",
    }
    postgres_connection.execute(
        """
        INSERT INTO guest_orders (id, owner_id, snapshot, created_at)
        VALUES (%s::uuid, %s, %s::jsonb, %s)
        """,
        (receipt_id, guest_a, json.dumps(receipt), created_at),
    )
    postgres_connection.execute(
        """
        INSERT INTO order_idempotency (owner_id, idempotency_key, payload_sha256, order_id)
        VALUES (%s, %s, %s, %s::uuid)
        """,
        (guest_a, "11111111-1111-4111-8111-111111111114", "a" * 64, receipt_id),
    )
    postgres_connection.commit()

    a_cart = client_a.get("/v1/cart")
    b_cart = client_b.get("/v1/cart")
    assert a_cart.status_code == 200
    assert a_cart.json()["revision"] == 1
    assert a_cart.json()["items"][0]["id"] == "line-a"
    assert "session_id" not in a_cart.json()
    assert b_cart.status_code == 200
    assert b_cart.json() == {"schema_version": 1, "revision": 0, "items": []}

    b_clear = client_b.request(
        "DELETE",
        "/v1/cart",
        headers={"Origin": TEST_ORIGIN},
        json={"expected_revision": 0},
    )
    assert b_clear.status_code == 200
    assert b_clear.json()["revision"] == 1
    assert client_a.get("/v1/cart").json()["items"][0]["id"] == "line-a"

    a_orders = client_a.get("/v1/orders")
    b_orders = client_b.get("/v1/orders")
    assert a_orders.status_code == 200
    assert [order["id"] for order in a_orders.json()] == [receipt_id]
    assert "owner_id" not in a_orders.json()[0]
    assert "session_id" not in a_orders.json()[0]
    assert b_orders.status_code == 200
    assert b_orders.json() == []

    foreign_order = client_b.get(f"/v1/orders/{receipt_id}")
    assert foreign_order.status_code == 404
    assert foreign_order.json()["error"]["code"] == "order_not_found"
    assert foreign_order.json()["error"]["message"] == "Order not found"

    forbidden_origin = client_a.request(
        "DELETE",
        "/v1/cart",
        headers={"Origin": "https://evil.example"},
        json={"expected_revision": 1},
    )
    assert forbidden_origin.status_code == 403
    assert forbidden_origin.json()["error"]["code"] == "origin_forbidden"

    no_cookie = TestClient(app, base_url=TEST_ORIGIN).get(
        "/v1/cart",
        headers={"X-Orderly-Owner": guest_a},
    )
    assert no_cookie.status_code == 401
    assert no_cookie.json()["error"]["code"] == "session_required"

    forged = f"{token_a[:-1]}{'A' if token_a[-1] != 'A' else 'B'}"
    forged_response = TestClient(app, base_url=TEST_ORIGIN).get(
        "/v1/cart",
        headers={"Cookie": f"{COOKIE_NAME}={forged}", "X-Orderly-Owner": guest_a},
    )
    assert forged_response.status_code == 401
    assert forged_response.json()["error"]["code"] == "session_invalid"

    old_token = token_a
    if replacement_fails:
        original_insert = identity_module._insert_guest

        def fail_replacement(*args):
            raise RuntimeError("synthetic replacement failure")

        monkeypatch.setattr(identity_module, "_insert_guest", fail_replacement)
        failed_reset = client_a.post("/v1/session/reset", headers={"Origin": TEST_ORIGIN})
        assert failed_reset.status_code == 503
        assert failed_reset.json()["error"]["code"] == "storage_unavailable"
        assert "synthetic replacement failure" not in failed_reset.text
        assert client_a.cookies.get(COOKIE_NAME) == old_token
        assert client_a.get("/v1/cart").json()["items"][0]["id"] == "line-a"
        assert client_a.get(f"/v1/orders/{receipt_id}").status_code == 200
        assert postgres_connection.execute(
            "SELECT revoked_at FROM guest_sessions WHERE id = %s", (guest_a,),
        ).fetchone()[0] is None
        assert postgres_connection.execute(
            "SELECT count(*) FROM order_idempotency WHERE owner_id = %s", (guest_a,),
        ).fetchone()[0] == 1
        monkeypatch.setattr(identity_module, "_insert_guest", original_insert)

    reset = client_a.post("/v1/session/reset", headers={"Origin": TEST_ORIGIN})
    assert reset.status_code == 200
    new_token = client_a.cookies.get(COOKIE_NAME)
    assert new_token and new_token != old_token
    assert client_a.get("/v1/cart").json() == {"schema_version": 1, "revision": 0, "items": []}
    assert client_a.get("/v1/orders").json() == []
    # Access revocation alone is insufficient: C1 promises immediate deletion.
    for table in ("guest_carts", "guest_orders", "order_idempotency"):
        assert postgres_connection.execute(
            f"SELECT count(*) FROM {table} WHERE owner_id = %s", (guest_a,),
        ).fetchone()[0] == 0
    assert postgres_connection.execute(
        "SELECT count(*) FROM guest_sessions WHERE id = %s", (guest_a,),
    ).fetchone()[0] == 0
    assert guest_id_for_token(postgres_connection, token_b) == guest_b
    assert client_b.get("/v1/cart").json() == {"schema_version": 1, "revision": 1, "items": []}

    revoked = TestClient(app, base_url=TEST_ORIGIN).get(
        "/v1/cart",
        headers={"Cookie": f"{COOKIE_NAME}={old_token}"},
    )
    assert revoked.status_code == 401
    assert revoked.json()["error"]["code"] == "session_invalid"

    assert TestClient(app, base_url=TEST_ORIGIN).get("/sessions/browser-chosen/cart").status_code == 404
    assert TestClient(app, base_url=TEST_ORIGIN).get("/orders").status_code == 404
    assert client_b.get("/v1/restaurants").status_code == 200

    cleanup_guest_rows(postgres_connection)
