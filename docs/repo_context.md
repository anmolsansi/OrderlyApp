# OrderlyApp repository context — updated 2026-10-04

This file describes the current stabilization architecture. The canonical implementation order and slice contracts live in [`development.md`](../development.md).

## Product and maturity

OrderlyApp is a portfolio voice-assisted food-ordering marketplace with mock checkout. The application is still in stabilization. It is not ready for real customer orders or payments.

ST-01 established reproducible baseline contracts and CI. ST-02 moved cart/order ownership from a browser-generated identifier to a private server-issued guest session. ST-03 replaced the old local password/account simulation with a browser-only demo profile that has no ownership authority. ST-04 makes the backend catalog authoritative for restaurant/item availability, modifier validity, canonical labels, and catalog-derived item/option prices. Later slices still own cart revisions, immutable order snapshots, checkout idempotency, broader typed API errors, final address/checkout integration, observability, and deployment proof.

## Current architecture

| Area | Source | Current behavior |
|---|---|---|
| Frontend | `app/**` | Next.js marketplace UI, local fixtures still drive several product views until ST-08 |
| Same-origin API gateway | `app/api/orderly/[...path]/route.ts` | fixed upstream, explicit path/method allowlist, origin checks, 64 KiB body cap, timeout, safe header/cookie forwarding |
| Browser API client | `lib/api.ts` | calls `/api/orderly`; protected operations bootstrap the HttpOnly guest cookie; no browser owner ID is sent |
| Cart helpers | `lib/cart.ts` | cart validation and local mirror only; no backend session-ID generator |
| Demo profile | `lib/auth.ts`, sign-in/account pages | password-free C2 presentation profile and fixed synthetic addresses in versioned local storage; never server authentication |
| API | `backend/app/main.py` | public catalog plus versioned `/v1` guest session, cart, pricing, and order routes; cart/order writes canonicalize C3 catalog fields before persistence |
| Canonical catalog | `backend/app/catalog.py`, `backend/app/store.py` | one coherent snapshot per operation; explicit restaurant/item/option availability, modifier min/max/default semantics, stable invalid-cart field paths, server-authoritative item/option pricing |
| Guest identity | `backend/app/identity.py` | opaque HMAC-signed token, hashed token lookup, 30-day expiry, reset/revocation/cleanup, exact-origin enforcement |
| Persistence | `backend/app/store.py`, `database.py`, `redis_store.py` | PostgreSQL is the API-mode catalog source; protected order reads are owner-scoped; ST-05 still consolidates cart authority and revision semantics |
| Schema | `backend/migrations/001_initial.sql`, `002_guest_sessions.sql`, `003_catalog_validation.sql` | catalog/cart/order base schema, guest-session table, and additive catalog availability/modifier-semantics migration |
| Deployment | Dockerfiles, `docker-compose.yml`, `infra/render.yaml` | explicit guest secret/origin/API mode configuration; server-only gateway upstream origin |
| Contract fixtures | `tests/fixtures/contracts/*.json` | ST-01 baseline contracts; C1 frozen for ST-02, C2 frozen for ST-03, C3 frozen for ST-04 canonical catalog behavior |
| Tests | `tests/*.test.ts`, `backend/tests`, `e2e/orderly.spec.ts` | frontend contracts/profile tests, gateway coverage, real-Postgres guest isolation, canonical catalog adversarial tests, and browser profile/session coverage |
| CI | `.github/workflows/ci.yml` | Node 22, npm 11.20.0, Python 3.12, Postgres-backed backend/E2E, Chromium proof, evidence upload |

## ST-02 ownership boundary

The browser receives `orderly_guest`, an opaque signed token. The browser never receives the internal guest owner ID. PostgreSQL stores a hash of the token nonce and a separate guest ID. Cart and order rows continue to use the existing `session_id` column internally, but its value is now the verified server guest ID for ST-02-created data.

Protected ownership is derived only from the verified cookie. Caller-provided owner headers, URL session IDs, and order-body `session_id` fields are not accepted as an ownership source. Foreign order IDs return the same generic 404 as nonexistent IDs.

The backend cookie path is `/v1`. The Next.js gateway rewrites it to `/api/orderly` so it is sent only to the browser gateway. See [`docs/ST02_GUEST_SESSIONS.md`](ST02_GUEST_SESSIONS.md) for configuration, lifecycle, failure behavior, tests, and rollback.

## ST-03 presentation-profile boundary

The demo profile is local presentation data only. Its stored shape is `{schemaVersion:1,id,name,defaultAddressId}`. The profile has no password, email-login credential, auth token, server guest ID, owner ID, or session ID.

C2 uses:

- `orderlyapp.marketplace.demoProfile.v1`
- `orderlyapp.marketplace.demoAddresses.v1`

The address records are fixed synthetic fixtures. The profile UI does not collect a real email, phone number, password, or address. Browser-storage failures are recoverable UI states.

On C2 access, the exact legacy auth/session/profile/address keys are removed without calling `localStorage.clear()`. Cart and order-history keys remain intact.

Changing the local profile name, ID, or synthetic default address does not rotate the server guest cookie. **Forget local profile** clears presentation data only. **Start fresh guest session** is the explicit C1 ownership reset and calls the existing `resetGuestSession()` client operation.

The existing checkout page still imports `isSignedIn()` and `getSessionProfile()`. These are temporary presentation-only adapters, not authentication. They synthesize the legacy checkout shape until ST-09/ST-10 migrate that consumer. See [`docs/ST03_DEMO_PROFILES.md`](ST03_DEMO_PROFILES.md).

## ST-04 canonical catalog boundary

C3 makes the backend catalog authoritative for names, item prices, modifier option deltas, delivery fees, explicit availability, and modifier selection rules.

Each logical catalog/cart/pricing/order operation builds one `CatalogSnapshot`. The snapshot indexes restaurants and menu items once, so validation does not rescan or refetch the whole catalog for every cart line. Search/filter/sort and cart validation share the same normalized domain layer.

Catalog writes and explicit seeds normalize legacy modifier groups into explicit min/max/default semantics. Required single-choice groups have min 1, max 1, and a valid default option. Existing IDs are preserved.

Cart PUT, legacy order creation, and cart pricing validate submitted restaurant/item/modifier IDs against the same snapshot. Accepted cart lines are rebuilt with canonical item names and base prices before persistence. Submitted names and base prices can remain in the temporary legacy request shape for compatibility, but they are never authority.

Invalid catalog selections return HTTP 422 `invalid_cart` with stable machine-readable field paths. A missing restaurant read returns HTTP 404 `restaurant_not_found`. A malformed authoritative catalog fails closed as `catalog_unavailable` rather than becoming permissive.

With `DATABASE_URL` configured, PostgreSQL is the catalog authority. API mode does not silently switch to the JSON catalog when PostgreSQL configuration is absent or a configured database fails. JSON remains an explicit local/fixture and seed source.

See [`docs/ST04_CANONICAL_CATALOG.md`](ST04_CANONICAL_CATALOG.md) for the C3 contract, migration, validation rules, tests, and rollback behavior.

## Known intentional limitations after ST-04

- Frontend product views still use local fixture/fallback behavior in several paths. ST-08 performs the typed API catalog/cart adapter cutover.
- Cart persistence still has Redis/Postgres/JSON fallback behavior and no revision contract. ST-05 resolves it.
- Order response normalization still reconstructs some totals/details from current fixtures. ST-06 creates immutable receipt snapshots.
- Checkout does not yet enforce the C5/C6 quote/idempotency contracts. ST-06/ST-07 own those boundaries.
- Broader typed client failure/degraded-mode semantics are deferred to ST-08/ST-09.
- Checkout still consumes temporary presentation-profile adapters and does not yet persist the selected C2 synthetic address into the final receipt. ST-09/ST-10 own that integration.
- Voice capture is not part of the current stabilization release scope.

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

Before merging a stabilization slice, run the applicable contract, frontend, backend, build, and E2E suites. ST-02 additionally requires two independent cookie jars against real PostgreSQL and browser proof of cookie bootstrap/reset attributes. ST-03 additionally requires storage-migration/no-secret tests plus browser proof that profile edits leave the guest cookie stable and only explicit reset rotates it. ST-04 additionally requires adversarial C3 validation, spoofed name/price canonicalization proof, no-write-on-invalid proof, explicit open/availability behavior, and real-PostgreSQL catalog search coverage.

GitHub Actions is the authoritative shared validation record. The PR must not be merged with required CI failures.

## Historical assessment

The initial repository assessment remains under [`docs/audit-2026-10-04`](audit-2026-10-04/). It is historical evidence, not a description of the post-ST-01/ST-02/ST-03/ST-04 architecture. The local graph report remains at [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md).
