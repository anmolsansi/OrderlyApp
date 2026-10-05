# OrderlyApp repository context — updated 2026-10-05

This file describes the current stabilization architecture. The canonical implementation order and slice contracts live in [`development.md`](../development.md). This document was originally structured through ST-08; the ST-11 section below records the current C8 operational boundary without taking over ST-13's final cross-ticket guide reconciliation.

## Product and maturity

OrderlyApp is a portfolio voice-assisted food-ordering marketplace with mock checkout. The application is still in stabilization. It is not ready for real customer orders or payments.

ST-01 established reproducible baseline contracts and CI. ST-02 moved cart/order ownership to a private server-issued guest session. ST-03 replaced local password/account simulation with a browser-only demo profile that has no ownership authority. ST-04 made the backend catalog authoritative. ST-05 made `/v1/cart` a PostgreSQL-only, owner-scoped, revisioned compare-and-swap resource. ST-06 added deterministic `mock-v1` quotes and immutable receipt snapshots. ST-07 made C6 checkout atomic and idempotent. ST-08 cut discovery, menu customization, and basket review over to typed C3/C4 browser adapters. Later stabilization slices completed the checkout/recovery and UI-resilience work. ST-11 now adds C8 operational readiness: truthful live/readiness probes, non-mutating serving startup, serialized/checksummed migrations, bounded guest retention, checkout abuse limits, and recovery evidence. ST-13 still owns final release-guide reconciliation and public deployment acceptance.

## Current architecture

| Area | Source | Current behavior |
|---|---|---|
| Frontend | `app/**` | Next.js marketplace UI. Stabilized product flows consume the typed browser/API boundaries established by ST-08 through ST-10. |
| Same-origin API gateway | `app/api/orderly/[...path]/route.ts` | Fixed upstream, explicit path/method allowlist, origin checks, 64 KiB body cap, timeout, safe header/cookie forwarding. C6 `Idempotency-Key` forwards only on order POST. |
| Browser API client | `lib/api.ts` | Typed catalog/cart/checkout results, strict normalization, abortable reads, serialized C4 writes, explicit `api|local_demo` selection, and no API-error-to-fixture fallback. |
| Cart helpers | `lib/cart.ts` | Catalog-source-aware validation/pricing helpers plus separate local-preview, API-draft, and accepted-cart namespaces. Browser storage never becomes C4 API authority. |
| Marketplace helpers | `lib/marketplace.ts` | Discovery/filter/sort/default-modifier behavior accepts an explicit catalog source. |
| Demo profile | `lib/auth.ts`, sign-in/account pages | Password-free C2 presentation profile and fixed synthetic addresses in versioned local storage. Never server authentication. |
| API | `backend/app/main.py` | Public catalog plus versioned `/v1` guest session, revisioned cart, C5 quote, atomic C6 order submit, immutable receipt read, C8 live/readiness probes, and checkout abuse enforcement. |
| Cart service | `backend/app/cart_service.py` | C4 PostgreSQL boundary with row lock/CAS revision checks, whole-cart atomic mutation, typed conflict/validation/storage failures. |
| Order service | `backend/app/order_service.py` | C6 strict UUID idempotency key, canonical validated-body SHA-256, replay checks, quote revalidation, receipt/key/cart single transaction, and C8 guest-row coordination with retention cleanup. |
| Canonical catalog | `backend/app/catalog.py`, `backend/app/store.py` | Coherent snapshots with explicit availability/modifier rules and canonical item/option pricing. C4/C6 reuse C3 validation. |
| Pricing/receipt domain | `backend/app/pricing.py` | Deterministic integer `mock-v1` quote rules, half-up tax, promotion policy, catalog fingerprint, canonical receipt lines, immutable snapshots. |
| Guest identity / retention | `backend/app/identity.py`, `backend/scripts/cleanup_guests.py` | Opaque HMAC-signed token, hashed lookup, 30-day expiry, reset/revocation, exact-origin enforcement, and explicit bounded cleanup batches using `FOR UPDATE SKIP LOCKED`. |
| Persistence | `backend/app/store.py`, `backend/app/database.py` | PostgreSQL is API-mode catalog, C4 cart, C5 receipt, and C6 checkout authority. Redis is ephemeral only and is not an order/cart/receipt correctness fallback. |
| Migrations / seed lifecycle | `backend/scripts/migrate.py`, `backend/scripts/seed*.py` | Migrations are explicit, single-writer, checksum-verified deploy work. Fixture seed is explicit non-production work and never normal serving startup. |
| Contract fixtures | `tests/fixtures/contracts/*.json` | C1-C7 are frozen by their provider slices; C8 is frozen by ST-11 for readiness, startup lifecycle, retention, and checkout-abuse behavior. |
| Browser tests | `e2e/**` | API-backed product regression coverage plus independent Chromium runtime proof. |
| Deployment manifests | `backend/Dockerfile`, `docker-compose.yml`, `infra/render.yaml` | API serving start is application-only. Docker/Compose use C8 readiness; Compose uses a one-shot migration prerequisite; Render declares pre-deploy migration and scheduled guest cleanup. |
| CI | `.github/workflows/ci.yml` | Node 22, npm 11.20.0, Python 3.12, PostgreSQL + Redis integration, C8 readiness, Chromium/E2E proof, and transaction-consistent PostgreSQL receipt backup/restore rehearsal. |

## ST-02 ownership boundary

The browser receives `orderly_guest`, an opaque signed token. It never receives the internal guest owner ID. PostgreSQL stores a hash of the token nonce and a separate guest ID. Protected ownership is derived only from the verified cookie.

The backend cookie path is `/v1`. The Next.js gateway rewrites it to `/api/orderly` so the browser sends it only to the same-origin gateway. Caller-provided owner headers, URL session IDs, and order-body `session_id` fields are not ownership sources.

See [`docs/ST02_GUEST_SESSIONS.md`](ST02_GUEST_SESSIONS.md).

## ST-03 presentation-profile boundary

The demo profile is local presentation data only. Its stored shape is `{schemaVersion:1,id,name,defaultAddressId}`. It has no password, auth token, server guest ID, owner ID, or session ID.

C2 uses:

- `orderlyapp.marketplace.demoProfile.v1`
- `orderlyapp.marketplace.demoAddresses.v1`

Changing the local profile does not rotate the server guest cookie. **Forget local profile** clears presentation data only. **Start fresh guest session** is the explicit C1 ownership reset.

See [`docs/ST03_DEMO_PROFILES.md`](ST03_DEMO_PROFILES.md).

## ST-04 canonical catalog boundary

C3 makes the backend catalog authoritative for names, item prices, modifier option deltas, delivery fees, explicit availability, and modifier selection rules.

Each logical catalog/cart/pricing/order operation builds one coherent `CatalogSnapshot`. Cart writes and checkout validate submitted IDs against C3 and rebuild canonical labels/prices before persistence. Malformed authoritative catalog data fails closed.

With `DATABASE_URL` configured, PostgreSQL is catalog authority. API mode does not silently switch to JSON when configured storage fails. JSON remains an explicit local fixture/seed source.

See [`docs/ST04_CANONICAL_CATALOG.md`](ST04_CANONICAL_CATALOG.md).

## ST-05 revisioned cart boundary

C4 makes PostgreSQL the only `/v1/cart` API authority. A guest cart begins at revision 0. PUT and DELETE require a strict non-negative `expected_revision`. Each mutation locks the owner row, compares revisions, and either commits the complete new basket at revision +1 or returns HTTP 409 `cart_conflict` with `current_cart` unchanged.

C4 write input contains line IDs, restaurant/item IDs, quantity, modifier IDs, and optional instructions. Item labels and prices are output-only authority from C3.

Redis and JSON are not consulted by C4. Storage failure returns `storage_unavailable`, not a successful alternate-store cart.

See [`docs/ST05_REVISIONED_CARTS.md`](ST05_REVISIONED_CARTS.md).

## ST-06 deterministic quote and immutable receipt boundary

C5 makes quote money deterministic and receipt reads historical. `POST /v1/checkout/quote` reads the verified guest's C4 cart and C3 catalog in one transaction, requires `expected_revision`, validates the canonical cart, and returns the revision plus catalog/pricing fingerprint.

`mock-v1` uses integer money rules and half-up tax. New receipts in `guest_orders` contain immutable canonical line details, checkout fields, totals, creation time, and pricing version. Receipt reads do not join current menu/profile data and do not reprice.

See [`docs/ST06_DETERMINISTIC_RECEIPTS.md`](ST06_DETERMINISTIC_RECEIPTS.md).

## ST-07 atomic idempotent checkout boundary

C6 requires a UUID `Idempotency-Key`, strict body, quoted cart revision, and C5 fingerprint. A new request locks the verified guest ownership row and the C4 cart, rechecks the idempotency ledger, revalidates C3/C5 inputs, writes one immutable receipt plus the guest-scoped idempotency record, and clears/revisions the cart in one PostgreSQL transaction.

Exact owner/key/body replay returns the stored receipt. Reusing the key with a different body returns `idempotency_conflict`. Different keys against one stale cart revision serialize on the cart row. ST-11's guest-row lock additionally coordinates checkout with retention cleanup without changing the C6 public contract.

See [`docs/ST07_ATOMIC_CHECKOUT.md`](ST07_ATOMIC_CHECKOUT.md).

## ST-08 typed web adapter boundary

C7 is the browser boundary established for discovery, customization, and basket state.

### Explicit data mode

Browser behavior is selected with:

```text
NEXT_PUBLIC_ORDERLY_DATA_MODE=api|local_demo
```

The default is `api` for existing environments. Any other explicit value is invalid.

In `api` mode, restaurant/menu data comes only from C3 and cart state comes only from C4. An API failure remains a typed failure and never activates fixtures.

In `local_demo`, restaurant/menu data comes from bundled fixtures and the basket is stored only in `orderlyapp.marketplace.localDemoCart.v1`. ST-08 pages show a persistent **Local fixture preview** label, make no guest bootstrap/API call, and do not expose checkout entry.

### Typed results and strict mapping

The browser adapter exposes:

```ts
{ ok: true, data: T }

{
  ok: false,
  kind: 'validation' | 'conflict' | 'session' | 'network' | 'server',
  error: { code, message, requestId?, fields?, currentCart? }
}
```

C3/C4 snake_case payloads are normalized into browser camelCase only after shape checks. A malformed 2xx payload becomes `server / invalid_response`. C4 top-level `current_cart` is normalized to `error.currentCart`.

### Honest cart mutation behavior

The cart UI distinguishes:

1. accepted server basket and revision
2. attempted next basket
3. optional recovery draft

A failed mutation does not optimistically replace the accepted basket. The attempted items are kept under `orderlyapp.marketplace.apiCartDraft.v1` as recovery intent only.

On `409 cart_conflict`, the UI shows the server-provided `current_cart` and preserves the attempted change separately. **Reapply my change** sends the attempted list against the conflict-provided current revision. Cross-restaurant replacement also requires an explicit user confirmation.

Within one browser tab, C4 mutations are serialized. Reads support `AbortSignal`, and page effects suppress obsolete responses.

In `local_demo`, the fixture basket remains isolated from API-owned C4 state and is never an outage fallback.

See [`docs/ST08_WEB_ADAPTER.md`](ST08_WEB_ADAPTER.md) for detailed mappings, state transitions, storage namespaces, tests, and rollback.

## ST-11 C8 operational boundary

C8 distinguishes process liveness from application readiness.

- `GET /health/live` proves only that the API process can answer. It does not claim PostgreSQL or migration readiness.
- `GET /health/ready` uses bounded probes and returns 200 only when required API identity configuration is valid, PostgreSQL is reachable, the migration ledger exists, all repository migrations are recorded, and checkout-abuse configuration is valid. Dependency failures return a redacted 503 envelope with no connection strings, tokens, cookies, or secrets.
- Legacy `/health` is retained for compatibility but is not deployment readiness evidence.

Serving startup is non-mutating. Uvicorn starts the API. Migration is a separate serialized operation, and fixture seed requires `ORDERLY_ALLOW_FIXTURE_SEED=1` in an explicitly non-production environment. The migration runner validates the ordered migration set, takes a PostgreSQL advisory transaction lock, stores SHA-256 checksums in the ledger, and fails closed on drift.

Anonymous retention is explicit scheduled work, not a side effect of session bootstrap. Each SQL batch handles at most 100 expired/revoked guests and locks candidates with `FOR UPDATE SKIP LOCKED`. New C6 checkout locks the same guest row before durable work, so cleanup skips an in-flight checkout rather than deleting its ownership record.

Checkout abuse counters are ephemeral Redis state. Defaults are a 60-second window, 10 attempts per guest, and 120 aggregate attempts. Exceeding either limit returns HTTP 429 with `Retry-After`. If required counter enforcement is unavailable, new checkout writes return 503 rather than bypassing the boundary. Redis never becomes order/cart/receipt authority.

### Durability and recovery evidence

Catalog edits and accepted immutable receipts live in PostgreSQL and must survive ordinary application process restarts. CI proves that importing/starting the API does not reseed catalog fixtures. Migration rehearsal proves an idempotent rerun leaves legacy data intact and checksum drift fails closed.

The backend CI also performs a transaction-consistent recovery rehearsal: it inserts a synthetic immutable C5 receipt, runs `pg_dump`, restores into a fresh database with `pg_restore --single-transaction --exit-on-error`, and verifies the restored receipt ID, canonical 1192-cent fixture total, and migration ledger.

Operational commands and rollback sequencing are documented in [`docs/runbooks/stabilization.md`](runbooks/stabilization.md).

### Deployment boundary

`backend/Dockerfile` and the Compose API start command run the application only. Compose uses a one-shot migration service and an opt-in seed profile. `infra/render.yaml` declares a pre-deploy migration, `/health/ready`, and scheduled guest cleanup.

The currently connected integration Render service is on a free plan, so ST-11 does not silently purchase/enable paid pre-deploy or cron capabilities. The manifest records the intended production lifecycle. ST-13/INT-02 owns public deployment activation and release acceptance.

## Known intentional limitations after ST-11

- The product remains mock-checkout only. No real payment authorization, real customer account system, or production voice-payment behavior is claimed.
- Redis is required for checkout abuse enforcement, but PostgreSQL remains the sole durable order/cart/receipt authority.
- Render's checked-in pre-deploy and cron lifecycle may require a paid service tier. ST-11 does not change billing or silently create paid infrastructure.
- `development.md` and release-gate bookkeeping are intentionally left for ST-13 final reconciliation.
- Voice capture is outside the current stabilization release scope.

## Required local configuration

API-mode development requires at least:

```text
ORDERLY_DATA_MODE=api
NEXT_PUBLIC_ORDERLY_DATA_MODE=api
ORDERLY_SESSION_SECRET=<private random value of at least 32 bytes>
ORDERLY_ALLOWED_ORIGINS=http://localhost:3000
ORDERLY_API_ORIGIN=http://127.0.0.1:8000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ORDERLY_CHECKOUT_RATE_WINDOW_SECONDS=60
ORDERLY_CHECKOUT_RATE_LIMIT_PER_GUEST=10
ORDERLY_CHECKOUT_RATE_LIMIT_AGGREGATE=120
```

`ORDERLY_SESSION_SECRET` must never be committed. A secret rotation invalidates existing guest cookies.

Fixture seeding is opt-in only:

```text
ORDERLY_ENVIRONMENT=development ORDERLY_ALLOW_FIXTURE_SEED=1 python backend/scripts/seed_postgres.py
```

Do not put `ORDERLY_ALLOW_FIXTURE_SEED=1` in production serving configuration.

For an explicit isolated browser preview:

```text
NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo
```

That browser mode must remain labelled and must not be used as outage recovery.

## Validation expectations

Before merging a stabilization slice, run the applicable contract, frontend, backend, typecheck/build, browser runtime, and E2E suites. GitHub Actions is the authoritative shared record.

ST-11 specifically requires proof that:

- liveness remains process-only while readiness returns 503 during required PostgreSQL/config/schema failure and recovers to 200 when the dependency returns;
- live/readiness evidence contains no secret connection material;
- serving startup does not run migrations or fixture seed and preserves edited catalog data;
- migration reruns are serialized/idempotent and checksum drift fails closed;
- guest retention is bounded to at most 100 rows per batch, preserves active guests, and skips ownership locked by checkout;
- per-guest and aggregate checkout attempts are bounded, 429 includes retry guidance, and counter unavailability fails closed;
- a transaction-consistent backup restores an immutable receipt and migration ledger into a fresh database;
- C8 contract fixtures validate in both backend and TypeScript contract suites.

The PR must not merge with required CI failures.

## Historical assessment

The initial repository assessment remains under [`docs/audit-2026-10-04`](audit-2026-10-04/). It is historical evidence, not a description of the post-ST-01 stabilization architecture. The local graph report remains at [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md).