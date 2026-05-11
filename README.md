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
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create local environment values from the checked-in template:
   ```bash
   cp .env.example .env.local
   ```
3. Start the Next.js app:
   ```bash
   npm run dev
   ```

Open `http://localhost:3000` for `npm run dev`, or `http://localhost:3100` for Docker Compose.

## Environment configuration
Environment files stay at the repository root because Next.js loads `.env*` from the project root. The committed `.env.example` contains only safe placeholders; use `.env.local` for local overrides and never commit real secrets.

| Variable | Required for local dev | Production guidance |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Yes; `http://localhost:3000` for `npm run dev` | Set to the deployed frontend URL. |
| `NEXT_PUBLIC_API_BASE_URL` | Yes; `http://localhost:8000` when the FastAPI backend runs locally | Set to the deployed backend URL with no trailing slash preferred. |
| `NEXT_PUBLIC_VOICE_MODE` | Optional; defaults to `browser` | Use `browser` for real browser speech support or `mock` for deterministic demos. |
| `NEXT_PUBLIC_CHECKOUT_MODE` | Optional; defaults to `mock` | Keep `mock` for portfolio/demo checkout or `disabled` to block checkout. Real payments are not implemented. |
| `NEXT_PUBLIC_AUTH_PROVIDER` | Optional; defaults to `none` | Placeholder for future auth providers (`none`, `mock`, `clerk`, or `auth0`). |
| `AUTH_SECRET` | No; leave empty for demo mode | Server-only placeholder for future auth integrations. Do not expose it with `NEXT_PUBLIC_`. |
| `DATABASE_URL` | Only when running FastAPI directly with Postgres | Set to the managed Postgres connection string. |
| `REDIS_URL` | Only when running FastAPI directly with Redis | Set to the managed Redis connection string. |
| `ORDERLY_FORCE_JSON_STORE` | Optional; `0` by default | Set to `1` only to force JSON fallback persistence. |
| `ORDERLY_CORS_ORIGINS` | Yes for backend/API calls | Set to the comma-separated deployed frontend origins. |
| `ORDERLY_COMPOSE_APP_URL` | Only for Docker Compose local frontend builds | Defaults to `http://localhost:3100` so copied Docker env values match the exposed Compose port. |
| `ORDERLY_COMPOSE_DATABASE_URL` / `ORDERLY_COMPOSE_REDIS_URL` | Only for Docker Compose overrides | Usually keep the Compose-internal defaults. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Only for Docker Compose local database | Use non-demo credentials outside local development. |

## Validation commands
Use these scripts before opening a PR:
```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm run lint` currently delegates to the TypeScript typecheck until a dedicated linter is added, so `typecheck` is the canonical no-emit TypeScript validation command.

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
