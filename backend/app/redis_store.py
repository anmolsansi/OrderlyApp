from __future__ import annotations

import os
from typing import Iterable, Optional

_warned_redis_failure = False


def redis_url() -> Optional[str]:
    url = os.getenv("REDIS_URL")
    if not url or os.getenv("ORDERLY_FORCE_JSON_STORE") == "1":
        return None
    return url


def redis_client():
    global _warned_redis_failure

    url = redis_url()
    if not url:
        return None
    try:
        import redis

        client = redis.Redis.from_url(url, decode_responses=True)
        client.ping()
        return client
    except Exception as exc:
        if not _warned_redis_failure:
            print(f"Warning: Redis unavailable; falling back to non-Redis cart store ({exc.__class__.__name__})")
            _warned_redis_failure = True
        return None


def cart_key(session_id: str) -> str:
    return f"cart:{session_id}"


def delete_cart_keys(session_ids: Iterable[str]) -> None:
    keys = [cart_key(session_id) for session_id in session_ids]
    if not keys:
        return

    client = redis_client()
    if client is None:
        return

    try:
        client.delete(*keys)
    except Exception as exc:
        global _warned_redis_failure
        if not _warned_redis_failure:
            print(f"Warning: Redis cart cleanup unavailable ({exc.__class__.__name__})")
            _warned_redis_failure = True
