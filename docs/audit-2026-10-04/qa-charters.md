# Assessment QA charters

Scope: read-only product assessment at commit `9222c10435e3a96396ab7c1b39e4d6d79d839771`. No fixes or publication. Synthetic local fixtures only. Source inspection and existing test execution are reported separately from exploratory browser observations.

## Local browser baseline

- Contract: homepage renders the current product and exposes its actual navigation.
- Risk: documentation describes UI that is absent; static mockups may be mistaken for application screenshots.
- Entrypoint: `http://127.0.0.1:3200/`.
- Isolation: owned headless browser tab; no credentials, checkout, or shared-store mutation.
- Exit: capture snapshot, screenshot, console; no full visual or accessibility score.
- Source: current homepage and demo-script claims.
- Command: existing gstack browser `newtab`, `snapshot -i`, `screenshot`, `console --errors`.

## Hosted baseline

- Contract: latest GitHub production deployment is publicly readable.
- Risk: historical deployment success may be confused with current product acceptance.
- Entrypoint: deployment URL returned by GitHub deployment 4700156226.
- Isolation: owned headless tab, read only, no authenticated session or mutations.
- Exit: record visible page or access barrier. Do not claim API/cart/checkout acceptance from page load.

## Existing automated coverage

- Commands: `npm run test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
- Expected: documented suites complete successfully with their existing inputs.
- Isolation: repo-local build artifacts; E2E owns loopback web server and intercepted cart/order responses.
- Limits: mocks do not validate FastAPI/Postgres/Redis; a missing browser binary blocks all E2E product assertions.

## Unexecuted recovery and security charters

Proposed for implementation: timeout after durable order creation; retry with identical idempotency key; two clients competing to update a cart; wrong-owner order/cart access; Redis down then recovered; complete receipt after reload; malformed local JSON. These require reviewed synthetic integration fixtures and are not passed in this assessment.
