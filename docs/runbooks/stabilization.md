# OrderlyApp stabilization operations runbook

This runbook is the ST-11 / C8 operating procedure for the stabilization release. It covers health, migration, fixture seeding, retention, checkout abuse limits, backup, restore, restart verification, and rollback.

OrderlyApp is still a mock-checkout portfolio application. These procedures protect the current PostgreSQL guest/cart/receipt state, but they do not make the product suitable for real payments or real customer accounts.

## Health contract

Use the endpoints for different purposes.

### `GET /health/live`

Liveness proves only that the API process can serve a request.

Expected shape:

```json
{
  "schema_version": 1,
  "live": true,
  "source_sha": "<build sha or unknown>"
}
```

Do not use liveness as proof that PostgreSQL or migrations are healthy.

### `GET /health/ready`

Readiness is the C8 deployment gate. HTTP 200 requires:

- `ORDERLY_DATA_MODE=api`
- a session secret of at least 32 bytes
- at least one exact allowed browser origin
- valid checkout rate-limit configuration
- a configured and reachable PostgreSQL database
- the `schema_migrations` ledger
- every migration file in `backend/migrations/` recorded in that ledger

A missing or unavailable requirement returns HTTP 503 with the standard request ID and safe field names. Connection strings, passwords, cookies, and secrets are never returned.

`source_sha` uses `ORDERLY_SOURCE_SHA`, then Render's `RENDER_GIT_COMMIT`, then `GITHUB_SHA`, and finally `unknown` for an unlabelled local process.

### Legacy `GET /health`

`/health` remains only for backward compatibility with earlier baseline checks. New deployment and operational automation must use `/health/live` or `/health/ready` explicitly.

## Required production-like configuration

```text
ORDERLY_DATA_MODE=api
ORDERLY_ENVIRONMENT=production
ORDERLY_SESSION_SECRET=<private random value with at least 32 bytes>
ORDERLY_ALLOWED_ORIGINS=https://your-web-origin.example
ORDERLY_CORS_ORIGINS=https://your-web-origin.example
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ORDERLY_CHECKOUT_RATE_WINDOW_SECONDS=60
ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST=10
ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE=120
```

Redis holds only short-lived abuse counters and legacy cache cleanup keys. PostgreSQL remains the source of truth for guest identity, carts, idempotency, orders, and immutable receipts. If Redis cannot enforce checkout limits, the API rejects new checkout requests with HTTP 503 instead of bypassing the guard.

Never set `ORDERLY_ALLOW_FIXTURE_SEED=1` in a production serving process.

## Migration lifecycle

Serving startup must not apply migrations or seed fixtures.

The migration runner:

1. validates contiguous migration filenames beginning at `001`
2. takes one PostgreSQL advisory transaction lock
3. creates or upgrades the migration ledger
4. records SHA-256 for each applied migration
5. backfills a checksum for older ledger rows that predate ST-11
6. refuses to continue if an already-applied migration's checksum changes
7. applies new migrations in one transaction

Run it as a dedicated deployment step:

```bash
cd backend
python scripts/migrate.py
```

A second run must print `Migrations complete` without applying schema changes.

Do not edit an applied migration. Add a new numbered migration instead.

## Docker Compose lifecycle

Normal local startup no longer seeds catalog data during API startup.

For an existing database:

```bash
docker compose up --build
```

Compose starts PostgreSQL, runs the one-shot `migrate` service, and starts the API only after migration succeeds. The API container itself runs only Uvicorn.

For a new development database, seed fixtures explicitly:

```bash
ORDERLY_SESSION_SECRET="$(openssl rand -hex 32)" docker compose --profile seed run --rm seed
ORDERLY_SESSION_SECRET="$(openssl rand -hex 32)" docker compose up --build
```

Prefer one stable local `ORDERLY_SESSION_SECRET` instead of generating a different value for each command if you need sessions to survive restarts.

The `seed` profile sets `ORDERLY_ENVIRONMENT=development` and `ORDERLY_ALLOW_FIXTURE_SEED=1`. It is intentionally absent from normal serving startup.

## Render lifecycle and current plan limitation

`infra/render.yaml` describes the intended release lifecycle:

- API build installs the backend
- `preDeployCommand` runs `python scripts/migrate.py`
- serving `startCommand` runs only Uvicorn
- health checks use `/health/ready`
- daily cleanup is handled separately by the GitHub Actions workflow below

Render documents pre-deploy commands for paid web services. Confirmed production `OrderlyApp` (`srv-d7sobtkm0tmc73dcb65g`) uses Docker on the free plan; separate `orderlyapp-st13-staging` (`srv-db2bq5jncjis73e5cah0`) uses native Python on the free plan. **Do not upgrade the service, create a billed cron job, or sync a configuration that incurs charges without explicit approval.**

The isolated staging rehearsal proved migration-only build (`cd backend && pip install -e . && python scripts/migrate.py`) followed by app-only startup and `/health/ready`; it does not establish a paid pre-deploy hook or an actual daily production cron. One-time seed/recovery jobs were removed from the saved build. Docker Compose remains the local one-shot migration path. INT-02/ST-13 owns final public candidate proof.

## Explicit fixture seeding

Both seed scripts fail unless all of the following are true:

- `ORDERLY_ALLOW_FIXTURE_SEED=1`
- `ORDERLY_ENVIRONMENT` is `development`, `test`, or `preview`

PostgreSQL fixture seed:

```bash
cd backend
ORDERLY_ENVIRONMENT=development \
ORDERLY_ALLOW_FIXTURE_SEED=1 \
python scripts/seed_postgres.py
```

Local JSON fixture initialization:

```bash
cd backend
ORDERLY_ENVIRONMENT=development \
ORDERLY_ALLOW_FIXTURE_SEED=1 \
python scripts/seed.py
```

Never put either seed command in a production API start command.

## Guest retention

Anonymous guest sessions expire after 30 days. ST-11 cleanup also removes revoked sessions.

Run:

```bash
cd backend
python scripts/cleanup_guests.py
```

Each database transaction selects at most 100 expired/revoked guests using `FOR UPDATE SKIP LOCKED`. New guest-owned cart/order/idempotency rows cascade from `guest_sessions`. Legacy cart/order rows are explicitly removed because they predate those ownership foreign keys.

Checkout locks the same `guest_sessions` row before C6 durable work. If checkout already owns the row, cleanup skips it and a later batch/run can collect it. If cleanup wins after request authentication, checkout fails before writing an order.

`ORDERLY_CLEANUP_MAX_BATCHES` defaults to 1000. Reaching that cap fails the job instead of reporting a false complete drain.

The job is idempotent. Running it again with no eligible rows produces `deleted=0`.

## Checkout abuse limits

Default C8 checkout bounds are:

```text
window: 60 seconds
per guest: 10 attempts
aggregate: 120 attempts
```

Counters use fixed-window Redis keys and expire automatically. The guest key uses a SHA-256-derived identifier, not the raw guest ID.

When either limit is exceeded:

- response status is HTTP 429
- error code is `checkout_rate_limited`
- `Retry-After` reports the remaining window seconds
- no order write is attempted

If Redis is unavailable, new checkout returns HTTP 503 with `rate_limit_unavailable`. Do not change this to allow-through behavior during an outage.

## Transaction-consistent PostgreSQL backup

Take a backup before risky migration or release work.

```bash
pg_dump \
  --format=custom \
  --no-owner \
  --file=orderlyapp.dump \
  "$DATABASE_URL"
```

`pg_dump` takes a consistent snapshot without requiring application shutdown for the current single-database design. For a high-risk restore event, stop ingress/new writes first so the restored candidate can be verified without concurrent mutations.

Record with the evidence:

- source SHA
- database target name, not credentials
- UTC backup time
- migration ledger rows
- receipt count
- one synthetic receipt ID selected for restore verification

Never commit the dump file.

## Restore rehearsal

Restore into a new empty database first. Do not overwrite the only copy of the source database during rehearsal.

```bash
pg_restore \
  --single-transaction \
  --exit-on-error \
  --no-owner \
  --dbname="$RESTORE_DATABASE_URL" \
  orderlyapp.dump
```

Then point an isolated API process at `RESTORE_DATABASE_URL` with the same non-secret configuration pattern and verify:

```bash
curl --fail http://127.0.0.1:8000/health/ready
```

Verify durable data with SQL or the owner-scoped API. At minimum confirm:

```sql
SELECT version, checksum_sha256 FROM schema_migrations ORDER BY version;
SELECT count(*) FROM guest_orders;
SELECT count(*) FROM order_idempotency;
```

For the synthetic receipt selected before backup, verify its `guest_orders.snapshot` matches the source snapshot byte-for-byte as JSON data. Do not rebuild a receipt from current catalog/profile data.

## Restart and catalog durability rehearsal

The purpose is to prove serving restart does not reseed the catalog.

1. Choose a synthetic non-production restaurant row.
2. Record its current value.
3. Make a reversible edit in the non-production database.
4. Restart only the API serving process/container.
5. Verify `/health/ready` returns 200.
6. Verify the edited catalog value is unchanged.
7. Verify an accepted synthetic receipt remains readable and unchanged.
8. Restore the catalog test value manually if the rehearsal changed it.

A restart that replaces the edited value is an ST-11 failure and blocks release.

## Database outage and recovery rehearsal

1. Confirm `/health/live` and `/health/ready` both return 200.
2. Stop or block PostgreSQL.
3. Confirm `/health/live` still returns 200 while the process is alive.
4. Confirm `/health/ready` returns 503.
5. Attempt a safe synthetic cart/order write and confirm it fails. It must not return success from JSON/Redis fallback authority.
6. Restore PostgreSQL.
7. Confirm `/health/ready` returns 200 without restarting or reseeding the API.
8. Confirm previously accepted receipts still exist.

## Rollback

Rollback is application-first and non-destructive.

1. Stop ingress/new checkout writes if data compatibility is uncertain.
2. Capture a current transaction-consistent backup before destructive recovery work.
3. Deploy the last known application version that is compatible with the current additive schema.
4. Recheck `/health/ready` and synthetic receipt reads.
5. Restore a backup only when the current database itself must be replaced.
6. If restoring, restore into a new database first, verify it, then switch the application connection deliberately.

Do not automatically run destructive down-migrations. Do not restore startup fixture seeding as a rollback shortcut. Do not bypass checkout limits because Redis is unavailable.

## ST-11 evidence checklist

Before declaring ST-11 complete, record one exact source SHA proving:

- backend tests pass with real PostgreSQL
- C0-C8 contract fixtures pass in Python and TypeScript
- `/health/live` is dependency-independent
- `/health/ready` is 200 with required schema and 503 when PostgreSQL is unavailable
- migration rerun is idempotent and checksum drift fails closed
- serving startup contains no migration or seed command
- fixture seed rejects production/default invocation
- cleanup purges expired/revoked guests, preserves active guests, and skips a checkout-locked guest
- checkout returns 429 with `Retry-After` at the configured bound
- checkout fails closed when Redis cannot enforce the bound
- restart preserves catalog edits and accepted receipts
- backup/restore rehearsal recovers the selected synthetic receipt

ST-12 may expand CI/dependency gates. ST-13 decides release readiness. ST-11 does not claim those later gates on its own.

Readiness uses a read-only transaction and a two-second PostgreSQL statement timeout as well as the two-second connection timeout. A locked migration ledger returns 503 instead of hanging the probe; liveness remains process-only.

### Daily cleanup with GitHub Actions

The selected scheduler is [.github/workflows/guest-cleanup.yml](../../.github/workflows/guest-cleanup.yml), **Daily guest cleanup**, at **03:17 UTC daily** with a manual `workflow_dispatch` trigger. It reuses `backend/scripts/cleanup_guests.py`; it never runs migrations or seeds. It is restricted to `anmolsansi/OrderlyApp` on `main`, uses a read-only GitHub token, permits only one active cleanup run and has a ten-minute job limit. PostgreSQL connection/statement/lock timeouts bound individual operations. Missing database secret or cleanup failure fails the job; database diagnostics are suppressed from public logs. The safe deleted count, outcome, trigger and exact source SHA remain visible.

OrderlyApp is public; standard GitHub-hosted runner usage is free ([GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). No Render payment method is required for this path. The unsuccessful Render cron creation returned HTTP 402 and created no service ([dated provisioning evidence](../qa/st11-st13-acceptance/cron-provisioning-2026-10-07.json)). The Render cron proposal was removed from `infra/render.yaml` to avoid a second scheduler. Do not create/enable a duplicate cleanup service.

**Activation steps:**

1. Privately add repository Actions secret **`ORDERLY_CLEANUP_DATABASE_URL`** in [OrderlyApp Settings → Secrets and variables → Actions](https://github.com/anmolsansi/OrderlyApp/settings/secrets/actions). Use the production Neon direct (pooling off) database URL with TLS, not a temporary staging branch. Direct access lets the workflow apply PostgreSQL startup timeouts consistently. Never paste the URL into chat, a workflow input, a YAML file or a log. A dedicated cleanup database role can be substituted when provisioned; this workflow does not create roles or broaden database network access.
2. Review CI and merge the workflow onto `main`. Scheduled runs use the default branch; manual dispatch from a feature branch is deliberately skipped by the main-only guard. A prepared/pushed PR is not an active schedule.
3. In [Actions](https://github.com/anmolsansi/OrderlyApp/actions), select **Daily guest cleanup → Run workflow → main**. Verify success and `Guest cleanup complete; deleted=N`; zero is a valid success when nothing is expired. Record the run URL, SHA, timestamp and deleted count. Do not claim a manual PASS until the actual production database is linked and that run completes.
4. Watch OrderlyApp and configure [GitHub notification settings](https://github.com/settings/notifications): System → Actions → Email or On GitHub, optionally **Only notify for failed workflows**, then Save ([official instructions](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)). Confirm the intended verified email/notification route. Failure notification preference and delivery are separate from a green job; no email/message is sent by this workflow.
5. After the next scheduled invocation, record the actual `schedule` run separately. Check each day that a successful run exists in the preceding 36 hours. If a run failed, inspect the safe job error, check Neon access privately and manually rerun after repair; per-batch transactions and row locks make retries safe. If no run exists, inspect workflow enablement/default branch and use a manual run while resolving the schedule.

GitHub schedules can be delayed or dropped under load, and public-repository schedules are disabled after 60 days without repository activity ([official schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). GitHub failure notifications do not detect an absent run; the freshness check is part of operations, not an automatic external heartbeat. Do not close the daily scheduling gate without a named operator, notification settings evidence and an observed scheduled success.

Render's internal Redis hostname is unreachable from a GitHub-hosted runner. `REDIS_URL` is deliberately unset; authoritative PostgreSQL guest/cart/receipt/idempotency cleanup still works. Legacy Redis cache-key purging is skipped, as the existing best-effort cache cleanup permits; expired sessions cannot regain authorization because their database rows are removed. Render Key Value external access is not opened for this workflow.

**Current status:** Prepared and locally checked; no production database secret, manual run, scheduled run or notification delivery is inferred. ST-13 remains Not completed until remaining hosted and operational evidence passes.
