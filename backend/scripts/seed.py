from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ALLOWED_SEED_ENVIRONMENTS = {"development", "test", "preview"}


def require_fixture_seed() -> None:
    environment = os.getenv("ORDERLY_ENVIRONMENT", "").strip().lower()
    if (
        os.getenv("ORDERLY_ALLOW_FIXTURE_SEED") != "1"
        or environment not in ALLOWED_SEED_ENVIRONMENTS
    ):
        raise RuntimeError(
            "Fixture seeding requires ORDERLY_ALLOW_FIXTURE_SEED=1 and "
            "ORDERLY_ENVIRONMENT=development|test|preview"
        )


def main() -> None:
    require_fixture_seed()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    restaurants_file = DATA_DIR / "restaurants.json"
    carts_file = DATA_DIR / "carts.json"
    orders_file = DATA_DIR / "orders.json"

    if not restaurants_file.exists():
        restaurants_file.write_text(json.dumps([], indent=2))
    if not carts_file.exists():
        carts_file.write_text(json.dumps({}, indent=2))
    if not orders_file.exists():
        orders_file.write_text(json.dumps([], indent=2))

    print(f"Seed files ready in {DATA_DIR}")


if __name__ == "__main__":
    main()
