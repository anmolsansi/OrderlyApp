# OrderlyApp — Deployment Guide

This guide describes the **stabilized API-mode deployment contract**. Deployment success alone is not release acceptance: the exact frontend/backend identity, public unauthenticated access, durable receipt behavior, and required recovery evidence must also pass. Current acceptance status is recorded in [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md).

## 1. Release Boundary

The accepted public shape is:

- Next.js frontend in `api` mode.
- Browser protected calls through the same-origin `/api/orderly` gateway.
- FastAPI backend with `ORDERLY_DATA_MODE=api`.
- PostgreSQL as durable guest/catalog/cart/receipt/idempotency authority.
- Redis only for ephemeral checkout abuse counters.
- Explicit migrations before serving the candidate.
- Fixture seed only as an explicit approved non-production operation.
- `/health/ready` as the backend readiness gate.

Do **not** deploy `local_demo` as if it were the accepted public ordering backend. It is a fixture preview with checkout disabled.

## 2. Lifecycle Order

The operational sequence is deliberate:

1. Provision/configure PostgreSQL and Redis.
2. Install/build the exact source candidate.
3. Run `python backend/scripts/migrate.py` as a separate serialized lifecycle step.
4. Seed fixtures only when the target is an approved development/test/preview environment and fixture data is intentionally required.
5. Start the FastAPI application without migration/seed side effects.
6. Wait for `/health/ready` to return 200 for the exact source SHA.
7. Start/point the frontend at that fixed backend origin.
8. Run candidate/public acceptance checks.
9. Only after all mandatory evidence passes, call the release accepted.

Normal serving startup must never reseed or silently migrate.

## 3. Frontend / Vercel

### Build

```bash
npm ci --ignore-scripts
npm run build
```

### Required/important configuration

- `NEXT_PUBLIC_APP_URL` — public frontend origin.
- `NEXT_PUBLIC_ORDERLY_DATA_MODE=api` — accepted public ordering mode.
- `ORDERLY_API_ORIGIN` — server-only fixed FastAPI origin used by `/api/orderly`.
- `NEXT_PUBLIC_CHECKOUT_MODE=mock` — no real payment processing.
- `NEXT_PUBLIC_AUTH_PROVIDER=none` — the release uses password-free demo presentation, not a real account provider.

`NEXT_PUBLIC_API_BASE_URL` is retained for compatibility/documentation, but protected browser traffic uses the same-origin gateway. Voice-related environment placeholders may still exist in repository configuration; voice is deferred from stabilization acceptance and must not be presented as a required public feature.

### Deployment protection

Release acceptance requires a fresh visitor to reach the identified public candidate **without developer sign-in or an authenticated/share bypass**. If Vercel Authentication protects all candidate aliases, that deployment can be used for owner diagnostics but cannot satisfy ST-13 public-access acceptance.

Changing protection/aliases or promoting another deployment is a release operation and requires explicit authorization; documentation work must not silently change it.

## 4. FastAPI Backend

### Install

```bash
python -m pip install -e ./backend
```

### Production configuration

- `DATABASE_URL`
- `REDIS_URL`
- `ORDERLY_DATA_MODE=api`
- `ORDERLY_ENVIRONMENT=production`
- `ORDERLY_SESSION_SECRET` — private value with at least 32 bytes
- `ORDERLY_ALLOWED_ORIGINS` — exact deployed frontend origin(s)
- `ORDERLY_CORS_ORIGINS` — exact required frontend origin(s)
- `ORDERLY_SOURCE_SHA` when the platform does not supply source identity automatically
- checkout-rate settings as documented in `.env.example`

Never expose these server-only values with `NEXT_PUBLIC_` and never log secrets/full connection URLs.

### Migration

Run before serving the new candidate:

```bash
python backend/scripts/migrate.py
```

The migration runner validates ordered versions, records checksums, serializes application through PostgreSQL, and fails closed on migration drift.

### Fixture seed

Do **not** seed during production serving startup. For an approved non-production fixture environment only:

```bash
ORDERLY_ENVIRONMENT=preview ORDERLY_ALLOW_FIXTURE_SEED=1 \
  python backend/scripts/seed_postgres.py
```

Use `development` or `test` only when they match the target. Production must not rely on this fixture-seed switch.

### Serve

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
```

### Health

- `/health/live` — process liveness only.
- `/health/ready` — required configuration/PostgreSQL/migration/rate-limit-config readiness and source identity.
- `/health` — legacy compatibility only; not release proof.

## 5. Render Blueprint / Platform Notes

`infra/render.yaml` expresses the desired lifecycle:

- backend build installs the package;
- migration is a pre-deploy step when the selected Render plan supports it;
- web start runs only Uvicorn;
- readiness uses `/health/ready`;
- guest retention is a separate scheduled job;
- no serving-time fixture seed.

The checked-in blueprint is intent, not evidence that every resource exists. Some Render lifecycle features/plans may require paid resources. Do not create/upgrade paid infrastructure solely to satisfy this guide without explicit approval.

If the chosen platform cannot execute the required pre-deploy migration on the authorized plan, run migration as an explicit release operation before starting the candidate and retain evidence. Do not move migration/seed back into the long-running web start command as a shortcut.

## 6. PostgreSQL and Redis

### PostgreSQL

Required for API mode. It owns guest sessions, canonical catalog, revisioned carts, immutable receipts, idempotency records, and migration state. A database outage must make readiness/write operations fail safely; it must not activate JSON/fixture success.

### Redis

Used only for short-lived checkout attempt counters. It is not cart/order/receipt authority. If required limiter enforcement is unavailable, new checkout fails closed rather than bypassing the limiter.

## 7. Docker Compose Development/Recovery Environment

Copy the environment template and set a private session secret:

```bash
cp .env.example .env
```

Then run lifecycle steps explicitly:

```bash
docker compose up -d postgres redis
docker compose run --rm migrate
docker compose --profile seed run --rm seed
docker compose up --build api web
```

The normal API service depends on the one-shot migration service; the seed service is opt-in through the `seed` profile. PostgreSQL initialization itself does not own application migration/seed execution.

Local endpoints:

- Web: `http://localhost:3100`
- API: `http://localhost:8000`
- Ready: `http://localhost:8000/health/ready`

## 8. Current Hosted Evidence — October 6, 2026

PR #50 is merged at `c0931252fe652d8f14254db6687c228f4db8c5c5`; both public platforms deploy that SHA, and all seven merged-main CI jobs passed. In the user-confirmed Render workspace, `OrderlyApp` at `https://orderlyapp.onrender.com` returns readiness 200 after API-mode, signing-secret and private limiter configuration repairs. A fresh visitor saves a mock order (201) and reloads the exact complete receipt (200); a second guest has empty history and receives 404 for that receipt. The public alias opens anonymously; the immutable Vercel URL returns 302. ST-13 remains Not completed pending isolated hosted recovery and actual cleanup scheduling. See [current acceptance ledger](releases/stabilization-acceptance.md).

Vercel deployment `dpl_2FbVtUZmEMggR5ztcLxxac2srLJH` and Render deployment `dep-db2b9ucs728c73br6m10` identify the merged SHA. The old `orderlyapp-int01-api` service belongs to a different Render account and is not the current backend. No paid plan or billed cron was activated. Configuration updates merged only the required keys; signing credentials are excluded from evidence.

## 9. Public Acceptance Checklist

Before calling a deployment accepted:

- [ ] exact frontend source/build identity recorded;
- [ ] exact backend source/build identity recorded;
- [ ] ST-12 release CI is green on the candidate source;
- [ ] backend `/health/ready` is 200 and reports the expected source SHA;
- [ ] fresh visitor reaches frontend without developer login/share bypass;
- [ ] canonical restaurant/menu loads from API mode;
- [ ] guest A/B isolation is verified in separate fresh contexts;
- [ ] cart revision/save/reload works through PostgreSQL;
- [ ] quote totals come from server `mock-v1` pricing;
- [ ] mock checkout creates one durable receipt;
- [ ] exact receipt reload shows identical saved values;
- [ ] controlled required failure/recovery/backup checks are current;
- [ ] no mandatory case is blocked, skipped, or replaced by stale evidence.

Results belong in [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md).

## 10. Rollback

If a release candidate fails:

1. stop/avoid new checkout writes when correctness is uncertain;
2. preserve accepted PostgreSQL receipt/idempotency data;
3. restore/redeploy a schema-compatible application candidate;
4. restore from a transaction-consistent backup only when actually required and verified;
5. keep the failed evidence in the acceptance record;
6. never recover by enabling hidden fixture/JSON authority, disabling ownership checks/rate limits, reseeding production on startup, or inventing new idempotency keys for unresolved attempts.
