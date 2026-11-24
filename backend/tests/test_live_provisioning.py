from __future__ import annotations

from pathlib import Path
import sys
from uuid import uuid4

import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from scripts.provision_live_restaurant import (
    ProvisioningInputError,
    build_parser,
    main,
    read_input_text,
    validate_input_object,
    _insert_compatibility_restaurant,
    _insert_live_restaurant,
    provision_restaurant,
)


def test_cli_requires_an_input_file():
    with pytest.raises(SystemExit) as error:
        main([])

    assert error.value.code == 2


def test_cli_accepts_the_documented_input_path():
    args = build_parser().parse_args(["--input", "/private/restaurant.json"])

    assert args.input == Path("/private/restaurant.json")


def test_input_reader_accepts_bounded_utf8_text(tmp_path):
    source = tmp_path / "restaurant.json"
    source.write_text('{"restaurant_id":"r-test"}', encoding="utf-8")

    assert read_input_text(source) == '{"restaurant_id":"r-test"}'


def test_input_reader_rejects_files_over_64_kib(tmp_path):
    source = tmp_path / "restaurant.json"
    source.write_bytes(b"x" * (64 * 1024 + 1))

    with pytest.raises(ProvisioningInputError, match="64 KiB"):
        read_input_text(source)


def test_input_reader_rejects_non_utf8_files(tmp_path):
    source = tmp_path / "restaurant.json"
    source.write_bytes(b"\xff\xfe")

    with pytest.raises(ProvisioningInputError, match="UTF-8"):
        read_input_text(source)


def test_input_reader_reports_missing_file_without_exposing_path(tmp_path):
    source = tmp_path / "private-secret-input.json"

    with pytest.raises(ProvisioningInputError) as error:
        read_input_text(source)

    assert str(error.value) == "input file cannot be read"
    assert "private-secret-input" not in str(error.value)


@pytest.mark.parametrize("text", ["{", '{"restaurant_id":', "not-json"])
def test_json_parser_rejects_malformed_input(text):
    from scripts.provision_live_restaurant import parse_input_text

    with pytest.raises(ProvisioningInputError, match="valid JSON"):
        parse_input_text(text)


def test_json_parser_rejects_duplicate_keys_at_any_depth():
    from scripts.provision_live_restaurant import parse_input_text

    with pytest.raises(ProvisioningInputError, match="duplicate keys"):
        parse_input_text('{"restaurant_id":"first","nested":{"id":1,"id":2}}')


@pytest.mark.parametrize("text", ["[]", "null", '"restaurant"', "17"])
def test_json_parser_requires_a_top_level_object(text):
    from scripts.provision_live_restaurant import parse_input_text

    with pytest.raises(ProvisioningInputError, match="JSON object"):
        parse_input_text(text)


def test_json_parser_rejects_non_standard_numeric_constants():
    from scripts.provision_live_restaurant import parse_input_text

    with pytest.raises(ProvisioningInputError, match="valid JSON"):
        parse_input_text('{"hours":NaN}')


def valid_input_object(**changes):
    value = {
        "restaurant_id": "r-test",
        "name": "Test Restaurant",
        "cuisine": "Indian",
        "brand_label": "Test Brand",
        "timezone": "Asia/Kolkata",
        "hours": [],
    }
    value.update(changes)
    return value


def test_input_schema_accepts_the_documented_fields():
    from scripts.provision_live_restaurant import validate_input_object

    parsed = validate_input_object(valid_input_object())

    assert parsed.restaurant_id == "r-test"
    assert parsed.name == "Test Restaurant"
    assert parsed.cuisine == "Indian"
    assert parsed.brand_label == "Test Brand"
    assert parsed.timezone == "Asia/Kolkata"
    assert parsed.hours == []


def test_input_schema_rejects_missing_required_fields():
    from scripts.provision_live_restaurant import validate_input_object

    with pytest.raises(ProvisioningInputError, match="restaurant_id"):
        validate_input_object({"name": "Test Restaurant"})


def test_input_schema_rejects_unknown_fields():
    from scripts.provision_live_restaurant import validate_input_object

    with pytest.raises(ProvisioningInputError, match="unexpected"):
        validate_input_object(valid_input_object(unexpected="must not be accepted"))


@pytest.mark.parametrize("field", ["restaurant_id", "name", "cuisine", "brand_label", "timezone", "hours"])
def test_input_schema_rejects_wrong_field_types(field):
    from scripts.provision_live_restaurant import validate_input_object

    with pytest.raises(ProvisioningInputError):
        validate_input_object(valid_input_object(**{field: 17}))


@pytest.mark.parametrize(
    "field,value",
    [
        ("restaurant_id", ""),
        ("restaurant_id", "r" * 101),
        ("name", ""),
        ("name", "n" * 121),
        ("cuisine", ""),
        ("brand_label", ""),
        ("brand_label", "b" * 61),
        ("name", "   "),
    ],
)
def test_input_schema_enforces_string_bounds_and_nonblank_values(field, value):
    from scripts.provision_live_restaurant import validate_input_object

    with pytest.raises(ProvisioningInputError):
        validate_input_object(valid_input_object(**{field: value}))


@pytest.mark.parametrize("timezone", ["UTC", "Asia/Calcutta", "asia/kolkata"])
def test_input_schema_requires_the_frozen_india_timezone(timezone):
    from scripts.provision_live_restaurant import validate_input_object

    with pytest.raises(ProvisioningInputError, match="timezone"):
        validate_input_object(valid_input_object(timezone=timezone))


def test_hours_schema_accepts_valid_and_boundary_intervals():
    from scripts.provision_live_restaurant import validate_input_object

    parsed = validate_input_object(valid_input_object(hours=[
        {"day": 1, "opens_minute": 0, "closes_minute": 1440},
        {"day": 2, "opens_minute": 540, "closes_minute": 1320},
    ]))

    assert parsed.hours[0].opens_minute == 0
    assert parsed.hours[0].closes_minute == 1440


@pytest.mark.parametrize(
    "interval",
    [
        {"day": 0, "opens_minute": 0, "closes_minute": 60},
        {"day": 8, "opens_minute": 0, "closes_minute": 60},
        {"day": 1, "opens_minute": -1, "closes_minute": 60},
        {"day": 1, "opens_minute": 1440, "closes_minute": 1440},
        {"day": 1, "opens_minute": 60, "closes_minute": 0},
        {"day": 1, "opens_minute": 120, "closes_minute": 120},
        {"day": 1, "opens_minute": 180, "closes_minute": 120},
        {"day": True, "opens_minute": 0, "closes_minute": 60},
        {"day": 1, "opens_minute": 1.5, "closes_minute": 60},
    ],
)
def test_hours_schema_rejects_invalid_interval_values(interval):
    from scripts.provision_live_restaurant import validate_input_object

    with pytest.raises(ProvisioningInputError):
        validate_input_object(valid_input_object(hours=[interval]))


def test_hours_schema_rejects_unknown_interval_fields():
    from scripts.provision_live_restaurant import validate_input_object

    with pytest.raises(ProvisioningInputError):
        validate_input_object(valid_input_object(hours=[
            {"day": 1, "opens_minute": 0, "closes_minute": 60, "open": True}
        ]))


def test_hours_schema_rejects_overlapping_intervals_on_the_same_day():
    from scripts.provision_live_restaurant import validate_input_object

    with pytest.raises(ProvisioningInputError, match="hours"):
        validate_input_object(valid_input_object(hours=[
            {"day": 1, "opens_minute": 540, "closes_minute": 720},
            {"day": 1, "opens_minute": 700, "closes_minute": 900},
        ]))


def test_hours_schema_accepts_adjacent_and_split_midnight_segments():
    from scripts.provision_live_restaurant import validate_input_object

    parsed = validate_input_object(valid_input_object(hours=[
        {"day": 1, "opens_minute": 540, "closes_minute": 720},
        {"day": 1, "opens_minute": 720, "closes_minute": 900},
        {"day": 2, "opens_minute": 0, "closes_minute": 60},
    ]))

    assert len(parsed.hours) == 3


def test_hours_schema_enforces_the_fourteen_entry_limit():
    from scripts.provision_live_restaurant import validate_input_object

    fourteen = [
        {"day": day, "opens_minute": 0, "closes_minute": 60}
        for day in range(1, 8)
    ] + [
        {"day": day, "opens_minute": 60, "closes_minute": 120}
        for day in range(1, 8)
    ]
    validate_input_object(valid_input_object(hours=fourteen))

    with pytest.raises(ProvisioningInputError):
        validate_input_object(valid_input_object(hours=fourteen + [
            {"day": 1, "opens_minute": 120, "closes_minute": 180}
        ]))


def test_target_environment_requires_an_explicit_value(monkeypatch):
    from scripts.provision_live_restaurant import ProvisioningError, require_target_environment

    monkeypatch.delenv("ORDERLY_ENVIRONMENT", raising=False)

    with pytest.raises(ProvisioningError, match="ORDERLY_ENVIRONMENT"):
        require_target_environment()


def test_target_environment_returns_the_explicit_name_without_guessing(monkeypatch):
    from scripts.provision_live_restaurant import require_target_environment

    monkeypatch.setenv("ORDERLY_ENVIRONMENT", "test")

    assert require_target_environment() == "test"


@pytest.fixture
def db(postgres_database_url):
    with psycopg.connect(postgres_database_url) as connection:
        connection.execute("SELECT 1")
        try:
            yield connection
        finally:
            connection.rollback()


def test_compatibility_insert_uses_only_the_fixed_non_live_placeholders(db):
    restaurant_id = f"rs67-{uuid4().hex}"
    payload = validate_input_object(valid_input_object(restaurant_id=restaurant_id))

    _insert_compatibility_restaurant(db, payload)

    row = db.execute(
        """SELECT id,name,cuisine,rating,delivery_minutes,delivery_fee_cents,
                  image_emoji,tags
           FROM restaurants WHERE id=%s""",
        (restaurant_id,),
    ).fetchone()
    assert row == (
        restaurant_id,
        "Test Restaurant",
        "Indian",
        0,
        "Not offered",
        0,
        "",
        [],
    )


def test_live_insert_keeps_ordering_disabled_and_uses_db_a_defaults(db):
    restaurant_id = f"rs67-{uuid4().hex}"
    payload = validate_input_object(valid_input_object(
        restaurant_id=restaurant_id,
        hours=[
            {"day": 1, "opens_minute": 540, "closes_minute": 1020},
            {"day": 2, "opens_minute": 0, "closes_minute": 60},
        ],
    ))
    _insert_compatibility_restaurant(db, payload)

    _insert_live_restaurant(db, payload)

    row = db.execute(
        """SELECT restaurant_id,brand_label,timezone,hours,ordering_enabled,
                  version,catalog_version,pricing_version,pricing_profile,
                  synthetic,demo_owner_id
           FROM live_restaurants WHERE restaurant_id=%s""",
        (restaurant_id,),
    ).fetchone()
    assert row == (
        restaurant_id,
        "Test Brand",
        "Asia/Kolkata",
        [
            {"day": 1, "opens_minute": 540, "closes_minute": 1020},
            {"day": 2, "opens_minute": 0, "closes_minute": 60},
        ],
        False,
        1,
        1,
        1,
        None,
        False,
        None,
    )


def test_provision_restaurant_creates_both_rows_in_one_transaction(db):
    restaurant_id = f"rs67-{uuid4().hex}"
    payload = validate_input_object(valid_input_object(restaurant_id=restaurant_id))

    result = provision_restaurant(db, payload)

    assert result == restaurant_id
    assert db.execute(
        "SELECT id FROM restaurants WHERE id=%s", (restaurant_id,)
    ).fetchone() == (restaurant_id,)
    assert db.execute(
        """SELECT restaurant_id,ordering_enabled
           FROM live_restaurants WHERE restaurant_id=%s""",
        (restaurant_id,),
    ).fetchone() == (restaurant_id, False)
