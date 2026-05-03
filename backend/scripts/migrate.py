from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import get_connection
MIGRATIONS_DIR = ROOT / "migrations"


def main() -> None:
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migrations:
        print("No migrations found")
        return

    with get_connection() as conn:
        with conn.transaction():
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  version TEXT PRIMARY KEY,
                  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            applied_rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
            applied = {row["version"] for row in applied_rows}

            for migration in migrations:
                version = migration.name
                if version in applied:
                    continue
                sql = migration.read_text()
                conn.execute(sql)
                conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
                print(f"Applied migration {version}")

    print("Migrations complete")


if __name__ == "__main__":
    main()
