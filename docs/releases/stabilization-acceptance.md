# OrderlyApp — Stabilization Acceptance Record

**Status:** NOT COMPLETED — public deployment and recovery gates remain blocked.

**Record date:** 2026-10-05

This is the current acceptance ledger for the stabilization release. It distinguishes repository/CI proof from deployed public proof. A READY deployment, tracker status, historical successful run, or owner-authenticated diagnostic does not satisfy a criterion that requires a fresh public visitor or a current staged backend.

## Candidate identity

### Repository / CI candidate

- Repository: `anmolsansi/OrderlyApp`
- Exact source SHA: `934208c36d323e39d9f6ddcfcc3805cbd979507f`
- ST-12 post-merge Stabilization CI run: `37347582799`
- Result: PASS for the repository release-CI matrix.

### Vercel frontend candidate

- Project: `orderly-app`
- Deployment ID: `dpl_DiDAHxxRJcCboiSqWiFJjSC2NPsU`
- Immutable URL: `https://orderly-o9w42h6f0-openclawneutron-4687s-projects.vercel.app`
- Source SHA: `934208c36d323e39d9f6ddcfcc3805cbd979507f`
- State: `READY`
- Production alias observed: `https://orderly-app-eight.vercel.app`
- Protection: Vercel Authentication is enabled for the `vercel.app` deployment surface; fresh public access without developer authentication is not yet proven.

Owner-authenticated diagnostic access returned the expected OrderlyApp HTML, but authenticated bypass is diagnostic evidence only and is not ST-13-AC2 proof.

The same diagnostic showed the frontend gateway request `GET /api/orderly/restaurants` returning `504 upstream_timeout`. Therefore the hosted frontend currently cannot complete the API-mode manual journey against a healthy backend.

### Render backend candidate

- Service: `orderlyapp-int01-api`
- Service ID: `srv-db1mb4k9v7es7388ksug`
- URL: `https://orderlyapp-int01-api.onrender.com`
- Exact-SHA redeploy attempted: `dep-db1v020m7kps73cuhj5g`
- Source SHA: `934208c36d323e39d9f6ddcfcc3805cbd979507f`
- Build: PASS
- Deploy: FAIL
- Observed failure: PostgreSQL authentication rejected the configured `DATABASE_URL` because no password was supplied.
- Existing service start command also still combines migration, fixture seed and serving, which is not the merged C8 lifecycle.

A free Render Key Value instance `orderlyapp-stabilization-redis` (`red-db1v0k0m7kps73cuj180`) was created for the stabilization runtime, but safely linking managed database/Redis connection values requires an authenticated Render dashboard session. No credential was exposed or copied into this record.

## ST-12 release-CI evidence

Run `37347582799` executed against exact source SHA `934208c36d323e39d9f6ddcfcc3805cbd979507f`.

| Required job | Result | Evidence summary |
| --- | --- | --- |
| Dependency security | PASS | Clean frontend install; npm high-severity audit 0 vulnerabilities; strict installed Python dependency audit clean. |
| Web quality | PASS | Genuine ESLint, contract fixtures, frontend units, independent typecheck, production build. |
| Backend and recovery | PASS | Isolated PostgreSQL/Redis, migrations, backend suite, transaction-consistent backup/restore rehearsal. |
| Chromium runtime | PASS | Playwright Chromium provisioned and launched. |
| API product E2E | PASS | C8 readiness/source-SHA check, non-empty mandatory suite, API/PostgreSQL product E2E. |
| Local fixture preview E2E | PASS | Separate `local_demo` safety assertions; never accepted as API fallback or checkout proof. |
| Release candidate evidence | PASS | Final gate fails closed unless all required upstream results are `success`. |

This evidence proves the repository candidate in CI. It does not substitute for public deployment acceptance or INT-02 staged recovery evidence.

## Prerequisite gates

### INT-01

`development.md` still records INT-01 as Not completed and there is no current `docs/qa/int-01.md` report. Automated provider/consumer E2E evidence exists, but the formal checkpoint report required by the plan has not been published. **Result: BLOCKED / NOT RECORDED.**

### INT-02

`development.md` requires `docs/qa/int-02.md` with current release/persistence/recovery rehearsal evidence. That file does not exist on the candidate. The public/staged backend is not currently healthy, so the required rehearsal cannot truthfully be declared complete. **Result: BLOCKED.**

## ST-13 acceptance criteria

| Criterion | Result | Current observed evidence |
| --- | --- | --- |
| ST-13-AC1 — active owned docs agree with stabilized manual release | PASS for reconciled docs on `chore/st-13-release-reconciliation`; pending final branch review | Active docs now describe API-mode authority, password-free demo profiles, isolated `local_demo`, explicit migration/seed lifecycle, PostgreSQL authority, limiter-only Redis use, mock-only checkout, and deferred voice/real accounts/payments. Historical plans are labelled superseded. |
| ST-13-AC2 — fresh visitor reaches identified deployment and saves/reopens complete receipt | BLOCKED | Vercel public access is not proven; authenticated diagnostic is not acceptable proof; gateway-to-backend request currently returns 504; current Render exact-SHA deploy fails DB authentication. |
| ST-13-AC3 — release record maps every mandatory criterion and leaves blocked/unrun gates incomplete | PASS | This record identifies exact SHA/deployments, CI proof, blocked public backend/access, and required follow-up without inventing a pass. |

## RELEASE-GATE status

| Gate | Result | Evidence / blocker |
| --- | --- | --- |
| RG-01 | BLOCKED | ST-12 candidate CI is green, but INT-01/INT-02/ST-13-AC2 are not complete. |
| RG-02 | PARTIAL / BLOCKED | Provider security/identity/negative tests are green in CI; formal hosted/manual integration report is missing. |
| RG-03 | PARTIAL / BLOCKED | CI backup/restore and C8 lifecycle tests pass; INT-02 staging migration/restart/restore rehearsal is not recorded. |
| RG-04 | BLOCKED | Exact frontend SHA is deployed, but fresh unauthenticated public acceptance is not proven and the current backend candidate is unhealthy. |
| RG-05 | BLOCKED | Hosted manual receipt save/reopen and hosted two-guest isolation cannot run until the backend is healthy. |
| RG-06 | BLOCKED | Safe CI/runtime signals exist, but current public-platform reviewer/alert evidence is not recorded. |
| RG-07 | PASS for ST-13 documentation reconciliation; overall release remains blocked | Active ST-13-owned documentation is reconciled; historical plans remain history; accepted limitations and deferred scope are explicit. |

## Required action to unblock final acceptance

1. Sign in to the Render dashboard in the connected browser session.
2. Link `orderlyapp-int01-api` to the existing managed Postgres and `orderlyapp-stabilization-redis` resources using Render resource references; do not copy credentials into repository or chat.
3. Set serving to application-only (`uvicorn`) and run migrations as a separate lifecycle operation; explicitly seed only the isolated demo database if needed.
4. Verify `/health/ready` reports API mode, healthy PostgreSQL/schema/rate-limit configuration and exact source SHA.
5. Point the Vercel gateway to that backend, allow the intended public production alias without developer sign-in, and redeploy/rebuild only as required for environment changes.
6. Run the two-fresh-browser public journey, exact receipt reload, guest isolation, and INT-02 recovery rehearsal; attach the resulting evidence before changing any blocked criterion to PASS.

## Safety / rollback

- Do not expose database passwords, Redis credentials, guest cookies, signing secrets or raw checkout contact/address data in evidence.
- Do not use `local_demo`, authenticated deployment bypass, fixture fallback, or stale Render services as public acceptance proof.
- Do not weaken readiness, storage authority, rate limiting or idempotency merely to make a deployment green.
- If a public candidate violates guest isolation, duplicates an order, changes an immutable receipt, invents success, or reports false readiness, withdraw/disable the candidate and preserve failed evidence before retesting a replacement build.
