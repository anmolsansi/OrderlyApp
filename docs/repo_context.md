# OrderlyApp repository context — assessed 2026-10-04

Assessment target: `main`, commit `9222c10435e3a96396ab7c1b39e4d6d79d839771`, version 0.2.0. GitHub main matched this commit during the assessment. Scope: assess and propose; no application fixes, commits, publication, or Linear writes.

## Product and maturity

The charter describes a portfolio voice-assisted ordering demo with mock checkout. The current application is a fixture-backed marketplace UI with backend-first cart/order requests and local fallback. It is not ready for real customer orders. Voice parsing exists as a tested library but has no current application caller. Restaurant API adapters likewise have no current page caller. The catalog contains 12 fixture restaurants and 48 backend fixture items; the UI already includes several cuisines despite pizza-first copy.

## Evidence map

| Area | Source | Important symbols / behavior |
|---|---|---|
| Frontend | `app/page.tsx`, `app/restaurants/page.tsx`, dynamic restaurant/item pages | HomePage, RestaurantsPage, ItemCustomizationPage; local fixtures drive menus |
| Shared catalog | `lib/mock-data.ts`, `lib/marketplace.ts` | restaurants, getRestaurant, getMenuItem, filterRestaurants, calculateCartTotals |
| Cart | `lib/cart.ts`, `app/cart/page.tsx`, `lib/api.ts` | validation; local mirror; fetchCart/saveCart/clearBackendCart |
| Checkout | `app/checkout/page.tsx`, `lib/api.ts` | placeOrder; API failure becomes local mock confirmation |
| Receipt/history | confirmation and orders pages, `lib/api.ts` | backend fetch; normalizeOrder reconstructs totals from fixtures |
| Demo identity | `lib/auth.ts`, sign-in/account pages | raw local credentials and mutable browser session; no API authentication |
| Voice | `lib/voice.ts` | parseVoiceIntent; no application caller |
| Telemetry | `lib/telemetry.ts` | in-memory buffer; no application caller |
| API | `backend/app/main.py`, `models.py` | health, restaurants, session carts, pricing, orders; public unscoped order listing |
| Persistence | `store.py`, `database.py`, `redis_store.py` | carts prefer Redis then Postgres then JSON; orders prefer Postgres then JSON |
| Schema | `backend/migrations/001_initial.sql` | catalog, carts, orders; no order totals snapshot, identity, idempotency, cart revision |
| Startup | Dockerfiles, compose, `infra/render.yaml`, seed/migrate scripts | repeatable migrations; startup seed deletes/replaces catalog |
| Tests | `tests/*.test.ts`, `e2e/orderly.spec.ts` | 37 unit tests; 5 Chromium E2E tests; cart/order E2E intercepts API |
| CI | tracked repository inventory and GitHub runs | no tracked application CI workflow; one old Copilot run found |

## Verified commands and limits

- `npm ci --ignore-scripts`: installed locked dependencies; no manifest/lock changes.
- `npm run test`: 9 files, 37 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, generated frontend routes.
- `npm run lint`: package script aliases typecheck; it provides no independent lint coverage.
- `npm run test:e2e`: blocked initially by loopback sandbox permission; after approved retry, all five cases failed at browser launch because Chromium headless shell 1217 was absent. No E2E product assertion completed.
- `npm audit --json`: advisory database reports 8 affected dependency entries: 1 critical, 4 high, 3 moderate. Reachability/exploitation is not established by that count.
- Local browser: homepage rendered and screenshot captured; no complete order journey, microphone, mobile, or accessibility acceptance.
- Hosted browser: latest recorded deployment URL redirected to Vercel login. Public end-to-end acceptance remains unverified.
- Docker daemon unavailable; Postgres/Redis recovery and container integration not run.

## External status

[Linear OPE-77](https://linear.app/openclaw-neutron/issue/OPE-77/completed-work-archive-orderlyapp-v02-hardening-7-issues) archives seven completed hardening tickets. [OPE-83](https://linear.app/openclaw-neutron/issue/OPE-83/verify-deployed-portfolio-demo) remains Todo. Archive claims are historical implementation records, not proof of all desired semantics. No Linear records were changed.

GitHub records a successful Production deployment on May 15, 2026, for the assessed commit. The recorded immutable deployment URL requires Vercel authentication. This does not prove that every possible custom/alias domain is protected or unavailable.

## Discovery limitations

MCP repository indexing was rejected by automatic approval review because it would export potentially private source/configuration to an unverified destination. Local inspection and local Graphify extraction were used instead. CSO's trusted start command returned `INVALID_SCHEMA`, creating no usable run ID; this assessment is not a completed formal CSO audit. Guard's helper returned `FREEZE_BUSY`; the accepted repository boundary was followed without claiming helper enforcement. Global observation/skills memory was not modified.

See [assessment](audit-2026-10-04/ASSESSMENT.md), [proposed execution plan](audit-2026-10-04/IMPLEMENTATION_PLAN.md), and [local graph report](../graphify-out/GRAPH_REPORT.md).
