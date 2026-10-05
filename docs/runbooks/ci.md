# Stabilization CI Runbook

This runbook describes the current release-candidate verification workflow in `.github/workflows/ci.yml`. The workflow is evidence for the exact candidate SHA that ran. A green workflow does not, by itself, prove that GitHub branch protection or required checks are configured.

## Trigger and candidate identity

`Stabilization CI` runs on:

- pushes to `main`, `feat/**`, `fix/**`, and `chore/**`;
- pull requests targeting `main`.

Every release decision must cite the immutable `GITHUB_SHA` from the run, not a moving branch name. The API-backed E2E job also passes that SHA to the backend as `ORDERLY_SOURCE_SHA` and rejects `/health/ready` unless the response reports the same candidate SHA.

## Supported hosted runtimes

- Node.js: Node 22; application range remains `>=20.9.0 <25` from `package.json`.
- npm resolver: npm `11.20.0`.
- Python: Python 3.12; application range remains `>=3.9` from `backend/pyproject.toml`.
- Backend test/security tools: `httpx`, `pytest`, and `pip-audit` are pinned in `backend/requirements-test.lock`.
- PostgreSQL: `postgres:16-alpine`.
- Redis: `redis:7-alpine`.
- Browser: Playwright Chromium from the committed frontend dependency graph.

The workflow summary records the exact Node, npm, Python, `pip-audit`, Playwright, Chromium, PostgreSQL image, ref, and candidate SHA used for the run.

## Required release jobs

A release candidate is complete only when every job below succeeds:

1. `Dependency security`
2. `Web quality`
3. `Backend and recovery`
4. `Chromium runtime`
5. `API product E2E`
6. `Local fixture preview E2E`
7. `Release candidate evidence`

`Release candidate evidence` runs even when an upstream job fails, is cancelled, or is skipped. It fails unless every required upstream result is exactly `success`. This prevents a missing product assertion from being presented as a green candidate.

## Frontend quality and dependency verification

From a clean checkout of the exact SHA:

```bash
npm install --global npm@11.20.0
npm ci --ignore-scripts
npm run lint
npm run test:contracts
npm run test
npm run typecheck
npm run build
npm audit --audit-level=high
```

`npm run lint` is genuine ESLint execution. It is intentionally separate from TypeScript typechecking. The lint stack uses ESLint 9 maintenance packages, `typescript-eslint`, and React's Hooks plugin. Existing synchronous state-in-effect debt in application pages and existing explicit `any` use in the Playwright harness remain visible as warnings so ST-12 does not rewrite non-owned product behavior merely to establish the gate.

ST-12 removed `eslint-config-next` after the hosted audit showed that its current lint-only dependency chain introduced a high-severity `braces` advisory with no patched release available in that chain. The replacement lint graph preserves TypeScript and React Hooks checks and currently allows `npm audit --audit-level=high` to fail closed with no advisory exception list.

The committed `package-lock.json` is authoritative. Do not replace `npm ci` with `npm install` during ordinary verification because that would resolve a different graph.

## Backend and Python dependency verification

For the strict security scan, install the backend candidate non-editably so `pip-audit --strict` can inspect the installed environment without treating the application itself as an unresolved editable distribution:

```bash
python -m pip install ./backend
python -m pip install -r backend/requirements-test.lock
python -m pip_audit --local --strict --progress-spinner=off
```

The hosted security job records current JSON results for both npm and Python audits. Each audit is allowed to finish and produce evidence, then a final enforcement step fails the job if either scan outcome is not successful. This keeps one failing ecosystem from hiding the current result of the other.

For backend behavior tests, hosted CI uses an isolated PostgreSQL 16 database and Redis 7 service:

```bash
python -m pip install -e ./backend
python -m pip install -r backend/requirements-test.lock
python backend/scripts/migrate.py
python -m pytest backend/tests -q
```

The backend job also rehearses the existing transaction-consistent receipt backup/restore proof against a disposable restore database. The dump and synthetic proof fixture are deleted before the job completes.

## Chromium proof

`Chromium runtime` answers one question only: can the committed candidate provision and launch the expected browser runtime?

```bash
npm ci --ignore-scripts
npm run test:e2e:install
```

The hosted job launches headless Chromium, records the browser version, records the Playwright version, and closes the browser. Missing installation or launch is a hard failure.

## API-backed product E2E

`API product E2E` depends on successful dependency-security, web, backend, and Chromium gates. It provisions fresh PostgreSQL and Redis services, applies migrations, seeds explicit test fixtures, starts FastAPI, and waits for `/health/ready`.

Before browser assertions run, readiness must report:

- `schema_version == 1`;
- `ready == true`;
- `mode == "api"`;
- `source_sha == GITHUB_SHA`;
- PostgreSQL dependency state `ready`;
- schema dependency state `current`.

The job then lists Playwright tests with `--grep-invert 'local_demo'` and requires at least one Chromium product case before execution. An empty mandatory API suite fails instead of producing green evidence. The same filtered suite is then executed, so local-demo-only cases are not counted as skipped API assertions.

## Local fixture preview E2E

`Local fixture preview E2E` runs separately with:

```text
NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo
ORDERLY_DATA_MODE=local_demo
```

It does not provision backend services. The preflight requires at least two `local_demo` Chromium safety cases, then runs only those cases. Those assertions protect the preview boundary, including no backend API requests and no checkout/order-history/receipt behavior in local-demo mode.

Keeping preview coverage separate prevents intentional local-demo exclusions from reducing the mandatory API-mode product count.

## Failure semantics

The workflow is designed to fail closed:

- PostgreSQL container health failure blocks backend/API jobs.
- Missing or unlaunchable Chromium fails `Chromium runtime` and prevents browser-dependent release evidence.
- Unhealthy or mismatched C8 readiness fails before Playwright product assertions.
- Zero discovered API-mode mandatory tests fails the API E2E job.
- Fewer than two local-demo safety tests fails the preview job.
- High/critical npm advisories fail the dependency-security job.
- Any Python vulnerability or strict dependency-collection failure makes `pip-audit` fail and therefore fails dependency security.
- Failed, cancelled, or skipped required jobs cause `Release candidate evidence` to fail.

Do not weaken a gate to obtain a green run. Fix the incompatibility, remediate the dependency, or record the candidate as blocked.

## Evidence artifacts and retention

Hosted CI keeps short-lived evidence for 14 days:

- `stabilization-dependency-audit-*`: current npm and Python JSON audit output;
- `stabilization-api-e2e-*`: API startup log, exact readiness payload, and Playwright `test-results` when present;
- `stabilization-local-demo-*`: Playwright failure results when the preview suite fails.

Artifacts must not include `.env` files, API tokens, session secrets, private keys, database dumps, production data, or browser credentials. The backup rehearsal removes its database dump instead of uploading it. Only test-environment logs, readiness metadata, dependency audit results, and Playwright diagnostic output are retained.

## Release review

Before merging a candidate:

1. Verify the branch head SHA matches the successful workflow run.
2. Inspect every required job instead of relying only on the aggregate workflow status.
3. Confirm `npm audit --audit-level=high` and strict `pip-audit` are current for that SHA.
4. Review the branch diff for unrelated source changes, generated files, credentials, or temporary workflows.
5. Confirm documentation still describes the committed commands and failure behavior.
6. Open or update the PR against the repository's intended base branch and preserve the exact-head CI evidence in the task record.

Rollback remains commit-based. Dependency and configuration changes must retain committed lockfiles so an incompatible candidate can be reverted without silently weakening the security or verification gates.
