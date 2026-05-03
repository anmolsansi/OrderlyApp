from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator, Optional


def database_url() -> Optional[str]:
    url = os.getenv("DATABASE_URL")
    if not url or os.getenv("ORDERLY_FORCE_JSON_STORE") == "1":
        return None
    return url


def postgres_available() -> bool:
    if not database_url():
        return False
    try:
        import psycopg  # noqa: F401
    except Exception:
        return False
    return True


@contextmanager
def get_connection() -> Iterator[Any]:
    url = database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured")

    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(url, row_factory=dict_row) as conn:
        yield conn
