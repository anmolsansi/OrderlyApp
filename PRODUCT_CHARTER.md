# OrderlyApp — Product Charter

## Mission

Build a portfolio-ready **manual food-ordering mock demo** that proves a visitor can browse a canonical pizza catalog, customize an item, maintain a private guest basket, review server-calculated totals, place a safe idempotent mock order, and reopen the exact saved receipt.

The stabilization release favors truthful behavior and recoverability over feature breadth. Voice is deferred from release acceptance; the manual keyboard/touch path is the required product path.

## Primary User

A desktop or mobile visitor evaluating the ordering experience. The visitor should be able to complete the demo without creating a real account, supplying a password, entering real payment credentials, or relying on speech support.

## Stabilized Demo Promise

The accepted API-mode journey is:

1. Browse/search the canonical pizza restaurant catalog.
2. Open a restaurant and available menu item.
3. Choose required/optional modifiers and quantity.
4. Add the canonical item to a private server-owned guest cart.
5. Review/edit the revisioned cart and resolve any conflict explicitly.
6. Optionally select a password-free local demo profile and synthetic demo address.
7. Review a deterministic server quote and clearly mocked payment summary.
8. Place the mock order with one idempotent submission.
9. See the complete immutable receipt.
10. Reload the requested receipt/history and see the same server-stored values.

## Product Modes

### `api`

The release path. The browser uses the same-origin `/api/orderly` gateway, FastAPI validates canonical catalog/cart/checkout state, and PostgreSQL owns durable guest/cart/receipt correctness.

An API failure is shown as a failure/recovery state; it must never activate fixture mode or invent a successful order.

### `local_demo`

An explicit, visibly labelled fixture preview for browsing, customization, and a browser-local preview basket. It performs no guest bootstrap/API ordering requests and exposes no accepted checkout, receipt, or history path.

`local_demo` is useful for visual development but is not public-release acceptance evidence.

## Identity and Privacy

- Guest ownership is server-issued through an opaque HttpOnly cookie.
- The browser never chooses or persists the server owner ID.
- Demo profiles are password-free local presentation data only; they do not authenticate or change guest ownership.
- Demo addresses are synthetic fixtures for the portfolio flow.
- Real passwords, real payment credentials, and real account authentication are not collected.

## Non-goals for the Stabilization Release

- Voice/speech as a required ordering path.
- Real payments or card processing.
- Real restaurant/order integrations.
- Real customer accounts, OAuth, password auth, email/SMS auth, or account-scoped production order history.
- Real delivery dispatch/tracking.
- Restaurant/admin dashboard.
- Multi-vendor carts/orders.
- Hidden outage fallback from API authority to fixtures, browser-local state, JSON, or Redis.

## Success Criteria

A successful stabilization release requires all of the following:

- The source candidate passes the hosted release CI matrix on an identified SHA.
- Canonical catalog/cart/quote/checkout/receipt behavior is exercised against the API/PostgreSQL path.
- A failed or uncertain request never becomes an invented success.
- Lost-response retry preserves one idempotency key/body and one durable receipt.
- A fresh visitor can reach the identified public candidate without developer login.
- The visitor can complete the manual mock journey and reopen the exact saved receipt.
- Active product/deployment/quality documentation describes the behavior that was actually verified.
- Any blocked or unrun public/recovery criterion keeps the overall release gate Not completed.

## Deferred Product Direction

After the manual mock release is genuinely accepted, separate future work may evaluate richer voice interaction, real authentication, real payments, restaurant integrations, and broader marketplace behavior. Those features must not be implied by the current portfolio-release claim.