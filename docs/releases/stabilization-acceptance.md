# OrderlyApp — Stabilization Acceptance Record

**Status:** NOT COMPLETED — public ordering and hosted recovery remain blocked.
**Record date:** 2026-10-06. User merged PR50; platform configuration repairs triggered automatic deployments. No paid-plan change or Linear write performed.

## Candidate identities

| Surface | Exact identity | Observed result |
| --- | --- | --- |
| Merged source / CI | `c0931252fe652d8f14254db6687c228f4db8c5c5`, [PR50](https://github.com/anmolsansi/OrderlyApp/pull/50) merged | [Main CI run 37431711534](https://github.com/anmolsansi/OrderlyApp/actions/runs/37431711534) passed all seven gates. |
| Public frontend | Vercel `orderly-app`, deployment `dpl_2FbVtUZmEMggR5ztcLxxac2srLJH`, merged source above | READY. Immutable URL: [orderly-3y6vw19cj-openclawneutron-4687s-projects.vercel.app](https://orderly-3y6vw19cj-openclawneutron-4687s-projects.vercel.app); anonymous immutable-URL access not newly verified. |
| Public alias | [orderly-app-eight.vercel.app](https://orderly-app-eight.vercel.app) | Opens in fresh anonymous Chromium context; no developer sign-in or bypass. |
| Confirmed Render workspace | Anmol's workspace, `tea-d7so32sm0tmc73dc3cp0` | User explicitly confirmed; `OrderlyApp` is `srv-d7sobtkm0tmc73dcb65g`, free Virginia service. |
| Public backend | [orderlyapp.onrender.com](https://orderlyapp.onrender.com), deployment `dep-db2b4ju0tbcc738jpqn0`, merged source above | LIVE; readiness 200, ready=true, mode=api, exact source SHA. PostgreSQL/schema/configuration checks pass. |
| Configuration repairs | Merge-only `ORDERLY_DATA_MODE=api` and secure `ORDERLY_SESSION_SECRET` updates | Automatic deployment; existing environment preserved. Secret excluded from all evidence. |
| Public guest / cart / quote | Public gateway session, cart and quote | HTTP 200; customization and basket persistence succeed. |
| Public checkout | `POST /api/orderly/orders` | HTTP 503 `rate_limit_unavailable`; no accepted receipt or isolation proof. |
| New checkout limiter | `orderlyapp-checkout-limiter`, `red-db2b6jh7lnhs73earc9g` | Available, free, same Virginia workspace, persistence off, noeviction, no external allowlist. Internal connection URL not yet linked. |

The earlier Job Grid workspace and `orderlyapp-int01-api.onrender.com` observations concerned a different Render account. They are not current OrderlyApp evidence. Earlier `ORDERLY_DATA_MODE` and invalid-secret failures are repaired; the current blocker is Redis linkage. The connector does not expose connection info, and the dashboard requires user sign-in to obtain the authoritative Internal URL. Prior dated reports remain historical; no credentials are published.

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
| ST-13-AC2: fresh public visitor saves/reopens exact receipt | BLOCKED | Fresh public context passes guest creation, customization, persisted basket and quote; order submission returns 503 `rate_limit_unavailable`. No receipt was accepted and receipt isolation remains unrun. See the redacted current journey report. |
| ST-13-AC3: honest current release ledger | PASS | Current identities, local/CI evidence, historical observations and public failures are separated here. |

## Integration and release gates

INT-01 already has a disclosed separate local report at [int-01.md](../qa/int-01.md), supplemented by this candidate's 35 passing API browser cases. INT-02 has a [current local rehearsal report](../qa/int-02.md); hosted staging recovery is not accepted.

| Gate | Result | Remaining requirement |
| --- | --- | --- |
| RG-01 | BLOCKED | Complete INT-02 hosted recovery and ST-13 public receipt acceptance. |
| RG-02 | PARTIAL | Local/CI guest/provider negative cases pass; public two-guest evidence is missing. |
| RG-03 | PARTIAL | Local upgrade, restart, real outage, rollback and full restore pass; hosted staging rehearsal remains unrun. |
| RG-04 | BLOCKED | Frontend/backend identify the same merged SHA and backend readiness passes; required checkout and hosted operational evidence remain missing. |
| RG-05 | BLOCKED | Public receipt save/reopen, exact totals/address and guest isolation remain unrun. |
| RG-06 | BLOCKED | Exact deployment is verified; actual retention schedule and operational reviewer evidence remain unverified. |
| RG-07 | PASS for documentation | Current docs and explicit limitations are reconciled; overall release is not complete. |

## Tracker reconciliation, read only

GitHub #41/#43/#45 were already closed before this follow-up. Linear OPE-335 (ST11) was Done; OPE-336 (ST12) was In Progress. Neither label is acceptance evidence; no exact ST13 Linear ticket was found in the read-only query. No Linear state was changed.

## Remaining release operation

1. Obtain the created limiter's Internal URL from Render's Connect panel in the confirmed workspace; merge it as `REDIS_URL` on OrderlyApp without exposing credentials or enabling external access. Verify the automatic deployment and rerun the public journey.
2. In two fresh browser contexts, save/reload the complete synthetic receipt and prove guest isolation. Change ST-13-AC2 only after observed success.
3. Use isolated hosted staging for controlled failure/recovery, backup/restore and rollback; do not stop or corrupt the public database for a rehearsal. Establish the external database provider/access before planning these operations.
4. Verify actual daily cleanup execution and monitoring. A checked-in cron/predeploy blueprint is not a running service; no paid upgrades are authorized by this record.
5. Keep INT-02, ST13.03 and the release gate Not completed while mandatory hosted evidence is missing.

Rollback was rehearsed locally using previous main backend against the additive schema; local backups restored complete synthetic data. On public isolation, durability, idempotency or false-success regressions, disable the candidate, retain redacted evidence and use the compatible application/backup procedure in [stabilization runbook](../runbooks/stabilization.md). Never use fixture fallback or owner-authenticated bypass as public acceptance.

Merged implementation PR: [#50](https://github.com/anmolsansi/OrderlyApp/pull/50). Historical [public access](../qa/st11-st13-acceptance/public-access.json) and [guest-bootstrap failure](../qa/st11-st13-acceptance/public-journey.json) remain dated evidence. The [current confirmed-workspace journey](../qa/st11-st13-acceptance/confirmed-public-journey.json) records safe HTTP/error evidence at merged main; it contains no cookies, secrets or contact payloads.
