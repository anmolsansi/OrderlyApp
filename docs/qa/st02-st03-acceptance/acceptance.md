# ST-02 / ST-03 current branch acceptance

Date: 2026-10-05, America/New_York. Reviewer/executor: Codex, requested by Anmol Sansi.
Base: GitHub main `b2c8c75d1120c59a9dcae6ded68f4f0cf51ab970`.
Implementation/test candidate: `a9537931c57cbf636466bf3f791e440e24ce74bd`, branch `fix/st02-st03-acceptance`. Later commits in this packet change documentation/progress only.

**Implementation and local acceptance: PASS. GitHub CI/merge: pending. Public deployment/release acceptance: not performed by this task.** This report does not complete INT-01, INT-02, ST-13 or the overall release gate. Historical merged implementations were reused; this work closes the current ST-02/ST-03 gaps.

## Changes and reasons

- Guest cookie expiry is formatted in UTC/GMT. A returning guest previously crashed when Postgres returned its expiry in a non-UTC session timezone. The actual expiry and signed token are preserved; no sliding lifetime is introduced.
- Explicit reset removes the old guest owner in the existing transaction, using FK cascades to delete current cart, receipt and retry-ledger rows. Legacy exact-owner rows are also deleted. Failure to create the replacement rolls the transaction back. Other guests and unowned legacy data are unchanged.
- Reset aborts active protected requests, prevents queued old-scope cart writes from running and blocks protected requests while reset settles. The account action clears this tab's checkout recovery after server reset and reports a partial result if storage cleanup fails.
- Decoded C2 records that fail validation are deleted from their exact profile/address key. Unknown password fields are therefore not retained after successful cleanup. A failed deletion is visible. Malformed JSON retains its existing explicit-clear recovery flow. No global storage clear is used.
- Real browser regressions save receipts for two independent guests, change the local profile ID/name, test own/foreign receipt access and history, and verify explicit reset plus legacy-secret cleanup. The C2 positive fixture is consumed by the actual profile implementation.

## Numbered criteria

| Criterion | Result | Actions / expected and observed evidence |
|---|---|---|
| ST-02-AC1: guest isolation, forged cookie and spoofed headers | PASS locally | `backend/tests/test_guest_isolation.py` uses independent cookie jars and persisted guest rows: A retains its basket when B clears its own; B lists no A order and receives generic 404 for A's receipt; missing/forged cookies return 401 despite an owner header. `tests/gateway.test.ts` verifies header stripping. New real-gateway browser test independently saves A/B receipts and confirms 200 for own, 404 for foreign, and owner-only history even after local ID/name tampering. |
| ST-02-AC2: allowed bootstrap, forbidden Origin, expiry | PASS locally | Valid bootstrap preserves the token; disallowed mutation returns 403; missing and expired sessions return 401. New real-PG test sets `America/New_York` on identity connections and observes successful returning bootstrap, the same token, and GMT expiry matching the original signed timestamp. |
| ST-02-AC3: private cookie, no browser ownership authority/password | PASS locally | Backend HTTPS cookie is HttpOnly/Secure/SameSite Lax; browser gateway rewrites path to `/api/orderly`. Local HTTP correctly omits Secure. Session/cart/order responses do not expose the internal guest owner; browser profile ID is only presentation. Existing gateway/body/storage checks and browser cookie test pass. Hosted HTTPS behavior is not claimed tested here. |
| ST-03-AC1: no password UI/storage after successful migration | PASS locally | Browser chooser has no password input; exact legacy credential/session/profile/address keys disappear while an unrelated preference survives. Unit tests reject/delete password-bearing C2 profile/address records and verify a blocked delete reports failure. Frozen C2 fixture produces the expected credential-free storage snapshot. |
| ST-03-AC2: profile name/local ID never grants server orders | PASS locally | Two real browser guests save separate durable receipts. A adopts B's display ID/name and then renames itself: A can still read A's receipt, cannot read B's receipt, and lists only A's orders; its HttpOnly guest token is unchanged. Local forget also leaves ownership unchanged. Explicit server reset rotates the token separately. |
| ST-03-AC3: malformed/unavailable storage does not crash; reset result clear | PASS locally | Browser malformed-profile recovery, denied localStorage getter on sign-in/account/checkout, explicit temporary profiles, and late storage failures pass without page errors. New reset fault test blocks sessionStorage recovery removal: token rotates, visible message states server success/local cleanup failure, and action is re-enabled. Successful reset clears old recovery and returns empty history; B's receipt remains available. |

The new deletion test checks physical `guest_carts`, `guest_orders` and `order_idempotency` counts immediately after reset, before retention cleanup. The replacement-failure variant confirms old cart, receipt, idempotency row, cookie and unrevoked owner survive the 503. Both defects were reproduced as failing regressions before their fixes.

## Verification and artifacts

| Check | Current result | Artifact |
|---|---|---|
| Frontend unit suite | 90 passed, 13 files | [units.log](units.log) |
| Web lint/typecheck/production build | Passed; existing 16 ESLint warnings, 0 errors | [web.log](web.log) |
| Focused final changed-file lint/typecheck | Passed; existing account effect warning only | Commands below |
| Backend full suite with real Postgres/Redis | 93 passed; existing Starlette/httpx deprecation warning | [backend.log](backend.log) |
| Full real API browser suite | 26 passed, 0 skipped, 0 failed | [api-e2e.log](api-e2e.log) |
| Separate local preview safety suite | 2 passed, 0 skipped, 0 failed | [local-demo.log](local-demo.log) |

`web.log` contains the full web check before the final C2 fixture-only test addition (89 units). `units.log` is the final complete 90-test unit run. Final changed-file ESLint and TypeScript checks include that addition. No runtime source changed afterward.

Local runtime: Node 24.19.0, Python 3.12, PostgreSQL 16, Redis 8.8.0, Playwright 1.59.1 Chromium. Frontend uses the committed lockfile; Python uses the existing isolated venv. The CI Node/Redis versions and clean dependency resolution remain separately verified by GitHub CI. Two synthetic databases separated backend tests from browser fixtures. Catalog seed was explicit and test-only. Browser frontend ran from a temporary checkout containing the candidate's runtime source; tests ran against the actual same-origin gateway and FastAPI/Postgres. No production orders were created.

Commands (supply only isolated test environment values):

```bash
npm run test:web
npm run test
npm run typecheck
npx eslint app/account/page.tsx lib/api.ts tests/api.test.ts tests/auth.test.ts e2e/guest-profile-acceptance.spec.ts
PYTHONPATH=backend python -m pytest backend/tests -q
# API-mode frontend/backend running; PLAYWRIGHT_BASE_URL set; PLAYWRIGHT_SKIP_WEBSERVER=1
npx playwright test --grep-invert local_demo
# Restart frontend explicitly in local_demo mode, then:
npx playwright test --grep local_demo
```

## Contract, migration and handoff

C1/C2 valid version-1 shapes are unchanged and current local provider/consumer checks pass. Reset now fulfills the already-frozen C1 deletion promise rather than weakening it. No schema migration/backfill is needed: 004–006 already declare the required ownership cascades. All six migrations were applied to fresh disposable databases, and the backend suite includes operational migration checks.

Consumers should use the guest cookie and typed API results; local profile IDs do not authorize data. Cancellation applies to this adapter instance/tab. A server write already committed cannot be undone by aborting its HTTP request; successful reset deletes its old guest scope transactionally. Other tabs must refresh server state and treat missing/revoked scope honestly. Browser storage denial cannot be bypassed: report incomplete cleanup and let the user enable storage.

Rollback must retain guest isolation and the current additive schemas; never restore browser-selected ownership or password collection. Completed reset intentionally deletes old scope data and cannot be undone by rolling application code back. The runtime deployment is untouched by this task.

Unrelated ST-06 pagination, ST-11 readiness, ST-12 CI enforcement, and hosted release-proof gaps remain separate. Source graph export was previously rejected by automatic approval review; local source inspection was used without retrying that export. No live observer memory or skills were changed.
