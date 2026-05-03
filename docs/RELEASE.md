# OrderlyApp — Release Notes

## v0.2.0 — Production Demo Release

### Completed phases
- Phase 0 — Branch/setup
- Phase 1 — Frontend API integration
- Phase 2 — PostgreSQL backend persistence
- Phase 3 — Redis cart persistence
- Phase 4 — Checkout/backend wiring
- Phase 5 — E2E tests
- Phase 6 — Deployment readiness
- Phase 7 — Portfolio polish
- Phase 8 — Release

### Highlights
- Frontend reads restaurant data from the FastAPI backend with local fallback behavior for demo resilience.
- PostgreSQL-backed restaurant/order persistence with repeatable SQL migration runner.
- Redis-backed session carts with PostgreSQL fallback and JSON emergency fallback.
- Docker Compose stack for web, API, Postgres, and Redis.
- Deployment docs/config for Vercel-style frontend and Render/Railway-style backend services.
- Playwright smoke tests cover menu customization and typed voice-command checkout.
- Health endpoint reports dependency status for Postgres and Redis.

### Verification
Final release gate:
```bash
npm run test
npm run build
npm run lint
python3 -m py_compile backend/app/*.py backend/scripts/*.py
docker compose config
docker compose --env-file .env.example config
npm run test:e2e
```

### Known limitations
- Payments, restaurant integrations, accounts/auth, and live driver tracking are intentionally out of scope.
- Browser speech support depends on browser/platform; typed command mode remains the reliable demo path.
- Hosted deployment still requires provisioning managed Postgres/Redis and setting production environment variables.

### Recommended next iteration
- Deploy the portfolio demo.
- Capture real screenshots/video from the hosted demo.
- Add auth/user accounts if turning this from portfolio demo into a product prototype.

## v0.1.0 — Local MVP

### Completed phases
- Phase 0 — Restart/Foundation
- Phase 1 — Product Design
- Phase 2 — Frontend App Shell
- Phase 3 — Data Models + Mock Content
- Phase 4 — Voice Input + Parsing
- Phase 5 — Cart + Ordering Logic
- Phase 6 — Checkout + Status
- Phase 7 — Backend API
- Phase 8 — Database + Infrastructure
- Phase 9 — Quality + Safety
- Phase 10 — Polish + Release

### Highlights
- End-to-end local ordering demo.
- Voice and typed command path.
- Cart validation and mock checkout safety copy.
- Mock order status timeline.
- Backend/API scaffold and infrastructure plan.
- Automated tests for core logic.

### Known limitations
- Backend persistence was JSON-backed at runtime; PostgreSQL/Redis schema and Docker services were scaffolded for the next hardening step.
- Browser speech support depends on browser/platform.
- Real payment and real restaurant integrations are intentionally out of MVP scope.
