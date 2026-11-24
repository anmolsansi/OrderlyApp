from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import Optional, Sequence


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
