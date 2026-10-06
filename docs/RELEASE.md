# OrderlyApp — Release Notes

## Unreleased — Stabilization Candidate (current)

### Candidate identity

- Repository candidate: `fix/st11-st13-acceptance`; existing public frontend remains on older `main`.
- ST-12 runtime/audit source SHA: `64a6f412c03731e997c9a96e91e849bc4cf998e4`
- Stabilization CI: [run 37428142914](https://github.com/anmolsansi/OrderlyApp/actions/runs/37428142914) — all seven jobs passed.
- Current release acceptance: **Not completed**.

### Stabilized behavior

- Server-issued private guest ownership through an opaque HttpOnly cookie.
- Password-free local demo profiles and synthetic addresses that never become server ownership.
- Canonical API catalog and server-authoritative prices/availability/modifiers.
- PostgreSQL-only revisioned API carts with explicit conflict/current-cart recovery.
- Deterministic `mock-v1` server quotes and immutable receipt snapshots.
- Atomic idempotent mock checkout with exact lost-response replay.
- Guest-scoped exact receipt/history reads; no local invented-order fallback.
- Explicit `api|local_demo` browser modes; API failure never activates fixture mode.
- `local_demo` is a labelled browse/customize/local-basket preview with checkout/history/receipt unavailable.
- Safe profile/address recovery, internal return-path validation, keyboard/mobile checkout coverage.
- Separate liveness/readiness, explicit serialized/checksummed migrations, explicit non-production seed, guest retention cleanup, Redis-backed checkout abuse counters, and backup/restore proof.
- Release CI now includes genuine ESLint, independent typecheck/build, backend/PostgreSQL recovery, real Chromium launch, API product E2E, local-demo safety E2E, and frontend/Python dependency audits.

### Current hosted evidence / blocker

The existing main frontend is READY. Its public alias opens anonymously, while its immutable URL redirects to Vercel SSO. Catalog initially returned 504, then recovered to 200 in two fresh anonymous browsers. Guest creation returns 503 `invalid_config` for `ORDERLY_DATA_MODE`, and public manual checkout failed. The separately observed backend readiness URL times out. This follow-up branch has not been deployed; current Render service identity/configuration is unverified. Local recovery now has a report, but hosted staging/public two-guest receipt evidence remains blocked.

Therefore a READY frontend build must **not** be described as an accepted public release yet. See [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md).

### Verification already passed for repository candidate

- Dependency security — PASS
- Genuine lint / contracts / frontend units / typecheck / production build — PASS
- Backend/PostgreSQL migrations + regression + transaction-consistent recovery — PASS
- Chromium provision/launch — PASS
- API-mode product E2E — 35/35 PASS
- Explicit `local_demo` safety E2E — PASS
- Fail-closed release evidence — PASS

Public access/current backend/recovery rehearsal remain separate mandatory release gates.

---

## Historical Release Record — v0.2.0 “Production Demo Release”

> This section is retained as the project’s earlier v0.2.0 release record. Its checked phases and old fallback/Redis/voice descriptions are historical context, **not current stabilization acceptance evidence**. Later C1–C8 work replaced several of those assumptions.

### Historical completed phases

- Phase 0 — Branch/setup
- Phase 1 — Frontend API integration
- Phase 2 — PostgreSQL backend persistence
- Phase 3 — Redis cart persistence
- Phase 4 — Checkout/backend wiring
- Phase 5 — E2E tests
- Phase 6 — Deployment readiness
- Phase 7 — Portfolio polish
- Phase 8 — Release

### Historical highlights

- Frontend read restaurant data from FastAPI with local fallback behavior for demo resilience.
- Cart, checkout, and order confirmation used backend APIs as the primary path with local fallback behavior.
- PostgreSQL-backed restaurant/order persistence with repeatable SQL migration runner.
- Redis-backed session carts with PostgreSQL/JSON fallback.
- Docker Compose stack for web, API, Postgres, and Redis.
- Vercel-style frontend and Render/Railway-style backend deployment guidance.
- Playwright smoke coverage included menu customization and typed voice-command checkout.

Those statements describe the v0.2.0 stage. The current candidate instead uses private C1 guest ownership, PostgreSQL C4 cart authority, C5/C6 immutable/idempotent checkout, explicit no-fallback C7 web behavior, and C8 operational lifecycle.

### Historical verification

```bash
npm run test
npm run build
npm run lint
python3 -m py_compile backend/app/*.py backend/scripts/*.py
docker compose config
docker compose --env-file .env.example config
npm run test:e2e
```

### Historical known limitations

- Real payments, restaurant integrations, accounts/auth, and live driver tracking were out of scope.
- Browser speech support depended on browser/platform.
- Hosted deployment still required managed service provisioning/configuration.

---

## Historical Release Record — v0.1.0 Local MVP

> Retained as historical project context; not current acceptance evidence.

### Completed phases

- Phase 0 — Restart/Foundation
- Phase 1 — Product Design
- Phase 2 — Frontend App Shell
- Phase 3 — Data Models + Mock Content
- Phase 4 — Voice Input + Parsing
- Phase 5 — Cart + Ordering Logic
- Phase 6 — Checkout + Status
- Phase 7 — Backend API
- Phase 8 — Database + Infrastructure
- Phase 9 — Quality + Safety
- Phase 10 — Polish + Release

### Historical highlights

- End-to-end local ordering demo.
- Voice and typed command path.
- Cart validation and mock checkout safety copy.
- Mock order status timeline.
- Backend/API scaffold and infrastructure plan.
- Automated tests for core logic.

### Historical limitations

- Backend persistence was JSON-backed at runtime; PostgreSQL/Redis were scaffolding for the later hardening track.
- Browser speech support depended on browser/platform.
- Real payments and real restaurant integrations were intentionally out of scope.

## Current Release Rule

Use [`../development.md`](../development.md) plus [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md) to decide whether the current stabilization release is complete. Historical tags/checklists/releases do not override a blocked current public/recovery criterion.