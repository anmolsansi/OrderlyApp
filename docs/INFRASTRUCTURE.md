# OrderlyApp — Database + Infrastructure

## Current stack

- Frontend: Next.js
- Backend: FastAPI
- Database: PostgreSQL primary persistence, JSON fallback for local emergency mode
- Session/cache: Redis cart sessions, JSON fallback for local emergency mode
- Local orchestration: Docker Compose

## Local services

```bash
cp .env.example .env
docker compose up --build
```

Services:

- Web: `http://localhost:3100`
- API: `http://localhost:8000`
- API health: `http://localhost:8000/health`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

Compose behavior:

- Postgres runs `backend/migrations/001_initial.sql` on first volume creation.
- API waits for Postgres and Redis healthchecks.
- API runs `python scripts/migrate.py` and `python scripts/seed_postgres.py` before starting Uvicorn.
- Compose intentionally uses `ORDERLY_COMPOSE_DATABASE_URL` / `ORDERLY_COMPOSE_REDIS_URL` defaults that point to internal service hosts (`postgres`, `redis`) so copied localhost values from `.env.example` do not break containers.
- Web waits for API healthcheck.

## Database schema

Initial migration:

`backend/migrations/001_initial.sql`

Tables:

- `restaurants`
- `menu_items`
- `carts`
- `orders`

## Redis usage

Redis is the primary active cart session store:

- key: `cart:{session_id}`
- value: serialized cart JSON
- expiration: 24 hours
- fallback: PostgreSQL `carts` table when Redis is unavailable and Postgres is configured
- final fallback: JSON file store when neither Redis nor Postgres is available, or `ORDERLY_FORCE_JSON_STORE=1`
- Redis failures are logged once so production degradation is visible.

## Deployment targets

Recommended:

- Frontend: Vercel
- Backend: Railway or Render
- Postgres: Railway/Render managed Postgres
- Redis: Upstash or Railway Redis

See `docs/DEPLOYMENT.md` for exact environment variables, provisioning steps, and healthcheck checklist.

## Required environment variables

See `.env.example`.

Important values:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_VOICE_MODE`
- `DATABASE_URL`
- `REDIS_URL`
- `ORDERLY_CORS_ORIGINS`
- `ORDERLY_COMPOSE_DATABASE_URL` / `ORDERLY_COMPOSE_REDIS_URL` only if overriding Compose-internal service URLs
