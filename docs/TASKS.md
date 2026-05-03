# OrderlyApp — Master Task List

## Goal
Build a voice-first food ordering web app from scratch at `~/Documents/Projects/OrderlyApp`.

## Scope
- Browse restaurants
- View menus and item details
- Add/edit/remove cart items
- Voice commands for cart actions
- Mock checkout
- Mock order status
- Transcript + assistant response panel
- Clear state confirmations and recovery

## Phase 0 — Restart / Foundation
- [x] Create new repo structure at `OrderlyApp`
- [x] Confirm stack and folder layout
- [x] Add root README and product charter
- [x] Set up monorepo/workspace if needed (deferred: single Next app is enough for current MVP slice)
- [x] Add formatting, linting, typecheck, and build scripts
- [x] Set up env files and example env vars
- [x] Add Git workflow rules and branch strategy
- [x] Create shared types/contracts package
- [x] Define mock data source format

## Phase 1 — Product Design
- [x] Finalize user flows
- [x] Define restaurant browsing flow
- [x] Define menu/item detail flow
- [x] Define cart flow
- [x] Define voice capture + transcript flow
- [x] Define error correction flow
- [x] Define mock checkout flow
- [x] Define order status flow
- [x] Define accessibility requirements

## Phase 2 — Frontend App Shell
- [x] Build app layout and navigation
- [x] Build home / restaurant browse page
- [x] Build restaurant detail page
- [x] Build menu/item detail modal/page
- [x] Build cart sidebar/page
- [x] Build transcript panel
- [x] Build assistant response panel
- [x] Build toast/confirmation system
- [x] Add loading, empty, and error states

## Phase 3 — Data Models + Mock Content
- [x] Create restaurant schema
- [x] Create menu schema
- [x] Create modifier schema (size, toppings, sides, quantity)
- [x] Create cart schema
- [x] Create order schema
- [x] Seed 5–20 pizza restaurants
- [x] Seed menu items and modifiers
- [x] Seed mock order-status states
- [x] Add fixture validation

## Phase 4 — Voice Input + Parsing
- [x] Add browser voice capture
- [x] Normalize transcript stream
- [x] Build intent parser abstraction
- [x] Support add-to-cart intent
- [x] Support view-cart intent
- [x] Support remove-item intent
- [x] Support modifier capture
- [x] Support correction/retry flow
- [x] Show interpreted command before commit
- [x] Handle voice failures gracefully

## Phase 5 — Cart + Ordering Logic
- [x] Add item to cart
- [x] Edit item quantity/modifiers
- [x] Remove item from cart
- [x] Recalculate totals
- [x] Validate cart conflicts and missing modifiers
- [x] Persist cart session state
- [x] Restore cart on reload

## Phase 6 — Checkout + Status
- [x] Build mock checkout confirmation
- [x] Require explicit confirmation before placing order
- [x] Create mock order record
- [x] Show post-checkout order summary
- [x] Add basic status timeline
- [x] Simulate status updates

## Phase 7 — Backend API
- [x] Scaffold backend service
- [x] Define REST endpoints
- [x] Add request/response validation
- [x] Add session/cart persistence
- [x] Add order persistence
- [x] Add seed/import scripts
- [x] Add health endpoint

## Phase 8 — Database + Infrastructure
- [x] Choose database schema
- [x] Add migrations
- [x] Add PostgreSQL setup
- [x] Add Redis session layer if kept
- [x] Add local dev compose config
- [x] Add deploy config

## Phase 9 — Quality + Safety
- [x] Add tests for schemas
- [x] Add tests for voice parsing
- [x] Add tests for cart logic
- [x] Add tests for checkout flow
- [x] Add accessibility checks
- [x] Add error logging strategy
- [x] Add basic telemetry hooks

## Phase 10 — Polish + Release
- [x] Clean up UI copy
- [x] Improve responsive/mobile layout
- [x] Tighten visual states
- [x] Write README
- [x] Record demo script
- [x] Prepare screenshots/video
- [x] Final pass on bugs
- [x] Tag release

## Suggested Build Order
1. Foundation
2. Product design
3. Mock data + contracts
4. Frontend shell
5. Voice + cart logic
6. Checkout + status
7. Backend + DB
8. Tests + polish
9. Release
