from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

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
    postgres_connection.execute("DELETE FROM carts WHERE session_id LIKE 'guest-%'")
    postgres_connection.execute("DELETE FROM orders WHERE session_id LIKE 'guest-%'")
    postgres_connection.execute("DELETE FROM guest_sessions")
    postgres_connection.commit()


def test_two_guest_cookie_jars_are_isolated_and_reset_revokes_old_scope(
    identity_environment: None,
    postgres_connection,
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
        "INSERT INTO carts (session_id, items) VALUES (%s, %s::jsonb)",
        (guest_a, json.dumps([cart_item])),
    )
    postgres_connection.execute(
        """
        INSERT INTO orders (id, session_id, cart_items, subtotal_cents, status)
        VALUES (%s, %s, %s::jsonb, %s, 'Placed')
        """,
        ("ORD-GUEST-A", guest_a, json.dumps([cart_item]), 500),
    )
    postgres_connection.commit()

    a_cart = client_a.get("/v1/cart")
    b_cart = client_b.get("/v1/cart")
    assert a_cart.status_code == 200
    assert a_cart.json()["items"][0]["id"] == "line-a"
    assert "session_id" not in a_cart.json()
    assert b_cart.status_code == 200
    assert b_cart.json()["items"] == []

    b_clear = client_b.delete("/v1/cart", headers={"Origin": TEST_ORIGIN})
    assert b_clear.status_code == 200
    assert client_a.get("/v1/cart").json()["items"][0]["id"] == "line-a"

    a_orders = client_a.get("/v1/orders")
    b_orders = client_b.get("/v1/orders")
    assert a_orders.status_code == 200
    assert [order["id"] for order in a_orders.json()] == ["ORD-GUEST-A"]
    assert "session_id" not in a_orders.json()[0]
    assert b_orders.status_code == 200
    assert b_orders.json() == []

    foreign_order = client_b.get("/v1/orders/ORD-GUEST-A")
    assert foreign_order.status_code == 404
    assert foreign_order.json()["error"]["code"] == "not_found"
    assert foreign_order.json()["error"]["message"] == "Order not found"

    forbidden_origin = client_a.delete("/v1/cart", headers={"Origin": "https://evil.example"})
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
    reset = client_a.post("/v1/session/reset", headers={"Origin": TEST_ORIGIN})
    assert reset.status_code == 200
    new_token = client_a.cookies.get(COOKIE_NAME)
    assert new_token and new_token != old_token
    assert client_a.get("/v1/cart").json()["items"] == []
    assert client_a.get("/v1/orders").json() == []

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
