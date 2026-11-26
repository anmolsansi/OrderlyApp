"""RS-06 conformance: signed synthetic JWTs and actual PostgreSQL transactions."""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
from threading import Barrier
from time import time
from uuid import uuid4

import jwt
import psycopg
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from psycopg.rows import dict_row
from psycopg import sql
from psycopg.conninfo import make_conninfo
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app import staff_identity as identity
from app import staff_memberships as members
from app import staff_routes
from app.staff_db_security import assert_staff_runtime_role
from scripts.configure_staff_runtime import grant_staff_runtime
from app.main import app
from scripts.provision_live_restaurant import provision_restaurant, validate_input_object

ISSUER = "https://rs06-clerk.example.test"
PARTY = "https://rs06-orderly.example.test"


@pytest.fixture
def auth(monkeypatch):
    signer = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(signer.public_key()))
    key = jwt.PyJWK.from_dict(dict(jwk, kid="rs06", alg="RS256"), algorithm="RS256")
    monkeypatch.setenv("ORDERLY_LIVE_ENABLED", "1")
    monkeypatch.setenv("ORDERLY_CLERK_ISSUER", ISSUER)
    monkeypatch.setenv("ORDERLY_CLERK_JWKS_URL", ISSUER + "/jwks")
    monkeypatch.setenv("ORDERLY_CLERK_AUTHORIZED_PARTIES", PARTY)
    monkeypatch.delenv(members.VERIFIED_SUBJECTS_ENV, raising=False)
    monkeypatch.delenv(members.VERIFIED_REACTIVATIONS_ENV, raising=False)
    identity._cache.cache_clear()
    monkeypatch.setattr(identity, "_fetch_keys", lambda url: {"rs06": key})

    def headers(subject, **changes):
        now = int(time())
        claims = {"iss": ISSUER, "azp": PARTY, "sub": subject, "exp": now + 120, "nbf": now - 5,
              "iat": now, "sid": "sess_Synthetic123", "v": 2}
        claims.update(changes)
        token = jwt.encode(claims, signer, algorithm="RS256", headers={"kid": "rs06"})
        return {"Authorization": "Bearer " + token}

    yield headers
    identity._cache.cache_clear()


@pytest.fixture
def client(auth):
    with TestClient(app) as test_client:
        yield test_client


def provision(conn, rid, *, synthetic=False):
    provision_restaurant(conn, validate_input_object({
        "restaurant_id": rid, "name": "RS06 Test Restaurant", "cuisine": "Indian",
        "brand_label": "Synthetic Test", "timezone": "Asia/Kolkata", "hours": [],
    }))
    if synthetic:
        conn.execute("UPDATE live_restaurants SET synthetic = true WHERE restaurant_id = %s", (rid,))


def insert_member(conn, rid, subject, role, active=True):
    conn.execute(
        "INSERT INTO live_memberships (restaurant_id, clerk_user_id, role, active) VALUES (%s,%s,%s,%s)",
        (rid, subject, role, active),
    )


@pytest.fixture
def staff_runtime_url(postgres_database_url):
    role = "rs06_runtime_" + uuid4().hex
    password = uuid4().hex
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as admin:
        admin.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(sql.Identifier(role), sql.Literal(password)))
        grant_staff_runtime(admin, role)
    try:
        yield make_conninfo(postgres_database_url, user=role, password=password)
    finally:
        with psycopg.connect(postgres_database_url) as admin:
            admin.execute(sql.SQL("DROP OWNED BY {}").format(sql.Identifier(role)))
            admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))


@pytest.fixture
def tenants(postgres_database_url, staff_runtime_url, monkeypatch):
    # Committed rows with unique IDs are necessary for independent HTTP/concurrency
    # connections. Audit history is immutable; use only the isolated test database.
    monkeypatch.setenv("DATABASE_URL", staff_runtime_url)
    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)
    suffix = uuid4().hex
    data = {name: f"rs06-{name}-{suffix}" for name in
            ("a", "b", "demo", "owner", "second", "staff", "cashier", "foreign", "new", "unknown")}
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as conn:
        for key in ("a", "b", "demo"):
            provision(conn, data[key], synthetic=key == "demo")
        for key, role in (("owner", "owner"), ("second", "owner"),
                          ("staff", "order_staff"), ("cashier", "cashier")):
            insert_member(conn, data["a"], data[key], role)
        insert_member(conn, data["b"], data["foreign"], "owner")
        insert_member(conn, data["demo"], data["owner"], "owner")
    monkeypatch.setenv(members.VERIFIED_SUBJECTS_ENV, json.dumps({data["a"]: [data["new"]]}))
    return data


def path(rid, subject=None):
    base = f"/v1/live/staff/restaurants/{rid}/members"
    return base if subject is None else f"{base}/{subject}"


def update(version, role, active=True):
    return {"expected_version": version, "role": role, "active": active}


def error(response, status, code, fields=None):
    assert response.status_code == status, response.text
    result = response.json()
    assert set(result) == {"error"}
    body = result["error"]
    assert set(body) == {"code", "message", "fields", "request_id"}
    assert body["code"] == code
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert response.headers["Cache-Control"] == "no-store"
    if fields is not None:
        assert body["fields"] == fields
    return body


def state(url, rid):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        rows = conn.execute(
            """SELECT restaurant_id, clerk_user_id, role, active, version
               FROM live_memberships WHERE restaurant_id=%s ORDER BY clerk_user_id""", (rid,),
        ).fetchall()
        audit = conn.execute(
            """SELECT restaurant_id, subject, actor, old_role, new_role, old_active, new_active
               FROM live_membership_audit WHERE restaurant_id=%s ORDER BY created_at,id""", (rid,),
        ).fetchall()
        return rows, audit


def test_identity_errors_and_disabled_gate_do_not_connect(client, auth, monkeypatch):
    def no_db(**kwargs):
        pytest.fail("authentication failure must not open database")
    monkeypatch.setattr(staff_routes, "get_connection", no_db)
    monkeypatch.setattr(staff_routes, "database_url", lambda: "synthetic-test")
    fixtures = json.loads((ROOT / "tests/fixtures/restaurant-service/v1.json").read_text())
    expected = {case["name"]: case for case in fixtures["protocol_negative_cases"] if case["contract"] == "CON-05"}
    endpoint = "/v1/live/staff/memberships"
    for name, headers in (("missing_staff_token", {}), ("invalid_staff_token", auth("staff", iss="https://wrong.example"))):
        case = expected[name]
        error(client.get(endpoint, headers=headers), case["expected_status"], case["code"], case["fields"])
    identity._cache.cache_clear()
    def fail_fetch(url):
        raise OSError("private provider detail")
    monkeypatch.setattr(identity, "_fetch_keys", fail_fetch)
    case = expected["staff_jwks_unavailable"]
    response = client.get(endpoint, headers=auth("staff"))
    error(response, case["expected_status"], case["code"], case["fields"])
    assert "private provider detail" not in response.text
    monkeypatch.setenv("ORDERLY_LIVE_ENABLED", "0")
    def no_identity(request):
        pytest.fail("disabled live service must not verify token")
    monkeypatch.setattr(staff_routes, "verify_staff_token", no_identity)
    error(client.get(endpoint, headers=auth("staff")), 503, "storage_unavailable", [])


def test_membership_summary_and_owner_listing(client, auth, tenants):
    t = tenants
    result = client.get("/v1/live/staff/memberships", headers=auth(t["owner"], role="cashier"))
    assert result.status_code == 200
    fixture = json.loads((ROOT / "tests/fixtures/restaurant-service/v1.json").read_text())
    wire = next(case for case in fixture["wire_cases"] if case["id"] == "CON-06-1")
    expected_summary = dict(wire["response"]["memberships"][0], restaurant_id=t["a"])
    assert result.json() == {"memberships": [expected_summary]}
    result = client.get(path(t["a"]), headers=auth(t["owner"]))
    assert result.status_code == 200
    subjects = [m["clerk_user_id"] for m in result.json()["memberships"]]
    assert subjects == sorted(t[key] for key in ("owner", "second", "staff", "cashier"))
    result = client.get(path(t["a"], t["owner"]), headers=auth(t["owner"]))
    fixture = json.loads((ROOT / "tests/fixtures/restaurant-service/v1.json").read_text())
    expected = dict(fixture["contracts"]["CON-06"]["positive"]["payload"],
                    restaurant_id=t["a"], clerk_user_id=t["owner"])
    assert result.status_code == 200 and result.json() == expected


def test_grant_update_revoke_and_atomic_audit(client, auth, tenants, postgres_database_url):
    t = tenants
    owner = auth(t["owner"])
    new = auth(t["new"], role="owner")
    target = path(t["a"], t["new"])
    created = client.put(target, headers=owner, json=update(0, "order_staff"))
    assert created.status_code == 201
    assert created.json() == {"restaurant_id": t["a"], "clerk_user_id": t["new"],
                              "role": "order_staff", "active": True, "version": 1}
    # Same current-version no-op must not increment version or append audit.
    same = client.put(target, headers=owner, json=update(1, "order_staff"))
    assert same.status_code == 200 and same.json() == created.json()
    assert client.get("/v1/live/staff/memberships", headers=new).json() == {
        "memberships": [{"restaurant_id": t["a"], "role": "order_staff", "version": 1}]}
    error(client.get(path(t["a"]), headers=new), 403, "permission_denied")
    revoked = client.put(target, headers=owner, json=update(1, "order_staff", False))
    assert revoked.status_code == 200 and revoked.json()["version"] == 2 and not revoked.json()["active"]
    assert client.get("/v1/live/staff/memberships", headers=new).json() == {"memberships": []}
    error(client.get(path(t["a"]), headers=new), 404, "not_found")
    _, audits = state(postgres_database_url, t["a"])
    assert audits == [
        {"restaurant_id": t["a"], "subject": t["new"], "actor": t["owner"],
         "old_role": None, "new_role": "order_staff", "old_active": None, "new_active": True},
        {"restaurant_id": t["a"], "subject": t["new"], "actor": t["owner"],
         "old_role": "order_staff", "new_role": "order_staff", "old_active": True, "new_active": False},
    ]


@pytest.mark.parametrize("key", ["staff", "cashier"])
def test_nonowner_cannot_manage_members(client, auth, tenants, postgres_database_url, key):
    t = tenants
    before = state(postgres_database_url, t["a"])
    headers = auth(t[key], role="owner", restaurant_id=t["a"])
    error(client.get(path(t["a"]), headers=headers), 403, "permission_denied")
    error(client.get(path(t["a"], t["owner"]), headers=headers), 403, "permission_denied")
    error(client.put(path(t["a"], t["new"]), headers=headers, json=update(0, "owner")),
          403, "permission_denied")
    assert state(postgres_database_url, t["a"]) == before


def test_foreign_absent_and_demo_scope_indistinguishable(client, auth, tenants, postgres_database_url):
    t = tenants
    owner = auth(t["owner"])
    before = {rid: state(postgres_database_url, rid) for rid in (t["a"], t["b"], t["demo"])}
    errors = []
    for rid in (t["b"], t["demo"], "missing-" + uuid4().hex):
        for response in (client.get(path(rid), headers=owner),
                         client.get(path(rid, t["foreign"]), headers=owner),
                         client.put(path(rid, t["foreign"]), headers=owner, json=update(1, "cashier"))):
            body = error(response, 404, "not_found", [])
            errors.append({k: v for k, v in body.items() if k != "request_id"})
    assert all(body == errors[0] for body in errors)
    assert {rid: state(postgres_database_url, rid) for rid in before} == before


def test_unverified_subject_cannot_enroll_or_cross_allowlist(client, auth, tenants, postgres_database_url, monkeypatch):
    t = tenants
    before = state(postgres_database_url, t["a"])
    target = path(t["a"], t["unknown"])
    error(client.put(target, headers=auth(t["owner"]), json=update(0, "owner")), 404, "not_found")
    error(client.put(target, headers=auth(t["unknown"]), json=update(0, "owner")), 404, "not_found")
    monkeypatch.setenv(members.VERIFIED_SUBJECTS_ENV, json.dumps({t["b"]: [t["unknown"]]}))
    error(client.put(target, headers=auth(t["owner"]), json=update(0, "order_staff")), 404, "not_found")
    monkeypatch.setenv(members.VERIFIED_SUBJECTS_ENV, "not-json")
    error(client.put(target, headers=auth(t["owner"]), json=update(0, "order_staff")), 503, "identity_unavailable")
    assert state(postgres_database_url, t["a"]) == before


@pytest.mark.parametrize("payload,fields", [
    ({"expected_version": True, "role": "owner", "active": True}, ["expected_version"]),
    ({"expected_version": "1", "role": "owner", "active": True}, ["expected_version"]),
    ({"expected_version": 1.0, "role": "owner", "active": True}, ["expected_version"]),
    ({"expected_version": -1, "role": "owner", "active": True}, ["expected_version"]),
    ({"expected_version": 1, "role": "admin", "active": True}, ["role"]),
    ({"expected_version": 1, "role": "owner", "active": 1}, ["active"]),
    ({"expected_version": 1, "role": "owner"}, ["active"]),
    ({"expected_version": 1, "role": "owner", "active": True, "operator_verified": True}, ["operator_verified"]),
])
def test_strict_mutation_validation(client, auth, tenants, postgres_database_url, payload, fields):
    t = tenants
    before = state(postgres_database_url, t["a"])
    error(client.put(path(t["a"], t["owner"]), headers=auth(t["owner"]), json=payload),
          422, "invalid_input", fields)
    assert state(postgres_database_url, t["a"]) == before


def test_stale_version_and_oversized_body_do_not_write(client, auth, tenants, postgres_database_url):
    t = tenants
    before = state(postgres_database_url, t["a"])
    target = path(t["a"], t["staff"])
    headers = auth(t["owner"])
    fixture = json.loads((ROOT / "tests/fixtures/restaurant-service/v1.json").read_text())
    case = next(c for c in fixture["protocol_negative_cases"] if c["name"] == "membership_stale_version")
    conflict = client.put(target, headers=headers, json=update(0, "cashier"))
    payload = error(conflict, case["expected_status"], case["code"], case["fields"])
    assert payload["message"] == case["error"]["message"]
    # A fresh owner-authorized GET is the reconciliation boundary; the exact
    # error envelope carries no membership data or retry authorization.
    current = client.get(target, headers=headers)
    assert current.status_code == 200
    assert current.json() == next(row for row in before[0] if row["clerk_user_id"] == t["staff"])
    error(client.get(target, headers=auth(t["staff"])), 403, "permission_denied")
    error(client.get(target, headers=auth(t["foreign"])), 404, "not_found")
    error(client.put(target, headers=headers, content=b"x" * (65536 + 1)), 422, "invalid_input", ["body"])
    assert state(postgres_database_url, t["a"]) == before


def test_fresh_role_matrix_and_revocation(client, auth, tenants, postgres_database_url):
    t = tenants
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as conn:
        for key, role in (("owner", "owner"), ("staff", "order_staff"), ("cashier", "cashier")):
            principal = identity.StaffPrincipal(t[key])
            assert members.require_role(conn, principal, t["a"], {role}).role == role
            with pytest.raises(members.MembershipError) as exc:
                members.require_role(conn, principal, t["a"], members.ROLES - {role})
            assert exc.value.code == "permission_denied"
    staff_token = auth(t["staff"])
    assert client.get("/v1/live/staff/memberships", headers=staff_token).json()["memberships"]
    result = client.put(path(t["a"], t["staff"]), headers=auth(t["owner"]), json=update(1, "order_staff", False))
    assert result.status_code == 200
    assert client.get("/v1/live/staff/memberships", headers=staff_token).json() == {"memberships": []}
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as conn:
        with pytest.raises(members.MembershipError) as exc:
            members.require_role(conn, identity.StaffPrincipal(t["staff"]), t["a"], members.ROLES)
        assert exc.value.code == "not_found"


@pytest.mark.parametrize("role,active", [("cashier", True), ("owner", False)])
def test_last_owner_cannot_be_removed(client, auth, tenants, postgres_database_url, role, active):
    t = tenants
    headers = auth(t["foreign"])
    before = state(postgres_database_url, t["b"])
    error(client.put(path(t["b"], t["foreign"]), headers=headers, json=update(1, role, active)),
          409, "last_owner")
    assert state(postgres_database_url, t["b"]) == before


def test_concurrent_owner_removal_keeps_one_owner(tenants, postgres_database_url):
    t = tenants
    barrier = Barrier(2)

    def remove_self(subject):
        try:
            with psycopg.connect(postgres_database_url, row_factory=dict_row) as conn:
                conn.execute("SET LOCAL lock_timeout = '5s'")
                barrier.wait(timeout=5)
                membership, created = members.put_member(
                    conn, identity.StaffPrincipal(subject), t["a"], subject,
                    members.MembershipUpdate(**update(1, "owner", False)),
                )
                assert not created and not membership.active
            return "accepted"
        except members.MembershipError as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(remove_self, [t["owner"], t["second"]]))
    assert sorted(results) == ["accepted", "last_owner"]
    rows, audit = state(postgres_database_url, t["a"])
    assert sum(row["active"] and row["role"] == "owner" for row in rows) == 1
    assert len(audit) == 1


def test_database_audit_failure_rolls_back_entire_write(client, auth, tenants, postgres_database_url, monkeypatch):
    t = tenants
    before = state(postgres_database_url, t["a"])

    def fail_audit(conn, actor, previous, after):
        # Real PostgreSQL constraint failure after the membership row was written.
        conn.execute(
            """INSERT INTO live_membership_audit
               (id,restaurant_id,subject,actor,new_role,new_active)
               VALUES (%s,%s,%s,NULL,%s,%s)""",
            (uuid4(), after.restaurant_id, after.clerk_user_id, after.role, after.active),
        )

    monkeypatch.setattr(members, "_audit", fail_audit)
    response = client.put(path(t["a"], t["new"]), headers=auth(t["owner"]), json=update(0, "cashier"))
    error(response, 503, "storage_unavailable", [])
    assert "NULL" not in response.text and "audit" not in response.text
    assert state(postgres_database_url, t["a"]) == before


def test_database_outage_is_redacted(client, auth, monkeypatch):
    monkeypatch.setattr(staff_routes, "database_url", lambda: "synthetic")
    def unavailable_connection(**kwargs):
        raise psycopg.OperationalError("postgresql://private:secret@hidden/db")
    monkeypatch.setattr(staff_routes, "get_connection", unavailable_connection)
    response = client.get("/v1/live/staff/memberships", headers=auth("staff"))
    error(response, 503, "storage_unavailable", [])
    assert "secret" not in response.text


def test_existing_mock_health_remains_unchanged(client):
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["live"] is True
    assert response.json()["schema_version"] == 1


def test_shared_membership_negative_vectors(client, auth, tenants, postgres_database_url):
    t = tenants
    fixture = json.loads((ROOT / "tests/fixtures/restaurant-service/v1.json").read_text())
    cases = {c["name"]: c for c in fixture["protocol_negative_cases"] if c["contract"] == "CON-06"}
    before_a = state(postgres_database_url, t["a"])
    before_b = state(postgres_database_url, t["b"])
    responses = {
        "membership_role_denied": client.put(path(t["a"], t["staff"]), headers=auth(t["cashier"]), json=update(1, "cashier")),
        "membership_foreign_or_missing": client.get(path(t["b"], t["foreign"]), headers=auth(t["owner"])),
        "membership_last_owner": client.put(path(t["b"], t["foreign"]), headers=auth(t["foreign"]), json=update(1, "cashier")),
    }
    for name, response in responses.items():
        case = cases[name]
        payload = error(response, case["expected_status"], case["code"], case["fields"])
        assert payload["message"] == case["error"]["message"]
        assert case["no_write"] is True
    assert state(postgres_database_url, t["a"]) == before_a
    assert state(postgres_database_url, t["b"]) == before_b


@pytest.mark.parametrize("claims", [{"sts": "pending"}, {"sid": None}, {"v": None}, {"act": {"sub": "operator"}}])
def test_wrong_session_profile_cannot_open_database(client, auth, monkeypatch, claims):
    monkeypatch.setattr(staff_routes, "database_url", lambda: "synthetic-test")
    monkeypatch.setattr(staff_routes, "get_connection", lambda **kwargs: pytest.fail("invalid session reached DB"))
    error(client.get("/v1/live/staff/memberships", headers=auth("synthetic", **claims)), 401, "staff_auth_required", [])



def test_nondefault_isolation_is_rejected_by_direct_writer(tenants, postgres_database_url):
    t = tenants
    before = state(postgres_database_url, t["a"])
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as conn:
        conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
        with pytest.raises(members.MembershipError) as exc:
            members.put_member(conn, identity.StaffPrincipal(t["owner"]), t["a"], t["staff"],
                               members.MembershipUpdate(**update(1, "cashier")))
        assert exc.value.code == "storage_unavailable"
    assert state(postgres_database_url, t["a"]) == before


def test_staff_connection_forces_read_committed(tenants, staff_runtime_url, monkeypatch):
    from contextlib import contextmanager
    @contextmanager
    def repeatable_read(**kwargs):
        with psycopg.connect(staff_runtime_url, row_factory=dict_row) as conn:
            conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
            yield conn
    monkeypatch.setattr(staff_routes, "get_connection", repeatable_read)
    with staff_routes.staff_connection() as conn:
        assert conn.execute("SHOW transaction_isolation").fetchone()["transaction_isolation"] == "read committed"


def test_reactivation_requires_current_operator_approval(client, auth, tenants, postgres_database_url, monkeypatch):
    t = tenants
    target = path(t["a"], t["staff"])
    owner_token = auth(t["owner"])
    original_token = auth(t["staff"])
    assert client.put(target, headers=owner_token, json=update(1, "order_staff", False)).status_code == 200
    before = state(postgres_database_url, t["a"])
    assert client.get("/v1/live/staff/memberships", headers=original_token).json() == {"memberships": []}
    error(client.put(target, headers=owner_token, json=update(2, "order_staff")), 404, "not_found")
    error(client.put(target, headers=original_token, json=update(2, "owner")), 404, "not_found")
    assert state(postgres_database_url, t["a"]) == before
    monkeypatch.setenv(members.VERIFIED_SUBJECTS_ENV, json.dumps({t["a"]: [t["staff"]]}))
    error(client.put(target, headers=owner_token, json=update(2, "order_staff")), 404, "not_found")
    monkeypatch.setenv(members.VERIFIED_REACTIVATIONS_ENV, json.dumps({t["b"]: {t["staff"]: 2}}))
    error(client.put(target, headers=owner_token, json=update(2, "order_staff")), 404, "not_found")
    monkeypatch.setenv(members.VERIFIED_REACTIVATIONS_ENV, json.dumps({t["a"]: {t["staff"]: True}}))
    error(client.put(target, headers=owner_token, json=update(2, "order_staff")), 503, "identity_unavailable")
    monkeypatch.setenv(members.VERIFIED_REACTIVATIONS_ENV, json.dumps({t["a"]: {t["staff"]: 2}}))
    error(client.put(target, headers=owner_token, json=update(1, "order_staff")), 409, "version_conflict")
    restored = client.put(target, headers=owner_token, json=update(2, "order_staff"))
    assert restored.status_code == 200 and restored.json()["version"] == 3
    assert client.get("/v1/live/staff/memberships", headers=original_token).json() == {
        "memberships": [{"restaurant_id": t["a"], "role": "order_staff", "version": 3}]}
    _, audit = state(postgres_database_url, t["a"])
    assert len(audit) == 2 and audit[-1]["old_active"] is False and audit[-1]["new_active"] is True
    assert client.put(target, headers=owner_token, json=update(3, "order_staff", False)).status_code == 200
    error(client.put(target, headers=owner_token, json=update(4, "order_staff")), 404, "not_found")
    assert client.get("/v1/live/staff/memberships", headers=original_token).json() == {"memberships": []}
    monkeypatch.setenv(members.VERIFIED_REACTIVATIONS_ENV, json.dumps({t["a"]: {t["staff"]: 4}}))
    assert client.put(target, headers=owner_token, json=update(4, "order_staff")).status_code == 200
    _, audit = state(postgres_database_url, t["a"])
    assert len(audit) == 4


def test_runtime_role_cannot_erase_or_alter_audit(client, auth, tenants, staff_runtime_url, postgres_database_url):
    t = tenants
    assert client.put(path(t["a"], t["new"]), headers=auth(t["owner"]), json=update(0, "cashier")).status_code == 201
    before = state(postgres_database_url, t["a"])
    with psycopg.connect(staff_runtime_url, row_factory=dict_row) as runtime:
        assert_staff_runtime_role(runtime)
        for statement in (
            "UPDATE live_membership_audit SET new_role='owner'",
            "DELETE FROM live_membership_audit",
            "TRUNCATE live_membership_audit",
            "ALTER TABLE live_membership_audit DISABLE TRIGGER ALL",
            "DROP TABLE live_membership_audit",
            "CREATE TABLE public.rs06_unauthorized_ddl (id int)",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege), runtime.transaction():
                runtime.execute(statement)
    assert state(postgres_database_url, t["a"]) == before


def test_privileged_runtime_identity_fails_closed(client, auth, tenants, postgres_database_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    error(client.get("/v1/live/staff/memberships", headers=auth(tenants["owner"])), 503, "storage_unavailable", [])


def test_duplicate_member_mutation_fields_rejected(client, auth, tenants, postgres_database_url):
    t = tenants
    before = state(postgres_database_url, t["a"])
    error(client.put(path(t["a"], t["staff"]), headers=auth(t["owner"]),
                     content=b'{"expected_version":1,"role":"cashier","role":"owner","active":true}'),
          422, "invalid_input", ["body"])
    assert state(postgres_database_url, t["a"]) == before


def test_foreign_caller_denied_without_tenant_lock(client, auth, tenants, postgres_database_url):
    t = tenants
    with psycopg.connect(postgres_database_url) as holder:
        holder.execute("SELECT restaurant_id FROM live_restaurants WHERE restaurant_id=%s FOR UPDATE", (t["a"],))
        error(client.get(path(t["a"]), headers=auth(t["foreign"])), 404, "not_found")
        error(client.put(path(t["a"], t["staff"]), headers=auth(t["foreign"]), json=update(1, "owner")), 404, "not_found")


def test_lock_timeout_is_safe_and_does_not_write(client, auth, tenants, postgres_database_url):
    t = tenants
    before = state(postgres_database_url, t["a"])
    with psycopg.connect(postgres_database_url) as holder:
        holder.execute("SELECT restaurant_id FROM live_restaurants WHERE restaurant_id=%s FOR UPDATE", (t["a"],))
        error(client.put(path(t["a"], t["staff"]), headers=auth(t["owner"]), json=update(1, "cashier")),
              503, "storage_unavailable", [])
    assert state(postgres_database_url, t["a"]) == before


def test_queued_owner_write_rechecks_revocation(tenants, staff_runtime_url, postgres_database_url, monkeypatch):
    from threading import Event
    t = tenants
    queued = Event()
    original = members._lock_restaurant

    def observe(conn, rid, *, write):
        queued.set()
        return original(conn, rid, write=write)

    def queued_mutation():
        try:
            with staff_routes.staff_connection() as conn:
                members.put_member(conn, identity.StaffPrincipal(t["owner"]), t["a"], t["staff"],
                                   members.MembershipUpdate(**update(1, "cashier")))
        except members.MembershipError as exc:
            return exc.code
        return "unexpected success"

    with ThreadPoolExecutor(max_workers=1) as pool:
        with psycopg.connect(postgres_database_url, row_factory=dict_row) as holder:
            # Hold the parent, revoke the actor, but keep the revocation uncommitted.
            holder.execute("SELECT restaurant_id FROM live_restaurants WHERE restaurant_id=%s FOR UPDATE", (t["a"],))
            members.put_member(holder, identity.StaffPrincipal(t["second"]), t["a"], t["owner"],
                               members.MembershipUpdate(**update(1, "owner", False)))
            monkeypatch.setattr(members, "_lock_restaurant", observe)
            pending = pool.submit(queued_mutation)
            assert queued.wait(1.5)
        assert pending.result(timeout=5) == "not_found"
    rows, audit = state(postgres_database_url, t["a"])
    assert next(row for row in rows if row["clerk_user_id"] == t["staff"])["role"] == "order_staff"
    assert len(audit) == 1


def test_two_owner_race_with_nondefault_connection_setting(tenants, staff_runtime_url, postgres_database_url, monkeypatch):
    from contextlib import contextmanager
    t = tenants
    @contextmanager
    def nondefault(**kwargs):
        with psycopg.connect(staff_runtime_url, row_factory=dict_row) as conn:
            conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
            yield conn
    monkeypatch.setattr(staff_routes, "get_connection", nondefault)
    barrier = Barrier(2)

    def remove_self(subject):
        try:
            with staff_routes.staff_connection() as conn:
                barrier.wait(timeout=5)
                members.put_member(conn, identity.StaffPrincipal(subject), t["a"], subject,
                                   members.MembershipUpdate(**update(1, "owner", False)))
            return "accepted"
        except members.MembershipError as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(remove_self, [t["owner"], t["second"]])) == ["accepted", "last_owner"]
    rows, audit = state(postgres_database_url, t["a"])
    assert sum(row["active"] and row["role"] == "owner" for row in rows) == 1
    assert len(audit) == 1


def test_runtime_restaurant_lock_privilege_cannot_change_scope(
    client, auth, tenants, staff_runtime_url, postgres_database_url
):
    t = tenants
    rid = t["a"]
    # Both HTTP read and mutation paths use the actual restricted login.
    assert client.get(path(rid), headers=auth(t["owner"])).status_code == 200
    assert client.put(path(rid, t["new"]), headers=auth(t["owner"]), json=update(0, "cashier")).status_code == 201
    with psycopg.connect(staff_runtime_url, row_factory=dict_row) as runtime:
        assert_staff_runtime_role(runtime)
        before = runtime.execute(
            "SELECT ordering_enabled, synthetic FROM live_restaurants WHERE restaurant_id=%s", (rid,)
        ).fetchone()
        assert before == {"ordering_enabled": False, "synthetic": False}
        for clause in ("FOR SHARE", "FOR UPDATE"):
            assert runtime.execute(
                "SELECT restaurant_id FROM live_restaurants WHERE restaurant_id=%s " + clause, (rid,)
            ).fetchone()["restaurant_id"] == rid
        for column in ("ordering_enabled", "synthetic"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege), runtime.transaction():
                runtime.execute(sql.SQL("UPDATE live_restaurants SET {}=true WHERE restaurant_id=%s").format(
                    sql.Identifier(column)), (rid,))
        assert runtime.execute(
            "SELECT ordering_enabled, synthetic FROM live_restaurants WHERE restaurant_id=%s", (rid,)
        ).fetchone() == before


def test_regrant_removes_previous_broad_restaurant_update(
    client, auth, tenants, staff_runtime_url, postgres_database_url
):
    from psycopg.conninfo import conninfo_to_dict
    role = sql.Identifier(conninfo_to_dict(staff_runtime_url)["user"])
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as admin:
        admin.execute(sql.SQL("GRANT UPDATE ON public.live_restaurants TO {}").format(role))
        admin.execute(sql.SQL("GRANT UPDATE (ordering_enabled, synthetic) ON public.live_restaurants TO {}").format(role))
    error(client.get("/v1/live/staff/memberships", headers=auth(tenants["owner"])), 503, "storage_unavailable", [])
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as admin:
        grant_staff_runtime(admin, conninfo_to_dict(staff_runtime_url)["user"])
    with psycopg.connect(staff_runtime_url, row_factory=dict_row) as runtime:
        assert_staff_runtime_role(runtime)
        for column in ("ordering_enabled", "synthetic"):
            assert runtime.execute(
                "SELECT has_column_privilege(current_user, 'public.live_restaurants', %s, 'UPDATE') AS allowed",
                (column,)
            ).fetchone()["allowed"] is False
    assert client.get(path(tenants["a"]), headers=auth(tenants["owner"])).status_code == 200


def test_runtime_guard_rejects_column_only_scope_grant(
    client, auth, tenants, staff_runtime_url, postgres_database_url
):
    from psycopg.conninfo import conninfo_to_dict
    role = sql.Identifier(conninfo_to_dict(staff_runtime_url)["user"])
    with psycopg.connect(postgres_database_url, row_factory=dict_row) as admin:
        admin.execute(sql.SQL("GRANT UPDATE (synthetic) ON public.live_restaurants TO {}").format(role))
    error(client.get("/v1/live/staff/memberships", headers=auth(tenants["owner"])), 503, "storage_unavailable", [])
