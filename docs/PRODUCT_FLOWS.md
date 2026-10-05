# OrderlyApp — Product Scope, Routes, and User Flows

This document describes the **current stabilized manual-ordering candidate**. It replaces earlier fallback/session/voice assumptions. The canonical release contract is defined in [`../development.md`](../development.md); this file explains the user-facing flow in practical terms.

## 1. Product Scope

### Accepted `api`-mode behavior

- Search/browse canonical restaurants and menus from FastAPI.
- Customize an available item using canonical modifier groups/options.
- Bootstrap a private server-issued guest session through the same-origin gateway.
- Add/edit/remove/clear a revisioned PostgreSQL-backed guest cart.
- Keep the last server-accepted cart visible if a write fails or conflicts.
- Review a deterministic server quote for the accepted cart.
- Use a password-free local demo profile/synthetic address as checkout presentation/input only.
- Submit a mock checkout with one idempotency key/body.
- Recover an uncertain/lost-response submission by retrying the exact same key/body.
- Display the immutable server receipt only after a valid accepted response.
- Reload exact receipts and current-guest history from PostgreSQL snapshots.

### Explicit `local_demo` preview

`local_demo` is a separate, visibly labelled fixture preview. It supports restaurant/menu browsing, item customization, and an isolated browser-local preview basket. It does **not** bootstrap a server guest, call ordering APIs, enable checkout, or claim accepted receipts/history.

An API error in `api` mode never changes the mode to `local_demo`.

### Deferred / out of release scope

- Voice/speech as a required interaction.
- Real payments/card collection.
- Real restaurant integrations or dispatch.
- Real customer account/authentication providers.
- Real delivery tracking/refunds/support.
- Multi-vendor ordering.

## 2. Identity and State Boundaries

### Guest ownership

The backend issues an opaque signed HttpOnly guest cookie. The browser does not choose, display, or persist the durable owner ID. Protected cart/order routes derive ownership only from the verified cookie.

### Demo profile

`/sign-in` and `/account` manage a **password-free local demo profile** and synthetic addresses. This is presentation data, not authentication. Renaming/forgetting a profile does not rotate server ownership; an explicit fresh-guest reset is a separate action.

### Cart authority

In `api` mode:

- `GET /v1/cart` returns `{revision, items}` from PostgreSQL.
- `PUT /v1/cart` / `DELETE /v1/cart` require `expected_revision`.
- Accepted writes increment revision exactly once.
- `409 cart_conflict` returns the current server cart for explicit review/reapply.
- Failed writes do not overwrite the last accepted basket with local intent.

Browser storage may retain recovery/presentation state, but it is not durable API cart authority.

### Receipt authority

Only a valid C5/C6 server receipt represents an accepted order. Confirmation/history never fabricate a receipt from current fixtures, cart state, or a local mock fallback.

## 3. Current Route Map

| Route | Purpose | API mode | `local_demo` |
| --- | --- | --- | --- |
| `/` | Marketplace/discovery entry | Canonical API catalog | Fixture catalog preview |
| `/restaurants` | Search/filter restaurants | Canonical API catalog | Fixture catalog preview |
| `/restaurants/:restaurantId` | Restaurant/menu | Canonical API detail | Fixture detail preview |
| `/restaurants/:restaurantId/items/:itemId` | Customize item | Canonical item/modifiers; accepted add waits for cart write | Local preview customization/cart |
| `/cart` | Review/edit basket | Revisioned server cart | Labelled local preview basket |
| `/checkout` | Quote + mock submit | Enabled only for accepted API cart/session | Unavailable |
| `/order-confirmation?orderId=...` | Exact immutable receipt | Fetch exact current-guest receipt | Unavailable |
| `/orders` | Current-guest receipt history | Server receipt list only | Unavailable |
| `/sign-in` | Create/select password-free demo profile | Local presentation only | Local presentation only |
| `/account` | Rename/forget profile, synthetic address, explicit guest reset | Presentation actions + explicit C1 reset | Presentation only; no ordering authority |

The frontend calls protected backend behavior through the bounded same-origin `/api/orderly` gateway rather than exposing guest credentials/owner IDs in application payloads.

## 4. Primary Manual API Journey

1. **Discover** — visitor lands on `/`, searches/filters restaurants, and chooses one from the canonical API response.
2. **Browse menu** — restaurant detail shows canonical availability/prices/modifier rules.
3. **Customize** — visitor selects required/optional modifiers, quantity, and bounded special instructions.
4. **Add to cart** — frontend submits IDs/quantity/modifiers against the current cart revision; success/navigation occurs only after the server accepts the mutation.
5. **Review cart** — visitor edits/removes/clears lines through serialized revisioned mutations. A stale write shows the current server cart and explicit recovery controls.
6. **Checkout profile/address** — visitor may use the password-free demo profile and one of the synthetic addresses. These values never become ownership authority.
7. **Quote** — frontend asks `POST /v1/checkout/quote`; rendered totals come from the server quote.
8. **Prepare submission** — frontend builds the immutable checkout body and creates one UUID idempotency key for the logical attempt. The exact unresolved key/body is saved in session storage before POST.
9. **Submit** — `POST /v1/orders` performs atomic idempotent checkout. A first commit returns `201`; identical replay returns `200` with the exact same receipt.
10. **Recover uncertainty** — if transport fails after send, the UI does not invent success or clear the basket. Retry reuses the exact saved key/body.
11. **Confirm** — accepted response routes to `/order-confirmation?orderId=...`; the page fetches that exact receipt.
12. **Reload/history** — receipt reload and `/orders` remain current-guest scoped and server-backed.

## 5. Important Failure and Recovery Flows

### Catalog/API failure

Show a loading/error/retry state. Do not switch to fixture data in `api` mode.

### Cart write/network failure

Keep the last accepted cart visible. Preserve attempted intent separately when needed and offer retry/recovery; do not show unaccepted local state as saved.

### Revision conflict

Show the server-provided current cart. User can review it and deliberately reapply against its revision. Do not silently overwrite another tab’s accepted state.

### Required storage unavailable

Backend returns typed unavailable/not-ready behavior. The system does not claim success through JSON, Redis, or browser-local fallback.

### Checkout validation/catalog conflict

Keep the durable cart. Refresh/review the current cart/quote as appropriate. No accepted receipt is shown unless the server returns one.

### Checkout response lost/timeout

State is `uncertain`, not failed-as-new and not accepted. Retry only the exact persisted idempotency key/body so at most one durable order exists.

### Unknown/foreign receipt ID

Show a not-found/recovery state. Never display another guest’s order and never substitute a “latest” local receipt.

### Browser profile storage unavailable/corrupt

Offer explicit recovery/temporary synthetic-profile UI. Do not crash, collect a password, or fabricate server ownership.

## 6. Password-Free Profile Flow

1. Visitor may continue/create a local demo profile with a display name.
2. UI stores only validated presentation data and synthetic-address selection.
3. No password/email-auth session is created.
4. Checkout can use the selected synthetic address, but server guest ownership remains the C1 cookie.
5. “Forget profile” removes local presentation state only.
6. “Start fresh guest” separately invokes the server guest reset and rotates ownership.
7. Return navigation from profile/sign-in accepts only known safe internal app paths.

## 7. `local_demo` Flow

1. Environment explicitly selects `NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo`.
2. UI shows the fixture-preview label.
3. Visitor browses fixture restaurants/menu and customizes items.
4. Preview basket is stored only in the isolated local-demo namespace.
5. Checkout/history/receipt routes show an unavailable state.
6. No guest bootstrap/API ordering request is performed.

This mode is for development/visual preview and cannot satisfy public API release acceptance.

## 8. Canonical Data / Pricing Rules

- Restaurant/item/option names, availability, modifier constraints, and price deltas come from the canonical backend catalog in API mode.
- Client-submitted display names/prices are not trusted as authority.
- Required single-choice and bounded multi-choice groups are validated server-side.
- One cart belongs to one restaurant.
- Quote/receipt totals use deterministic `mock-v1` server pricing.
- Accepted receipts preserve canonical line/modifier labels/prices and checkout fields as an immutable snapshot; later catalog changes cannot rewrite old receipts.

## 9. Accessibility / Responsive Requirements

- Complete manual ordering without voice.
- Keyboard-accessible controls and visible focus states.
- Validation summary/field associations for checkout errors.
- Clear disabled/pending states while mutations/submissions are in flight.
- Color is not the only state signal.
- Mock/no-real-payment language remains visible.
- Critical checkout journey must work at 375px without horizontal document overflow.
- Unsafe external/protocol-relative return destinations are rejected.

## 10. Release Evidence Boundary

Repository/browser CI can prove the candidate implementation, but public release acceptance additionally requires the exact deployed frontend/backend identity, fresh unauthenticated access, durable receipt reload, guest isolation, and required recovery rehearsal. Those results are recorded in [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md); blocked/unrun scenarios keep the release Not completed.