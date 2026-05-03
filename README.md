# OrderlyApp

Voice-first food ordering demo app for browsing pizza restaurants, customizing items, managing a cart, placing a mock checkout, and tracking mock order status.

## Status
MVP phases 0–10 are complete for the local portfolio demo. v0.2.0 production-demo release is complete locally on the production-demo branch.

## Development root
`~/Documents/Projects/OrderlyApp`

## What works
- Restaurant browsing
- Restaurant detail section
- Menu/item detail and modifiers
- Cart add/update/remove/clear
- Cart validation and one-restaurant conflict handling
- Typed command fallback
- Browser voice command capture where supported
- Voice intent parsing for add/view/remove/clear cart
- Mock checkout confirmation with explicit no-payment copy
- Mock order creation and simulated status timeline
- FastAPI backend with PostgreSQL primary persistence and JSON fallback
- Redis-backed session carts with local fallback
- Dockerized frontend/backend/Postgres/Redis stack
- Playwright E2E smoke tests
- Deployment readiness docs for Vercel + Render/Railway + managed Postgres/Redis
- Automated tests and quality docs

## Local development
```bash
npm install
npm run dev
npm run test
npm run build
npm run lint
```

Open `http://localhost:3000` for `npm run dev`, or `http://localhost:3100` for Docker Compose.

## Backend
```bash
cd backend
pip install -e .
uvicorn app.main:app --reload --port 8000
```

API health: `http://localhost:8000/health`

## Docker stack
```bash
cp .env.example .env
docker compose up --build
```

Services:
- Web: `http://localhost:3100`
- API: `http://localhost:8000`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Demo voice commands
Try these in the typed command box or browser speech mode:
- `add a large pepperoni pizza with jalapeños and extra cheese`
- `show cart`
- `remove item`
- `clear cart`

## Docs
- `PRODUCT_CHARTER.md` — product promise, non-goals, success criteria
- `PROJECT_PLAN.md` — restart plan
- `docs/TASKS.md` — completed checklist
- `docs/PRODUCT_FLOWS.md` — MVP user flows and accessibility requirements
- `docs/GIT_WORKFLOW.md` — branch/commit/PR rules
- `docs/ARCHITECTURE.md` — architecture overview
- `docs/INFRASTRUCTURE.md` — database/infrastructure plan
- `docs/QUALITY.md` — checks, accessibility, error logging, telemetry
- `docs/DEPLOYMENT.md` — Vercel/backend/Postgres/Redis deployment guide
- `docs/DEMO_SCRIPT.md` — demo recording script
- `docs/RELEASE.md` — release notes
- `docs/PROJECT_PLAN_V0.2.0.md` — next production-ish portfolio plan

## Roadmap
v0.2.0 production-demo release is complete locally. Recommended next work: deploy the portfolio demo and add real screenshots/video after deployment.

## Verification
Latest release gate:
- `npm run test`
- `npm run build`
- `npm run lint`
- `python3 -m py_compile backend/app/*.py backend/scripts/*.py`
- `docker compose config`
- `docker compose --env-file .env.example config`
- `npm run test:e2e`
