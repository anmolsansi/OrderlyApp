# OrderlyApp — Database + Infrastructure

## Current Stabilized Stack

- **Frontend:** Next.js App Router.
- **Gateway:** bounded same-origin `/api/orderly` proxy to a fixed FastAPI origin.
- **Backend:** FastAPI.
- **Durable correctness authority:** PostgreSQL.
- **Ephemeral abuse-control dependency:** Redis checkout attempt counters.
- **Local orchestration:** Docker Compose with separate migrate/optional-seed/application services.

There is no accepted API-mode fallback from PostgreSQL to JSON, Redis, fixtures, or browser-local data. Required dependency failure is explicit failure/not-ready behavior.

## PostgreSQL Responsibilities

The stabilized schema has evolved beyond the original four-table scaffold. PostgreSQL owns:

- canonical restaurants/menu and availability/modifier configuration;
- private guest-session ownership/token hashes;
- revisioned guest carts;
- immutable receipt/order snapshots;
- checkout idempotency ledger;
- migration version/checksum state.

Migrations live under `backend/migrations/` and are applied by:

```bash
python backend/scripts/migrate.py
```

The runner validates migration naming/order, serializes migration execution with PostgreSQL, records SHA-256 checksums, supports safe reruns, and rejects drift.

Do not rely on PostgreSQL container initialization to apply application migrations.

## Redis Responsibilities

Redis does **not** own carts or orders in the stabilized API contract. It stores only short-lived checkout-abuse counters:

- per verified guest;
- aggregate/global window.

Default bounds are documented in `.env.example`. Exceeding a bound returns 429 with `Retry-After`. If required Redis-backed enforcement is unavailable, new checkout fails closed with 503 rather than bypassing the limiter.

## Guest Retention

Anonymous guest retention is an explicit scheduled operation:

```bash
python backend/scripts/cleanup_guests.py
```

Cleanup:

- drains bounded batches of at most 100 rows;
- uses `FOR UPDATE SKIP LOCKED` candidate locking;
- is idempotent;
- preserves active guest data;
- cannot delete a guest whose checkout owns the same guest lock while committing.

## Local Compose Lifecycle

Create `.env` from the safe template and supply a private `ORDERLY_SESSION_SECRET`.

```bash
cp .env.example .env
docker compose up -d postgres redis
docker compose run --rm migrate
docker compose --profile seed run --rm seed
docker compose up --build api web
```

Services:

- Web: `http://localhost:3100`
- API: `http://localhost:8000`
- API liveness: `http://localhost:8000/health/live`
- API readiness: `http://localhost:8000/health/ready`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

### Compose behavior

- `migrate` is a one-shot service and must complete before API serving.
- `seed` is opt-in behind the `seed` profile and explicitly enables fixture seeding in development.
- `api` starts only Uvicorn after required dependencies/migrations are ready.
- `web` waits for API health.
- normal startup does not reseed application data.

## Runtime Health

`GET /health/live` proves only that the process can answer.

`GET /health/ready` proves the C8 release-ready dependency boundary:

- identity/session configuration valid;
- checkout rate-limit configuration valid;
- PostgreSQL configured/reachable;
- migration ledger exists;
- all required migrations applied;
- source SHA included for candidate identity.

It returns 503 without exposing connection strings/secrets when required dependencies are not ready.

`GET /health` is legacy compatibility and must not be used as release readiness.

## Backup and Recovery

The release gate includes transaction-consistent PostgreSQL backup/restore rehearsal with an immutable synthetic receipt. Backup/recovery guidance is in `docs/runbooks/stabilization.md` and the CI workflow exercises a receipt restoration proof.

Rollback must preserve already accepted receipt/idempotency rows and must never use destructive reseeding or legacy fallback as an outage shortcut.

## Deployment Targets / Evidence

The repository supports Vercel-style frontend deployment and Render-style backend infrastructure through checked-in config/docs. A checked-in blueprint is not proof that the public resources are current.

PR #50 is merged at `c0931252fe652d8f14254db6687c228f4db8c5c5`; both public platforms deploy that SHA, and all seven merged-main CI jobs passed. In the user-confirmed Render workspace, `OrderlyApp` at `https://orderlyapp.onrender.com` now returns readiness 200 after API-mode and signing-secret configuration repairs. The public alias opens anonymously; guest creation, basket persistence and quote succeed (200). Mock order submission still returns 503 `rate_limit_unavailable`. A free private limiter is available but its connection URL has not yet been linked. Public receipt/isolation acceptance, isolated hosted recovery and actual cleanup scheduling remain pending. See [current acceptance ledger](releases/stabilization-acceptance.md).

See [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md) before treating any hosted URL as accepted.

## Important Environment Variables

See `.env.example` for exact defaults/placeholders. Core stabilization variables include:

- `NEXT_PUBLIC_ORDERLY_DATA_MODE`
- `NEXT_PUBLIC_APP_URL`
- `ORDERLY_API_ORIGIN`
- `ORDERLY_DATA_MODE`
- `ORDERLY_ENVIRONMENT`
- `ORDERLY_SOURCE_SHA`
- `ORDERLY_SESSION_SECRET`
- `ORDERLY_ALLOWED_ORIGINS`
- `ORDERLY_CORS_ORIGINS`
- `DATABASE_URL`
- `REDIS_URL`
- checkout rate-limit settings
- guest cleanup batch setting
- `ORDERLY_ALLOW_FIXTURE_SEED`

Voice/auth-provider placeholders may still exist for compatibility, but they are not release requirements.
