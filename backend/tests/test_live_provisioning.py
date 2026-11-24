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
