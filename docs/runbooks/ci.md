# ST-01 Verification Runbook

This runbook defines the reproducible test vocabulary introduced by ST-01. It describes the baseline only. Product hardening remains owned by later stabilization tickets.

## Source identity

The ST-01 work branch started from `main` at `78b8fa6a7d6a779a8985d34413d81d8b23673403`.

Hosted CI records `GITHUB_SHA` in the `baseline-evidence` job summary. Use that SHA, not a moving branch name, when citing a verification result.

## Supported runtimes

- Node.js: `>=20.9.0 <25` from `package.json`.
- Hosted Node baseline: Node 22.
- Hosted npm resolver: npm 11.20.0. npm 10.9.9 hit an Arborist `edgesOut` internal error while reconciling the pre-ST-01 lockfile, so ST-01 regenerated the lock with npm 11 and uses that resolver in CI.
- Python application range: `>=3.9` from `backend/pyproject.toml`.
- Hosted Python baseline: Python 3.12.
- Backend test tools: `pytest==8.4.2` and `httpx==0.28.1` from `backend/requirements-test.lock`.
- Database baseline: PostgreSQL 16.
- Browser baseline: Playwright Chromium.

## Command vocabulary

Use these names consistently in issues, CI evidence, and stabilization reviews:

- `WEB`: `npm run test:web`
- `CONTRACTS-TS`: `npm run test:contracts`
- `BACKEND`: `python -m pytest backend/tests -q`
- `E2E-INSTALL`: `npm run test:e2e:install`
- `E2E`: `npm run test:e2e`
- `AUDIT`: `npm audit --audit-level=high`

`WEB` covers the frontend unit suite, typecheck, and production build. `BACKEND` includes the ST-01 contract and baseline tests. Hosted BACKEND additionally provisions a real PostgreSQL service before pytest runs.

## Clean frontend verification

From a clean checkout of the exact SHA being assessed:

```bash
node --version
npm --version
npm install --global npm@11.20.0
npm ci --ignore-scripts
npm run test:contracts
npm run test
npm run typecheck
npm run build
npm audit --audit-level=high
```

Expected runtime for hosted evidence is Node 22 with npm 11.20.0. `npm ci` must use the committed `package-lock.json`. Do not replace it with `npm install` during ordinary verification because that would change the resolved dependency graph.

A WEB failure is a product or source failure only after dependency installation succeeds. A missing runtime or broken lock is foundation failure and stays owned by ST-01.
