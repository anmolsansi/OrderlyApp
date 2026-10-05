# ST-10 UI Resilience and Safe Return Navigation

ST-10 hardens the existing password-free demo profile and checkout UI without changing backend ownership, C7 API contracts, ST-09 order recovery, dependencies, or deployment configuration.

## Scope

ST-10 changes only browser presentation and navigation behavior:

- validated internal return destinations after choosing a demo profile
- recoverable malformed or unavailable local profile storage
- explicit temporary synthetic profile behavior when browser storage is blocked
- deterministic synthetic address preference and deliberate-input precedence
- accessible checkout validation and keyboard submission
- browser regression coverage for safe returns, storage failures, address persistence, and a 375px checkout viewport

The private server guest remains the only cart/order ownership boundary. A local or temporary demo profile never grants access to another guest's cart or orders.

## Safe profile return destinations

`lib/routes.ts` exposes `sanitizeAppReturnPath()` and `routes.signIn(next)` uses it before writing a `next` query parameter. `app/sign-in/page.tsx` sanitizes the consumed query value again before calling the router.

Allowed return path families are the known marketplace screens:

- `/`
- `/restaurants` with local query parameters
- `/restaurants/:restaurantId`
- `/restaurants/:restaurantId/items/:itemId`
- `/cart`
- `/checkout`
- `/order-confirmation` with local query parameters
- `/orders`
- `/account`

Absolute URLs, protocol-relative values, backslashes, control characters, encoded path traversal/separators, fragments, malformed values, and unknown app paths fall back to `/account`.

This is navigation hardening only. It does not create an authentication boundary.

## Profile storage behavior

C2 remains versioned local presentation data:

- `orderlyapp.marketplace.demoProfile.v1`
- `orderlyapp.marketplace.demoAddresses.v1`

Reads still validate exact JSON/schema/address shapes. Storage access continues to catch browser `getItem`, `setItem`, and `removeItem` exceptions instead of throwing into React.

`lib/browser-storage.ts` also guards access to `window.localStorage` and `window.sessionStorage` themselves: browser policy can throw before a Storage method is called. Profile pages and shared navigation use this boundary. An unavailable store is reported as unavailable; no replacement memory store claims that anything was persisted.

If checkout cannot acquire session storage when loading, it shows a recovery-storage message and blocks new submissions until storage is enabled and the page reloaded. If access becomes unavailable later, saving the recovery key/body fails before any order API call. An accepted server response can still be displayed if clearing its local recovery record fails; denied storage cannot turn a failed write into a saved order.

Profile reset never uses `localStorage.clear()`. Unrelated cart/order/browser keys are not intentionally removed.

### Malformed data

Sign-in, account, and checkout surface a plain-language recovery state. Invalid C2 data can be cleared explicitly and reloaded. Checkout preserves any delivery details the user already changed before that recovery. A later default/profile load cannot silently overwrite deliberate checkout input.

### Storage unavailable

When browser profile storage is blocked, account and checkout can use an explicitly temporary synthetic profile. The temporary profile:

- is kept only in React state
- is not persisted to local storage
- uses only the fixed ST-03 synthetic addresses
- disappears on reload/navigation
- does not rotate, replace, or identify the private server guest
- does not change ST-09 idempotency or receipt behavior

Sign-in also lets the user continue without claiming that profile persistence succeeded. Checkout then offers the temporary profile recovery path if needed.

## Address precedence

`getPreferredDemoAddress()` centralizes the deterministic preference rule:

1. use the profile's known `defaultAddressId` when it exists in the validated synthetic address list
2. otherwise use the first known synthetic address
3. return no address when the list is empty

Checkout applies that default only before deliberate input. The following actions mark checkout input deliberate:

- editing delivery/contact fields
- choosing a synthetic address
- restoring an unresolved ST-09 submission recovery body

Once input is deliberate, profile/storage recovery does not replace it. Explicitly choosing another address is still allowed and intentionally updates the delivery fields.

## Checkout validation and keyboard behavior

The checkout details area is a real HTML form. Pressing Enter follows the same guarded `placeOrder()` path as the primary submit button.

Client validation now provides:

- a focusable validation summary
- stable field IDs
- visible field-level messages
- `aria-invalid` on affected controls
- `aria-describedby` linking a field to its message
- focus movement to the summary after an invalid keyboard/button submit
- disabled submission during cart mutation, order submission, or uncertain ST-09 recovery

ST-09's exact-key/body replay behavior is unchanged.

## Mobile behavior

The existing project breakpoints remain authoritative. ST-10 does not introduce new visual design or CSS dependencies. The checkout grid already collapses for smaller viewports. `e2e/profile-address.spec.ts` asserts that the critical checkout journey has no horizontal document overflow at a 375px viewport.

## Verification

ST-10 adds or extends coverage for:

- valid known return routes
- absolute/protocol-relative/backslash/encoded/unknown return rejection
- malformed profile and address JSON/schema
- browser read/write/remove failures
- denied localStorage getters on sign-in, account, and checkout, with temporary profile recovery
- denied sessionStorage getters at load or submission, with no new order request
- preservation of unrelated browser keys during profile reset
- preferred-address fallback
- deliberate checkout input surviving profile recovery
- explicit temporary profile recovery when local storage is blocked
- selected synthetic address saved into the immutable receipt and still exact after receipt reload
- keyboard validation focus and field associations
- 375px horizontal-overflow regression

The existing ST-09 checkout recovery E2E remains responsible for lost-response replay, exact idempotency-key/body reuse, definitive server failures, exact receipt reads, guest isolation, and `local_demo` order-route blocking.

## Dependency note

The implementation is based on merged C2 and C7/ST-09 providers. `development.md` still lists the separate INT-01 manual journey gate as not completed. ST-10 does not silently mark that canonical gate complete. Branch-level automated browser evidence is recorded independently, and final merge readiness must still respect the stabilization plan's dependency bookkeeping.

## Rollback

If ST-10 causes a regression, revert the ST-10 web hardening while keeping:

- C2 password-free presentation profiles
- C1 private guest ownership
- C7 typed browser API behavior
- ST-09 truthful checkout and idempotent recovery

Do not restore password simulation, local order authority, fixture fallback on API failure, or unsafe external `next` navigation.
