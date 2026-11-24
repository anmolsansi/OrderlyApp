from __future__ import annotations

from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from scripts.provision_live_restaurant import build_parser, main


def test_cli_requires_an_input_file():
    with pytest.raises(SystemExit) as error:
        main([])

    assert error.value.code == 2


def test_cli_accepts_the_documented_input_path():
    args = build_parser().parse_args(["--input", "/private/restaurant.json"])

    assert args.input == Path("/private/restaurant.json")
