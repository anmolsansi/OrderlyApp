# OrderlyApp — Stabilization Acceptance Record

**Status:** NOT COMPLETED — public ordering and hosted recovery remain blocked.
**Record date:** 2026-10-06. No deployment, merge, paid-plan change or Linear write performed in this follow-up.

## Candidate identities

| Surface | Exact identity | Observed result |
| --- | --- | --- |
| Repository runtime/CI candidate | `64a6f412c03731e997c9a96e91e849bc4cf998e4` on `fix/st11-st13-acceptance` | [CI run 37428142914](https://github.com/anmolsansi/OrderlyApp/actions/runs/37428142914) passed all seven required gates. Subsequent changes are evidence/docs only; final PR checks are recorded separately. |
| Existing public frontend | Vercel `orderly-app`, deployment `dpl_B2UzqrDyu1uMV9SBmfNjTWWLzBT3`, main SHA `1eaba8e396f1068f5da577aa29b78ed1cc6d2500` | READY in Vercel metadata. It does **not** deploy this follow-up branch. |
| Public production alias | [orderly-app-eight.vercel.app](https://orderly-app-eight.vercel.app) | Anonymous HTTP 200; frontend access alone is not receipt acceptance. |
| Immutable frontend URL | [orderly-2wxyqwwn6-openclawneutron-4687s-projects.vercel.app](https://orderly-2wxyqwwn6-openclawneutron-4687s-projects.vercel.app) | Anonymous HTTP 302 to Vercel SSO. No authenticated bypass used. |
| Public gateway | `GET /api/orderly/restaurants` on public alias | HTTP 504, `upstream_timeout`; safe request ID returned. No catalog or order success accepted. |
| Existing backend readiness | `https://orderlyapp-int01-api.onrender.com/health/ready` | Request timed out at 45 seconds (HTTP 000); current backend SHA/configuration is unverified. Render control-plane inspection requires explicit workspace selection. |

The earlier October 5 ledger described protected frontend aliases and an unhealthy Render deploy. The public alias now opens; immutable deployment authentication and public gateway failure remain. Prior Render deployment/configuration observations are historical, not current proof.

Dependency identity: unchanged frontend `package-lock.json`; backend audit/test lock now pins pip 26.2, pytest 9.0.3, httpx 0.28.1 and pip-audit 2.10.1. Hosted CI resolves and strictly scans backend runtime dependencies; backend runtime ranges are not a frozen transitive runtime lock. See [CI runbook](../runbooks/ci.md) and [current detailed evidence](../qa/st11-st13-acceptance/results.md).

## Acceptance criteria

| Criterion | Result | Current evidence |
| --- | --- | --- |
| ST-11-AC1: real required DB outage | PASS, isolated local runtime | Same Uvicorn process: live 200, ready 503, guest write 503 while PostgreSQL stopped; ready 200 after recovery. Real ledger lock also returns bounded 503. |
| ST-11-AC2: restart preserves data, startup does not seed | PASS, isolated local runtime | Database and API restarts preserved complete saved receipts/carts and edited catalog; previous main backend also remained compatible. |
| ST-11-AC3: safe cleanup and exact receipt backup/restore | PASS, isolated local + hosted CI | Active guests retained; expired/revoked receipts and replay keys removed; held guest locks skipped; batch limit 100 and repeat safety; exported snapshot dump restored into separate DB with all nine public table digests equal. CI compares complete receipt and exact migration ledger. |
| ST-12-AC1: clean hosted complete matrix | PASS | Exact runtime candidate CI has seven successful jobs: security, web, backend/recovery, Chromium, API E2E, preview E2E, release evidence. Final PR/head identity is an additional gate. |
| ST-12-AC2: missing/skipped mandatory checks fail | PASS | Real services and Chromium required; focused browser tests forbidden; skip/empty/error/flaky browser guard and skipped-backend subprocess regressions verified. |
| ST-12-AC3: dependency security | PASS | npm zero vulnerabilities; strict third-party Python audit clean after patching pip installer. Hosted current security job passed. |
| ST-13-AC1: active owned documentation agrees | PASS for repository candidate | Active docs describe canonical API/private guest data, password-free profiles, isolated checkout-disabled preview, explicit migration/seed/cleanup, mock-only manual release and deferred voice/accounts/payments. Historical plans retain superseded notices. |
| ST-13-AC2: fresh public visitor saves/reopens exact receipt | BLOCKED | Public alias opens but gateway catalog request is 504; immutable URL redirects to developer SSO. Two-guest public order acceptance cannot run successfully. |
| ST-13-AC3: honest current release ledger | PASS | Current identities, local/CI evidence, historical observations and public failures are separated here. |

## Integration and release gates

INT-01 already has a disclosed separate local report at [int-01.md](../qa/int-01.md), supplemented by this candidate's 35 passing API browser cases. INT-02 has a [current local rehearsal report](../qa/int-02.md); hosted staging recovery is not accepted.

| Gate | Result | Remaining requirement |
| --- | --- | --- |
| RG-01 | BLOCKED | Complete INT-02 hosted recovery and ST-13 public receipt acceptance. |
| RG-02 | PARTIAL | Local/CI guest/provider negative cases pass; public two-guest evidence is missing. |
| RG-03 | PARTIAL | Local upgrade, restart, real outage, rollback and full restore pass; hosted staging rehearsal remains unrun. |
| RG-04 | BLOCKED | Existing frontend is a different SHA from the follow-up; public gateway fails. |
| RG-05 | BLOCKED | Public receipt save/reopen, exact totals/address and guest isolation remain unrun. |
| RG-06 | BLOCKED | Live deployment/retention schedule/operational reviewer evidence is unverified. |
| RG-07 | PASS for documentation | Current docs and explicit limitations are reconciled; overall release is not complete. |

## Tracker reconciliation, read only

GitHub #41/#43/#45 were already closed before this follow-up. Linear OPE-335 (ST11) was Done; OPE-336 (ST12) was In Progress. Neither label is acceptance evidence; no exact ST13 Linear ticket was found in the read-only query. No Linear state was changed.

## Remaining release operation

1. Select the Render workspace explicitly, inspect the current service/deploy SHA and safe configuration metadata.
2. Repair database/Redis resource linkage through secure platform references; never publish credentials. Separate migrations from serving and fixture seed. A free-plan service cannot silently gain paid predeploy/cron capabilities.
3. Establish a healthy identified API-mode backend with exact source SHA and limiter dependency; verify gateway routing.
4. Merge/deploy the reviewed candidate only with release authorization; identify frontend/backend deployed SHAs and public alias.
5. In two fresh browser contexts, save/reload complete synthetic receipt, test guest isolation and record controlled hosted staging failure/recovery. Verify actual daily cleanup execution and monitoring.
6. Change blocked criteria to PASS only after those observations.

Rollback was rehearsed locally using previous main backend against the additive schema; local backups restored complete synthetic data. On public isolation, durability, idempotency or false-success regressions, disable the candidate, retain redacted evidence and use the compatible application/backup procedure in [stabilization runbook](../runbooks/stabilization.md). Never use fixture fallback or owner-authenticated bypass as public acceptance.
