# OrderlyApp — Quality, Safety, and Release Gates

## Release-CI Principle

A green release candidate must represent the exact source SHA and must not become green because a required environment, browser suite, dependency scan, or backend service was skipped. The ST-12 workflow is intentionally fail-closed.

The current workflow is `.github/workflows/ci.yml` (`Stabilization CI`). It runs on `main`, supported task branches, and pull requests to `main`.

## Required Hosted Jobs

### Dependency security

- clean locked frontend install;
- Node/npm/Python/audit-tool versions recorded;
- `npm audit --audit-level=high`;
- strict installed Python dependency audit with pinned `pip-audit`;
- current scan artifacts uploaded;
- job fails if either ecosystem audit fails.

Current ST-12 post-merge evidence on SHA `934208c36d323e39d9f6ddcfcc3805cbd979507f` reported zero npm vulnerabilities and no known Python vulnerabilities.

### Web quality

Runs as separate required checks:

```bash
npm run lint
npm run test:contracts
npm run test
npm run typecheck
npm run build
```

`npm run lint` is genuine ESLint. It is not an alias for typecheck.

### Backend and recovery

- isolated PostgreSQL 16 and Redis services;
- pinned Python test tooling;
- explicit migrations;
- complete backend pytest suite;
- transaction-consistent PostgreSQL backup + restore rehearsal;
- restored synthetic immutable receipt/migration state verified.

### Chromium runtime

- locked frontend dependencies;
- Playwright Chromium provisioning;
- real headless Chromium launch;
- browser/Playwright version recorded.

Missing browser runtime is a failed release gate, not an accepted product failure.

### API product E2E

Runs only after dependency-security, web, backend, and Chromium gates succeed.

Before browser tests it:

- provisions isolated PostgreSQL/Redis;
- applies migrations;
- explicitly seeds test fixtures;
- starts FastAPI in `api` mode;
- verifies `/health/ready` reports ready, API mode, required dependencies `ok`, and the exact GitHub source SHA;
- lists the API-mode Playwright suite and fails if no mandatory tests are discovered.

The current ST-12 candidate discovered and passed 23 API-mode Chromium tests.

### Local fixture preview E2E

Runs separately with `ORDERLY_DATA_MODE=local_demo` / `NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo` and requires at least the expected fixture-preview safety cases. This proves the preview remains isolated; it is not used as API fallback or checkout acceptance.

### Release candidate evidence

Runs with `if: always()` and fails unless every required upstream job result is `success`. Failed, cancelled, and skipped mandatory jobs are not treated as passes.

It records source/ref, runtime versions, PostgreSQL image, Playwright/Chromium identity, and every required job result.

## Local Narrow Checks

Use the smallest relevant test during development, then run the hosted matrix before merge/release evidence.

Frontend examples:

```bash
npm run lint
npm run test:contracts
npm run test
npm run typecheck
npm run build
```

Backend (with the documented test PostgreSQL/Redis environment):

```bash
python -m pytest backend/tests -q
```

Browser:

```bash
npm run test:e2e:install
npm run test:e2e:list
npm run test:e2e
```

Do not substitute a local incomplete environment for hosted release evidence.

## Product Safety Invariants Covered

The regression matrix protects, among other things:

- private guest A/B isolation;
- password-free demo profiles that do not become ownership;
- canonical catalog labels/prices/availability;
- revisioned cart conflict behavior and no hidden failover;
- deterministic `mock-v1` quote totals;
- immutable receipt rereads;
- atomic/idempotent checkout and lost-response replay;
- API errors never activating fixture success;
- exact order-ID/history scoping;
- synthetic address persistence and safe return paths;
- corrupt/disabled browser-storage recovery;
- keyboard checkout behavior and 375px overflow protection;
- truthful readiness/migration/seed lifecycle;
- rate-limit and retention behavior;
- backup/restore durability.

## Accessibility / UX Safety

- The complete required release journey is manual; voice is not required.
- Interactive controls must be keyboard reachable with visible labels/focus.
- Checkout errors associate feedback with affected fields and move focus to useful recovery information.
- Color is not the only state signal.
- Pending/mutation states must not claim success early.
- Checkout clearly states no real payment is charged.
- Password-free profile UI must never imply real authentication.
- `local_demo` must be visibly labelled and keep checkout unavailable.

## Error / Privacy Safety

Never expose in UI logs, CI artifacts, or documentation evidence:

- guest cookies or token hashes;
- session secret;
- database/Redis credentials/full connection URLs;
- real/private checkout contact/address payloads;
- another guest’s cart/receipt;
- production secret values.

Error evidence should contain safe error codes, request IDs, states/counts, and redacted operational context only.

## Current Candidate Evidence

ST-12 post-merge run `37347582799` passed all required jobs on exact `main` SHA `934208c36d323e39d9f6ddcfcc3805cbd979507f`.

This establishes repository candidate quality. It does **not** establish ST-13 public deployment acceptance because public unauthenticated access/current backend identity/INT-02 recovery rehearsal remain separate gates. See [`releases/stabilization-acceptance.md`](releases/stabilization-acceptance.md).