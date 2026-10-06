# Current ST11–ST13 evidence

Date: 2026-10-06. Base main: `1eaba8e396f1068f5da577aa29b78ed1cc6d2500`.

## ST11 readiness

Added a read-only readiness transaction and a two-second statement timeout. Real PostgreSQL 16.13 ACCESS EXCLUSIVE ledger lock returns 503 in under five seconds; process liveness stays 200; releasing the lock restores readiness to 200. Existing C8 success shape is unchanged.

`backend/tests/test_operations.py`: **18 passed**, zero skipped, against isolated migrated PostgreSQL. Also verifies cleanup lock safety, checksum drift rejection, legacy preservation and startup without catalog seeding.

## Scope and remaining gate

The sections below record subsequent acceptance of retention, full backup/restore, complete suites and hosted CI. Public deployment/staging operations remain separate and blocked; no deployment, merge or paid resource change performed.

Retention now checks both expired and explicitly revoked guests: receipt and idempotency rows cascade away, active guest rows remain, and a second cleanup is safe. Operations suite: 18 passed with CI mode enabled.

CI guard regressions: backend subprocess with a deliberately skipped assertion exits 1; browser report guard accepts a nonempty green report and rejects empty, skipped, failed, flaky, errored or missing stats. Targeted Vitest and independent typecheck pass.

Full backend suite after provisioning required Redis: 143 passed, zero skipped (before two additional operations regressions). Web checks passed genuine lint (19 existing warnings, zero errors), frontend units, independent typecheck and production build. npm audit returned zero vulnerabilities. Public alias returned HTTP 200 without credentials; the Render readiness request timed out at 45 seconds. Historical protection claims must be corrected; a functioning public ordering backend is still unproven.

The disposable venv initially contained vulnerable pip 25.3 (installer tooling, not application request handling). The strict audit correctly failed. Pinning pip 26.2 in the test/audit lock addresses the published fixes instead of suppressing advisories. Both audit tooling and request-path dependencies must pass the new candidate scan.

Backup rehearsal compares **9** public tables (not 10); the runnable rehearsal exports one repeatable-read snapshot and verifies all table digests, complete receipt, cart revision and edited catalog after restoring into a separate database.

After pinning pip 26.2, the current strict third-party Python audit reports **no known vulnerabilities**. Official source: [pip 26.2 changelog](https://pip.pypa.io/en/stable/news/#v26-2). Hosted run [37427653835](https://github.com/anmolsansi/OrderlyApp/actions/runs/37427653835) passed all seven gates at `beda36db30a092c0d85a1475275acdd22ded2e90`; final candidate rerun remains required after the audit-lock change.

## Real process and storage recovery

On the isolated API/browser database, edited the catalog and captured a digest of all complete receipt, cart and catalog rows. Stopped PostgreSQL: same Uvicorn process returned live 200, ready 503, guest bootstrap write 503. Restarted PostgreSQL: ready 200, all data equal. Restarted Uvicorn with application-only command: ready 200 and all data equal again (12 synthetic receipts preserved). No fixture seed ran during either restart.

API-mode browser suite: **35 passed**, zero skipped; JSON report guard passed. The first local_demo attempt failed because a second Next dev server cannot share the same checkout lock. It is a harness failure, not acceptance; preview is rerun sequentially.

Final backend suite: **145 passed**, zero skips. Final frontend suite: **110 passed**, 15 files; lint/typecheck/build pass. Sequential preview rerun: **2 passed**, zero skips; JSON guard passed. Real Redis probe separately confirmed per-guest and cross-guest aggregate bounds reject with positive Retry-After; only owned probe keys were removed.

Compatible rollback probe: started archived previous main backend on port 8042 against the current synthetic schema; exact prior SHA readiness 200, edited catalog visible, and complete receipt/cart/catalog digest unchanged. Current hosted runtime/audit candidate run [37428142914](https://github.com/anmolsansi/OrderlyApp/actions/runs/37428142914) passed all seven jobs at `64a6f412c03731e997c9a96e91e849bc4cf998e4`.

Browser-report parsing also rejects a missing/noninteger expected count; that negative case runs in the existing guard regression. Current documentation statuses distinguish local ST11, repository/hosted ST12, blocked ST13 public receipt acceptance and INT02 local versus hosted staging. Render inspection remains pending workspace selection; no resource/deployment or Linear writes occurred.

Document check: all 18 active owned/evidence documents have existing local Markdown link targets; historical plans retain dated superseded notices. No edits needed to already-correct charter/flows/architecture/backend README/history. Final PR checks will be recorded by exact SHA separately.

## Final publication and public recheck

[PR50](https://github.com/anmolsansi/OrderlyApp/pull/50) contains focused pushed microcommits. All seven hosted checks passed on exact PR candidate `a5a46a0e604dc9b4140fb1f5d32a5d41ce28a469`: [PR run 37429346691](https://github.com/anmolsansi/OrderlyApp/actions/runs/37429346691) and [push run 37429334322](https://github.com/anmolsansi/OrderlyApp/actions/runs/37429334322). Later changes are documentation/public-observation evidence only. Final head checks remain visible on the PR.

Later public observations supersede the initial catalog-only timeout diagnosis: two fresh anonymous browsers loaded catalog (HTTP 200), but guest bootstrap returns **503 `invalid_config`, field `ORDERLY_DATA_MODE`**, and the public manual journey failed. No successful public receipt or guest isolation is claimed. The immutable URL still redirects to SSO, and the separately observed Render readiness URL still times out. Runtime mode/configuration and actual backend routing must be inspected and repaired in the authorized release operation. The requested Render workspace selection remains pending.

All owned disposable servers were stopped, temporary restore DB/dump cleaned, and generated Next/pytest artifacts removed. Pre-existing unrelated QA and graph artifacts remain untouched.

## Confirmed workspace deployment follow-up — October 6, 2026

PR50 is merged at c0931252fe652d8f14254db6687c228f4db8c5c5; merged-main CI run 37431711534 passed all seven gates. The user confirmed workspace tea-d7so32sm0tmc73dc3cp0 (Anmol's workspace); its OrderlyApp service srv-d7sobtkm0tmc73dcb65g serves https://orderlyapp.onrender.com. The previously inspected Job Grid workspace and orderlyapp-int01-api backend were the wrong account and do not establish this deployment's state.

Set ORDERLY_DATA_MODE=api and configured a secure signing secret through merge-only environment updates. No secret/cookie is included in this report. Automatic deployment dep-db2b4ju0tbcc738jpqn0 became live on merged main. Readiness is 200, ready=true, mode=api, with configuration/PostgreSQL/schema/rate-limit configuration checks passing. Vercel deployment dpl_2FbVtUZmEMggR5ztcLxxac2srLJH is READY at the same source SHA.

Fresh public Chromium journey passes profile, API session, menu customization, persisted basket and server quote; POST /api/orderly/orders fails with 503 rate_limit_unavailable. No saved receipt or guest-isolation PASS is claimed. Redacted statuses: [confirmed-public-journey.json](confirmed-public-journey.json). Created free Virginia Key Value red-db2b6jh7lnhs73earc9g (orderlyapp-checkout-limiter), available, persistence off, noeviction, external access disabled. It is not yet linked: the connector exposes metadata but not connection info; the dashboard requires user sign-in to obtain its authoritative Internal URL. No paid resource or cleanup scheduler was activated.

Earlier dated public failures above are historical; this section supersedes the active mode/secret and wrong-account diagnosis. ST13.03 and INT02 hosted recovery remain Not completed.

## Private limiter connected; public journey passes — October 6, 2026

After user dashboard sign-in, read the created limiter's authoritative Internal URL and merged REDIS_URL into OrderlyApp. No external network access was enabled. Automatic Render deployment dep-db2b9ucs728c73br6m10 is LIVE at c0931252fe652d8f14254db6687c228f4db8c5c5; readiness remains 200 at that exact source. The current immutable Vercel URL returns anonymous 302; the public alias is the unauthenticated acceptance endpoint.

Fresh public Chromium guest A completes profile, customization, API basket and quote, receives checkout 201, and reads the saved receipt 200 after page reload. Deep equality compares the entire accepted and reloaded JSON; only a digest is exported. Independent context B has its own session (200), history (200) with the empty-history UI, and foreign receipt 404 with Order not found UI. [Current redacted public report](confirmed-public-journey.json); [preserved earlier limiter failure](confirmed-public-limiter-failure.json).

The first post-linkage isolation probe omitted Origin on its request-client session POST and correctly received 403 origin_forbidden. After matching the browser's same-origin header, the complete public probe passed. The application's origin check was not weakened. A quote 409 observed after checkout accompanies the now-cleared basket; saved receipt reload is 200 and exact.

ST-13-AC2 is PASS for the named public deployment; M46 is complete. ST13.03 still includes isolated hosted failure/recovery and stays unchecked. INT02 and the release gate remain Not completed: external PostgreSQL provider/staging access, hosted recovery/backup/rollback and actual daily cleanup execution/monitoring are not proven. No source edits, paid infrastructure or tracker writes were made.
