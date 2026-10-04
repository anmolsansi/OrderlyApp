# OrderlyApp repository context — updated 2026-10-04

This file describes the current stabilization architecture. The canonical implementation order and slice contracts live in [`development.md`](../development.md).

## Product and maturity

OrderlyApp is a portfolio voice-assisted food-ordering marketplace with mock checkout. The application is still in stabilization. It is not ready for real customer orders or payments.

ST-01 established reproducible baseline contracts and CI. ST-02 moved cart/order ownership from a browser-generated identifier to a private server-issued guest session. ST-03 replaced the old local password/account simulation with a browser-only demo profile that has no ownership authority. ST-04 makes the backend catalog authoritative for restaurant/item availability, modifier validity, canonical labels, and catalog-derived item/option prices. ST-05 makes `/v1/cart` a PostgreSQL-only, owner-scoped, revisioned compare-and-swap resource so stale tabs cannot silently overwrite newer baskets and storage outages cannot switch cart authority. ST-06 adds deterministic `mock-v1` quotes and immutable owner-scoped receipt snapshots so later catalog/profile changes cannot rewrite order history. ST-07 makes C6 checkout atomic and idempotent: one PostgreSQL transaction locks/revalidates the quoted cart, writes one immutable receipt and guest-scoped idempotency record, then clears/revisions the cart exactly once. Later slices still own broader typed frontend API errors, product/cart frontend cutover, checkout UI recovery, observability, retention, and deployment proof.

## Current architecture

| Area | Source | Current behavior |
|---|---|---|
| Frontend | `app/**` | Next.js marketplace UI, local fixtures still drive several product/cart views until ST-08 |
| Same-origin API gateway | `app/api/orderly/[...path]/route.ts` | fixed upstream, explicit path/method allowlist, origin checks, 64 KiB body cap, timeout, safe header/cookie forwarding; C6 `Idempotency-Key` forwards only on order POST |
| Browser API client | `lib/api.ts` | calls `/api/orderly`; protected operations bootstrap the HttpOnly guest cookie; C4/C5/C6 frontend cutover is deferred to ST-08/ST-09 |
| Cart helpers | `lib/cart.ts` | frontend cart validation and local mirror/presentation only; no backend owner-ID generator |
| Demo profile | `lib/auth.ts`, sign-in/account pages | password-free C2 presentation profile and fixed synthetic addresses in versioned local storage; never server authentication |
| API | `backend/app/main.py` | public catalog plus versioned `/v1` guest session, revisioned cart, C5 quote, atomic C6 order submit, and immutable receipt read; legacy pricing remains only for pre-cutover web consumers |
| Cart service | `backend/app/cart_service.py` | C4 business boundary: Postgres requirement, row lock/CAS revision checks, whole-cart atomic mutation, typed conflict/validation/storage failures |
| Order service | `backend/app/order_service.py` | C6 boundary: strict UUID key normalization, canonical validated-body SHA-256, pre-lock and post-lock replay checks, cart serialization, quote revalidation, receipt/key/cart single transaction |
| Canonical catalog | `backend/app/catalog.py`, `backend/app/store.py` | one coherent snapshot per operation; explicit availability and modifier rules; canonical item/option pricing; C4/C6 writes reuse C3 validation inside their database transaction |
| Pricing/receipt domain | `backend/app/pricing.py` | deterministic integer `mock-v1` quote rules, half-up tax, promotion policy, catalog fingerprint, canonical receipt-line and immutable snapshot construction |
| Guest identity | `backend/app/identity.py` | opaque HMAC-signed token, hashed token lookup, 30-day expiry, reset/revocation/cleanup, exact-origin enforcement |
| Persistence | `backend/app/store.py`, `database.py` | PostgreSQL is API-mode catalog, C4 cart, C5 receipt, and C6 checkout authority; `guest_carts` owns revisioned baskets; `guest_orders` stores immutable receipts; `order_idempotency` maps guest/key/digest/order; Redis/JSON are not C4/C5/C6 API fallbacks |
| Redis | `backend/app/redis_store.py` | optional legacy cleanup/health helper; not consulted by C4 `/v1/cart`, C5 receipt authority, or C6 checkout writes |
| Schema | `backend/migrations/001_initial.sql` through `006_order_idempotency.sql` | base schema, guest sessions, catalog semantics, additive revisioned guest carts, immutable receipt snapshots, and additive guest-scoped checkout idempotency ledger; legacy `carts`/`orders` remain isolated |
| Deployment | Dockerfiles, `docker-compose.yml`, `infra/render.yaml` | explicit guest secret/origin/API mode configuration; server-only gateway upstream origin |
| Contract fixtures | `tests/fixtures/contracts/*.json` | ST-01 baseline contracts; C1 frozen for ST-02, C2 for ST-03, C3 for ST-04, C4 for ST-05, C5 for ST-06, and C6 extended/frozen for ST-07 atomic/replay behavior |
| Tests | `tests/*.test.ts`, `backend/tests`, `e2e/orderly.spec.ts` | frontend contracts/profile tests, gateway coverage, real-Postgres guest isolation, canonical catalog tests, C4 concurrency/failure tests, C5 money/snapshot tests, C6 replay/concurrency/rollback/recovery tests, browser profile/session coverage |
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

Cart validation and cart pricing validate submitted restaurant/item/modifier IDs against the same C3 rules. C4 cart write inputs no longer contain client-supplied labels/prices at all; accepted cart lines are rebuilt with canonical item names and base prices before persistence. C6 checkout revalidates the current locked cart against the same catalog before accepting the quoted fingerprint.

Invalid catalog selections return HTTP 422 `invalid_cart` on cart mutation. A missing restaurant read returns HTTP 404 `restaurant_not_found`. A malformed authoritative catalog fails closed as `catalog_unavailable` rather than becoming permissive. C6 quote drift returns `catalog_changed` instead of silently repricing an accepted submit request.

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

Legacy `orders(session_id, cart_items, subtotal_cents)` rows are intentionally left offline. They are not copied, backfilled, or supplied with invented current address/tip/owner fields. C6 now inserts only complete C5 receipt snapshots through the atomic ST-07 service.

See [`docs/ST06_DETERMINISTIC_RECEIPTS.md`](ST06_DETERMINISTIC_RECEIPTS.md) for the exact money rules, C5 contracts, storage behavior, migration, rollback, tests, and ST-07 handoff.

## ST-07 atomic idempotent checkout boundary

C6 replaces the temporary order-submit path with `backend/app/order_service.py`.

`POST /v1/orders` requires a UUID `Idempotency-Key`, strict C6 request body, the caller's quoted cart revision, and the C5 catalog/pricing fingerprint. The validated body is serialized canonically and hashed with SHA-256. The `(owner_id, idempotency_key)` pair is unique in PostgreSQL.

For a genuinely new request, the service locks the guest's C4 cart row, rechecks the idempotency ledger after acquiring that lock, validates the expected revision, revalidates the current cart against C3, recomputes the C5 fingerprint, builds the immutable C5 receipt, writes the receipt and idempotency record, and clears/increments the cart. All writes share one PostgreSQL transaction.

The second ledger lookup after the cart lock closes the same-key race: if two identical requests both initially see no key, one commits and the waiting request then replays that committed receipt. Different keys submitted against the same expected revision also serialize on the cart row, so only one can commit and the other receives `cart_conflict`.

An exact owner/key/body replay returns HTTP 200 with the stored receipt even though the accepted first request already emptied the cart. The first request returns HTTP 201. Reusing the same owner/key with a different validated body returns HTTP 409 `idempotency_conflict`.

The same-origin gateway forwards `Idempotency-Key` only for order POST. Caller-provided owner/identity headers remain filtered. PostgreSQL outages fail closed as `storage_unavailable`; checkout never switches to Redis/JSON or the old non-idempotent writer.

See [`docs/ST07_ATOMIC_CHECKOUT.md`](ST07_ATOMIC_CHECKOUT.md) for transaction order, request hashing, schema, concurrency behavior, failure semantics, tests, rollback, and ST-09 handoff.

## Known intentional limitations after ST-07

- Frontend product views and cart adapters still use local fixture/mirror behavior in several paths. ST-08 performs the typed C3/C4 API cutover and two-tab conflict UI.
- `lib/api.ts` and the checkout UI do not yet generate/persist C6 idempotency keys or submit the C5 revision/fingerprint contract. ST-09 owns that browser integration and recovery UX.
- Broader typed client failure/degraded-mode semantics are deferred to ST-08/ST-09.
- Checkout still consumes temporary presentation-profile adapters and does not yet persist the selected C2 synthetic address through the real C6 browser flow. ST-09/ST-10 own that integration.
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

Redis is not required for C4 cart, C5 receipt, or C6 checkout authority.

## Validation expectations

Before merging a stabilization slice, run the applicable contract, frontend, backend, build, and E2E suites. ST-02 additionally requires two independent cookie jars against real PostgreSQL and browser proof of cookie bootstrap/reset attributes. ST-03 additionally requires storage-migration/no-secret tests plus browser proof that profile edits leave the guest cookie stable and only explicit reset rotates it. ST-04 additionally requires adversarial C3 validation, spoofed name/price canonicalization proof, no-write-on-invalid proof, explicit open/availability behavior, and real-PostgreSQL catalog search coverage. ST-05 additionally requires real-PostgreSQL same-revision concurrency proof, sequential revision checks, stale PUT/DELETE conflict/current-cart proof, legacy-cart isolation, Redis-unavailable proof, and fail-closed PostgreSQL storage behavior. ST-06 additionally requires exact 1192-cent totals, half-up tax, promotion/tip boundary checks, real-PostgreSQL complete snapshot roundtrip, catalog-mutation immutability, owner-scoped list/read, pagination, generic foreign/missing 404, and proof that legacy incomplete rows are not exposed as fabricated C5 receipts. ST-07 additionally requires same-key concurrency proof, changed-body conflict proof, different-key/same-revision serialization, injected transaction rollback at multiple write boundaries, exact stored-receipt replay after a simulated lost response, scoped gateway header forwarding, and fail-closed PostgreSQL behavior.

GitHub Actions is the authoritative shared validation record. The PR must not be merged with required CI failures.

## Historical assessment

The initial repository assessment remains under [`docs/audit-2026-10-04`](audit-2026-10-04/). It is historical evidence, not a description of the post-ST-01 through ST-07 architecture. The local graph report remains at [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md).
