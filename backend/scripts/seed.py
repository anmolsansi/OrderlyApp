from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"


def main() -> None:
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
