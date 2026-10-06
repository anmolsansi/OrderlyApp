# ST-08 Web Catalog and Cart Adapter

ST-08 connects restaurant discovery, menu customization, and the basket to the frozen C3/C4 backend contracts without allowing API failures to masquerade as fixture success.

## Scope

This slice owns the browser adapter and the product surfaces from home/discovery through cart review. It does **not** own checkout submission, confirmation/history recovery, backend storage, authentication, deployment, or the canonical `development.md` reconciliation.

ST-09 remains responsible for checkout/idempotency/recovery. ST-12 owns CI/deployment hardening. ST-13 owns final canonical-guide reconciliation.

## Data modes

The browser-side projection of C0 is:

```text
NEXT_PUBLIC_ORDERLY_DATA_MODE=api|local_demo
```

The default is `api` for compatibility with existing environments. Any other explicit value is rejected.

### `api`

- Restaurant catalog comes only from `/api/orderly/restaurants` and `/api/orderly/restaurants/:id`.
- Protected cart reads/writes use the verified guest cookie through the same-origin `/api/orderly` gateway.
- Cart authority is C4/PostgreSQL.
- API failures stay failures. They never load fixture restaurants or a fixture basket.
- Cart mutation payloads contain IDs, quantity, modifiers, optional instructions, and `expected_revision`. Client labels/prices are never submitted as authority.

### `local_demo`

- Catalog comes from bundled fixtures.
- Basket data uses only `orderlyapp.marketplace.localDemoCart.v1`.
- No guest bootstrap or `/api/orderly` request is made by ST-08 flows.
- Pages display a persistent **Local fixture preview** notice.
- Checkout entry is unavailable.
- Local preview data is never merged into the API basket automatically.

## C7 typed result contract

`lib/types.ts` defines the browser result boundary:

```ts
{ ok: true, data: T }

{ 
  ok: false,
  kind: 'validation' | 'conflict' | 'session' | 'network' | 'server',
  error: {
    code: string,
    message: string,
    requestId?: string,
    status?: number,
    fields?: string[],
    currentCart?: RevisionedCart,
  },
}
```

A successful HTTP status with malformed JSON/schema becomes `server / invalid_response`. `undefined` is not treated as success by the C7 catalog/cart functions.

The adapter converts backend snake_case fields to the browser camelCase types. Important mappings include:

- `delivery_fee_cents -> deliveryFeeCents`
- `price_cents -> priceCents`
- `price_delta_cents -> priceDeltaCents`
- `default_option_id -> defaultOptionId`
- `restaurant_id -> restaurantId`
- `menu_item_id -> menuItemId`
- `base_price_cents -> basePriceCents`
- C4 top-level `current_cart -> error.currentCart`

Catalog and cart payloads are shape-checked before the UI receives them. Malformed canonical data is rejected rather than partially trusted.

## Request behavior

All browser API requests stay same-origin under `/api/orderly`.

Reads accept an `AbortSignal`. Page effects abort obsolete reads and the cart page also uses a monotonically increasing load sequence so a late result cannot replace a newer load.

Cart mutations are serialized inside `lib/api.ts`. PUT and DELETE mutations are not automatically retried. The user decides whether to reapply after a conflict or failure.

## Basket state model

The cart UI keeps three concepts separate:

1. **Accepted basket** — the latest C4 cart accepted by the server, including its revision.
2. **Attempted change** — the user’s desired next item list while a mutation is pending.
3. **Recovery draft** — the failed attempted list saved under `orderlyapp.marketplace.apiCartDraft.v1`.

The accepted basket is not optimistically overwritten.

### Successful mutation

1. Start from the accepted revision.
2. Send one serialized C4 mutation.
3. Wait for the server result.
4. Replace accepted state only with the successful canonical response.
5. Clear the API draft.
6. Update the legacy presentation mirror; checkout still reads the authoritative C4 cart.

### Validation/network/server failure

1. Keep the previously accepted basket visible.
2. Save the attempted items in the API-draft namespace.
3. Show the typed error.
4. Offer an explicit reapply action where useful.

### `409 cart_conflict`

1. Read `current_cart` from the C4 error response.
2. Show that server basket as the current accepted view.
3. Keep the attempted items separately.
4. Offer **Review current basket** or **Reapply my change**.
5. Reapply uses the conflict-provided current revision. It never blindly replays the stale revision.

### Cross-restaurant add

Adding an item from a different restaurant does not silently clear the current basket. Customization displays an explicit replacement confirmation. In API mode, replacement uses the revision that was just read. A subsequent conflict still requires normal conflict recovery.

## Storage namespaces

| Key | Purpose | Authority |
| --- | --- | --- |
| `orderlyapp.marketplace.localDemoCart.v1` | Explicit local fixture basket | Local preview only |
| `orderlyapp.marketplace.apiCartDraft.v1` | Failed API mutation intent | Recovery hint only |
| `orderlyapp.marketplace.cart.v1` | Temporary accepted-cart mirror for ST-09-owned legacy checkout | Never read by ST-08 as API authority |

The legacy mirror is written only after an accepted C4 read/write response. It exists to avoid breaking the ST-09-owned checkout screen before that slice removes the legacy coupling.

## Catalog authority and display prices

Discovery, menu pages, customization, and cart helpers take the selected catalog as an input. They do not use global fixture lookups in API mode.

C3 controls restaurant/menu names, availability, delivery fee, base price, modifier price deltas, modifier min/max values, defaults, and option availability.

The cart screen shows line totals, item subtotal, and delivery fee from C3/C4 inputs. It deliberately does not invent service fee, promotion, tax, or tip. Those values belong to the C5 checkout quote and ST-09.

## UI states

The ST-08 surfaces now have real data states:

- loading
- success
- empty/not found
- API error with Retry
- mutation pending
- mutation rejected
- cart conflict with Review/Reapply
- explicit local fixture preview

The old query-parameter-only fake loading/error discovery states are no longer the API-mode source of truth.

## Tests

### Unit and contract

```bash
npm run test:contracts
npm run test
npm run typecheck
npm run build
```

Coverage includes:

- snake_case canonical mapping
- canonical price/default/availability mapping
- malformed success payload rejection
- typed validation/conflict/session/network/server behavior
- `current_cart` normalization
- revision-required PUT/DELETE bodies
- no client price/name authority in C4 writes
- aborted obsolete reads
- serialized cart mutations
- catalog-source-aware cart/marketplace helpers
- isolated local-demo/API-draft storage namespaces

### API-mode browser flow

```bash
npm run test:e2e -- e2e/catalog-cart.spec.ts
```

This covers canonical discovery/menu/customization, add/edit/reload, rejected save, conflict review/reapply, and proof that an API outage does not activate fixture discovery.

### Explicit local-demo browser boundary

Run the preview case under a preview-mode dev server:

```bash
NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo npm run test:e2e -- e2e/catalog-cart.spec.ts -g "explicit local_demo"
```

That case asserts the fixture label, local basket persistence across reload, unavailable checkout, and zero `/api/orderly` requests.

The repository CI remains API-mode because ST-12 owns CI/deployment configuration.

## Operational and security notes

- No owner/session ID is added to request bodies or browser storage.
- Guest identity remains cookie-owned by C1.
- No raw cookie, token, DB URL, or secret is logged.
- C4 errors may expose only the documented safe error envelope/current cart.
- Failed requests never change data mode.
- Browser storage failure cannot change the accepted server basket.

## Rollback

If the mutation UI must be disabled, keep API-mode reads and show the basket as unavailable/read-only. Do not restore the old “API error -> fixture success” behavior.

`local_demo` may remain as an explicitly selected development/test preview, but it must stay labelled, isolated, and unable to enter checkout/order flows.

## Current conformance

`tests/browser-contracts.test.ts` executes the shared C3 catalog, C4 basket and C5 quote/receipt through the real browser adapters and compares complete serialized C7 results. C7 now includes all presentation fields and the same required Small modifier, notes and catalog fingerprint as its providers. Error examples use browser `requestId`/HTTP `status`; network failures do not invent request IDs. Recovery corruption blocks new checkout rather than masquerading as an empty store.
