# OrderlyApp repository context — updated 2026-10-04

This file describes the current stabilization architecture. The canonical implementation order and slice contracts live in [`development.md`](../development.md).

## Product and maturity

OrderlyApp is a portfolio voice-assisted food-ordering marketplace with mock checkout. The application is still in stabilization. It is not ready for real customer orders or payments.

ST-01 established reproducible baseline contracts and CI. ST-02 moved cart/order ownership to a private server-issued guest session. ST-03 replaced local password/account simulation with a browser-only demo profile that has no ownership authority. ST-04 made the backend catalog authoritative. ST-05 made `/v1/cart` a PostgreSQL-only, owner-scoped, revisioned compare-and-swap resource. ST-06 added deterministic `mock-v1` quotes and immutable receipt snapshots. ST-07 made C6 checkout atomic and idempotent. ST-08 now cuts discovery, menu customization, and basket review over to typed C3/C4 browser adapters with honest error states, revision-aware conflict recovery, and an explicitly selected isolated `local_demo` preview. ST-09 still owns real C5/C6 checkout browser integration and recovery.

## Current architecture

| Area | Source | Current behavior |
|---|---|---|
| Frontend | `app/**` | Next.js marketplace UI. Home, discovery, menu, customization, and cart use the ST-08 C7 adapter. Checkout/order-history browser cutover remains ST-09. |
| Same-origin API gateway | `app/api/orderly/[...path]/route.ts` | Fixed upstream, explicit path/method allowlist, origin checks, 64 KiB body cap, timeout, safe header/cookie forwarding. C6 `Idempotency-Key` forwards only on order POST. |
| Browser API client | `lib/api.ts` | Typed C7 catalog/cart results, strict C3/C4 normalization, abortable reads, serialized C4 writes, explicit `api|local_demo` selection, and no API-error-to-fixture fallback. Legacy order exports remain only as ST-09 compatibility. |
| Cart helpers | `lib/cart.ts` | Catalog-source-aware validation/pricing helpers plus separate local-preview, API-draft, and temporary accepted-cart mirror namespaces. Browser storage never becomes C4 API authority. |
| Marketplace helpers | `lib/marketplace.ts` | Discovery/filter/sort/default-modifier behavior accepts an explicit catalog source. Legacy one/two-argument lookup overloads remain for ST-09-owned screens only. |
| Demo profile | `lib/auth.ts`, sign-in/account pages | Password-free C2 presentation profile and fixed synthetic addresses in versioned local storage. Never server authentication. |
| API | `backend/app/main.py` | Public catalog plus versioned `/v1` guest session, revisioned cart, C5 quote, atomic C6 order submit, and immutable receipt read. |
| Cart service | `backend/app/cart_service.py` | C4 PostgreSQL boundary with row lock/CAS revision checks, whole-cart atomic mutation, typed conflict/validation/storage failures. |
| Order service | `backend/app/order_service.py` | C6 strict UUID idempotency key, canonical validated-body SHA-256, pre-lock/post-lock replay checks, quote revalidation, receipt/key/cart single transaction. |
| Canonical catalog | `backend/app/catalog.py`, `backend/app/store.py` | Coherent snapshots with explicit availability/modifier rules and canonical item/option pricing. C4/C6 reuse C3 validation. |
| Pricing/receipt domain | `backend/app/pricing.py` | Deterministic integer `mock-v1` quote rules, half-up tax, promotion policy, catalog fingerprint, canonical receipt lines, immutable snapshots. |
| Guest identity | `backend/app/identity.py` | Opaque HMAC-signed token, hashed token lookup, 30-day expiry, reset/revocation/cleanup, exact-origin enforcement. |
| Persistence | `backend/app/store.py`, `database.py` | PostgreSQL is API-mode catalog, C4 cart, C5 receipt, and C6 checkout authority. Redis/JSON are not C4/C5/C6 API fallbacks. |
| Contract fixtures | `tests/fixtures/contracts/*.json` | C1 frozen ST-02, C2 ST-03, C3 ST-04, C4 ST-05, C5 ST-06, C6 ST-07, and C7 extended/frozen by ST-08. |
| Browser tests | `e2e/orderly.spec.ts`, `e2e/catalog-cart.spec.ts` | Existing ownership/checkout regression flow plus ST-08 canonical browse/customize/cart/reload/failure/conflict coverage. Explicit local preview has a dedicated environment-gated proof. |
| CI | `.github/workflows/ci.yml` | Node 22, npm 11.20.0, Python 3.12, Postgres-backed backend/E2E, Chromium proof, evidence upload. |

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

The current checkout page still uses temporary presentation-profile adapters until ST-09/ST-10 migrate that consumer. See [`docs/ST03_DEMO_PROFILES.md`](ST03_DEMO_PROFILES.md).

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

C6 requires a UUID `Idempotency-Key`, strict body, quoted cart revision, and C5 fingerprint. A new request locks the C4 cart, rechecks the idempotency ledger, revalidates C3/C5 inputs, writes one immutable receipt plus the guest-scoped idempotency record, and clears/revisions the cart in one PostgreSQL transaction.

Exact owner/key/body replay returns the stored receipt. Reusing the key with a different body returns `idempotency_conflict`. Different keys against one stale cart revision serialize on the cart row.

See [`docs/ST07_ATOMIC_CHECKOUT.md`](ST07_ATOMIC_CHECKOUT.md).

## ST-08 typed web adapter boundary

C7 is now the browser boundary for discovery, customization, and basket state.

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

### Temporary ST-09 compatibility

`orderlyapp.marketplace.cart.v1` remains as a temporary accepted-cart mirror because the ST-09-owned checkout page still reads the older shape. ST-08 never reads that mirror as API authority. It is updated only after an accepted C4 response.

Legacy `getRestaurant(id)` / `getMenuItem(restaurantId,itemId)` overloads likewise remain for ST-09-owned checkout/history consumers. ST-08 code always passes the selected catalog explicitly.

See [`docs/ST08_WEB_ADAPTER.md`](ST08_WEB_ADAPTER.md) for detailed mappings, state transitions, storage namespaces, tests, and rollback.

## Known intentional limitations after ST-08

- Checkout UI still does not use the C5 quote plus C6 idempotent submit contract. ST-09 owns browser idempotency-key generation/persistence, quote/revision/fingerprint handling, uncertain-submit recovery, and receipt-based confirmation/history.
- A temporary accepted-cart local-storage mirror and legacy catalog lookup overloads remain only to avoid breaking ST-09-owned screens before their cutover. They are not ST-08 API authority.
- The explicit `local_demo` browser proof is environment-gated because ST-12 owns CI/deployment configuration. API-mode CI remains the shared default.
- Checkout still consumes temporary C2 presentation-profile adapters. ST-09/ST-10 own the remaining integration.
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
```

`ORDERLY_SESSION_SECRET` must never be committed. A secret rotation invalidates existing guest cookies.

For an explicit isolated browser preview:

```text
NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo
```

That browser mode must remain labelled and must not be used as outage recovery.

## Validation expectations

Before merging a stabilization slice, run the applicable contract, frontend, backend, typecheck/build, and E2E suites. GitHub Actions is the authoritative shared record.

ST-08 specifically requires proof that:

- C3 restaurant/menu prices, defaults, availability, and delivery fee are mapped canonically.
- C4 writes include `expected_revision` and omit client-owned labels/prices.
- malformed success payloads fail closed.
- API errors do not return fixture success.
- obsolete reads can be aborted/suppressed.
- same-tab cart writes are serialized.
- failed/stale writes keep the last accepted basket visible.
- 409 uses server `current_cart` and explicit review/reapply.
- explicit local preview uses its isolated basket namespace, persists across reload, makes zero `/api/orderly` requests for ST-08 flows, and exposes no checkout entry.

The PR must not merge with required CI failures.

## Historical assessment

The initial repository assessment remains under [`docs/audit-2026-10-04`](audit-2026-10-04/). It is historical evidence, not a description of the post-ST-01 through ST-08 architecture. The local graph report remains at [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md).
