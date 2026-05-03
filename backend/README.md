# OrderlyApp Backend

FastAPI backend for the OrderlyApp MVP.

## Run locally

```bash
cd backend
uv pip install -e .
uvicorn app.main:app --reload --port 8000
```

If not using `uv`, create a virtualenv and install from `pyproject.toml` with your preferred tool.

## Endpoints

- `GET /health`
- `GET /restaurants`
- `GET /restaurants/{restaurant_id}`
- `GET /sessions/{session_id}/cart`
- `PUT /sessions/{session_id}/cart`
- `DELETE /sessions/{session_id}/cart`
- `POST /orders`
- `GET /orders`
- `GET /orders/{order_id}`

## Persistence

v0.2.0 behavior:
- Uses PostgreSQL when `DATABASE_URL` is configured and `psycopg` is installed.
- Falls back to JSON files under `backend/data/` when Postgres is unavailable.
- Set `ORDERLY_FORCE_JSON_STORE=1` to force JSON fallback locally.

## Migrations and seed

Run the SQL migration against Postgres:

```bash
psql "$DATABASE_URL" -f migrations/001_initial.sql
```

Seed restaurants/menu into the active store:

```bash
python scripts/seed_postgres.py
```
