# OrderlyApp — Screenshot / Video Checklist

Capture portfolio media from the **stabilized manual mock-ordering flow**. Voice/transcript screenshots are not required for the current release.

## Hosted Capture Rule

Prefer an identified, publicly accepted `api`-mode candidate. Before calling hosted media release evidence, verify [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md) shows public access/current backend/receipt durability gates passed.

As of October 5, 2026, the exact ST-12 Vercel build is still behind developer authentication and the current backend candidate has not been established publicly. Hosted portfolio capture is therefore not yet release-acceptance proof.

Local captures are fine for development review but must be labelled as local and must not imply public deployment acceptance.

## Recommended Captures

1. Marketplace hero/search with current product positioning.
2. Restaurant search/filter result cards.
3. Restaurant menu with canonical availability/prices.
4. Item customization with required/optional modifiers.
5. Revisioned cart with accepted line items/totals.
6. Password-free demo profile or synthetic-address selector where it helps explain the flow.
7. Mock checkout with server quote and visible “no real payment” safety copy.
8. Immutable order confirmation showing the mock order ID and complete totals.
9. Exact confirmation page after reload, proving the saved receipt is reopened rather than reconstructed.
10. Optional current-guest order history.
11. Optional CI/release evidence view showing the exact candidate SHA and required job results.

Suggested filenames:

- `marketplace.png`
- `restaurants.png`
- `restaurant-menu.png`
- `customize-item.png`
- `cart.png`
- `demo-profile-address.png`
- `mock-checkout.png`
- `order-confirmation.png`
- `receipt-reload.png`
- `order-history.png`
- `release-ci.png`

## Optional Recovery Captures

Only capture recovery states that are safe and current on the chosen candidate:

- cart conflict with current-server-basket review/reapply;
- API/server failure that leaves the accepted basket intact;
- uncertain checkout/retry state without an invented receipt;
- corrupt/disabled local profile storage recovery;
- safe internal fallback after an unsafe return destination.

## `local_demo` Media

If you capture the explicit fixture preview, keep its persistent preview label visible and describe it as visual/development preview only. Do not show `local_demo` checkout/order confirmation/history as successful behavior; those routes are intentionally unavailable.

## Privacy / Security Redaction

Do not capture or publish:

- guest cookies or token hashes;
- `ORDERLY_SESSION_SECRET`;
- database/Redis credentials or full private connection URLs;
- `.env` files;
- real personal address/contact information;
- real card/payment details;
- private platform/admin screens that expose secrets;
- authenticated Vercel bypass/tooling as if it were public-visitor proof.

Use only the synthetic demo profile/address data intended for the portfolio flow.

## Final Media Check

Before using a screenshot/video in a portfolio:

- verify it represents the current manual release, not an obsolete voice-first/fallback architecture;
- verify mock/no-payment language is visible when checkout is shown;
- verify the UI is not displaying a `local_demo` preview while narration claims API persistence;
- verify the public candidate identity is recorded when media is presented as hosted proof;
- verify no secret/private data is visible.