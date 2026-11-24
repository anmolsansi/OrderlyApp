from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
from typing import Optional, Sequence

MAX_INPUT_BYTES = 64 * 1024


class ProvisioningInputError(ValueError):
    pass


def read_input_text(path: Path) -> str:
    try:
        with path.open("rb") as input_file:
            raw = input_file.read(MAX_INPUT_BYTES + 1)
    except OSError:
        raise ProvisioningInputError("input file cannot be read") from None

    if len(raw) > MAX_INPUT_BYTES:
        raise ProvisioningInputError("input file exceeds the 64 KiB limit")

    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ProvisioningInputError("input file must be UTF-8") from None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Provision a disabled live restaurant from a private JSON file.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Path to the private restaurant provisioning JSON file.",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    parser.parse_args(argv)
    parser.error("restaurant provisioning is not available yet")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
