# ST-01 Verification Runbook

This runbook defines the reproducible test vocabulary introduced by ST-01. It describes the baseline only. Product hardening remains owned by later stabilization tickets.

## Source identity

The ST-01 work branch started from `main` at `78b8fa6a7d6a779a8985d34413d81d8b23673403`.

Hosted CI records `GITHUB_SHA` in the `baseline-evidence` job summary. Use that SHA, not a moving branch name, when citing a verification result.

## Supported runtimes

- Node.js: `>=20.9.0 <25` from `package.json`.
- Hosted Node baseline: Node 22.
- Hosted npm resolver: npm 11.20.0. npm 10.9.9 hit an Arborist `edgesOut` internal error while reconciling the pre-ST-01 lockfile, so ST-01 regenerated the lock with npm 11 and uses that resolver in CI.
- Python application range: `>=3.9` from `backend/pyproject.toml`.
- Hosted Python baseline: Python 3.12.
- Backend test tools: `pytest==8.4.2` and `httpx==0.28.1` from `backend/requirements-test.lock`.
- Database baseline: PostgreSQL 16.
- Browser baseline: Playwright Chromium.

## Command vocabulary

Use these names consistently in issues, CI evidence, and stabilization reviews:

- `WEB`: `npm run test:web`
- `CONTRACTS-TS`: `npm run test:contracts`
- `BACKEND`: `python -m pytest backend/tests -q`
- `E2E-INSTALL`: `npm run test:e2e:install`
- `E2E`: `npm run test:e2e`
- `AUDIT`: `npm audit --audit-level=high`

`WEB` covers the frontend unit suite, typecheck, and production build. `BACKEND` includes the ST-01 contract and baseline tests. Hosted BACKEND additionally provisions a real PostgreSQL service before pytest runs.

## Clean frontend verification

From a clean checkout of the exact SHA being assessed:

```bash
node --version
npm --version
npm install --global npm@11.20.0
npm ci --ignore-scripts
npm run test:contracts
npm run test
npm run typecheck
npm run build
npm audit --audit-level=high
```

Expected runtime for hosted evidence is Node 22 with npm 11.20.0. `npm ci` must use the committed `package-lock.json`. Do not replace it with `npm install` during ordinary verification because that would change the resolved dependency graph.

A WEB failure is a product or source failure only after dependency installation succeeds. A missing runtime or broken lock is foundation failure and stays owned by ST-01.

## Backend and PostgreSQL verification

Hosted CI uses PostgreSQL 16 with a disposable `orderlyapp_test` database. For the equivalent local check, start only the database service or point the test environment at an isolated disposable Postgres instance:

```bash
docker compose up -d postgres
python -m venv .venv
. .venv/bin/activate
python -m pip install -e ./backend
python -m pip install -r backend/requirements-test.lock
export DATABASE_URL=postgresql://orderly:orderly@127.0.0.1:5432/orderlyapp
export ORDERLY_TEST_DATABASE_URL="$DATABASE_URL"
python backend/scripts/migrate.py
python -m pytest backend/tests -q
```

On Windows, activate the virtual environment using the shell-specific `.venv` activation command and set environment variables with that shell's syntax.

The Postgres integration test may skip when run locally without `DATABASE_URL`/`ORDERLY_TEST_DATABASE_URL`. It does **not** skip in hosted CI. When `CI=true`, a missing database URL fails the fixture because hosted baseline evidence must prove a real database connection.

The unit-style health check uses `ORDERLY_FORCE_JSON_STORE=1` and removes external database/Redis variables through pytest's monkeypatch fixture. That keeps the unit baseline isolated from a developer's services and credentials.

## Chromium and product E2E verification

Install the exact frontend dependency graph first, then provision Chromium:

```bash
npm ci --ignore-scripts
npm run test:e2e:install
npm run test:e2e
```

The hosted workflow deliberately separates two questions:

1. `browser-runtime` installs Chromium and launches/closes a headless browser without running product assertions.
2. `e2e` provisions its own Postgres database, applies migrations, seeds the current catalog, starts the FastAPI server, waits for `/health`, and then runs the existing Playwright product suite against the Next.js app.

This separation is important. A Chromium install/launch failure is a foundation failure owned by ST-01. Once Chromium launches, a failed selector, navigation, cart, checkout, or receipt assertion is a product baseline failure and must remain visible for its owning stabilization ticket.

The E2E job sets:

- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`
- `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3200`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3200`
- `NEXT_PUBLIC_VOICE_MODE=mock`
- `NEXT_PUBLIC_CHECKOUT_MODE=mock`
- `NEXT_PUBLIC_AUTH_PROVIDER=none`

`playwright.config.ts` uses `PLAYWRIGHT_BASE_URL` when supplied and otherwise defaults to `http://127.0.0.1:3200`.
