# OrderlyApp — Deployment Guide

## Targets

Recommended production-ish portfolio stack:

- Frontend: Vercel
- Backend: Render or Railway
- Postgres: Render/Railway managed Postgres
- Redis: Upstash or Railway Redis

## Local Docker verification

From a clean checkout:

```bash
cp .env.example .env
npm install
npm run test
npm run build
npm run lint
python3 -m py_compile backend/app/*.py backend/scripts/*.py
docker compose config
docker compose --env-file .env.example config
docker compose up --build
```

Then verify:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/restaurants
open http://localhost:3100
```

Expected:

- API health returns `{"ok":true,"service":"orderlyapp-api",...}`
- `/restaurants` returns seeded pizza restaurants
- frontend loads and shows `Connected to FastAPI`
- adding an item updates the cart
- placing mock checkout creates a mock order and clears cart

## Vercel frontend

Set these environment variables in Vercel:

| Variable | Example | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://orderlyapp.vercel.app` | Public frontend URL |
| `NEXT_PUBLIC_API_BASE_URL` | `https://orderlyapp-api.onrender.com` | Public backend URL, no trailing slash preferred |
| `NEXT_PUBLIC_VOICE_MODE` | `browser` | Browser speech capture where supported |

Build settings:

- Framework preset: Next.js
- Install command: `npm ci`
- Build command: `npm run build`
- Output: Vercel default for Next.js

## Backend service

Deploy `backend/Dockerfile` or a Python service from the repo root.

Required backend environment variables:

| Variable | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Managed Postgres connection string |
| `REDIS_URL` | `redis://default:pass@host:6379` | Managed Redis/Upstash connection string |
| `ORDERLY_CORS_ORIGINS` | `https://orderlyapp.vercel.app` | Comma-separated allowed frontend origins |

Start command if not using Dockerfile:

```bash
cd backend
pip install -e .
python scripts/migrate.py
python scripts/seed_postgres.py
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## Postgres provisioning

1. Create a managed Postgres database.
2. Set `DATABASE_URL` on the backend service.
3. Run `python backend/scripts/migrate.py` with backend env vars configured. This records applied files in `schema_migrations` and is safe to rerun.
4. Run `python backend/scripts/seed_postgres.py` with backend env vars configured.
5. Verify `GET /restaurants` returns non-empty data.

Docker Compose runs migrations and seed automatically on API startup. Postgres also runs `backend/migrations/001_initial.sql` through `/docker-entrypoint-initdb.d` on first volume creation.

## Redis provisioning

1. Create a managed Redis instance.
2. Copy the Redis URL into `REDIS_URL`.
3. Verify cart APIs work:

```bash
curl http://localhost:8000/sessions/demo/cart
```

Cart keys use `cart:{session_id}` and expire after 24 hours. If Redis is unavailable but Postgres is configured, carts fall back to the `carts` table and Redis failure is logged once.

## Healthcheck checklist

After deployment:

- [ ] `GET /health` returns `ok: true` and dependency statuses for Postgres/Redis
- [ ] `GET /restaurants` returns seeded restaurants
- [ ] frontend loads over HTTPS
- [ ] frontend data source says FastAPI/API, not fallback
- [ ] typed voice command can add a pizza to cart
- [ ] mock checkout creates an order ID
- [ ] cart clears after checkout
- [ ] backend logs show no repeated DB/Redis connection errors
- [ ] CORS allows the frontend domain only

## Troubleshooting

- Empty restaurant list: run migration + seed script; confirm `DATABASE_URL` points to the intended DB.
- Frontend says fallback: confirm `NEXT_PUBLIC_API_BASE_URL` is the deployed backend URL and CORS allows the frontend origin.
- Cart does not persist: confirm `REDIS_URL` is set and backend logs do not show Redis connection errors.
- Vercel still calls old API URL: rebuild the frontend after changing `NEXT_PUBLIC_API_BASE_URL`.
