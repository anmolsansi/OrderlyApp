"""Operator-only initial owner bootstrap; verify Clerk subject and target DB out of band."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any, Optional, Sequence
from uuid import uuid4

import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import get_connection


class BootstrapError(RuntimeError):
    """Safe operator-facing error; never includes raw database or input details."""


def validate_identity(restaurant_id: str, clerk_user_id: str) -> None:
    if not isinstance(restaurant_id, str) or not 1 <= len(restaurant_id) <= 100:
        raise BootstrapError("restaurant_id must contain 1 to 100 characters")
    for value, field in ((restaurant_id, "restaurant_id"), (clerk_user_id, "clerk_user_id")):
        if (not isinstance(value, str) or not value.strip()
                or any(not char.isprintable() for char in value)):
            raise BootstrapError(f"{field} must be a nonblank printable identifier")


def require_target() -> None:
    if not os.getenv("ORDERLY_ENVIRONMENT", "").strip():
        raise BootstrapError("ORDERLY_ENVIRONMENT must be set explicitly")
    if not os.getenv("DATABASE_URL", "").strip() or os.getenv("ORDERLY_FORCE_JSON_STORE") == "1":
        raise BootstrapError("PostgreSQL DATABASE_URL must be configured and JSON store mode disabled")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Bootstrap the initial owner of a disabled live restaurant. "
                    "Operator must verify the exact Clerk subject and target database.",
        allow_abbrev=False,
    )
    parser.add_argument("--restaurant-id", required=True)
    parser.add_argument("--clerk-user-id", required=True)
    return parser
