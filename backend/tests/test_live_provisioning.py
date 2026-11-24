from __future__ import annotations

from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from scripts.provision_live_restaurant import (
    ProvisioningInputError,
    build_parser,
    main,
    read_input_text,
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
