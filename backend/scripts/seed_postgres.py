from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models import Restaurant
from app.store import write_restaurants
RESTAURANTS_FILE = ROOT / "data" / "restaurants.json"


def main() -> None:
    restaurants = [Restaurant(**item) for item in json.loads(RESTAURANTS_FILE.read_text())]
    write_restaurants(restaurants)
    print(f"Seeded {len(restaurants)} restaurants")


if __name__ == "__main__":
    main()
