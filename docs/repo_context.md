# OrderlyApp repository context — updated 2026-10-04

This file describes the current stabilization architecture. The canonical implementation order and slice contracts live in [`development.md`](../development.md).

## Product and maturity

OrderlyApp is a portfolio voice-assisted food-ordering marketplace with mock checkout. The application is still in stabilization. It is not ready for real customer orders or payments.

ST-01 established reproducible baseline contracts and CI. ST-02 moved cart/order ownership from a browser-generated identifier to a private server-issued guest session. ST-03 replaced the old local password/account simulation with a browser-only demo profile that has no ownership authority. ST-04 makes the backend catalog authoritative for restaurant/item availability, modifier validity, canonical labels, and catalog-derived item/option prices. ST-05 makes `/v1/cart` a PostgreSQL-only, owner-scoped, revisioned compare-and-swap resource so stale tabs cannot silently overwrite newer baskets and storage outages cannot switch cart authority. ST-06 adds deterministic `mock-v1` quotes and immutable owner-scoped receipt snapshots so later catalog/profile changes cannot rewrite order history. Later slices still own atomic/idempotent checkout, broader typed frontend API errors, final address/checkout integration, observability, retention, and deployment proof.

## Current architecture

| Area | Source | Current behavior |
|---|---|---|
| Frontend | `app/**` | Next.js marketplace UI, local fixtures still drive several product/cart views until ST-08 |
| Same-origin API gateway | `app/api/orderly/[...path]/route.ts` | fixed upstream, explicit path/method allowlist, origin checks, 64 KiB body cap, timeout, safe header/cookie forwarding |
| Browser API client | `lib/api.ts` | calls `/api/orderly`; protected operations bootstrap the HttpOnly guest cookie; C4/C5 frontend cutover is deferred to ST-08/ST-09 |
| Cart helpers | `lib/cart.ts` | frontend cart validation and local mirror/presentation only; no backend owner-ID generator |
| Demo profile | `lib/auth.ts`, sign-in/account pages | password-free C2 presentation profile and fixed synthetic addresses in versioned local storage; never server authentication |
| API | `backend/app/main.py` | public catalog plus versioned `/v1` guest session, revisioned cart, C5 quote, immutable receipt read, legacy pricing and temporary pre-C6 submit routes |
| Cart service | `backend/app/cart_service.py` | C4 business boundary: Postgres requirement, row lock/CAS revision checks, whole-cart atomic mutation, typed conflict/validation/storage failures |
| Canonical catalog | `backend/app/catalog.py`, `backend/app/store.py` | one coherent snapshot per operation; explicit availability and modifier rules; canonical item/option pricing; C4 cart writes reuse the C3 validator inside the cart transaction |
| Pricing/receipt domain | `backend/app/pricing.py` | deterministic integer `mock-v1` quote rules, half-up tax, promotion policy, catalog fingerprint, canonical receipt-line and immutable snapshot construction |
| Guest identity | `backend/app/identity.py` | opaque HMAC-signed token, hashed token lookup, 30-day expiry, reset/revocation/cleanup, exact-origin enforcement |
| Persistence | `backend/app/store.py`, `database.py` | PostgreSQL is API-mode catalog, C4 cart, and C5 receipt authority; `guest_carts` owns revisioned baskets; `guest_orders` stores immutable owner-scoped C5 snapshots; Redis/JSON are not C4/C5 API fallbacks |
| Redis | `backend/app/redis_store.py` | optional legacy cleanup/health helper; not consulted by the C4 `/v1/cart` or C5 receipt authority paths |
| Schema | `backend/migrations/001_initial.sql` through `005_order_snapshots.sql` | base schema, guest sessions, catalog semantics, additive revisioned guest carts, and additive immutable guest receipt snapshots; legacy `carts`/`orders` remain isolated from C4/C5 |
| Deployment | Dockerfiles, `docker-compose.yml`, `infra/render.yaml` | explicit guest secret/origin/API mode configuration; server-only gateway upstream origin |
| Contract fixtures | `tests/fixtures/contracts/*.json` | ST-01 baseline contracts; C1 frozen for ST-02, C2 frozen for ST-03, C3 frozen for ST-04, C4 frozen for ST-05, C5 extended/frozen for ST-06 deterministic quote/receipt behavior |
| Tests | `tests/*.test.ts`, `backend/tests`, `e2e/orderly.spec.ts` | frontend contracts/profile tests, gateway coverage, real-Postgres guest isolation, canonical catalog tests, C4 concurrency/failure tests, C5 money/snapshot/immutability/pagination tests, browser profile/session coverage |
| CI | `.github/workflows/ci.yml` | Node 22, npm 11.20.0, Python 3.12, Postgres-backed backend/E2E, Chromium proof, evidence upload |

## ST-02 ownership boundary

The browser receives `orderly_guest`, an opaque signed token. The browser never receives the internal guest owner ID. PostgreSQL stores a hash of the token nonce and a separate guest ID. Cart and order rows use the verified server guest ID as their ownership key.

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

Cart validation, legacy order creation, and cart pricing validate submitted restaurant/item/modifier IDs against the same C3 rules. C4 cart write inputs no longer contain client-supplied labels/prices at all; accepted cart lines are rebuilt with canonical item names and base prices before persistence.

Invalid catalog selections return HTTP 422 `invalid_cart` with stable machine-readable field paths. A missing restaurant read returns HTTP 404 `restaurant_not_found`. A malformed authoritative catalog fails closed as `catalog_unavailable` rather than becoming permissive.

With `DATABASE_URL` configured, PostgreSQL is the catalog authority. API mode does not silently switch to the JSON catalog when PostgreSQL configuration is absent or a configured database fails. JSON remains an explicit local/fixture and seed source.

See [`docs/ST04_CANONICAL_CATALOG.md`](ST04_CANONICAL_CATALOG.md) for the C3 contract, migration, validation rules, tests, and rollback behavior.

## ST-05 revisioned cart boundary

C4 makes PostgreSQL the only `/v1/cart` authority. The C4 row lives in `guest_carts` and is keyed by the verified C1 guest owner. The legacy `carts(session_id)` table is intentionally not migrated or adopted because pre-C1 identifiers cannot be trusted as verified ownership.

A new guest cart starts at revision 0 with no items. GET may establish the empty row but never changes its revision. PUT and DELETE require strict non-negative `expected_revision` values. Each mutation locks the owner row, compares the expected revision, and either commits the complete new basket with revision +1 or returns HTTP 409 `cart_conflict` with `current_cart` unchanged.

PUT validation is whole-cart atomic. It loads the C3 canonical catalog in the same PostgreSQL transaction, validates every line/modifier, reconstructs canonical names/prices, and only then updates `guest_carts`. Invalid input therefore cannot partially write or increment the revision.

C4 server input contains line IDs, restaurant/item IDs, quantity, modifier IDs, and optional instructions only. Item labels and prices are output-only authority from C3.

Redis and JSON are not consulted by `backend/app/cart_service.py`. If PostgreSQL cart storage is absent or fails, the API returns HTTP 503 `storage_unavailable`. It never returns a successful alternate-store cart. After database recovery, the persisted PostgreSQL row remains the source of truth.

See [`docs/ST05_REVISIONED_CARTS.md`](ST05_REVISIONED_CARTS.md) for exact request/response examples, concurrency behavior, failure semantics, migration, rollback, tests, and deferred integration boundaries.

## ST-06 deterministic quote and immutable receipt boundary

C5 makes quote money deterministic and receipt reads historical instead of reconstructive.

`POST /v1/checkout/quote` reads the verified guest's C4 cart and C3 catalog in one PostgreSQL transaction. It requires the caller's `expected_revision`, validates the current canonical cart, applies integer `mock-v1` money rules, and returns the cart revision plus a SHA-256 catalog/pricing fingerprint. The quote does not clear the basket or create an order.

`mock-v1` recognizes only optional `DEMO5`, capped at 500 cents. The service fee is 249 cents for a non-empty cart. Tax is integer half-up at 8.75% of subtotal minus discount, and tip is a strict integer from 0 through 10000 cents. The shared fixture totals exactly 1192 cents, and the 40-cent taxable boundary rounds to 4 cents rather than Python's banker's rounding.

New immutable receipts live in `guest_orders`, keyed to verified C1 ownership. The JSONB snapshot contains canonical item/modifier labels and prices, every selected checkout field, all totals, creation time, and `pricing_version: mock-v1`. Receipt reads deserialize that snapshot directly. They do not join to current menu/profile tables and do not reprice.

`GET /v1/orders` is newest-first, current-owner only, and bounded to 50 rows. An optional cursor is the last receipt UUID from the previous page and is resolved only within the current owner scope. `GET /v1/orders/{id}` returns the same generic `order_not_found` response for missing and foreign IDs.

Legacy `orders(session_id, cart_items, subtotal_cents)` rows are intentionally left offline. They are not copied, backfilled, or supplied with invented current address/tip/owner fields. The temporary pre-C6 POST `/v1/orders` remains until ST-07 replaces submission with one atomic/idempotent transaction.

See [`docs/ST06_DETERMINISTIC_RECEIPTS.md`](ST06_DETERMINISTIC_RECEIPTS.md) for the exact money rules, C5 contracts, storage behavior, migration, rollback, tests, and ST-07 handoff.

## Known intentional limitations after ST-06

- Frontend product views and cart adapters still use local fixture/mirror behavior in several paths. ST-08 performs the typed C3/C4 API cutover and two-tab conflict UI.
- The existing order-creation endpoint is still the temporary pre-C6 path and does not atomically consume the C4 cart row or insert a C5 receipt. ST-07 owns idempotency, cart locking/consumption, and `guest_orders` snapshot insertion in one transaction.
- Checkout does not yet enforce the C5/C6 quote/idempotency contracts end to end. ST-07 and ST-09 own those boundaries.
- Broader typed client failure/degraded-mode semantics are deferred to ST-08/ST-09.
- Checkout still consumes temporary presentation-profile adapters and does not yet persist the selected C2 synthetic address through the real C6 submit flow. ST-09/ST-10 own that integration.
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

Redis is not required for C4 cart or C5 receipt authority.

## Validation expectations

Before merging a stabilization slice, run the applicable contract, frontend, backend, build, and E2E suites. ST-02 additionally requires two independent cookie jars against real PostgreSQL and browser proof of cookie bootstrap/reset attributes. ST-03 additionally requires storage-migration/no-secret tests plus browser proof that profile edits leave the guest cookie stable and only explicit reset rotates it. ST-04 additionally requires adversarial C3 validation, spoofed name/price canonicalization proof, no-write-on-invalid proof, explicit open/availability behavior, and real-PostgreSQL catalog search coverage. ST-05 additionally requires real-PostgreSQL same-revision concurrency proof, sequential revision checks, stale PUT/DELETE conflict/current-cart proof, legacy-cart isolation, Redis-unavailable proof, and fail-closed PostgreSQL storage behavior. ST-06 additionally requires exact 1192-cent totals, half-up tax, promotion/tip boundary checks, real-PostgreSQL complete snapshot roundtrip, catalog-mutation immutability, owner-scoped list/read, pagination, generic foreign/missing 404, and proof that legacy incomplete rows are not exposed as fabricated C5 receipts.

GitHub Actions is the authoritative shared validation record. The PR must not be merged with required CI failures.

## Historical assessment

The initial repository assessment remains under [`docs/audit-2026-10-04`](audit-2026-10-04/). It is historical evidence, not a description of the post-ST-01/ST-02/ST-03/ST-04/ST-05/ST-06 architecture. The local graph report remains at [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md).
