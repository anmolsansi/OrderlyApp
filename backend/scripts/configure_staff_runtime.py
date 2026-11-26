"""Operator-only grants for an already-created, dedicated login role.

Use migration-owner DATABASE_URL. Never run in the API process. Additional
mock/runtime permissions are provisioned separately by the deployment operator.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

from psycopg import sql

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import get_connection


def grant_staff_runtime(conn, role: str):
    identity = sql.Identifier(role)
    with conn.transaction():
        row = conn.execute("""
            SELECT rolcanlogin AND NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
              AND NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) AS safe
            FROM pg_roles r WHERE rolname = %s AND rolname <> current_user
            """, (role,)).fetchone()
        if not row or not row["safe"]:
            raise ValueError("dedicated unprivileged login required")
        for template in (
            "GRANT USAGE ON SCHEMA public TO {}",
            "GRANT SELECT, UPDATE ON public.live_restaurants TO {}",
            "GRANT SELECT, INSERT, UPDATE ON public.live_memberships TO {}",
            "REVOKE ALL ON public.live_membership_audit FROM {}",
            "GRANT INSERT ON public.live_membership_audit TO {}",
        ):
            conn.execute(sql.SQL(template).format(identity))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", required=True)
    args = parser.parse_args()
    if not os.getenv("ORDERLY_ENVIRONMENT", "").strip() or not os.getenv("DATABASE_URL", "").strip():
        parser.error("explicit operator environment and database required")
    try:
        with get_connection() as conn:
            grant_staff_runtime(conn, args.role)
    except Exception:
        print("error: staff runtime role configuration failed", file=sys.stderr)
        return 2
    print("Staff runtime grants configured; verify by connecting as the runtime login.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
