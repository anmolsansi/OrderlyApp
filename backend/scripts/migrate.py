from __future__ import annotations

import hashlib
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import get_connection

MIGRATIONS_DIR = ROOT / "migrations"
MIGRATION_NAME = re.compile(r"^(?P<number>\d{3})_[a-z0-9_]+\.sql$")


def migration_checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validated_migrations() -> list[Path]:
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    seen_numbers: set[int] = set()

    for expected_number, migration in enumerate(migrations, start=1):
        match = MIGRATION_NAME.fullmatch(migration.name)
        if match is None:
            raise RuntimeError(f"Invalid migration filename: {migration.name}")
        number = int(match.group("number"))
        if number in seen_numbers:
            raise RuntimeError(f"Duplicate migration number: {number:03d}")
        seen_numbers.add(number)
        if number != expected_number:
            raise RuntimeError(
                f"Migration numbering must be contiguous from 001; expected {expected_number:03d}, found {number:03d}"
            )

    return migrations


def main() -> None:
    migrations = validated_migrations()
    if not migrations:
        print("No migrations found")
        return

    with get_connection() as conn:
        with conn.transaction():
            # One deploy writer owns the ledger and schema changes at a time.
            conn.execute("SELECT pg_advisory_xact_lock(hashtext('orderlyapp:migrations'))")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  version TEXT PRIMARY KEY,
                  checksum_sha256 TEXT NULL,
                  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            conn.execute(
                "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT NULL"
            )
            applied_rows = conn.execute(
                "SELECT version, checksum_sha256 FROM schema_migrations"
            ).fetchall()
            applied = {row["version"]: row["checksum_sha256"] for row in applied_rows}

            for migration in migrations:
                checksum = migration_checksum(migration)
                stored_checksum = applied.get(migration.name)
                if migration.name in applied:
                    if stored_checksum is None:
                        conn.execute(
                            "UPDATE schema_migrations SET checksum_sha256 = %s WHERE version = %s",
                            (checksum, migration.name),
                        )
                        continue
                    if stored_checksum != checksum:
                        raise RuntimeError(
                            f"Applied migration checksum drift detected: {migration.name}"
                        )
                    continue

                conn.execute(migration.read_text(encoding="utf-8"))
                conn.execute(
                    "INSERT INTO schema_migrations (version, checksum_sha256) VALUES (%s, %s)",
                    (migration.name, checksum),
                )
                print(f"Applied migration {migration.name}")

    print("Migrations complete")


if __name__ == "__main__":
    main()
