from __future__ import annotations

import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models import Restaurant
from app.store import write_restaurants

RESTAURANTS_FILE = ROOT / "data" / "restaurants.json"
ALLOWED_SEED_ENVIRONMENTS = {"development", "test", "preview"}


def require_fixture_seed() -> None:
    environment = os.getenv("ORDERLY_ENVIRONMENT", "").strip().lower()
    if (
        os.getenv("ORDERLY_ALLOW_FIXTURE_SEED") != "1"
        or environment not in ALLOWED_SEED_ENVIRONMENTS
    ):
        raise RuntimeError(
            "PostgreSQL fixture seeding requires ORDERLY_ALLOW_FIXTURE_SEED=1 and "
            "ORDERLY_ENVIRONMENT=development|test|preview"
        )


def main() -> None:
    require_fixture_seed()
    restaurants = [Restaurant(**item) for item in json.loads(RESTAURANTS_FILE.read_text())]
    write_restaurants(restaurants)
    print(f"Seeded {len(restaurants)} restaurants")


if __name__ == "__main__":
    main()
