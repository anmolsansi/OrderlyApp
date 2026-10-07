# OrderlyApp — Stabilization Acceptance Record

**Status:** NOT COMPLETED — public receipt/isolation and named hosted restart/outage/backup/rollback/retention checks pass; remaining INT-02 cases and actual cleanup scheduling remain pending.
**Record date:** 2026-10-06; hosted recovery update 2026-10-07. User merged PR50; platform configuration repairs triggered automatic deployments. No paid-plan change or Linear write performed.

## Candidate identities

| Surface | Exact identity | Observed result |
| --- | --- | --- |
| Merged source / CI | `c0931252fe652d8f14254db6687c228f4db8c5c5`, [PR50](https://github.com/anmolsansi/OrderlyApp/pull/50) merged | [Main CI run 37431711534](https://github.com/anmolsansi/OrderlyApp/actions/runs/37431711534) passed all seven gates. |
| Public frontend | Vercel `orderly-app`, deployment `dpl_2FbVtUZmEMggR5ztcLxxac2srLJH`, merged source above | READY. Immutable URL: [orderly-3y6vw19cj-openclawneutron-4687s-projects.vercel.app](https://orderly-3y6vw19cj-openclawneutron-4687s-projects.vercel.app); anonymous immutable URL returns 302; public alias is accepted below. |
| Public alias | [orderly-app-eight.vercel.app](https://orderly-app-eight.vercel.app) | Opens in fresh anonymous Chromium context; no developer sign-in or bypass. |
| Confirmed Render workspace | Anmol's workspace, `tea-d7so32sm0tmc73dc3cp0` | User explicitly confirmed; `OrderlyApp` is `srv-d7sobtkm0tmc73dcb65g`, free Virginia service. |
| Public backend | [orderlyapp.onrender.com](https://orderlyapp.onrender.com), deployment `dep-db2b9ucs728c73br6m10`, merged source above | LIVE; readiness 200, ready=true, mode=api, exact source SHA. PostgreSQL/schema/configuration checks pass. |
| Configuration repairs | Merge-only `ORDERLY_DATA_MODE=api`, secure `ORDERLY_SESSION_SECRET` and private `REDIS_URL` updates | Automatic deployment; existing environment preserved. Secret excluded from all evidence. |
| Public guest / cart / quote | Public gateway session, cart and quote | HTTP 200; customization and basket persistence succeed. |
| Public checkout | `POST /api/orderly/orders` | HTTP 201; exact complete receipt reload 200; independent guest foreign receipt 404 and empty history. |
| New checkout limiter | `orderlyapp-checkout-limiter`, `red-db2b6jh7lnhs73earc9g` | Available, free, same Virginia workspace, persistence off, noeviction, no external allowlist. Authoritative Internal URL linked privately to OrderlyApp; checkout proves working enforcement connection. |

The earlier Job Grid workspace and `orderlyapp-int01-api.onrender.com` observations concerned a different Render account. They are not current OrderlyApp evidence. Earlier `ORDERLY_DATA_MODE`, invalid-secret and Redis-linkage failures are repaired. The connector does not expose connection info; after user dashboard sign-in, the authoritative Internal URL was read and connected. External access remains blocked. Prior dated reports remain historical; no credentials are published.

Dependency identity: unchanged frontend `package-lock.json`; backend audit/test lock now pins pip 26.2, pytest 9.0.3, httpx 0.28.1 and pip-audit 2.10.1. Hosted CI resolves and strictly scans backend runtime dependencies; backend runtime ranges are not a frozen transitive runtime lock. See [CI runbook](../runbooks/ci.md) and [current detailed evidence](../qa/st11-st13-acceptance/results.md).

## Acceptance criteria

| Criterion | Result | Current evidence |
| --- | --- | --- |
| ST-11-AC1: real required DB outage | PASS, isolated local runtime | Same Uvicorn process: live 200, ready 503, guest write 503 while PostgreSQL stopped; ready 200 after recovery. Real ledger lock also returns bounded 503. |
| ST-11-AC2: restart preserves data, startup does not seed | PASS, isolated local runtime | Database and API restarts preserved complete saved receipts/carts and edited catalog; previous main backend also remained compatible. |
| ST-11-AC3: safe cleanup and exact receipt backup/restore | PASS, isolated local + hosted CI | Active guests retained; expired/revoked receipts and replay keys removed; held guest locks skipped; batch limit 100 and repeat safety; exported snapshot dump restored into separate DB with all nine public table digests equal. CI compares complete receipt and exact migration ledger. |
| ST-12-AC1: clean hosted complete matrix | PASS | Merged-main CI run 37431711534 has seven successful jobs: security, web, backend/recovery, Chromium, API E2E, preview E2E, release evidence. Both platforms identify the merged main source. |
| ST-12-AC2: missing/skipped mandatory checks fail | PASS | Real services and Chromium required; focused browser tests forbidden; skip/empty/error/flaky browser guard and skipped-backend subprocess regressions verified. |
| ST-12-AC3: dependency security | PASS | npm zero vulnerabilities; strict third-party Python audit clean after patching pip installer. Hosted current security job passed. |
| ST-13-AC1: active owned documentation agrees | PASS for repository candidate | Active docs describe canonical API/private guest data, password-free profiles, isolated checkout-disabled preview, explicit migration/seed/cleanup, mock-only manual release and deferred voice/accounts/payments. Historical plans retain superseded notices. |
| ST-13-AC2: fresh public visitor saves/reopens exact receipt | PASS, named public build | Fresh guest A saves a mock receipt (201), then reloads the complete exact JSON (200). Guest B has its own session, empty history and foreign receipt 404. Both browser contexts lack developer authentication. See the redacted current journey report. |
| ST-13-AC3: honest current release ledger | PASS | Current identities, local/CI evidence, historical observations and public failures are separated here. |

## Integration and release gates

INT-01 already has a disclosed separate local report at [int-01.md](../qa/int-01.md), supplemented by this candidate's 35 passing API browser cases. INT-02 has a [current local rehearsal report](../qa/int-02.md); hosted INT-02.03 restart/outage and INT-02.04 backup/rollback now pass in the isolated clean branch. Remaining hosted case obligations are open.

| Gate | Result | Remaining requirement |
| --- | --- | --- |
| RG-01 | BLOCKED | Complete remaining INT-02 hosted cases and operational scheduling proof; public receipt acceptance now passes. |
| RG-02 | PASS for guest isolation | Local/CI provider negatives and public independent guest history/foreign-receipt denial pass. Hosted operational gates remain separate. |
| RG-03 | PARTIAL | Local upgrade passes; hosted restart, real outage, full restore and compatible rollback/current-main recovery pass. Hosted legacy upgrade/cutover remains open. |
| RG-04 | BLOCKED | Frontend/backend identify the same merged SHA and readiness/checkout pass; remaining hosted INT-02 and daily scheduling acceptance remain missing. |
| RG-05 | PASS for public receipt/isolation | Complete receipt JSON survives reload exactly, including totals/address; independent guest history is empty and foreign receipt returns 404. Hosted recovery is not inferred. |
| RG-06 | BLOCKED | Exact deployment is verified; actual retention schedule and operational reviewer evidence remain unverified. |
| RG-07 | PASS for documentation | Current docs and explicit limitations are reconciled; overall release is not complete. |

## Tracker reconciliation, read only

GitHub #41/#43/#45 were already closed before this follow-up. Linear OPE-335 (ST11) was Done; OPE-336 (ST12) was In Progress. Neither label is acceptance evidence; no exact ST13 Linear ticket was found in the read-only query. No Linear state was changed.

## Remaining release operation

1. The isolated **st13-recovery-clean** (`br-dawn-bonus-aqvk2u1j`) is explicitly schema-only and exact Render linkage was guarded before synthetic bootstrap. Hosted restart/outage, full native backup/restore, one-off locked-row retention and compatible rollback/current-main recovery pass. Staging recovered to `9a72d02` in live deployment `dep-db3500rncjis73efur7g`. See [dated staging verification](../qa/st13-staging-2026-10-07.md). Production database and shared Redis were not faulted. Clean branch expires October 8 at 9:05:48 a.m. EDT.
2. Verify actual daily cleanup execution and monitoring. A checked-in cron/predeploy blueprint is not a running service; no paid upgrades are authorized by this record.
3. Complete the outstanding hosted cases in INT-02, then close ST13.03 and the release gate only when the named hosted observations pass. Public receipt and guest isolation are already proven; retest them if deployed source changes.

Rollback was rehearsed locally using previous main backend against the additive schema; local backups restored complete synthetic data. On public isolation, durability, idempotency or false-success regressions, disable the candidate, retain redacted evidence and use the compatible application/backup procedure in [stabilization runbook](../runbooks/stabilization.md). Never use fixture fallback or owner-authenticated bypass as public acceptance.

Merged implementation PR: [#50](https://github.com/anmolsansi/OrderlyApp/pull/50). Historical [public access](../qa/st11-st13-acceptance/public-access.json) and [guest-bootstrap failure](../qa/st11-st13-acceptance/public-journey.json) remain dated evidence. The [current confirmed-workspace journey](../qa/st11-st13-acceptance/confirmed-public-journey.json) records passing safe HTTP/status and full-receipt digest evidence at merged main; it contains no cookies, secrets or contact payloads.

Evidence follow-up: [merged PR51](https://github.com/anmolsansi/OrderlyApp/pull/51). The earlier [limiter failure](../qa/st11-st13-acceptance/confirmed-public-limiter-failure.json) remains historical evidence.

Hosted staging update: resources exist but no hosted recovery PASS is claimed. The Neon schema-only test branch expires October 7, 2026, at 5:17 a.m. EDT. Initial Render builds failed on absent DATABASE_URL; no public configuration was changed.

October 7 update: staging deploy `dep-db33rsnlk1mc739bfm00` is live at merged PR51 main `9a72d0288ea8b2fe9f14b0973a079ec661497835`, with HTTP 200 readiness. This does not supersede the October 6 public journey evidence or establish any hosted recovery pass. The replacement Neon branch expires October 8 at 8:39 a.m. EDT and contains inherited data; see the current staging report above.

Latest October 7 update supersedes the initial inherited-branch and connection blockers above: clean schema-only linkage, hosted restart/outage, all-nine-table backup/restore, locked-row retention, compatible rollback and current-main recovery pass. [Safe recovery evidence](../qa/st11-st13-acceptance/hosted-recovery-2026-10-07.json). Service inventory confirms **no running OrderlyApp daily cron**; the concrete pending service and paid approval requirement are in the [runbook](../runbooks/stabilization.md#pending-daily-cleanup-service--approval-required). No scheduled cleanup or complete INT-02/release PASS is inferred.
