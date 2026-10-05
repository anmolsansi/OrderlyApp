# OrderlyApp Backend

FastAPI backend for the stabilized OrderlyApp manual mock-ordering demo.

The release path is **API mode**: the server owns guest identity, canonical catalog validation/pricing, revisioned carts, immutable receipts, and idempotent checkout. PostgreSQL is the durable correctness authority. Redis is used only for short-lived checkout abuse counters.

## Install

From the repository root:

```bash
python -m pip install -e ./backend
python -m pip install -r backend/requirements-test.lock
```

## Required API-mode configuration

At minimum, configure:

- `DATABASE_URL` — PostgreSQL connection string.
- `REDIS_URL` — Redis connection used for checkout abuse-limit counters.
- `ORDERLY_DATA_MODE=api`.
- `ORDERLY_SESSION_SECRET` — private value with at least 32 bytes.
- `ORDERLY_ALLOWED_ORIGINS` — exact browser origins permitted for unsafe guest/session mutations.
- `ORDERLY_CORS_ORIGINS` — allowed frontend origins when CORS is applicable.
- `ORDERLY_ENVIRONMENT` — `development`, `test`, `preview`, or `production` as appropriate.
- `ORDERLY_SOURCE_SHA` — exact source identity when the platform does not provide it automatically.

Never commit real secrets or database/Redis credentials.

## Lifecycle: migrate, optional seed, then serve

Serving startup is application-only. It must not silently migrate or reseed data.

### 1. Apply migrations

```bash
python backend/scripts/migrate.py
```

The migration runner validates ordered migration versions, serializes execution with PostgreSQL, records checksums in `schema_migrations`, supports safe reruns, and fails closed on drift.

### 2. Seed fixtures only when explicitly intended

Fixture seeding is disabled by default and is not a production-serving step.

```bash
ORDERLY_ENVIRONMENT=development ORDERLY_ALLOW_FIXTURE_SEED=1 \
  python backend/scripts/seed_postgres.py
```

Use the equivalent `test` or approved `preview` environment only when fixture data is intentionally required. Do not enable fixture seeding in production serving configuration.

### 3. Start the API

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

## Health endpoints

- `GET /health/live` — process liveness only. A live response does **not** mean storage is ready.
- `GET /health/ready` — release readiness. It checks required identity/rate-limit configuration, PostgreSQL connectivity, and required migration state. It returns `503` when those dependencies are not ready.
- `GET /health` — legacy compatibility endpoint. Do not use it as C8 release-readiness proof.

`/health/ready` includes the configured source SHA and safe dependency states without exposing connection strings, cookies, or secrets.

## Current API contracts

### Guest identity

- `POST /v1/session` — bootstrap or continue the private guest session.
- `POST /v1/session/reset` — explicitly revoke/replace the guest ownership scope.

The browser receives an opaque signed HttpOnly cookie. The public API never accepts a caller-chosen owner/session ID as authority.

### Canonical catalog

- `GET /v1/restaurants`
- `GET /v1/restaurants/{restaurant_id}`

Legacy unversioned restaurant GET aliases remain for compatibility, but the stabilized browser adapter consumes the versioned contract through the same-origin gateway.

### Revisioned cart

- `GET /v1/cart`
- `PUT /v1/cart`
- `DELETE /v1/cart`

Cart mutations require the current `expected_revision`. Accepted mutations increment the revision once. Stale writes return `409 cart_conflict` with the current cart so the UI can explicitly review/reapply.

### Quote and checkout

- `POST /v1/checkout/quote` — deterministic `mock-v1` quote for the current canonical cart.
- `POST /v1/orders` — atomic idempotent mock checkout; requires `Idempotency-Key`.

The first accepted checkout returns `201`; an identical replay returns `200` with the exact stored receipt. Reusing a key with a different canonical body returns `409 idempotency_conflict`.

### Guest-scoped receipts

- `GET /v1/orders`
- `GET /v1/orders/{order_id}`

Receipt reads are owner-scoped and come from immutable PostgreSQL snapshots. Missing and foreign IDs use the same public not-found behavior.

## Persistence and failure behavior

### PostgreSQL

PostgreSQL is the API-mode authority for:

- guest session ownership;
- canonical catalog data;
- revisioned guest carts;
- immutable order/receipt snapshots;
- idempotency records;
- migration state.

A required PostgreSQL failure produces typed unavailable/not-ready behavior. The stabilized API must not claim success by switching to JSON, Redis, fixtures, or browser-local state.

### Redis

Redis holds only ephemeral checkout-attempt counters used by the C8 abuse boundary. It is **not** durable cart, order, receipt, or ownership authority. If required rate-limit enforcement is unavailable, new checkout fails safely rather than bypassing the limiter.

### Legacy JSON paths

Legacy/local JSON helpers remain in the repository for historical/local compatibility, but they are not an accepted fallback for the stabilized API-mode ordering contracts.

## Retention cleanup

Anonymous guest retention is an explicit operational job, not a request-side or startup side effect:

```bash
python backend/scripts/cleanup_guests.py
```

Cleanup processes bounded batches, uses row locking so it cannot race a committing checkout owner, and preserves active guest data. See the stabilization runbook for scheduling, backup, recovery, and rollback guidance.

## Tests

The pinned backend test environment is defined by `backend/requirements-test.lock`. The hosted Stabilization CI supplies isolated PostgreSQL and Redis services, applies migrations, runs the backend suite, rehearses transaction-consistent backup/restore, and then runs browser/API release gates on the same candidate SHA.

Useful local command after configuring the documented test services:

```bash
python -m pytest backend/tests -q
```

Do not present a passing legacy health request or an in-memory/local fallback as proof that the stabilized API contracts are ready.