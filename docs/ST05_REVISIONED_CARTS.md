# ST-05 revisioned cart authority

ST-05 implements contract C4: a guest basket is durable PostgreSQL state with an explicit revision. A stale tab cannot silently overwrite a newer basket, and a PostgreSQL failure cannot switch cart authority to Redis or JSON.

## Why this exists

Before ST-05, `/v1/cart` could read or write different stores depending on runtime availability: Redis first, then PostgreSQL, then a JSON file. Those stores were independent copies. A Redis outage could expose a different cart, and an old browser tab could overwrite a newer cart without detection.

C4 fixes both problems:

- PostgreSQL is the only API cart authority.
- Every accepted mutation increments an owner-scoped revision exactly once.
- Every mutation supplies the revision it expects to replace.
- A stale revision returns HTTP 409 with the current accepted cart.
- Storage failure returns a typed HTTP 503. There is no fallback success.

## Architecture

The route/service/repository flow is:

```text
/v1/cart route
    -> cart_service.py
        -> store.py guest-cart repository helpers
            -> PostgreSQL guest_carts
```

The route handles HTTP validation, origin enforcement, and response/error mapping. `cart_service.py` owns compare-and-swap behavior. `store.py` owns SQL and canonical JSONB serialization.

Catalog validation still uses the ST-04 canonical catalog. A PUT loads the catalog through the same PostgreSQL transaction, validates all lines, rebuilds accepted lines with canonical names and prices, and only then updates the cart row.

Redis is not imported by `cart_service.py` and is not read or written by the C4 API path. Existing Redis helpers remain for legacy cleanup and health behavior only.

## Database contract

Migration `backend/migrations/004_guest_carts.sql` adds:

```text
guest_carts
- owner_id TEXT PRIMARY KEY -> guest_sessions(id) ON DELETE CASCADE
- revision BIGINT NOT NULL DEFAULT 0 CHECK revision >= 0
- items JSONB NOT NULL DEFAULT [] CHECK items is an array
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

`guest_carts` is intentionally separate from the legacy `carts(session_id)` table. Browser-era cart rows are not adopted into verified guest ownership. This avoids assigning stale or caller-chosen session data to a server-issued guest.

For a verified guest with no row, the service atomically establishes an empty revision-0 row. GET may establish that row, but GET never changes the revision.

## HTTP contract

All routes derive `owner_id` from the verified C1 guest cookie. The browser never submits an owner ID.

### GET `/v1/cart`

Response:

```json
{
  "schema_version": 1,
  "revision": 0,
  "items": []
}
```

A repeated GET returns the same revision unless an accepted mutation occurred.

### PUT `/v1/cart`

Request:

```json
{
  "expected_revision": 0,
  "items": [
    {
      "id": "line-1",
      "restaurant_id": "restaurant-1",
      "menu_item_id": "item-1",
      "quantity": 1,
      "modifiers": [
        {
          "group_id": "size",
          "option_ids": ["small"]
        }
      ],
      "special_instructions": "No onions"
    }
  ]
}
```

The client does not submit item names or prices. Those fields are output-only and are reconstructed from the C3 canonical catalog.

`expected_revision` is a strict non-negative integer. The request supports at most 50 lines; line quantities remain strict integers from 1 through 10; special instructions remain bounded to 500 characters.

Accepted PUT behavior:

1. Establish the owner cart row if absent.
2. Lock the row with `SELECT ... FOR UPDATE`.
3. Compare the stored revision with `expected_revision`.
4. Load one coherent canonical catalog snapshot in the transaction.
5. Validate the entire basket before any cart update.
6. Replace the complete basket atomically.
7. Increment revision exactly once.
8. Return canonical names/prices and the new revision.

### DELETE `/v1/cart`

DELETE uses a JSON body:

```json
{
  "expected_revision": 3
}
```

It uses the same row lock and revision check as PUT. An accepted clear stores an empty item array and increments the revision exactly once. The row is retained so revision history cannot silently reset to zero.

## Conflict behavior

If the submitted revision is stale, no cart data is changed. The response is:

```json
{
  "error": {
    "code": "cart_conflict",
    "message": "Basket changed in another tab",
    "request_id": "...",
    "fields": []
  },
  "current_cart": {
    "schema_version": 1,
    "revision": 2,
    "items": []
  }
}
```

A lost-response retry is therefore safe: if the first write committed, replaying the old expected revision gets a 409 and the current accepted cart instead of applying the mutation twice.

## Other failures

- `422 invalid_cart`: canonical restaurant/item/modifier selection is invalid. No cart update occurs.
- `503 storage_unavailable`: PostgreSQL cart storage is not configured or cannot complete the operation. Redis and JSON are not attempted.
- `503 catalog_unavailable`: authoritative catalog data is malformed or unavailable during validation.
- `401 session_required`, `session_invalid`, or `session_expired`: the C1 guest ownership boundary failed.
- `403 origin_forbidden`: an unsafe mutation came from an unapproved Origin.

All API errors retain the shared request ID envelope. Conflict additionally exposes `current_cart` at the top level as required by C4.

## Concurrency

The owner row is the serialization point. Two writes that both submit revision 0 cannot both succeed:

- one transaction locks revision 0 and commits revision 1;
- the second transaction observes revision 1 after the lock is available;
- the second returns 409 with revision 1 and never overwrites the winner.

There is no per-line partial update. The whole basket is one atomic document for C4.

## Store authority and failure recovery

Production/API mode requires PostgreSQL for C4. Redis availability does not affect cart reads or writes. `ORDERLY_FORCE_JSON_STORE` does not make JSON a C4 fallback.

If PostgreSQL becomes unavailable, callers receive `storage_unavailable`. After PostgreSQL recovers, the same persisted cart/revision is read again. No alternate copy is promoted or merged.

Legacy `carts` rows remain offline. They may still exist for pre-C4 compatibility paths, but `/v1/cart` never reads or adopts them.

## Migration and rollback

The migration is additive and does not rewrite or delete the legacy `carts` table.

Safe deploy order:

1. Apply migrations through `backend/scripts/migrate.py`.
2. Deploy ST-05 backend code.
3. Verify C4 GET, PUT, DELETE, conflict, and PostgreSQL-failure behavior.
4. Keep Redis/JSON legacy data isolated rather than attempting automatic reconciliation.

Application rollback can revert the ST-05 code while leaving `guest_carts` in place. The table contains only ST-05 guest-cart data and can remain unused. Do not backfill it from Redis or legacy JSON/carts as part of rollback.

A production rollback that would intentionally return to pre-C4 cart authority must first quiesce cart writes. Otherwise accepted C4 revisions could be replaced by stale legacy state.

## Verification

`backend/tests/test_carts.py` covers:

- strict expected-revision validation;
- client rejection of submitted labels/prices;
- initial revision 0 and stable GETs;
- canonical output persistence;
- sequential PUT/DELETE revision increments;
- stale PUT and DELETE conflicts;
- two real concurrent PostgreSQL writes with the same revision;
- invalid-catalog rollback;
- legacy-cart isolation;
- Redis-unavailable behavior;
- storage-unavailable fail-closed behavior;
- HTTP conflict/current-cart behavior.

C1 guest isolation and C3 catalog tests remain active against the C4 boundary. `tests/fixtures/contracts/c4.json` is the executable positive/negative contract fixture.

Shared GitHub Actions must pass the frontend contracts/tests/typecheck/build, PostgreSQL backend suite and migrations, Chromium runtime, product E2E, and baseline evidence before merge.

## Deliberately deferred work

ST-05 does not pull later contracts forward:

- ST-06 owns immutable quote/receipt pricing snapshots.
- ST-07 owns atomic idempotent order creation and cart consumption. The legacy order endpoint is not redefined here.
- ST-08 owns the typed frontend C4 adapter, serialized browser mutations, and two-tab conflict UI.
- ST-09 owns checkout failure/uncertain-state recovery.

Until ST-08, existing frontend code can still use its legacy/local cart presentation behavior. That compatibility does not change C4 server authority.
