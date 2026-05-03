# OrderlyApp — Architecture

## v0.2.0 target shape

```text
Browser / Next.js
  ├─ fetches restaurants/menu from FastAPI
  ├─ keeps local fallback fixtures for demo resilience
  ├─ stores anonymous session id locally
  └─ will sync cart/checkout to API in Phase 4

FastAPI
  ├─ /health
  ├─ /restaurants
  ├─ /restaurants/{id}
  ├─ /sessions/{session_id}/cart
  └─ /orders

Persistence
  ├─ PostgreSQL: restaurants, menu_items, orders
  ├─ JSON fallback: local/dev emergency mode
  └─ Redis: planned cart/session store in Phase 3
```

## Current v0.2.0 state
- Frontend can load restaurant/menu data from the backend API.
- Frontend falls back to local fixtures if the API is unavailable.
- Frontend syncs cart changes and checkout to backend APIs when available.
- Backend uses PostgreSQL when `DATABASE_URL` and `psycopg` are available.
- Backend uses Redis for cart sessions when `REDIS_URL` and `redis` are available.
- Backend falls back to JSON persistence when Postgres/Redis are unavailable or `ORDERLY_FORCE_JSON_STORE=1`.
