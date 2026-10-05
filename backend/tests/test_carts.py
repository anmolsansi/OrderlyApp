from __future__ import annotations

import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import cart_service, redis_store, store
from app.cart_service import (
    CartConflictError,
    CartStorageUnavailableError,
    CartValidationError,
    delete_cart,
    get_cart,
    put_cart,
)
from app.identity import VerifiedGuest, verify_request_guest
from app.main import app
from app.models import CartDeleteRequest, CartItem, CartItemInput, CartItemModifier, CartUpsertRequest


TEST_ORIGIN = "https://orderly.test"
TEST_SECRET = "st05-integration-secret-that-is-longer-than-32-bytes"


@pytest.fixture
def cart_environment(
    monkeypatch: pytest.MonkeyPatch,
    postgres_database_url: str,
    postgres_connection,
) -> Iterator[dict[str, str]]:
    suffix = uuid4().hex[:10]
    owner_id = f"guest-st05-{suffix}"
    restaurant_id = f"st05-r-{suffix}"
    item_id = f"st05-i-{suffix}"

    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_SESSION_SECRET", TEST_SECRET)
    monkeypatch.setenv("ORDERLY_ALLOWED_ORIGINS", TEST_ORIGIN)

    now = datetime.now(timezone.utc)
    postgres_connection.execute(
        """
        INSERT INTO guest_sessions (id, token_hash, created_at, expires_at)
        VALUES (%s, %s, %s, %s)
        """,
        (owner_id, f"hash-{suffix}", now, now + timedelta(days=1)),
    )
    postgres_connection.execute(
        """
        INSERT INTO restaurants (
            id, name, cuisine, rating, delivery_minutes,
            delivery_fee_cents, image_emoji, is_open, tags
        ) VALUES (%s, %s, 'Synthetic', 4.7, '10-20 min', 199, 'R', TRUE, '[]'::jsonb)
        """,
        (restaurant_id, f"ST05 Restaurant {suffix}"),
    )
    postgres_connection.execute(
        """
        INSERT INTO menu_items (
            id, restaurant_id, name, description, price_cents,
            image_emoji, popular, available, modifier_groups
        ) VALUES (%s, %s, %s, 'Synthetic cart item', 1000, 'M', FALSE, TRUE, '[]'::jsonb)
        """,
        (item_id, restaurant_id, f"Canonical Meal {suffix}"),
    )
    postgres_connection.commit()

    context = {
        "owner_id": owner_id,
        "restaurant_id": restaurant_id,
        "item_id": item_id,
        "canonical_name": f"Canonical Meal {suffix}",
    }
    try:
        yield context
    finally:
        app.dependency_overrides.clear()
        postgres_connection.execute("DELETE FROM carts WHERE session_id = %s", (owner_id,))
        postgres_connection.execute("DELETE FROM guest_sessions WHERE id = %s", (owner_id,))
        postgres_connection.execute("DELETE FROM menu_items WHERE id = %s", (item_id,))
        postgres_connection.execute("DELETE FROM restaurants WHERE id = %s", (restaurant_id,))
        postgres_connection.commit()


def line(context: dict[str, str], *, line_id: str = "line-1") -> CartItemInput:
    return CartItemInput(
        id=line_id,
        restaurant_id=context["restaurant_id"],
        menu_item_id=context["item_id"],
        quantity=1,
        modifiers=[],
    )


def test_expected_revision_is_required_strict_and_nonnegative(cart_environment: dict[str, str]) -> None:
    payload = {"expected_revision": 0, "items": [line(cart_environment).model_dump(mode="json")]}
    assert CartUpsertRequest.model_validate(payload).expected_revision == 0
    assert CartDeleteRequest.model_validate({"expected_revision": 0}).expected_revision == 0

    for invalid in (-1, 1.5, True, "0"):
        invalid_payload = dict(payload)
        invalid_payload["expected_revision"] = invalid
        with pytest.raises(ValidationError):
            CartUpsertRequest.model_validate(invalid_payload)
        with pytest.raises(ValidationError):
            CartDeleteRequest.model_validate({"expected_revision": invalid})

    missing = {"items": payload["items"]}
    with pytest.raises(ValidationError):
        CartUpsertRequest.model_validate(missing)
    with pytest.raises(ValidationError):
        CartDeleteRequest.model_validate({})


def test_cart_write_input_rejects_client_name_and_price(cart_environment: dict[str, str]) -> None:
    payload = line(cart_environment).model_dump(mode="json")
    payload["name"] = "Spoofed client label"
    payload["base_price_cents"] = 1

    with pytest.raises(ValidationError):
        CartItemInput.model_validate(payload)


def test_initial_get_is_revision_zero_and_does_not_increment(cart_environment: dict[str, str]) -> None:
    first = get_cart(cart_environment["owner_id"])
    second = get_cart(cart_environment["owner_id"])

    assert first.model_dump(mode="json") == {"schema_version": 1, "revision": 0, "items": []}
    assert second.model_dump(mode="json") == first.model_dump(mode="json")


def test_put_and_delete_increment_once_and_persist_canonical_output(cart_environment: dict[str, str]) -> None:
    saved = put_cart(cart_environment["owner_id"], 0, [line(cart_environment)])

    assert saved.revision == 1
    assert saved.items[0].name == cart_environment["canonical_name"]
    assert saved.items[0].base_price_cents == 1000

    # A new connection on the next service call sees the same durable row.
    reloaded = get_cart(cart_environment["owner_id"])
    assert reloaded.model_dump(mode="json") == saved.model_dump(mode="json")

    cleared = delete_cart(cart_environment["owner_id"], 1)
    assert cleared.revision == 2
    assert cleared.items == []
    assert get_cart(cart_environment["owner_id"]).revision == 2


def test_stale_mutations_return_current_cart_without_overwrite(cart_environment: dict[str, str]) -> None:
    saved = put_cart(cart_environment["owner_id"], 0, [line(cart_environment)])

    with pytest.raises(CartConflictError) as put_conflict:
        put_cart(cart_environment["owner_id"], 0, [line(cart_environment, line_id="stale")])
    assert put_conflict.value.current_cart.model_dump(mode="json") == saved.model_dump(mode="json")

    with pytest.raises(CartConflictError) as delete_conflict:
        delete_cart(cart_environment["owner_id"], 0)
    assert delete_conflict.value.current_cart.model_dump(mode="json") == saved.model_dump(mode="json")
    assert get_cart(cart_environment["owner_id"]).model_dump(mode="json") == saved.model_dump(mode="json")


def test_two_writes_with_same_revision_yield_one_success_and_one_conflict(
    cart_environment: dict[str, str],
) -> None:
    owner_id = cart_environment["owner_id"]

    def attempt(line_id: str):
        try:
            return ("success", put_cart(owner_id, 0, [line(cart_environment, line_id=line_id)]))
        except CartConflictError as exc:
            return ("conflict", exc.current_cart)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(attempt, ["line-a", "line-b"]))

    assert sorted(result[0] for result in results) == ["conflict", "success"]
    persisted = get_cart(owner_id)
    assert persisted.revision == 1
    assert persisted.items[0].id in {"line-a", "line-b"}
    conflict_cart = next(result[1] for result in results if result[0] == "conflict")
    assert conflict_cart.model_dump(mode="json") == persisted.model_dump(mode="json")


def test_invalid_catalog_choice_rolls_back_revision_and_items(cart_environment: dict[str, str]) -> None:
    invalid = line(cart_environment).model_copy(update={"menu_item_id": "missing-item"})

    with pytest.raises(CartValidationError) as exc_info:
        put_cart(cart_environment["owner_id"], 0, [invalid])

    assert exc_info.value.fields == ["items.0.menu_item_id"]
    assert get_cart(cart_environment["owner_id"]).model_dump(mode="json") == {
        "schema_version": 1,
        "revision": 0,
        "items": [],
    }


def test_legacy_cart_row_is_not_adopted(cart_environment: dict[str, str], postgres_connection) -> None:
    legacy_item = {
        "id": "legacy-line",
        "restaurant_id": cart_environment["restaurant_id"],
        "menu_item_id": cart_environment["item_id"],
        "name": "Legacy stale label",
        "quantity": 1,
        "base_price_cents": 1,
        "modifiers": [],
    }
    postgres_connection.execute(
        "INSERT INTO carts (session_id, items) VALUES (%s, %s::jsonb)",
        (cart_environment["owner_id"], __import__("json").dumps([legacy_item])),
    )
    postgres_connection.commit()

    current = get_cart(cart_environment["owner_id"])
    assert current.revision == 0
    assert current.items == []


def test_redis_failure_does_not_change_postgres_cart_authority(
    cart_environment: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1/0")
    monkeypatch.setattr(
        redis_store,
        "redis_client",
        lambda: (_ for _ in ()).throw(AssertionError("C4 cart path consulted Redis")),
    )

    saved = put_cart(cart_environment["owner_id"], 0, [line(cart_environment)])
    assert saved.revision == 1
    assert get_cart(cart_environment["owner_id"]).items[0].id == "line-1"


def test_missing_postgres_configuration_fails_closed_without_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("ORDERLY_DATA_MODE", "api")
    monkeypatch.setenv("ORDERLY_FORCE_JSON_STORE", "1")
    monkeypatch.setattr(
        store,
        "write_json",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("C4 cart path wrote JSON")),
    )
    monkeypatch.setattr(
        redis_store,
        "redis_client",
        lambda: (_ for _ in ()).throw(AssertionError("C4 cart path consulted Redis")),
    )

    with pytest.raises(CartStorageUnavailableError):
        get_cart("guest-no-postgres")


def test_configured_postgres_connection_failure_maps_to_storage_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://configured-but-unavailable/orderly")
    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)

    def fail_connection():
        raise RuntimeError("synthetic database outage")

    monkeypatch.setattr(cart_service, "get_connection", fail_connection)

    with pytest.raises(CartStorageUnavailableError):
        get_cart("guest-db-outage")


def test_unauthenticated_cart_read_is_rejected(cart_environment: dict[str, str]) -> None:
    response = TestClient(app, base_url=TEST_ORIGIN).get("/v1/cart")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_required"


def test_http_conflict_contains_current_cart_and_storage_failure_is_typed(
    cart_environment: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner_id = cart_environment["owner_id"]
    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(
        guest_id=owner_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    client = TestClient(app, base_url=TEST_ORIGIN)
    body = {
        "expected_revision": 0,
        "items": [line(cart_environment).model_dump(mode="json")],
    }

    first = client.put("/v1/cart", headers={"Origin": TEST_ORIGIN}, json=body)
    assert first.status_code == 200, first.text
    assert first.json()["revision"] == 1
    assert first.json()["items"][0]["name"] == cart_environment["canonical_name"]

    conflict = client.put("/v1/cart", headers={"Origin": TEST_ORIGIN}, json=body)
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "cart_conflict"
    assert conflict.json()["current_cart"] == first.json()

    missing_revision = client.request("DELETE", "/v1/cart", headers={"Origin": TEST_ORIGIN}, json={})
    assert missing_revision.status_code == 422
    assert missing_revision.json()["error"]["code"] == "invalid_cart"
    assert missing_revision.json()["error"]["fields"] == ["expected_revision"]

    wrong_type = client.request(
        "DELETE",
        "/v1/cart",
        headers={"Origin": TEST_ORIGIN},
        json={"expected_revision": "1"},
    )
    assert wrong_type.status_code == 422
    assert wrong_type.json()["error"]["code"] == "invalid_cart"
    assert wrong_type.json()["error"]["fields"] == ["expected_revision"]

    monkeypatch.delenv("DATABASE_URL", raising=False)
    unavailable = client.get("/v1/cart")
    assert unavailable.status_code == 503
    assert unavailable.json()["error"]["code"] == "storage_unavailable"


def test_post_update_failure_rolls_back_existing_basket(cart_environment, monkeypatch):
    owner = cart_environment['owner_id']
    accepted = put_cart(owner, 0, [line(cart_environment)])
    update = cart_service.update_guest_cart_row

    def fail_after_update(*args, **kwargs):
        update(*args, **kwargs)
        raise RuntimeError('synthetic failure after SQL update')

    monkeypatch.setattr(cart_service, 'update_guest_cart_row', fail_after_update)
    with pytest.raises(CartStorageUnavailableError):
        put_cart(owner, 1, [line(cart_environment, line_id='replacement')])
    assert get_cart(owner).model_dump(mode='json') == accepted.model_dump(mode='json')


@pytest.mark.parametrize('change', [
    {'quantity': 0}, {'quantity': 11}, {'quantity': True}, {'quantity': 1.5},
    {'quantity': '1'}, {'special_instructions': 'x' * 501},
    {'menu_item_id': 'unknown'}, {'name': 'spoof', 'base_price_cents': 1},
])
def test_invalid_http_write_preserves_accepted_basket(cart_environment, change):
    owner = cart_environment['owner_id']
    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(
        guest_id=owner, expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    client = TestClient(app, base_url=TEST_ORIGIN)
    accepted = put_cart(owner, 0, [line(cart_environment)])
    invalid = {**line(cart_environment).model_dump(mode='json'), **change}
    response = client.put('/v1/cart', headers={'Origin': TEST_ORIGIN}, json={'expected_revision': 1, 'items': [invalid]})
    assert response.status_code == 422, response.text
    assert response.json()['error']['code'] == 'invalid_cart'
    assert get_cart(owner).model_dump(mode='json') == accepted.model_dump(mode='json')


@pytest.mark.parametrize('case', json.loads((Path(__file__).resolve().parents[2] / 'tests/fixtures/contracts/c3.json').read_text())['negative'], ids=lambda case: case['name'])
def test_catalog_rejection_precedes_persistence(cart_environment, postgres_connection, case):
    from copy import deepcopy
    from pathlib import Path
    fixture = json.loads((Path(__file__).resolve().parents[2] / 'tests/fixtures/contracts/c3.json').read_text())
    groups = fixture['positive']['restaurants'][0]['menu'][0]['modifier_groups']
    owner = cart_environment['owner_id']
    postgres_connection.execute('UPDATE menu_items SET modifier_groups = %s::jsonb WHERE id = %s', (json.dumps(groups), cart_environment['item_id']))
    postgres_connection.commit()
    valid = line(cart_environment).model_copy(update={'modifiers': [CartItemModifier(group_id='size', option_ids=['small'])]})
    accepted = put_cart(owner, 0, [valid])
    override = case.get('catalog_override')
    if override == 'closed':
        postgres_connection.execute('UPDATE restaurants SET is_open = FALSE WHERE id = %s', (cart_environment['restaurant_id'],))
    elif override == 'unavailable':
        postgres_connection.execute('UPDATE menu_items SET available = FALSE WHERE id = %s', (cart_environment['item_id'],))
    elif override == 'three_available_extras':
        groups[1]['options'].extend([{'id': key, 'name': key, 'price_delta_cents': 0, 'available': True} for key in ('cheese', 'third')])
        postgres_connection.execute('UPDATE menu_items SET modifier_groups = %s::jsonb WHERE id = %s', (json.dumps(groups), cart_environment['item_id']))
    postgres_connection.commit()
    request = deepcopy(case['request'])
    for item in request.get('body', {}).get('items', []):
        if item['restaurant_id'] == 'fixture-r1': item['restaurant_id'] = cart_environment['restaurant_id']
        if item['menu_item_id'] == 'fixture-i1': item['menu_item_id'] = cart_environment['item_id']
    # Mixed-restaurant rejection occurs before the second restaurant lookup.
    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(guest_id=owner, expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    client = TestClient(app, base_url=TEST_ORIGIN)
    response = client.request(request['method'], request['path'], headers={'Origin': TEST_ORIGIN}, **({'json': request['body']} if 'body' in request else {}))
    assert response.status_code == case['status'], response.text
    assert response.json()['error']['code'] == case['error']['code']
    assert response.json()['error']['fields'] == case['error']['fields']
    assert response.json()['error']['request_id']
    assert get_cart(owner).model_dump(mode='json') == accepted.model_dump(mode='json')


def test_real_api_restart_and_unreachable_postgres_preserve_state(cart_environment, postgres_database_url, postgres_connection):
    import os
    import socket
    import subprocess
    import sys
    import time
    from pathlib import Path
    import httpx
    from app.identity import verify_guest_token
    from app.pricing import build_receipt_snapshot
    from app.store import get_catalog_snapshot, insert_order_snapshot
    from app.models import CheckoutDetails

    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    backend = Path(__file__).resolve().parents[1]
    env = {**os.environ, 'PYTHONPATH': str(backend), 'ORDERLY_DATA_MODE': 'api',
           'ORDERLY_ALLOWED_ORIGINS': origin, 'ORDERLY_SESSION_SECRET': TEST_SECRET,
           'PYTHONDONTWRITEBYTECODE': '1'}
    env.pop('REDIS_URL', None)
    env.pop('ORDERLY_FORCE_JSON_STORE', None)
    process = None
    guest_id = None
    pids = []

    def start(database_url):
        nonlocal process
        process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port)], cwd=backend, env={**env, 'DATABASE_URL': database_url}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        pids.append(process.pid)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            assert process.poll() is None, 'API exited before readiness'
            try:
                if httpx.get(f'{origin}/health/live', timeout=1).status_code == 200:
                    return
            except httpx.RequestError:
                pass
            time.sleep(.05)
        pytest.fail('API did not start')

    def stop():
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

    try:
        start(postgres_database_url)
        with httpx.Client(base_url=origin, headers={'Origin': origin}, timeout=10) as client:
            bootstrap = client.post('/v1/session')
            assert bootstrap.status_code == 200, bootstrap.text
            guest_id = verify_guest_token(client.cookies.get('orderly_guest')).guest_id
            saved = client.put('/v1/cart', json={'expected_revision': 0, 'items': [line(cart_environment).model_dump(mode='json')]})
            assert saved.status_code == 200, saved.text
            fixture = json.loads((backend.parent / 'tests/fixtures/contracts/c5.json').read_text())['positive']['receipt']
            receipt = build_receipt_snapshot(order_id=str(uuid4()), created_at=datetime.now(timezone.utc), snapshot=get_catalog_snapshot(), items=[CartItem.model_validate(i) for i in saved.json()['items']], checkout=CheckoutDetails.model_validate(fixture['checkout']), promotion_code='DEMO5')
            insert_order_snapshot(postgres_connection, guest_id, receipt)
            postgres_connection.execute('UPDATE menu_items SET price_cents = 2500 WHERE id = %s', (cart_environment['item_id'],))
            postgres_connection.commit()
            original_receipt = client.get(f'/v1/orders/{receipt.id}').json()
            assert original_receipt == receipt.model_dump(mode='json')
            stop()
            start(postgres_database_url)
            assert client.get('/v1/cart').json() == saved.json()
            assert client.get(f'/v1/orders/{receipt.id}').json() == original_receipt
            stop()
            with socket.socket() as unavailable:
                unavailable.bind(('127.0.0.1', 0))
                failed_port = unavailable.getsockname()[1]
                # Bound but not listening: real connection refusal, no provider mock.
                start(f'postgresql://orderly@127.0.0.1:{failed_port}/unavailable?connect_timeout=1')
                for path in ('/v1/cart', f'/v1/orders/{receipt.id}'):
                    failed = client.get(path)
                    assert failed.status_code == 503, failed.text
                    assert failed.json()['error']['code'] == 'storage_unavailable'
                stop()
            start(postgres_database_url)
            assert client.get('/v1/cart').json() == saved.json()
            assert client.get(f'/v1/orders/{receipt.id}').json() == original_receipt
            assert len(set(pids)) == 4
    finally:
        stop()
        if guest_id:
            postgres_connection.execute('DELETE FROM guest_sessions WHERE id = %s', (guest_id,))
            postgres_connection.commit()


def test_line_limit_preserves_accepted_basket(cart_environment):
    owner = cart_environment['owner_id']
    accepted = put_cart(owner, 0, [line(cart_environment)])
    app.dependency_overrides[verify_request_guest] = lambda: VerifiedGuest(guest_id=owner, expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    items = [line(cart_environment, line_id=f'line-{n}').model_dump(mode='json') for n in range(51)]
    response = TestClient(app, base_url=TEST_ORIGIN).put('/v1/cart', headers={'Origin': TEST_ORIGIN}, json={'expected_revision': 1, 'items': items})
    assert response.status_code == 422
    assert response.json()['error']['fields'] == ['items']
    assert get_cart(owner).model_dump(mode='json') == accepted.model_dump(mode='json')
