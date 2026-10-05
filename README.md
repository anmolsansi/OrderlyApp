# OrderlyApp

OrderlyApp is a stabilized **manual food-ordering portfolio demo** built with Next.js and FastAPI. The accepted product path is intentionally mock-only: visitors can browse a canonical pizza catalog, customize items, maintain a private guest basket, review a server-priced quote, place an idempotent mock order, and reopen the immutable receipt. No real payment is collected.

> **Current release status — October 5, 2026:** implementation and release CI are green on `main` at `934208c36d323e39d9f6ddcfcc3805cbd979507f`, but the public release is **not accepted yet**. The exact Vercel build is protected by developer authentication and the available Render backend is not the current candidate. See [development.md](development.md) and [the stabilization acceptance record](docs/releases/stabilization-acceptance.md) for the current gate state. Voice, real accounts, real payments, and real restaurant integrations are outside this stabilization release.

## What the stabilized candidate supports

- Canonical restaurant/menu discovery from the FastAPI API in `api` mode.
- Server-issued private guest ownership through an opaque HttpOnly cookie; the browser does not choose or persist an owner ID.
- Password-free local demo profiles and synthetic demo addresses. They are presentation data only and never grant server ownership.
- PostgreSQL-only API authority for guest carts, canonical catalog reads, immutable receipt snapshots, and idempotent checkout records.
- Revisioned cart writes with explicit conflict handling instead of optimistic local authority.
- Deterministic `mock-v1` quote pricing and immutable receipt totals/labels.
- Atomic checkout with an idempotency key so a lost response can be retried without creating a second order.
- Guest-scoped order history and exact receipt lookup.
- `local_demo` as a separately selected, visibly labelled fixture-preview mode for browse/customize/local-basket behavior only. It does not bootstrap a guest, call the ordering API, or expose checkout/history/receipt acceptance paths.
- Process liveness at `/health/live` and dependency-aware readiness at `/health/ready`.
- Explicit migrations and explicit non-production fixture seeding. Serving startup does not migrate or reseed automatically.
- Bounded anonymous-guest retention cleanup and Redis-backed checkout abuse counters. Redis is not cart/order authority.
- Hosted release CI with genuine ESLint, unit/contract tests, independent typecheck, production build, PostgreSQL-backed backend/recovery tests, Chromium launch proof, API product E2E, isolated `local_demo` E2E, and dependency security gates.

## Product modes

| Mode | Purpose | Network / authority | Checkout |
| --- | --- | --- | --- |
| `api` | Stabilized ordering candidate | Same-origin `/api/orderly` gateway → FastAPI → PostgreSQL | Mock checkout enabled when the backend is ready |
| `local_demo` | Explicit fixture preview | Browser-local fixtures/storage only; no guest/API fallback | Disabled |

An API failure never silently switches the application into `local_demo`.

## Local development

### Frontend dependencies

```bash
npm ci --ignore-scripts
```

Copy the safe environment template before running the stack:

```bash
cp .env.example .env
```

Set a private `ORDERLY_SESSION_SECRET` with at least 32 bytes for API mode. Do not commit it.

### Full local API-mode stack

The normal Compose path runs migrations as a separate one-shot dependency. Fixture data is seeded only when explicitly requested.

```bash
docker compose up -d postgres redis
docker compose run --rm migrate
docker compose --profile seed run --rm seed
docker compose up --build api web
```

Then use:

- Web: `http://localhost:3100`
- API liveness: `http://localhost:8000/health/live`
- API readiness: `http://localhost:8000/health/ready`

### Frontend-only fixture preview

To work without the ordering backend, explicitly select `local_demo` before starting Next.js:

```bash
NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo npm run dev
```

The preview is intentionally limited to browsing, customization, and a local preview basket. It is not release acceptance evidence and it does not support checkout.

## Backend lifecycle

The backend package can be installed directly from the repository root:

```bash
python -m pip install -e ./backend
```

Apply migrations explicitly:

```bash
python backend/scripts/migrate.py
```

Fixture seeding is development/test/preview-only and must be explicitly enabled:

```bash
ORDERLY_ENVIRONMENT=development ORDERLY_ALLOW_FIXTURE_SEED=1 \
  python backend/scripts/seed_postgres.py
```

Start serving separately:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

See [backend/README.md](backend/README.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the exact lifecycle and deployment boundaries.

## Important environment boundaries

- `NEXT_PUBLIC_ORDERLY_DATA_MODE=api|local_demo` chooses the browser data mode. `api` is the release path.
- `ORDERLY_API_ORIGIN` is the fixed server-side FastAPI origin used by the same-origin Next.js gateway.
- `ORDERLY_DATA_MODE=api` is required for server-issued guest sessions.
- `ORDERLY_SESSION_SECRET` must be private and at least 32 bytes.
- `ORDERLY_ALLOWED_ORIGINS` controls unsafe guest/session mutations.
- `DATABASE_URL` is required for API-mode durable authority.
- `REDIS_URL` is required for checkout abuse-limit enforcement; Redis does not own durable carts or receipts.
- `ORDERLY_ALLOW_FIXTURE_SEED=1` is allowed only for an explicit non-production seed command.
- `NEXT_PUBLIC_CHECKOUT_MODE=mock` means mock checkout only. Real payment processing is not implemented.
- Existing voice/auth-provider environment placeholders are retained for compatibility, but voice and real account providers are not part of the stabilization acceptance scope.

## Validation

The hosted release workflow is the authoritative full gate. Useful local commands are:

```bash
npm run lint
npm run test:contracts
npm run test
npm run typecheck
npm run build
```

Backend tests use the pinned tooling in `backend/requirements-test.lock` and require the documented PostgreSQL test environment. Browser release coverage uses Playwright Chromium and includes separate API-mode and `local_demo` gates.

Current post-merge ST-12 evidence for source SHA `934208c36d323e39d9f6ddcfcc3805cbd979507f` is GitHub Actions run `37347582799`; every required release-CI job passed. This proves the repository candidate, not public deployment acceptance.

## Safety and privacy

- No real cards or payment credentials are collected.
- No password is collected for the demo profile.
- Synthetic demo addresses are used for the portfolio flow.
- Guest ownership comes from the server-issued cookie, not profile/localStorage identifiers.
- Do not log cookies, session secrets, database/Redis URLs, raw checkout contact/address payloads, or idempotency secrets.

## Documentation

- [development.md](development.md) — canonical stabilization plan, contract DAG, integration gates, and completion criteria.
- [docs/repo_context.md](docs/repo_context.md) — current implementation architecture and provider boundaries.
- [docs/PRODUCT_FLOWS.md](docs/PRODUCT_FLOWS.md) — current manual ordering and fixture-preview flows.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current C1–C8 architecture.
- [docs/QUALITY.md](docs/QUALITY.md) — verification and release-CI gates.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — explicit migration/seed/serve and hosted deployment requirements.
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — current manual mock demo script.
- [docs/releases/stabilization-acceptance.md](docs/releases/stabilization-acceptance.md) — exact candidate/public-release acceptance record.
- `PROJECT_PLAN.md`, `docs/PROJECT_PLAN_V0.2.0.md`, and `docs/TASKS.md` are retained as dated historical planning/task records and are not current acceptance evidence.

## Deferred scope

After the stabilization release is genuinely accepted, future work may separately evaluate voice interaction, real authentication/accounts, real payments, restaurant integrations, and broader marketplace features. None of those are required to prove the current manual mock demo.