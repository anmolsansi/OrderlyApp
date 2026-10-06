# ST-07 atomic idempotent checkout

ST-07 freezes contract C6: an accepted checkout is one PostgreSQL commit that creates an immutable C5 receipt, records the guest-scoped idempotency key, and consumes the C4 cart exactly once.

## Why this exists

Checkout can fail from the caller's point of view after the server has already committed. A retry must therefore be safe. Creating a second order, clearing the cart twice, or rebuilding a receipt from current catalog data would make an unknown network outcome destructive.

C6 uses PostgreSQL as the only correctness authority. It does not use Redis, JSON, a queue, or an alternate success path.

## Public contract

`POST /v1/orders`

Required header:

```text
Idempotency-Key: <UUID>
```

The key is bounded to 64 characters and normalized to the canonical UUID string before storage. It is scoped to the verified C1 guest owner, not globally.

Body:

```json
{
  "expected_revision": 1,
  "catalog_fingerprint": "<64-character sha256>",
  "checkout": {
    "name": "Demo Visitor",
    "phone": "+1-555-0100",
    "email": "demo@example.test",
    "street": "100 Demo Street",
    "apartment": "5A",
    "city": "Demo City",
    "state": "CA",
    "postal_code": "94105",
    "delivery_instructions": "Synthetic fixture only",
    "payment_method": "mock",
    "tip_cents": 200
  },
  "promotion_code": "DEMO5"
}
```

Success behavior:

- First accepted key/body: HTTP 201 with the complete immutable C5 receipt.
- Exact replay for the same owner, key, and validated body: HTTP 200 with the exact stored receipt and the same order ID.
- Replay lookup happens before empty-cart validation. This is required because the first successful request has already consumed the cart.

Stable failures:

| Condition | Status | Code |
|---|---:|---|
| Same owner/key with a different canonical body | 409 | `idempotency_conflict` |
| Stale `expected_revision` | 409 | `cart_conflict` |
| Catalog/pricing fingerprint changed | 409 | `catalog_changed` |
| Invalid checkout body or key | 422 | `invalid_checkout` |
| Required PostgreSQL path unavailable | 503 | `storage_unavailable` |

## Canonical request digest

`backend/app/order_service.py` hashes only the validated C6 request body. Pydantic first removes invalid shapes and normalizes the catalog fingerprint to lowercase. The service then serializes the validated model with sorted JSON keys, fixed separators, explicit `null` values, and UTF-8 before taking SHA-256.

This means JSON object key order does not change the digest. A changed checkout field, revision, fingerprint, promotion code, or other validated request value does change it.

The idempotency key itself is not part of the body digest because it is the lookup key. Guest ownership is also not caller data. It comes only from the verified C1 session.

## Transaction sequence

All new-order work in `submit_order()` uses one database connection and one PostgreSQL transaction:

1. Require PostgreSQL. There is no fallback checkout store.
2. Normalize the UUID idempotency key and hash the validated body.
3. Look up `(owner_id, idempotency_key)` before reading the cart. If it exists, compare the digest and either replay the stored receipt or return `idempotency_conflict`.
4. Lock the verified guest's `guest_carts` row with `FOR UPDATE`.
5. Re-read the idempotency ledger. A concurrent same-key request may have been waiting on the cart lock while the first transaction committed.
6. Compare `expected_revision` with the locked cart revision.
7. Reject an empty cart for a genuinely new submission.
8. Load the canonical C3 catalog through the same transaction connection and revalidate the entire current cart.
9. Recompute the C5 catalog/pricing fingerprint and compare it with the submitted quote fingerprint.
10. Build the complete immutable C5 `mock-v1` receipt.
11. Insert the receipt into `guest_orders`.
12. Insert the `(owner_id, idempotency_key, payload_sha256, order_id)` ledger row.
13. Clear the cart and increment its revision by one.
14. Commit once.

Any exception before step 14 rolls back the receipt, idempotency row, and cart mutation together.

## Concurrency guarantees

The C4 cart row is the serialization boundary for new checkouts from one guest.

Two simultaneous requests with the same owner/key/body can both initially see no ledger row. One obtains the cart lock first and commits. The other obtains the lock afterward, performs the required second ledger lookup, and replays the stored receipt. Only one order and one key row exist.

Two different keys submitted against the same expected cart revision also serialize on the cart row. One can commit. The other then sees the incremented cart revision and returns `cart_conflict` without creating a second order or key row.

## Persistence

Migration `backend/migrations/006_order_idempotency.sql` adds `order_idempotency`:

```text
owner_id          -> guest_sessions(id)
idempotency_key   -> normalized UUID text, <=64 chars
payload_sha256    -> lowercase 64-character SHA-256
order_id           -> guest_orders(id)
created_at         -> timestamptz
primary key        -> (owner_id, idempotency_key)
```

The composite primary key is the database-level at-most-once guard for one guest/key. The order foreign key prevents a committed ledger record from referring to a nonexistent receipt.

`backend/app/store.py` exposes only parameterized persistence primitives. Replay receipt reads can use the caller's transaction connection, so checkout does not open a second transaction while deciding an idempotency result.

## Gateway behavior

The browser still calls the same-origin `/api/orderly` gateway. ST-07 extends its request-header allowlist narrowly: `Idempotency-Key` is forwarded only for `POST /api/orderly/orders`. It is not forwarded on cart or unrelated routes. Existing spoofable owner/identity headers remain dropped.

Direct backend CORS also allows `Idempotency-Key` for approved development origins.

## Privacy and logging

C6 does not log checkout contact/address values or the idempotency key. The database stores checkout details only inside the accepted immutable receipt, as required by C5. The ledger stores only owner ID, key, request digest, order ID, and timestamp.

The owner ID never comes from a request body/header. It is derived from the verified guest cookie.

## Verification

Primary tests live in `backend/tests/test_checkout.py`. They cover:

- strict request and UUID key validation;
- canonical request hashing;
- 201 first commit and byte-equivalent 200 replay;
- same key with changed body;
- same key reused by a different guest;
- simultaneous identical requests producing one order;
- different keys at one cart revision producing one commit and one conflict;
- injected failures before receipt insertion, between receipt and ledger insertion, and before cart clear;
- unknown-outcome/lost-response replay;
- stale revision, changed catalog fingerprint, and empty-cart rejection;
- missing/malformed idempotency headers;
- fail-closed behavior without PostgreSQL.

`tests/gateway.test.ts` proves the scoped gateway header forwarding. C6 fixture checks are in `tests/fixtures/contracts/c6.json` plus the shared TypeScript/Python contract suites.

The repository CI runs contract tests, frontend tests, typecheck, production build, PostgreSQL migrations/backend tests, Chromium runtime proof, and product E2E. GitHub Actions is the shared merge gate.

## Migration and rollback

Migration 006 is additive and forward-only, matching the repository migration convention. Do not delete accepted `guest_orders` or `order_idempotency` rows during an application rollback because those records are required to resolve client retries safely.

If atomicity, uniqueness, or replay evidence fails in production, disable C6 checkout writes. Keep receipt reads available and preserve the ledger. Do not restore the legacy non-idempotent submit path as an outage fallback, and do not tell a client to invent a fresh idempotency key for an unresolved prior attempt.

## ST-09 handoff

ST-07 provides the server contract and gateway transport only. ST-09 still owns the browser checkout client and UI recovery flow. That consumer must:

- generate one UUID key for a logical submit attempt;
- keep the same key and exact body while the outcome is unknown;
- use the C5 quote revision/fingerprint in the C6 body;
- treat 201 and 200 as the same successful order outcome;
- surface `cart_conflict`, `catalog_changed`, `idempotency_conflict`, validation, and storage errors explicitly;
- never silently create a replacement key after a timeout when the original outcome is unknown.

## Follow-up acceptance

Current PostgreSQL tests inject an exception after each receipt, idempotency and cart SQL write. Every failure leaves both tables empty and the exact previously accepted basket unchanged. Replay after a menu edit and a newer basket returns the original receipt without clearing that new basket. Browser consumers keep 5xx and malformed accepted responses uncertain: a storage error may hide a committed transaction, so recover with the original key/body.
