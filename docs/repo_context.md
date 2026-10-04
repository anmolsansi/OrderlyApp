# OrderlyApp repository context — updated 2026-10-04

This file describes the current stabilization architecture. The canonical implementation order and slice contracts live in [`development.md`](../development.md).

## Product and maturity

OrderlyApp is a portfolio voice-assisted food-ordering marketplace with mock checkout. The application is still in stabilization. It is not ready for real customer orders or payments.

ST-01 established reproducible baseline contracts and CI. ST-02 moves cart/order ownership from a browser-generated identifier to a private server-issued guest session. Later slices still own catalog authority, cart revisions, immutable order snapshots, checkout idempotency, typed API errors, password-free account identity, voice execution, observability, and deployment proof.

## Current architecture

| Area | Source | Current behavior |
|---|---|---|
| Frontend | `app/**` | Next.js marketplace UI, local fixtures still drive several product views |
| Same-origin API gateway | `app/api/orderly/[...path]/route.ts` | fixed upstream, explicit path/method allowlist, origin checks, 64 KiB body cap, timeout, safe header/cookie forwarding |
| Browser API client | `lib/api.ts` | calls `/api/orderly`; protected operations bootstrap the HttpOnly guest cookie; no browser owner ID is sent |
| Cart helpers | `lib/cart.ts` | cart validation and local mirror only; no backend session-ID generator |
| Demo account UI | `lib/auth.ts`, sign-in/account pages | local demo credentials/session remain and are intentionally separate from ST-02 guest ownership; ST-03 owns this redesign |
| API | `backend/app/main.py` | public catalog plus versioned `/v1` guest session, cart, pricing, and order routes |
| Guest identity | `backend/app/identity.py` | opaque HMAC-signed token, hashed token lookup, 30-day expiry, reset/revocation/cleanup, exact-origin enforcement |
| Persistence | `backend/app/store.py`, `database.py`, `redis_store.py` | protected order reads are owner-scoped; later slices still consolidate cart authority and snapshot semantics |
| Schema | `backend/migrations/001_initial.sql`, `002_guest_sessions.sql` | existing catalog/cart/order schema plus additive guest-session table |
| Deployment | Dockerfiles, `docker-compose.yml`, `infra/render.yaml` | explicit guest secret/origin/API mode configuration; server-only gateway upstream origin |
| Contract fixtures | `tests/fixtures/contracts/*.json` | ST-01 frozen contracts, with C1 expanded for ST-02 ownership/security semantics |
| Tests | `tests/*.test.ts`, `backend/tests`, `e2e/orderly.spec.ts` | frontend, gateway, real-Postgres guest isolation, and browser cookie/reset coverage |
| CI | `.github/workflows/ci.yml` | Node 22, npm 11.20.0, Python 3.12, Postgres-backed backend/E2E, Chromium proof, evidence upload |

## ST-02 ownership boundary

The browser receives `orderly_guest`, an opaque signed token. The browser never receives the internal guest owner ID. PostgreSQL stores a hash of the token nonce and a separate guest ID. Cart and order rows continue to use the existing `session_id` column internally, but its value is now the verified server guest ID for ST-02-created data.

Protected ownership is derived only from the verified cookie. Caller-provided owner headers, URL session IDs, and order-body `session_id` fields are not accepted as an ownership source. Foreign order IDs return the same generic 404 as nonexistent IDs.

The backend cookie path is `/v1`. The Next.js gateway rewrites it to `/api/orderly` so it is sent only to the browser gateway. See [`docs/ST02_GUEST_SESSIONS.md`](ST02_GUEST_SESSIONS.md) for configuration, lifecycle, failure behavior, tests, and rollback.

## Known intentional limitations after ST-02

- `lib/auth.ts` still stores demo account credentials/session in browser storage. ST-03 removes that password-first identity model.
- Catalog/menu authority remains split between frontend fixtures and backend data. ST-04 resolves it.
- Cart persistence still has Redis/Postgres/JSON fallback behavior and no revision contract. ST-05 resolves it.
- Order response normalization still reconstructs some totals/details from current fixtures. ST-06 creates immutable receipt snapshots.
- Checkout does not yet enforce the C5 idempotency contract. ST-07 owns that boundary.
- Broader typed client failure/degraded-mode semantics are deferred to ST-08/ST-09.
- Voice capture is not yet connected to an explicit review/execute workflow. ST-10 owns voice ordering.

## Required local guest-session configuration

At minimum:

```text
ORDERLY_DATA_MODE=api
ORDERLY_SESSION_SECRET=<private random value of at least 32 bytes>
ORDERLY_ALLOWED_ORIGINS=http://localhost:3000
ORDERLY_API_ORIGIN=http://127.0.0.1:8000
DATABASE_URL=postgresql://...
```

`ORDERLY_SESSION_SECRET` must never be committed. A secret rotation invalidates all existing guest cookies.

## Validation expectations

Before merging a stabilization slice, run the applicable contract, frontend, backend, build, and E2E suites. ST-02 additionally requires two independent cookie jars against real PostgreSQL and browser proof of cookie bootstrap/reset attributes.

GitHub Actions is the authoritative shared validation record. The PR must not be merged with required CI failures.

## Historical assessment

The initial repository assessment remains under [`docs/audit-2026-10-04`](audit-2026-10-04/). It is historical evidence, not a description of the post-ST-01/ST-02 architecture. The local graph report remains at [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md).
