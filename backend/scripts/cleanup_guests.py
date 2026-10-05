from __future__ import annotations

import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.identity import MAX_CLEANUP_BATCH_SIZE, cleanup_expired_guests

DEFAULT_MAX_BATCHES = 1000


def max_batches() -> int:
    raw = os.getenv("ORDERLY_CLEANUP_MAX_BATCHES", str(DEFAULT_MAX_BATCHES)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("ORDERLY_CLEANUP_MAX_BATCHES must be a positive integer") from exc
    if value < 1:
        raise RuntimeError("ORDERLY_CLEANUP_MAX_BATCHES must be a positive integer")
    return value


def main() -> None:
    total_deleted = 0
    limit = max_batches()

    for _batch_number in range(1, limit + 1):
        deleted = cleanup_expired_guests(batch_size=MAX_CLEANUP_BATCH_SIZE)
        total_deleted += deleted
        if deleted < MAX_CLEANUP_BATCH_SIZE:
            print(f"Guest cleanup complete; deleted={total_deleted}")
            return

    raise RuntimeError(
        "Guest cleanup reached ORDERLY_CLEANUP_MAX_BATCHES before draining all unlocked candidates"
    )


if __name__ == "__main__":
    main()
