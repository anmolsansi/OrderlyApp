from __future__ import annotations

import os
from typing import Optional

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
            print(f"Warning: Redis unavailable, falling back to non-Redis cart store: {exc}")
            _warned_redis_failure = True
        return None


def cart_key(session_id: str) -> str:
    return f"cart:{session_id}"
