# ST-03 — Password-free demo profiles

## Purpose

ST-03 removes the old browser-only password/account simulation. A demo profile is now only presentation data stored in this browser. It does not authenticate a user and it never controls access to carts or orders.

Server ownership remains the private guest session introduced by ST-02. The browser receives an opaque HttpOnly guest cookie. Profile changes do not modify that cookie. A guest scope changes only when the user explicitly chooses **Start fresh guest session**.

## C2 profile contract

The stored profile is version 1 and contains only:

```ts
{
  schemaVersion: 1,
  id: string,
  name: string,
  defaultAddressId: string,
}
```

The profile name is trimmed and must contain 1–60 characters. Unknown fields, invalid schema versions, malformed JSON, and unknown default address IDs are rejected. Decoded profile/address records that fail validation are removed from their exact C2 key, so an unknown password field cannot remain after successful cleanup. A blocked removal reports `storage_unavailable`; it never claims that cleanup succeeded. Malformed JSON still reports a recoverable error with an explicit clear action.

The local profile ID is a presentation label. Changing it cannot grant access to another guest's server data.

## Storage keys

ST-03 writes only these C2 keys:

- `orderlyapp.marketplace.demoProfile.v1`
- `orderlyapp.marketplace.demoAddresses.v1`

The address list contains fixed synthetic records. The profile UI does not collect a real email address, phone number, password, or delivery address.

During C2 access, these exact legacy keys are removed:

- `orderlyapp.marketplace.authAccounts.v1`
- `orderlyapp.marketplace.session.v1`
- `orderlyapp.marketplace.profile.v1`
- `orderlyapp.marketplace.addresses.v1`

The migration never calls `localStorage.clear()`. Cart and order-history keys are intentionally preserved.

## Files

- `lib/auth.ts` owns C2 validation, migration, storage errors, synthetic addresses, and compatibility adapters.
- `lib/types.ts` defines `DemoProfile` and `DemoAddress`.
- `app/sign-in/page.tsx` is the demo-profile chooser. The route name is retained for compatibility with existing links, but the screen is not a login form.
- `app/account/page.tsx` lets the user rename the local display profile, choose a synthetic default address, forget the local profile, or explicitly reset the private guest scope.
- `app/components/MarketplaceNav.tsx` uses **Demo profile** / **Profile** labels instead of presenting the local profile as authentication.
- `tests/fixtures/contracts/c2.json` is the executable C2 fixture.

## Local profile versus guest reset

**Forget local profile** removes only C2 browser presentation data. It does not call the backend and does not rotate the guest cookie.

**Start fresh guest session** calls the existing ST-02 `resetGuestSession()` client operation. On success, the server rotates the private guest scope and the page then clears the local demo profile so the user must choose presentation data again.

The reset also clears this tab's old checkout recovery record. Profile rename and **Forget local profile** do not clear it or rotate the guest. If recovery cleanup is blocked after the server rotates, the page states that partial result explicitly.

If guest reset fails, the existing guest scope remains active and the UI reports the failure. If the guest rotates successfully but local storage cleanup fails, the UI reports that partial local cleanup problem instead of pretending the whole reset failed.

## Checkout compatibility

`isSignedIn()` and `getSessionProfile()` remain temporary presentation adapters because the current checkout page still imports them. They no longer read credentials or create browser ownership IDs.

`isSignedIn()` means only “a valid local demo profile exists.” `getSessionProfile()` maps C2 display data onto the legacy checkout `UserProfile` shape using synthetic fixture contact values. ST-09/ST-10 own the later checkout/profile contract migration.

## Error behavior

C2 has two recoverable local error codes:

- `invalid_profile` — stored profile/address data is malformed, has an unknown field/version, or references an unknown synthetic address.
- `storage_unavailable` — browser storage read/write/remove operations threw an exception.

Profile pages show a plain-language error and retry action. They do not fabricate a successful profile write.

## Verification

Unit coverage in `tests/auth.test.ts` verifies:

- valid profile round-trip;
- strict malformed/unknown-field/version rejection;
- 1–60 character name limits;
- browser storage read/write failures;
- exact legacy-key cleanup without `clear()`;
- cart/order-history preservation;
- no password retained after migration;
- tampered synthetic address rejection;
- presentation-only checkout compatibility;
- local profile forget behavior.

Browser coverage in `e2e/orderly.spec.ts` verifies:

- no password or email login field exists on the profile chooser;
- checkout can continue through a demo profile instead of password sign-in;
- rename and local forget leave the guest cookie unchanged;
- explicit fresh guest reset rotates the guest cookie separately.

Shared CI runs contract fixtures, frontend unit tests, TypeScript checks, production build, backend tests, Chromium launch, and product E2E on `feat/**` pushes and pull requests.

## Rollback

ST-03 has no database migration. A code rollback may leave the new C2 keys unused. Do not restore the old password/account UI as a recovery mechanism. If C2 causes a release-blocking problem, disable the affected profile UI while preserving the ST-02 guest-session boundary and investigate the browser-storage failure.
