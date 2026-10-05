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
def get_connection(*, connect_timeout_seconds: int | None = None) -> Iterator[Any]:
    url = database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured")
    if connect_timeout_seconds is not None and connect_timeout_seconds < 1:
        raise ValueError("connect_timeout_seconds must be at least 1")

    import psycopg
    from psycopg.rows import dict_row

    connection_options: dict[str, Any] = {"row_factory": dict_row}
    if connect_timeout_seconds is not None:
        connection_options["connect_timeout"] = connect_timeout_seconds

    with psycopg.connect(url, **connection_options) as conn:
        yield conn
