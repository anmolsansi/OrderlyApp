# OrderlyApp — Stabilized Demo Script

## Goal

Record a concise portfolio demo of the **manual mock-ordering** journey only after the candidate being shown is identified and accepted for public use. Voice is not required for this release.

For current release status, check [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md) first. As of October 5, 2026 the exact Vercel build is protected by developer authentication and the current backend candidate is not publicly established, so hosted portfolio capture remains blocked.

## Preferred Demo Environment

Use an accepted `api`-mode deployment whose:

- frontend and backend source/build identities are recorded;
- backend `/health/ready` reports ready and the expected source SHA;
- frontend is reachable by a fresh visitor without developer login/bypass;
- INT-02/public durability/recovery evidence is current.

Do not use `local_demo` as if it were accepted API behavior.

## Local API-Mode Setup (development only)

```bash
cp .env.example .env
# Set a private ORDERLY_SESSION_SECRET in .env.
docker compose up -d postgres redis
docker compose run --rm migrate
docker compose --profile seed run --rm seed
docker compose up --build api web
```

Open `http://localhost:3100`.

Local capture can support development review, but it does not satisfy public-release acceptance.

## 60–90 Second Demo Flow

1. **Open the marketplace**
   - Introduce OrderlyApp as a safe manual mock-ordering portfolio demo.
   - Do not claim real payments, real restaurant submission, or voice as part of the accepted release.

2. **Browse/search restaurants**
   - Show canonical restaurant cards/search/filter behavior.
   - Open a restaurant/menu.

3. **Customize an item**
   - Select an available item.
   - Choose required options such as size/crust and optional toppings.
   - Show quantity/special-instruction controls where applicable.

4. **Add to the private guest cart**
   - Add the item and show the cart page.
   - Explain that guest ownership is server-issued/private and the accepted basket is revisioned in PostgreSQL.
   - Refresh once to show the accepted cart reloads.

5. **Show password-free profile/address behavior**
   - Create/select the demo profile if needed.
   - Select a synthetic demo address.
   - Explain that this profile is local presentation only and does not authenticate/own server data.

6. **Review mock checkout**
   - Show the server quote/totals.
   - Point out explicit no-real-payment language.
   - If demonstrating promo/tip behavior, use only supported mock inputs and keep totals visible.

7. **Place the mock order**
   - Submit once.
   - Show the backend-created immutable receipt/order ID.
   - Explain that checkout is idempotent, so a lost response can be retried with the same key/body without creating a second accepted order.

8. **Prove receipt durability**
   - Refresh/reopen the exact confirmation URL.
   - Show that item/modifier labels, checkout fields, and totals match the accepted receipt.
   - Optionally open `/orders` to show current-guest history.

9. **End with the implementation summary**
   - Next.js frontend + bounded same-origin gateway.
   - FastAPI backend.
   - PostgreSQL durable guest/cart/receipt/idempotency authority.
   - Redis used only for short-lived checkout abuse counters.
   - Explicit migration/seed lifecycle and readiness checks.
   - Hosted release CI covering lint/tests/typecheck/build/PostgreSQL/Chromium/E2E/security.

## Optional Recovery Demonstration

Only include recovery behavior that has current safe evidence on the chosen candidate. Useful examples include:

- stale two-tab cart conflict → review/reapply current server basket;
- rejected server response → basket remains and no receipt is invented;
- lost checkout response → exact same unresolved key/body replay;
- invalid external profile return URL → app falls back to a safe internal route.

Do not intentionally break a shared/public database or infrastructure just for the recording.

## `local_demo` Preview

If showing `local_demo`, clearly label it as a separate developer/visual preview:

- browse/customize/local preview basket only;
- no guest API bootstrap;
- no accepted checkout;
- no receipt/history acceptance claim.

Do not splice local-demo success into an API-mode release story.

## Recording Checklist

- [ ] candidate source/build identity is known;
- [ ] public acceptance record says the chosen hosted candidate is eligible to show;
- [ ] browser is a fresh unauthenticated context for public demo proof;
- [ ] no developer toolbar/auth/share-bypass screen is part of the claimed public flow;
- [ ] only synthetic profile/address information is visible;
- [ ] no secrets, cookies, DB/Redis URLs, private terminal/env values, or real payment data are shown;
- [ ] checkout visibly says mock/no real payment;
- [ ] exact receipt reload succeeds before recording completion;
- [ ] browser zoom/mobile framing keeps controls/readability clear;
- [ ] claims in narration match the current release docs rather than historical voice-first plans.