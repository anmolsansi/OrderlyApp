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


def bootstrap_owner(connection: Any, restaurant_id: str, clerk_user_id: str) -> dict[str, str]:
    """Insert an initial owner once; never elevate or reactivate an existing member.

    RS-06 must follow the same restaurant-first lock order. The operator has
    verified the Clerk subject before invocation; no identity provider is called.
    """
    validate_identity(restaurant_id, clerk_user_id)
    with connection.transaction():
        restaurant = connection.execute(
            """SELECT ordering_enabled, synthetic FROM live_restaurants
               WHERE restaurant_id = %s FOR UPDATE""",
            (restaurant_id,),
        ).fetchone()
        if restaurant is None:
            raise BootstrapError("live restaurant not found")
        if restaurant["ordering_enabled"] or restaurant["synthetic"]:
            raise BootstrapError("initial owner requires a disabled non-demo live restaurant")

        # The restaurant lock serializes initial-owner decisions, including when
        # no membership exists yet. A historical inactive owner is not replaced.
        members = connection.execute(
            """SELECT clerk_user_id, role, active FROM live_memberships
               WHERE restaurant_id = %s AND (role = 'owner' OR clerk_user_id = %s)
               ORDER BY clerk_user_id FOR UPDATE""",
            (restaurant_id, clerk_user_id),
        ).fetchall()
        if members:
            if (len(members) == 1 and members[0]["clerk_user_id"] == clerk_user_id
                    and members[0]["role"] == "owner" and members[0]["active"]):
                return {"restaurant_id": restaurant_id, "clerk_user_id": clerk_user_id}
            raise BootstrapError("conflicting existing membership or owner")

        connection.execute(
            """INSERT INTO live_memberships (restaurant_id, clerk_user_id, role)
               VALUES (%s, %s, 'owner')""",
            (restaurant_id, clerk_user_id),
        )
        connection.execute(
            """INSERT INTO live_membership_audit
               (id, restaurant_id, subject, actor, old_role, new_role, old_active, new_active)
               VALUES (%s, %s, %s, 'operator:bootstrap', NULL, 'owner', NULL, true)""",
            (uuid4(), restaurant_id, clerk_user_id),
        )

    return {"restaurant_id": restaurant_id, "clerk_user_id": clerk_user_id}


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        validate_identity(args.restaurant_id, args.clerk_user_id)
        require_target()
        with get_connection() as connection:
            result = bootstrap_owner(connection, args.restaurant_id, args.clerk_user_id)
    except BootstrapError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except psycopg.OperationalError:
        print("error: PostgreSQL is unavailable", file=sys.stderr)
        return 2
    except psycopg.Error:
        print("error: PostgreSQL owner bootstrap failed", file=sys.stderr)
        return 2
    except Exception:
        print("error: owner bootstrap failed", file=sys.stderr)
        return 2

    # get_connection commits on successful exit; no success on a failed commit.
    print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
