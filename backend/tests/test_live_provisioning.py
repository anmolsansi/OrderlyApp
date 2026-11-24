from __future__ import annotations

from contextlib import nullcontext
from pathlib import Path
import json
import sys
from uuid import uuid4

import psycopg
from psycopg import sql
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


def test_duplicate_restaurant_id_is_refused_without_partial_live_row(db):
    restaurant_id = f"rs67-{uuid4().hex}"
    payload = validate_input_object(valid_input_object(restaurant_id=restaurant_id))
    _insert_compatibility_restaurant(db, payload)

    from scripts.provision_live_restaurant import ProvisioningError

    with pytest.raises(ProvisioningError, match="restaurant_id already exists"):
        provision_restaurant(db, payload)

    assert db.execute(
        "SELECT COUNT(*) FROM restaurants WHERE id=%s", (restaurant_id,)
    ).fetchone() == (1,)
    assert db.execute(
        "SELECT COUNT(*) FROM live_restaurants WHERE restaurant_id=%s",
        (restaurant_id,),
    ).fetchone() == (0,)


def test_failure_after_compatibility_insert_rolls_back_both_rows(db):
    restaurant_id = f"rs67-{uuid4().hex}"
    payload = validate_input_object(valid_input_object(restaurant_id=restaurant_id))
    function_name = f"rs67_fail_{uuid4().hex}"
    trigger_name = f"rs67_fail_{uuid4().hex}"

    db.execute(sql.SQL(
        """
        CREATE FUNCTION {}() RETURNS trigger LANGUAGE plpgsql AS $function$
        BEGIN
            RAISE EXCEPTION 'simulated RS-67 second-write failure';
        END;
        $function$
        """
    ).format(sql.Identifier(function_name)))
    db.execute(sql.SQL(
        """
        CREATE TRIGGER {} BEFORE INSERT ON live_restaurants
        FOR EACH ROW EXECUTE FUNCTION {}()
        """
    ).format(sql.Identifier(trigger_name), sql.Identifier(function_name)))

    with pytest.raises(psycopg.errors.RaiseException):
        provision_restaurant(db, payload)

    assert db.execute(
        "SELECT COUNT(*) FROM restaurants WHERE id=%s", (restaurant_id,)
    ).fetchone() == (0,)
    assert db.execute(
        "SELECT COUNT(*) FROM live_restaurants WHERE restaurant_id=%s",
        (restaurant_id,),
    ).fetchone() == (0,)


def test_provisioning_does_not_adopt_or_copy_existing_mock_catalog(db):
    mock_id = f"mock-{uuid4().hex}"
    new_id = f"rs67-{uuid4().hex}"
    db.execute(
        """INSERT INTO restaurants
           (id,name,cuisine,rating,delivery_minutes,delivery_fee_cents,image_emoji)
           VALUES (%s,%s,%s,4.5,%s,125,'P')""",
        (mock_id, "Existing Mock", "Pizza", "20-30 min"),
    )
    db.execute(
        """INSERT INTO menu_items
           (id,restaurant_id,name,description,price_cents,image_emoji,popular)
           VALUES (%s,%s,%s,%s,1192,'P',true)""",
        (f"item-{uuid4().hex}", mock_id, "Mock Pizza", "Existing mock item"),
    )
    mock_before = db.execute(
        """SELECT id,name,cuisine,rating,delivery_minutes,delivery_fee_cents,image_emoji
           FROM restaurants WHERE id=%s""",
        (mock_id,),
    ).fetchone()
    menu_before = db.execute(
        """SELECT id,name,description,price_cents
           FROM menu_items WHERE restaurant_id=%s""",
        (mock_id,),
    ).fetchall()

    payload = validate_input_object(valid_input_object(restaurant_id=new_id))
    provision_restaurant(db, payload)

    assert db.execute(
        """SELECT id,name,cuisine,rating,delivery_minutes,delivery_fee_cents,image_emoji
           FROM restaurants WHERE id=%s""",
        (mock_id,),
    ).fetchone() == mock_before
    assert db.execute(
        """SELECT id,name,description,price_cents
           FROM menu_items WHERE restaurant_id=%s""",
        (mock_id,),
    ).fetchall() == menu_before
    assert db.execute(
        "SELECT COUNT(*) FROM menu_items WHERE restaurant_id=%s", (new_id,)
    ).fetchone() == (0,)
    assert db.execute(
        "SELECT COUNT(*) FROM live_restaurants WHERE restaurant_id=%s", (mock_id,)
    ).fetchone() == (0,)
    assert db.execute(
        "SELECT ordering_enabled FROM live_restaurants WHERE restaurant_id=%s",
        (new_id,),
    ).fetchone() == (False,)


def test_cli_success_prints_only_the_new_restaurant_id(db, tmp_path, monkeypatch, capsys):
    from scripts import provision_live_restaurant as cli

    restaurant_id = f"rs67-{uuid4().hex}"
    payload = valid_input_object(restaurant_id=restaurant_id)
    source = tmp_path / "private-restaurant.json"
    source.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setenv("ORDERLY_ENVIRONMENT", "test")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test-only")
    monkeypatch.delenv("ORDERLY_FORCE_JSON_STORE", raising=False)
    monkeypatch.setattr(cli, "get_connection", lambda: nullcontext(db))

    exit_code = cli.main(["--input", str(source)])

    output = capsys.readouterr()
    assert exit_code == 0
    assert output.out == f"{restaurant_id}\n"
    assert output.err == ""


def test_cli_fails_before_connecting_when_environment_is_missing(tmp_path, monkeypatch, capsys):
    from scripts import provision_live_restaurant as cli

    source = tmp_path / "restaurant.json"
    source.write_text(json.dumps(valid_input_object()), encoding="utf-8")
    monkeypatch.delenv("ORDERLY_ENVIRONMENT", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://test-only")
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda: pytest.fail("database connection must not be opened"),
    )

    exit_code = cli.main(["--input", str(source)])

    output = capsys.readouterr()
    assert exit_code == 2
    assert output.out == ""
    assert "ORDERLY_ENVIRONMENT" in output.err


def test_cli_fails_when_postgres_url_is_not_explicit(tmp_path, monkeypatch, capsys):
    from scripts import provision_live_restaurant as cli

    source = tmp_path / "restaurant.json"
    source.write_text(json.dumps(valid_input_object()), encoding="utf-8")
    monkeypatch.setenv("ORDERLY_ENVIRONMENT", "test")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda: pytest.fail("database connection must not be opened"),
    )

    exit_code = cli.main(["--input", str(source)])

    output = capsys.readouterr()
    assert exit_code == 2
    assert output.out == ""
    assert "DATABASE_URL" in output.err
