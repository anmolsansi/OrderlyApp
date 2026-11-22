"""RS-01 synthetic-only live-v1 contract consumer. No live provider is exercised."""
from __future__ import annotations

import copy
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests/fixtures/restaurant-service/v1.json"
DOCUMENT = ROOT / "docs/contracts/restaurant-service-v1.md"
DEVELOPMENT = ROOT / "development.md"
MOCK_ROOT = ROOT / "tests/fixtures/contracts"

PREVIEW_FIELDS: dict[str, Any] = {
    "fulfillment": "enum:dine_in|takeaway",
    "table_id": "uuid?",
    "restaurant_id": "rid",
    "restaurant_name": "str",
    "table_label": "str?",
    "items": ["@line"],
    "totals": "@totals",
    "pricing_version": "positive_int",
    "promotion_code": "str?",
    "offer_version": "positive_int?",
    "business_identity": "string_map",
    "synthetic": "bool",
}
SCHEMAS: dict[str, Any] = {
    "reference": {"contract_id": "contract_id", "restaurant_id": "rid", "state": "enum:proposed", "source": "str"},
    "restaurant": {
        "id": "rid", "name": "str", "brand_label": "str", "is_open": "bool",
        "ordering_enabled": "bool", "timezone": "enum:Asia/Kolkata",
    },
    "settings": {
        "id": "rid", "name": "str", "brand_label": "str", "is_open": "bool",
        "ordering_enabled": "bool", "timezone": "enum:Asia/Kolkata",
        "version": "positive_int", "hours": ["@hour"],
    },
    "hour": {"day": "weekday", "opens_minute": "minute", "closes_minute": "minute"},
    "table": {"id": "uuid", "restaurant_id": "rid", "label": "str", "active": "bool", "version": "positive_int", "url": "str"},
    "principal": {"sub": "str"},
    "membership": {
        "restaurant_id": "rid", "clerk_user_id": "str",
        "role": "enum:owner|order_staff|cashier", "active": "bool", "version": "positive_int",
    },
    "staff_session": {
        "status": "enum:loading|signed_out|ready|unavailable", "token": "str",
        "restaurantId": "rid", "role": "enum:owner|order_staff|cashier",
    },
    "modifier_selection": {"group_id": "str", "option_ids": ["str"]},
    "modifier_option": {"id": "str", "name": "str", "price_delta_cents": "int", "available": "bool"},
    "modifier_group": {
        "id": "str", "name": "str", "type": "enum:single|multiple", "required": "bool",
        "min_selected": "int", "max_selected": "int", "default_option_id": "str?",
        "options": ["@modifier_option"],
    },
    "menu_item": {
        "id": "str", "name": "str", "description": "str", "price_cents": "money",
        "image_emoji": "str", "popular": "bool", "available": "bool",
        "modifier_groups": ["@modifier_group"],
    },
    "menu": {"restaurant_id": "rid", "catalog_version": "positive_int", "items": ["@menu_item"]},
    "catalog": {
        "schema_version": "one", "restaurant": "@restaurant",
        "catalog_version": "positive_int", "items": ["@menu_item"],
    },
    "line": {
        "id": "str", "restaurant_id": "rid", "menu_item_id": "str", "quantity": "quantity",
        "modifiers": ["@modifier_selection"], "special_instructions": "str?",
        "name": "str", "unit_minor": "money", "line_minor": "money",
    },
    "initial_cart": {"schema_version": "one", "restaurant_id": "rid", "revision": "revision", "items": ["@line"]},
    "cart": {"schema_version": "one", "restaurant_id": "rid", "revision": "revision", "items": ["@line"]},
    "totals": {
        "currency": "enum:INR", "subtotal_minor": "money", "discount_minor": "money",
        "tax_minor": "money", "charges_minor": "money", "total_minor": "money",
    },
    "receipt_preview": PREVIEW_FIELDS,
    "quote": {
        "schema_version": "one", "cart_revision": "revision",
        "catalog_version": "positive_int", "pricing_version": "positive_int",
        "offer_version": "positive_int?", "quote_digest": "digest",
        "receipt_preview": "@receipt_preview", "totals": "@totals",
    },
    "receipt": {
        **PREVIEW_FIELDS, "schema_version": "one", "kind": "enum:live-v1",
        "id": "uuid", "created_at": "utc", "payment_instruction": "enum:Pay at restaurant",
    },
    "operation": {
        "status": "enum:Submitted|Accepted|Preparing|Ready|Completed|Rejected|Cancelled",
        "version": "positive_int", "reason": "str?", "updated_at": "utc",
    },
    "payment": {
        "status": "enum:Unpaid|Paid", "amount_minor": "money",
        "currency": "enum:INR", "active_payment_event_id": "uuid?",
        "settlement_required": "bool",
    },
    "event": {"id": "uuid", "kind": "str", "at": "utc", "actor": "str", "reason": "str?"},
    "detail": {
        "receipt": "@receipt", "operation": "@operation", "payment": "@payment",
        "events": ["@event"],
    },
    "order_summary": {
        "id": "uuid", "created_at": "utc", "fulfillment": "enum:dine_in|takeaway",
        "table_label": "str?", "total_minor": "money", "currency": "enum:INR",
        "operation": "@operation", "payment": "@payment",
    },
    "offer": {
        "id": "uuid", "restaurant_id": "rid", "version": "positive_int",
        "code": "str", "starts_at": "utc", "ends_at": "utc",
        "min_subtotal_minor": "money", "percent_bps": "positive_int",
        "max_discount_minor": "money", "max_redemptions": "positive_int",
        "consumed": "int", "active": "bool",
    },
    "campaign": {
        "id": "uuid", "restaurant_id": "rid", "version": "positive_int",
        "channel": "enum:sms|email", "offer_id": "uuid", "message": "str",
        "subject": "str?", "status": "enum:draft|approved|dispatching|paused|finished",
        "approval_id": "uuid?",
    },
    "campaign_preview": {
        "preview_id": "uuid", "expires_at": "utc", "recipient_count": "int",
        "estimated_cost_minor": "money", "currency": "enum:INR",
        "content_digest": "digest", "offer_version": "positive_int", "setup_ready": "bool",
    },
    "approval": {
        "id": "uuid", "campaign_id": "uuid", "version": "positive_int",
        "recipient_count": "int", "max_cost_minor": "money",
        "currency": "enum:INR", "approved_at": "utc",
    },
    "setup": {
        "configured": "bool", "verified": "bool", "reason_codes": ["str"],
        "cost_version": "positive_int?",
    },
    "delivery_input": {
        "id": "uuid", "restaurant_id": "rid", "approval_id": "uuid",
        "claim_token": "uuid", "channel": "enum:sms|email",
        "destination": "str", "message": "str", "subject": "str?",
        "unsubscribe_url": "str", "reserved_cost_minor": "money",
        "config_version": "positive_int",
    },
    "delivery_result": {
        "state": "enum:accepted|delivered|failed|uncertain|safely_not_sent",
        "provider_id": "str?", "safe_code": "str",
        "actual_cost_minor": "money?",
    },
    "campaign_counts": {
        "accepted": "int", "delivered": "int", "uncertain": "int",
        "cost_reserved_minor": "money",
    },
    "summary": {
        "from": "date", "to": "date", "currency": "enum:INR",
        "submitted": "int", "completed": "int", "cancelled": "int",
        "recorded_paid_minor": "money", "reversed_minor": "money",
        "unpaid_minor": "money", "settlement_required": "int",
        "promotion_submissions": "int", "campaigns": "@campaign_counts",
    },
    "consent": {
        "order_id": "uuid", "channel": "enum:sms|email",
        "destination": "str", "notice_version": "str", "consent": "bool",
    },
    "unsubscribe": {"unsubscribed": "bool"},
    "theme": {"theme": "enum:light|dark", "source": "str"},
    "form_error": {"field_id": "str", "message": "str"},
    "form_errors": {"errors": ["@form_error"], "submitted": "bool"},
    "api_result": {"ok": "bool", "data": "@receipt"},
    "queue": {"orders": ["@order_summary"], "next_cursor": "str?", "as_of": "utc"},
    "transcript": {"transcript": "str", "locale": "str", "verified_device": "bool"},
    "proposal": {
        "kind": "enum:add|clarify|navigate", "restaurantId": "rid",
        "catalogVersion": "positive_int", "itemId": "str?",
        "quantity": "quantity?", "modifiers": ["@modifier_selection"],
        "missingFields": ["str"], "transcript": "str",
    },
    "demo_session": {
        "schema_version": "one", "restaurant_id": "rid", "expires_at": "utc",
    },
    "readiness": {
        "ready": "bool", "source_sha": "str", "schema_ready": "bool",
        "worker_ready": "bool", "identity_ready": "bool",
        "live_enabled": "bool", "reason_codes": ["str"],
    },
    "worker": {
        "command": "str", "live_enabled": "bool", "marketing_send_enabled": "bool",
    },
    "error_payload": {
        "code": "str", "message": "str", "fields": ["str"],
        "request_id": "str",
    },
    "error": {"error": "@error_payload"},

    "memberships_list": {"memberships": ["@membership"]},
    "tables_list": {"tables": ["@table"]},
    "guest_order": {"receipt": "@receipt", "operation": "@operation", "payment": "@payment"},
    "recorded": {"recorded": "bool"},
    "messaging_setup": {"sms": "@setup", "email": "@setup"},
    "cart_item_input": {
        "id": "str", "restaurant_id": "rid", "menu_item_id": "str",
        "quantity": "quantity", "modifiers": ["@modifier_selection"],
        "special_instructions": "str?",
    },
    "member_update": {"expected_version": "revision", "role": "enum:owner|order_staff|cashier", "active": "bool"},
    "settings_update": {
        "expected_version": "revision", "name": "str", "timezone": "enum:Asia/Kolkata",
        "hours": ["@hour"], "is_open": "bool", "brand_label": "str",
    },
    "availability_update": {"expected_catalog_version": "positive_int", "available": "bool"},
    "table_update": {"expected_version": "revision", "label": "str", "active": "bool"},
    "cart_put": {"expected_revision": "revision", "items": ["@cart_item_input"]},
    "cart_delete": {"expected_revision": "revision"},
    "quote_request": {
        "expected_revision": "revision", "fulfillment": "enum:dine_in|takeaway",
        "table_id": "uuid?", "promotion_code": "str?",
    },
    "offer_update": {
        "expected_version": "revision", "code": "str", "starts_at": "utc",
        "ends_at": "utc", "min_subtotal_minor": "money", "percent_bps": "positive_int",
        "max_discount_minor": "money", "max_redemptions": "positive_int", "active": "bool",
    },
    "order_request": {
        "expected_revision": "revision", "quote_digest": "digest", "fulfillment": "enum:dine_in|takeaway",
        "table_id": "uuid?", "promotion_code": "str?",
    },
    "transition_request": {
        "expected_version": "revision", "target": "enum:Accepted|Rejected|Preparing|Ready|Completed|Cancelled",
        "reason": "str?",
    },
    "payment_request": {"expected_version": "revision", "method": "enum:cash|upi|card|other"},
    "reversal_request": {"expected_version": "revision", "payment_event_id": "uuid", "reason": "str"},
    "empty_request": {},
    "campaign_create": {"channel": "enum:sms|email", "offer_id": "uuid", "message": "str", "subject": "str?"},
    "preview_request": {"expected_version": "revision"},
    "approve_request": {"expected_version": "revision", "preview_id": "uuid", "max_cost_minor": "money"},
    "pause_request": {"expected_version": "revision"},
}


def is_scalar_valid(kind: str, value: Any) -> bool:
    if kind.endswith("?"):
        return value is None or is_scalar_valid(kind[:-1], value)
    if kind.startswith("@"):
        return validate(SCHEMAS[kind[1:]], value) == []
    if kind.startswith("enum:"):
        return isinstance(value, str) and value in kind[5:].split("|")
    if kind == "str":
        return isinstance(value, str)
    if kind == "bool":
        return type(value) is bool
    if kind == "one":
        return type(value) is int and value == 1
    if kind in {"int", "revision"}:
        return type(value) is int and 0 <= value <= 2**53 - 1
    if kind == "positive_int":
        return type(value) is int and 0 < value <= 2**53 - 1
    if kind == "money":
        return type(value) is int and 0 <= value <= 2147483647
    if kind == "quantity":
        return type(value) is int and 1 <= value <= 10
    if kind == "weekday":
        return type(value) is int and 1 <= value <= 7
    if kind == "minute":
        return type(value) is int and 0 <= value <= 1440
    if kind == "rid":
        return value == "r-demo"
    if kind == "contract_id":
        return isinstance(value, str) and bool(re.fullmatch(r"CON-\d{2}", value))
    if kind == "uuid":
        return isinstance(value, str) and bool(
            re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", value, re.I)
        )
    if kind == "digest":
        return isinstance(value, str) and bool(re.fullmatch(r"[a-f0-9]{64}", value))
    if kind == "utc":
        if not isinstance(value, str) or not re.fullmatch(
            r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)", value
        ):
            return False
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None
        except ValueError:
            return False
    if kind == "date":
        return isinstance(value, str) and bool(re.fullmatch(r"\d{4}-\d\d-\d\d", value))
    if kind == "string_map":
        return isinstance(value, dict) and all(isinstance(item, str) for item in value.values())
    raise AssertionError("Unknown schema kind: " + kind)


def validate(spec: Any, value: Any, path: str = "") -> list[str]:
    """Strict shape validation, independent from fixture-supplied expected paths."""
    if isinstance(spec, str):
        if spec.endswith("?") and value is None:
            return []
        if spec.startswith("@"):
            return validate(SCHEMAS[spec[1:]], value, path)
        return [] if is_scalar_valid(spec, value) else [path or "$"]
    if isinstance(spec, list):
        if not isinstance(value, list) or len(spec) != 1:
            return [path or "$"]
        return [
            issue
            for index, item in enumerate(value)
            for issue in validate(spec[0], item, f"{path}.{index}" if path else str(index))
        ]
    if not isinstance(value, dict):
        return [path or "$"]
    errors = []
    for field, field_spec in spec.items():
        field_path = f"{path}.{field}" if path else field
        if field not in value:
            errors.append(field_path)
        else:
            errors.extend(validate(field_spec, value[field], field_path))
    for field in value.keys() - spec.keys():
        errors.append(f"{path}.{field}" if path else field)
    return errors


def apply_mutation(payload: Any, change: dict[str, Any]) -> Any:
    result = copy.deepcopy(payload)
    names = change["path"].split(".")
    node = result
    for part in names[:-1]:
        node = node[int(part)] if isinstance(node, list) else node[part]
    final = int(names[-1]) if isinstance(node, list) else names[-1]
    if change["action"] == "remove":
        del node[final]
    else:
        node[final] = change["value"]
    return result


def canonical(value: Any) -> str:
    """Review correction C-A: recursively sorted keys, compact UTF-8 JSON, stable list order."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def read_bundle() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_registry_and_three_review_amendments_are_copied_verbatim() -> None:
    source = DEVELOPMENT.read_text(encoding="utf-8")
    published = DOCUMENT.read_text(encoding="utf-8")
    a = source.index("#### Shared wire, authorization and failure semantics")
    b = source.index("### 18.7 Dependency DAG", a)
    c = source.index("#### 18.17.1 Contract corrections required before fixture freeze")
    d = source.index("#### 18.17.2 Follow-up index", c)
    assert source[a:b].rstrip() in published
    assert source[c:d].rstrip() in published


def test_exactly_67_positive_examples_are_structurally_accepted() -> None:
    fixture = read_bundle()
    assert fixture["schema_version"] == 1
    assert fixture["synthetic"] is True
    assert fixture["live_activation"] is False
    assert fixture["money_unit"] == "INR paise"
    assert fixture["ids"]["restaurant_id"] == "r-demo"
    assert fixture["ids"]["guest_id"] == "g-one"
    assert fixture["ids"]["menu_item_id"] == "i-one"
    assert len(fixture["contracts"]) == 67
    for number in range(1, 68):
        contract_id = f"CON-{number:02}"
        case = fixture["contracts"][contract_id]
        assert case["contract"] == contract_id
        assert case["schema_version"] == 1 and case["synthetic"] is True
        assert case["live_provider_verified"] is False
        assert case["source_summary"].startswith(contract_id + ":")
        schema = SCHEMAS[case["kind"]]
        assert not validate(schema, case["positive"]["payload"]), contract_id
        assert case["negative"], contract_id
        if case["kind"] == "reference":
            assert case["positive"]["payload"]["contract_id"] == contract_id
    assert set(fixture["external_evidence_gates"]) == {"U1", "U2", "U3", "U4"}


def test_all_negative_mutations_fail_independent_strict_schema() -> None:
    fixture = read_bundle()
    count = 0
    for contract_id, case in fixture["contracts"].items():
        for change in case["negative"]:
            bad = apply_mutation(case["positive"]["payload"], change)
            errors = validate(SCHEMAS[case["kind"]], bad)
            assert change["expected_field"] in errors, (contract_id, change["name"], errors)
            assert change["code"] in {"invalid_input", "not_found"}
            assert validate(SCHEMAS["error"], {"error": change["error"]}) == []
            assert change["error"]["code"] == change["code"]
            assert change["error"]["fields"] == ([] if change["code"] == "not_found" else [change["expected_field"]])
            assert change["expected_status"] == (404 if change["code"] == "not_found" else 422)
            assert change["error"]["request_id"].startswith("synthetic-request-")
            count += 1
    assert count > 200


def test_quote_cart_and_receipt_values_are_integer_inr_and_deterministic() -> None:
    core = read_bundle()["core"]
    assert validate(SCHEMAS["quote"], core["quote"]) == []
    assert validate(SCHEMAS["receipt"], core["receipt"]) == []
    assert core["quote"]["totals"]["total_minor"] == 1200
    assert core["quote"]["totals"] == core["receipt"]["totals"]
    assert core["initial_cart"]["revision"] == 0
    assert core["cart"]["revision"] == 1
    assert len(core["cart"]["items"]) == 1
    assert core["quote"]["receipt_preview"]["offer_version"] is None
    assert core["receipt"]["payment_instruction"] == "Pay at restaurant"
    assert core["receipt"]["business_identity"] == {}


def test_canonical_command_digest_and_idempotency_conflicts() -> None:
    record = read_bundle()["canonical_command"]
    encoded = canonical(record["envelope"])
    assert encoded == record["canonical_json"]
    assert hashlib.sha256(encoded.encode("utf-8")).hexdigest() == record["sha256"]
    assert record["same_key_replay"]["expected_status"] == 200
    for conflict in record["conflicts"]:
        request = apply_mutation(
            record["envelope"],
            {"action": "replace", "path": conflict["path"], "value": conflict["value"]},
        )
        assert canonical(request) != encoded
        assert hashlib.sha256(canonical(request).encode("utf-8")).hexdigest() != record["sha256"]
        assert conflict["expected_status"] == 409
    assert [case["expected_status"] for case in record["security_cases"]] == [403, 404]
    assert len(record["canonicalization_vectors"]) == 2
    for vector in record["canonicalization_vectors"]:
        encoded = canonical(vector["input"])
        assert encoded == vector["canonical_json"], vector["name"]
        assert hashlib.sha256(encoded.encode("utf-8")).hexdigest() == vector["sha256"]
        assert "नमस्ते" in encoded
    assert record["canonicalization_vectors"][0]["sha256"] != record["canonicalization_vectors"][1]["sha256"]



def test_wire_cases_share_valid_request_response_shapes() -> None:
    fixture = read_bundle()
    wire_cases = fixture["wire_cases"]
    assert len(wire_cases) >= 25
    used = set()
    for case in wire_cases:
        assert case["id"] not in used
        used.add(case["id"])
        assert case["synthetic"] is True
        assert case["contract"] in fixture["contracts"]
        assert case["method"] in {"GET", "PUT", "POST", "DELETE"}
        assert case["auth"] in {
            "public", "guest_cookie", "capability_token", "clerk_staff",
            "clerk_owner", "clerk_order_staff", "clerk_cashier",
        }
        assert case["path"].replace("/v1/live/", "/api/orderly/live/") == case["gateway_path"]
        assert "r-other" not in case["path"]
        assert case["response_schema"] in SCHEMAS
        assert validate(SCHEMAS[case["response_schema"]], case["response"]) == [], case["id"]
        if case["method"] == "GET":
            assert case["request"] is None
            assert case["request_schema"] is None
        else:
            assert case["request_schema"] in SCHEMAS, case["id"]
            assert validate(SCHEMAS[case["request_schema"]], case["request"]) == [], case["id"]
        if case["idempotency_key"] is not None:
            assert case["method"] == "POST"
            assert case["idempotency_key"] == fixture["canonical_command"]["key"]
        if case["expected_status"] is not None:
            assert case["expected_status"] in {200, 201, 503}
    assert any(case["path"].endswith("/payment-reversals") for case in wire_cases)
    assert all(not case["path"].endswith("/reversals") for case in wire_cases)


def test_malformed_wire_requests_and_protocol_negatives_fail_closed() -> None:
    fixture = read_bundle()
    wires = {item["id"]: item for item in fixture["wire_cases"]}
    negatives = [
        ("CON-14-1", "items.0.restaurant_id", "r-other"),
        ("CON-14-1", "expected_revision", True),
        ("CON-15-1", "promotion_code", None),
        ("CON-16-1", "max_discount_minor", "200"),
        ("CON-18-1", "payment_token", "forbidden"),
        ("CON-28-1", "channel", "whatsapp"),
    ]
    for case_id, field, value in negatives:
        item = wires[case_id]
        operation = "remove" if case_id == "CON-15-1" else ("add" if field == "payment_token" else "replace")
        request = apply_mutation(item["request"], {
            "action": operation, "path": field, "value": value,
        })
        errors = validate(SCHEMAS[item["request_schema"]], request)
        assert field in errors, (case_id, field, errors)
    protocol = fixture["protocol_negative_cases"]
    assert [item["expected_status"] for item in protocol] == [401, 403, 404, 409, 409, 404, 503]
    for item in protocol:
        assert item["no_write"] is True
        assert item["synthetic"] is True
        assert item["contract"] in fixture["contracts"]
        assert item["code"]
        assert validate(SCHEMAS["error"], {"error": item["error"]}) == []
        assert item["error"]["code"] == item["code"]
        assert item["error"]["fields"] == item["fields"]
        assert item["error"]["request_id"].startswith("synthetic-request-")

def test_old_mock_fixture_blobs_are_byte_identical_to_base() -> None:
    expected = read_bundle()["mock_fixture_blob_sha"]
    assert len(expected) == 9
    for number in range(9):
        path = MOCK_ROOT / f"c{number}.json"
        raw = path.read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
        assert actual == expected[path.name], path.name
