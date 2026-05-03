# OrderlyApp — Project Plan v0.2.0

## Version Goal
Turn the completed local MVP (`v0.1.0`) into a production-ish portfolio demo with real frontend/backend integration, persistent storage, stronger test coverage, and deployable infrastructure.

## Current Baseline
`v0.1.0` is complete and tagged. It includes:
- Next.js frontend MVP
- Interactive restaurant/menu/cart flow
- Voice/typed command parser
- Mock checkout and order status
- FastAPI backend scaffold
- PostgreSQL/Redis/Docker infrastructure scaffold
- Unit tests for core logic

## v0.2.0 Success Criteria
- Frontend reads restaurants/menu from FastAPI, not only local mock data.
- Cart and orders persist through backend APIs.
- Backend uses PostgreSQL/Redis instead of JSON files for primary persistence.
- End-to-end smoke tests cover the main demo flow.
- App is deployable with clear environment/config docs.
- Portfolio materials are ready: README, screenshots, demo script, architecture notes.

---

## Phase 0 — v0.2.0 Planning + Branch Setup

### Goal
Prepare a clean development track for v0.2.0.

### Tasks
- [x] Create `feat/v0.2.0-production-demo` branch
- [x] Confirm v0.2.0 scope and non-goals
- [x] Update README roadmap section
- [x] Add architecture diagram placeholder
- [x] Confirm deployment targets: Vercel + Render/Railway + Upstash/Railway

### Done When
- Branch exists
- Plan is committed
- README points to this v0.2.0 plan

---

## Phase 1 — Frontend API Integration

### Goal
Move frontend data flow from local-only fixtures to FastAPI-backed data.

### Tasks
- [x] Add frontend API client module
- [x] Add environment-based API base URL handling
- [x] Fetch restaurants from `GET /restaurants`
- [x] Fetch restaurant detail from `GET /restaurants/{id}`
- [x] Keep local mock fallback if API is unavailable
- [x] Add loading/error UI for API states
- [x] Refactor cart flow to support backend session ID

### Done When
- App can load restaurant/menu data from FastAPI
- Local fallback still works
- Build/lint/tests pass

---

## Phase 2 — Backend PostgreSQL Persistence

### Goal
Replace backend JSON restaurant/order persistence with PostgreSQL.

### Tasks
- [x] Add backend database connection layer
- [x] Add migration runner or documented migration command
- [x] Implement restaurant queries from Postgres
- [x] Implement menu item queries from Postgres
- [x] Implement order creation in Postgres
- [x] Implement order lookup/listing in Postgres
- [x] Add seed script that imports restaurant/menu fixtures into Postgres
- [x] Keep JSON fallback only for local/dev emergency mode if useful

### Done When
- Backend restaurants/orders survive API restart via Postgres
- Seed command populates database
- Backend compile/tests pass

---

## Phase 3 — Redis Cart Session Persistence

### Goal
Use Redis for session cart state.

### Tasks
- [x] Add Redis client/config
- [x] Store cart at `cart:{session_id}`
- [x] Load cart from Redis through `GET /sessions/{session_id}/cart`
- [x] Upsert cart through `PUT /sessions/{session_id}/cart`
- [x] Clear cart after order creation
- [x] Add fallback behavior if Redis is unavailable in local mode
- [x] Add cart expiration policy

### Done When
- Cart persists through backend APIs and survives frontend reload
- Cart clears after mock order
- Redis behavior is documented

---

## Phase 4 — Frontend Cart/Checkout Backend Wiring

### Goal
Connect cart and checkout UI to the backend API.

### Tasks
- [x] Generate or store anonymous session ID
- [x] Sync cart add/update/remove/clear to backend
- [x] Load existing cart on app startup
- [x] Submit checkout to `POST /orders`
- [x] Display backend-created order ID
- [x] Load order details/status from API
- [x] Preserve visible no-real-payment safety copy

### Done When
- Full demo flow works through frontend → backend → persistence
- LocalStorage is fallback only, not primary path

---

## Phase 5 — E2E Test Coverage

### Goal
Add browser-level confidence for the portfolio demo.

### Tasks
- [x] Install/configure Playwright
- [x] Add smoke test: restaurant loads
- [x] Add smoke test: customize and add item to cart
- [x] Add smoke test: typed voice command adds item
- [x] Add smoke test: mock checkout creates order
- [x] Add smoke test: status timeline appears
- [x] Add CI-friendly test command

### Done When
- Playwright tests pass locally
- Test instructions are in README/QUALITY docs

---

## Phase 6 — Deployment Readiness

### Goal
Make the project deployable and easy to run externally.

### Tasks
- [x] Finalize Dockerfiles
- [x] Verify `docker compose up --build` from clean state
- [x] Document Vercel frontend env vars
- [x] Document backend env vars
- [x] Document Postgres/Redis provisioning
- [x] Add deployment checklist
- [x] Add healthcheck verification steps

### Done When
- A reviewer can deploy using docs without guessing
- API health and frontend can be verified after deployment

---

## Phase 7 — Portfolio Polish

### Goal
Make the project look and read like a strong portfolio piece.

### Tasks
- [ ] Improve responsive/mobile layout
- [ ] Add architecture diagram
- [ ] Add better restaurant/menu fixture content
- [ ] Add README screenshots section
- [ ] Record or prepare final demo video script
- [ ] Add known limitations and next-roadmap section
- [ ] Tighten copy across UI and docs

### Done When
- README explains product, architecture, demo flow, setup, and roadmap clearly
- Screenshots/video checklist is complete

---

## Phase 8 — v0.2.0 Release

### Goal
Cut a clean v0.2.0 release.

### Tasks
- [x] Run final quality gate:
  - `npm run test`
  - `npm run build`
  - `npm run lint`
  - backend tests/compile
  - Playwright smoke tests
  - Docker Compose config
- [x] Update `docs/RELEASE.md`
- [x] Commit final changes
- [x] Tag `v0.2.0`
- [x] Write short release summary

### Done When
- Repo is clean
- Tag `v0.2.0` exists
- Release notes are complete

---

## Recommended Execution Order
1. Phase 0 — Branch/setup
2. Phase 1 — Frontend API integration
3. Phase 2 — PostgreSQL backend persistence
4. Phase 3 — Redis cart persistence
5. Phase 4 — Checkout/backend wiring
6. Phase 5 — E2E tests
7. Phase 6 — Deployment readiness
8. Phase 7 — Portfolio polish
9. Phase 8 — Release

## Estimated Effort
- Fast production-ish version: 4–6 focused days
- Solid portfolio-ready version: 7–10 focused days
- Deployed and polished version: 10–14 focused days

## v0.2.0 Non-goals
- Real payment processing
- Real restaurant integrations
- User accounts/auth
- Driver tracking
- Restaurant admin dashboard
- Multi-language voice support
