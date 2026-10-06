# ST-09 — Truthful checkout, receipt, and history recovery

## What changed

ST-09 completes the browser cutover to the existing C2/C4/C5/C6/C7 contracts.

The browser now treats these server resources as authoritative:

- C4 revisioned cart for accepted basket state.
- C5 quote for all displayed checkout totals and the catalog fingerprint.
- C6 idempotent order submission for order creation.
- C5 immutable receipt snapshots for confirmation and history.
- C2 local demo profile and synthetic addresses only as checkout presentation/input data.

The browser no longer turns a failed order API call into a locally invented successful order.

## Checkout state model

Checkout has five explicit states:

- `idle` — editable checkout with no request in flight.
- `submitting` — one immutable C6 request is in flight and duplicate submission is disabled.
- `uncertain` — the browser lost the transport result after sending the request. The original request is locked and only an exact replay is allowed.
- `accepted` — a valid 200/201 immutable receipt was returned by the server.
- `rejected` — the server returned a definitive failure, or local validation/storage failed before an order could be accepted.

An HTTP 4xx/5xx response is definitive. It is not `uncertain`. Only transport failure or timeout after the POST was sent creates the uncertain state.

## Idempotency and recovery

Before the browser sends `POST /api/orderly/orders`, it creates exactly one UUID idempotency key and one immutable C6 body:

```text
{
  expectedRevision,
  catalogFingerprint,
  checkout,
  promotionCode
}
```

The browser stores this unresolved request in versioned `sessionStorage` under:

```text
orderlyapp.marketplace.checkoutRecovery.v1
```

The stored record contains only:

```text
{
  schemaVersion: 1,
  idempotencyKey,
  submission
}
```

The write happens before the POST. If required recovery storage cannot be written, checkout fails closed and no order request is sent.

When the POST result is lost, the UI enters `uncertain`. Address, tip, basket edits, and a new checkout submission are locked. The retry action sends the exact persisted key and body again. C6 then returns the original durable receipt with HTTP 200 if the first request already committed.

A new idempotency key is generated only after the previous attempt has a definitive result.

## Basket behavior

Checkout reads the accepted C4 cart and its revision directly from the API. The old `orderlyapp.marketplace.cart.v1` local mirror is not checkout authority.

Quantity and clear actions use the C4 revision contract. A conflict displays the current accepted server cart rather than silently overwriting it.

The browser clears no basket after an API error. C6 clears the durable server cart atomically only when the order is committed. After an accepted receipt, checkout re-reads C4 before navigating to confirmation.

## Quote behavior

Checkout calls:

```text
POST /api/orderly/checkout/quote
```

with the accepted cart revision, selected tip, and the mock `DEMO5` promotion.

The UI renders subtotal, discount, delivery fee, service fee, tax, tip, and total from the C5 quote only. It does not recalculate a replacement total from browser fixtures when the quote fails.

A changed cart revision invalidates the old quote and requests a new one.

## Demo profile and address behavior

C2 remains presentation-only. A demo profile never determines backend guest ownership.

Checkout loads the validated C2 synthetic address list and profile. The profile's default address is applied only before the customer deliberately edits or selects another address.

Selecting another synthetic address is explicit. Manual address edits become an `Edited address` selection.

If an unresolved C6 recovery record exists, its persisted checkout body wins over later profile/address loading so a retry cannot silently mutate the original request.

The accepted immutable receipt stores the exact selected address and tip. Confirmation renders those saved values after reload rather than reconstructing them from the current profile or catalog.

## Confirmation behavior

`/order-confirmation?orderId=<id>` requests only:

```text
GET /api/orderly/orders/{orderId}
```

for the current backend guest session.

There is no local latest-order fallback. An unknown ID renders `Order not found`; it can never display another receipt.

The screen renders immutable receipt item snapshots, modifier labels, checkout/address values, totals, status, and creation time. It does not infer historical receipt totals or progress from current fixtures.

## History behavior

`/orders` requests the backend guest-scoped receipt list only:

```text
GET /api/orderly/orders
```

It has explicit loading, error, empty, and success states. It does not use the presentation demo profile as authorization and does not fall back to local order history.

## `local_demo` boundary

`NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo` remains a fixture preview only.

Direct visits to:

- `/checkout`
- `/order-confirmation`
- `/orders`

render an unavailable-in-fixture-preview state. These routes do not bootstrap a guest session, call order APIs, create receipts, or claim successful checkout.

## Failure behavior

### Transport loss after order POST

- Keep the exact recovery record.
- Keep the UI in `uncertain`.
- Do not clear the basket locally.
- Do not display accepted confirmation.
- Retry only the same key/body.

### 409 cart conflict

- Treat the attempt as definitively rejected.
- Clear the resolved recovery record.
- Use `currentCart` when provided, otherwise re-read C4.
- Request a new quote before another submission.

### 409 catalog changed

- Treat the attempt as definitively rejected.
- Re-read C4 and refresh the C5 quote.
- Require a new deliberate submission and a new idempotency key.

### Definitive 4xx rejection

- Treat the attempt as rejected.
- Keep the basket.
- Clear the resolved recovery record.
- Show the server error.
- Never manufacture an order or receipt.

### 5xx server failure or malformed 2xx response

The response does not prove whether the transaction committed. Preserve the original key/body and stay uncertain, with same-key retry. This also covers a storage error caused by losing a database commit acknowledgement. A malformed receipt is `invalid_response`; never invent a replacement or unlock a fresh key.

Exact receipt reads also verify the response ID matches the requested UUID. A different receipt is an invalid response, never an acceptable substitute. C7 errors retain HTTP `status` for distinguishing definitive rejection from ambiguous server results.

## Verification

ST-09 adds or updates:

- `tests/api.test.ts` for C5/C6 normalization, exact order reads, guest-scoped lists, local-demo guards, and recovery storage.
- `tests/fixtures/contracts/c7.json` to freeze the browser quote/submission/receipt/recovery extension.
- `tests/fixtures-checkout.test.ts` for both synthetic C2 address inputs.
- `e2e/orderly.spec.ts` so the existing product checkout harness speaks C5/C6.
- `e2e/checkout-recovery.spec.ts` for real API/Postgres lost-response replay, definitive 422 and ambiguous 5xx behavior, exact-ID not-found behavior, guest-history isolation, address persistence, and local-demo route guards.

The real E2E lost-response test lets the first C6 POST reach the backend, captures its 201 receipt, then intentionally aborts that response before the browser receives it. The browser must enter `uncertain`; retry must send the identical idempotency key and body and receive the same durable receipt as a C6 replay.

## Operational notes

No database migration, new service, new dependency, new queue, or public backend contract is introduced by ST-09.

Useful checks:

```bash
npm run test:contracts
npm run test
npm run typecheck
npm run build
npm run test:e2e
python -m pytest backend/tests -q
```

GitHub Actions runs the frontend suite, backend suite against Postgres, Chromium runtime check, and product E2E suite against the real API/Postgres path for every `feat/**` push and pull request.

Damaged or unreadable recovery records block new submissions. `loadCheckoutRecovery` returns `undefined` only for an empty store, `null` for unavailable/damaged storage, and the validated record otherwise. Recovery keys must have UUID shape. Preserve damaged evidence for reconciliation rather than deleting it automatically.
