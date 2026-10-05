# ST-06: deterministic quotes and immutable receipts

ST-06 implements the C5 pricing and receipt boundary for the mock checkout flow. It does not make checkout atomic or idempotent. ST-07 owns that transaction boundary.

## Why this exists

A receipt must describe the order that was accepted at that moment. It must not be rebuilt from today's menu, current delivery fee, or a later profile/address value.

Before ST-06, the backend still had a legacy pricing path and legacy order rows with only cart items and a subtotal. That representation cannot prove a complete historical receipt. ST-06 therefore adds a separate immutable receipt store instead of guessing missing legacy fields.

## C5 source of truth

The C5 implementation lives in:

- `backend/app/pricing.py` for deterministic `mock-v1` pricing, catalog fingerprints, canonical receipt lines, and snapshot construction.
- `backend/app/models.py` for strict quote, checkout, totals, and immutable receipt schemas.
- `backend/app/store.py` for owner-scoped immutable receipt persistence and reads.
- `backend/app/main.py` for the quote and receipt HTTP contracts.
- `backend/migrations/005_order_snapshots.sql` for additive PostgreSQL storage.
- `backend/tests/test_receipts.py` for C5 money, storage, immutability, ownership, pagination, and compatibility proof.
- `tests/fixtures/contracts/c5.json` for the shared synthetic C5 contract fixture.

## Quote API

`POST /v1/checkout/quote` requires the verified guest cookie and an allowed Origin.

Request:

```json
{
  "expected_revision": 1,
  "tip_cents": 200,
  "promotion_code": "DEMO5"
}
```

`expected_revision` is a strict non-negative integer. `tip_cents` is a strict integer from 0 through 10000. The only accepted promotion code is `DEMO5`; omitting the field means no promotion.

Successful response:

```json
{
  "schema_version": 1,
  "cart_revision": 1,
  "catalog_fingerprint": "<sha256>",
  "totals": {
    "subtotal_cents": 1000,
    "discount_cents": 500,
    "delivery_fee_cents": 199,
    "service_fee_cents": 249,
    "tax_cents": 44,
    "tip_cents": 200,
    "total_cents": 1192
  }
}
```

The quote reads the current C4 cart and the C3 catalog inside one PostgreSQL transaction. It never submits an order and never clears or increments the cart.

### Quote failures

- stale `expected_revision` -> HTTP 409 `cart_conflict` with `current_cart`.
- an empty cart -> HTTP 422 `invalid_checkout` with `cart` in `fields`.
- malformed tip/promotion input -> HTTP 422 `invalid_checkout`.
- a saved cart that no longer validates against the canonical catalog -> HTTP 409 `catalog_changed`.
- required PostgreSQL pricing storage unavailable -> HTTP 503 `storage_unavailable`.
- malformed authoritative catalog -> HTTP 503 `catalog_unavailable`.

No failure writes an order or changes the cart.

## Deterministic `mock-v1` money rules

C5 uses integer cents only.

For each line:

```text
unit = canonical item price + selected canonical option deltas
line subtotal = unit * quantity
subtotal = sum(line subtotals)
```

Promotion policy:

```text
DEMO5 discount = min(500, subtotal)
no code = 0
any other code = rejected
```

For a non-empty cart:

```text
delivery fee = canonical restaurant delivery fee
service fee = 249
```

Tax uses integer half-up rounding:

```text
taxable = subtotal - discount
tax = round_half_up(taxable * 875 / 10000)
```

The implementation is integer arithmetic, not Python's `round()`. The boundary fixture proves that 40 taxable cents produces 4 cents of tax.

Final total:

```text
total = subtotal - discount + delivery fee + service fee + tax + tip
```

The shared C5 fixture is exactly 1192 cents.

## Catalog fingerprint

The quote returns a SHA-256 fingerprint of the canonical priced basket plus the `mock-v1` fee/promotion policy. The fingerprint is deterministic for the same canonical quote inputs.

ST-07 must revalidate the cart revision and fingerprint while holding the checkout/cart lock before accepting an order. A quote alone is not approval to submit a changed basket or changed catalog.

## Immutable receipt shape

A C5 receipt contains:

- schema version.
- immutable order ID.
- status `Placed` with mock/demo meaning only.
- creation timestamp.
- canonical item names, unit prices, quantities, line totals, instructions.
- canonical modifier group/option labels and price deltas.
- the complete selected checkout details.
- all monetary totals.
- `pricing_version: "mock-v1"`.

Checkout details are strict and bounded:

- `name`: 1-100 characters.
- `phone`: 1-30 characters and synthetic demo data only.
- `email`: valid basic shape and at most 254 characters.
- `street`: 1-200 characters.
- `apartment`: optional, at most 50 characters.
- `city`: 1-100 characters.
- `state`: exactly two uppercase letters.
- `postal_code`: `12345` or `12345-6789`.
- `delivery_instructions`: optional, at most 500 characters.
- `payment_method`: exactly `mock`.
- `tip_cents`: strict integer 0-10000.

The receipt response never contains `owner_id`, session IDs, secrets, or raw payment-card data.

## Storage and legacy compatibility

Migration `005_order_snapshots.sql` creates `guest_orders`:

- UUID `id` primary key.
- verified `owner_id` foreign key to `guest_sessions`.
- immutable JSONB `snapshot`.
- `created_at`.
- owner/newest-first index on `(owner_id, created_at DESC, id DESC)`.

This table is intentionally separate from legacy `orders(session_id, cart_items, subtotal_cents)`.

Legacy rows are retained as historical incomplete data. They are not copied into `guest_orders`, not returned through the C5 receipt read API, and never completed using today's catalog, address, tip, or owner assumptions.

The persistence helper `insert_order_snapshot()` is transaction-friendly so ST-07 can insert the snapshot in the same transaction that records idempotency and clears the cart.

## Receipt reads

`GET /v1/orders` returns only immutable receipts owned by the verified guest. Results are newest first and bounded to at most 50 rows.

Optional query parameters:

```text
limit=1..50
cursor=<last receipt UUID from the previous page>
```

The browser gateway at `GET /api/orderly/orders` forwards only `limit` and `cursor` to the versioned backend. Ownership still comes exclusively from the verified guest cookie. List parameters are not forwarded on order submissions or individual receipt reads; backend validation enforces the page-size and cursor bounds.

The cursor is resolved only inside the current guest's ownership scope. A missing, malformed, or foreign cursor is not used to expose another guest's position.

`GET /v1/orders/{id}` returns exactly one immutable receipt owned by the current guest. A nonexistent or foreign receipt returns the same HTTP 404 `order_not_found` response.

## Immutability guarantee

Receipt reads deserialize the stored JSONB snapshot directly. They do not join to menu tables or recalculate money.

The PostgreSQL integration test stores a complete synthetic receipt, then changes the current menu item name, price, modifier group label, option label, and option price. The later receipt read must remain equal to the stored snapshot, including totals and checkout details.

## Deployment and migration

Safe order:

1. Apply migrations with `python backend/scripts/migrate.py`.
2. Deploy the ST-06 backend.
3. Verify quote money boundaries and owner-scoped receipt reads.
4. Keep the legacy `orders` table isolated. Do not backfill it into C5.
5. Allow ST-07 to adopt `insert_order_snapshot()` only when atomic checkout/idempotency is ready.

The migration is additive. Existing legacy rows are not modified.

## Rollback

If ST-06 application behavior must be rolled back:

1. stop new C5 snapshot writes before changing application versions.
2. keep `guest_orders` and accepted snapshots intact.
3. roll application code back only to a version that does not mutate or reinterpret the snapshot rows.
4. never reconstruct a stored receipt from current catalog/profile data.
5. never destructively backfill or delete legacy orders as part of rollback.

The additive table may remain unused during an application rollback. Preserving accepted snapshots is safer than attempting schema reversal.

## Verification

Focused backend coverage proves:

- exact 1192-cent fixture totals.
- half-up tax boundary (`40 -> 4`).
- promotion cap and invalid-code behavior.
- strict zero/negative/fraction/out-of-range tip behavior.
- stale revision conflict and empty-cart quote rejection.
- complete PostgreSQL receipt roundtrip.
- unchanged receipt after catalog mutation.
- guest ownership isolation and generic foreign/missing 404.
- newest-first bounded pagination and owner-scoped cursor behavior.
- legacy incomplete orders are preserved but not exposed as fabricated C5 receipts.

The shared GitHub Actions workflow also runs the frontend contract suite, frontend unit/type/build checks, full backend suite, Chromium runtime check, product E2E, and baseline evidence job.

## Deferred boundaries

ST-06 deliberately does not implement:

- atomic order creation plus cart clear.
- idempotency keys or replay behavior.
- unknown-outcome recovery after connection loss.
- frontend checkout submission state.
- frontend receipt/history integration.
- production readiness/retention scheduling.

Those belong to ST-07, ST-09, and ST-11 as defined in `development.md`.
