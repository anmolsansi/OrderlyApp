# ST-04 / ST-05 / ST-06 acceptance — 2026-10-05

Implementation and local acceptance: **Completed** on `fix/st04-st06-acceptance`. PR publication, hosted CI and merge are separate gates. No deployment or public release is asserted.

Base main: `9c96d405472432492620e98dfb89d20a43fd482c` (ST-02/ST-03 PR #47 merged). Final behavior/test source: `566c21b`; subsequent changes are acceptance documentation only. Issues: [ST-04 #26](https://github.com/anmolsansi/OrderlyApp/issues/26), [ST-05 #28](https://github.com/anmolsansi/OrderlyApp/issues/28), [ST-06 #30](https://github.com/anmolsansi/OrderlyApp/issues/30).

## Changes and provider handoff

The catalog, revisioned PostgreSQL basket and deterministic snapshot implementation already existed on main. This follow-up retains that implementation and closes evidence/contract gaps plus one live gateway bug:

- The browser gateway discarded order-list `limit` and `cursor`. GET lists now forward those two parameters only; order writes and individual reads do not forward them. Owners still come exclusively from the signed guest cookie.
- `fetchOrderReceipts({limit, cursor, signal})` exposes pagination without changing default calls.
- C3 examples now satisfy the actual Restaurant/MenuItem schema. C4 selects the required Small option, and C5 snapshots its label and zero-cent delta. The exact total remains 1192 cents. C6 first/replay examples carry the same complete C5 receipt and fingerprint; no ST-07 implementation changes were made.
- Every one of the fifteen C3 negative examples now contains an executable request. Real HTTP tests assert exact status/code/fields and unchanged previously accepted PostgreSQL cart revision/items. Separate domain tests consume those same examples.
- New checks prove rollback after a SQL update, distinct API process restarts without Redis, actual database connection refusal and recovery, immutable receipt reads across catalog edits/restart, timestamp-tie pagination, and real browser gateway ownership/page bounds.

C3/C4/C5 schema version 1 is frozen for this branch's provider/local acceptance. Consumers: C4 input canonicalization, C5 pricing/snapshot construction, C6 first/replay fixture, frontend receipt transport, real catalog/cart and receipt browser flows. INT-01/INT-02 and the public release gate remain separately unaccepted.

## Numbered criterion evidence

| Criterion | Result | Current runnable evidence |
| --- | --- | --- |
| ST-04-AC1: invalid fixtures rejected before persistence | PASS | `test_catalog_rejection_precedes_persistence`: all 15 shared cases through HTTP, exact fields, request ID, unchanged accepted PG basket. Additional strict bool/string/fraction quantity, 501-character notes and 51-line rejection. |
| ST-04-AC2: spoofed labels/prices never saved | PASS | C4 model/HTTP reject extra name/price fields; accepted basket unchanged. Legacy internal validator canonicalizes spoofed values. Shared positive C3→C4→C5 example exercises authoritative output. |
| ST-04-AC3: search/cuisine/open/sort and availability | PASS | `test_postgres_catalog_search_reads_authoritative_availability`: query, cuisine, open filter, rating/fee sort, no match and changed availability from PG. Domain search tests preserve existing behavior. |
| ST-05-AC1: concurrent revision yields one winner/conflict | PASS | Two real concurrent PG transactions; one success and one conflict, exact persisted winning basket. HTTP conflict test asserts 409/current_cart envelope. |
| ST-05-AC2: restart, Redis absence | PASS | `test_real_api_restart_and_unreachable_postgres_preserve_state`: four distinct uvicorn child PIDs, no REDIS_URL, retained signed guest cookie, exact basket equality after restart. |
| ST-05-AC3: PG failure returns 503 without fallback | PASS | Same process rehearsal uses a real bound-but-not-listening local PostgreSQL endpoint: connection refusal, cart/receipt HTTP 503/storage_unavailable; reconnect to original DB restores exact state. Missing/configured-failure tests forbid JSON/Redis fallback. Post-update injected failure rolls back previously accepted revision/items. |
| ST-06-AC1: 1192 cents, every checkout field unchanged | PASS | Shared C3/C4/C5 full-model conformance; PostgreSQL snapshot full equality including complete checkout; totals exactly 1192. Half-up/promo/tip boundaries remain active. |
| ST-06-AC2: later menu changes cannot alter receipt | PASS | Receipt SQL roundtrip after changes to name, prices, modifier labels/deltas; full snapshot equality. Separate real-process restart retains exact receipt after catalog price mutation. |
| ST-06-AC3: legacy receipts are never invented | PASS | Incomplete legacy `orders` row remains stored offline; C5 list/read never adopt it or fabricate owner/address/tip. |

Additional C5 proof: equal-created-at IDs paginate without skips/duplicates; real Chromium creates three own orders and one foreign order, reads pages of 2 then 1, ignores forged owner query, rejects limit 51/foreign cursor with 422 and foreign receipt with 404.

## Environment and commands

Synthetic local API mode, PostgreSQL 16 isolated databases `orderly_st04_st06_backend` and `orderly_st04_st06_browser`; Redis disposable loopback port 56391 for full regression only. Runtime restart test deliberately omits Redis. Chromium uses real Next.js gateway, API and seeded synthetic catalog. No production provider/data touched.

- `PYTHONPATH=backend ORDERLY_TEST_DATABASE_URL=<isolated-PG> REDIS_URL=<isolated-Redis> python -m pytest backend/tests -q`: **136 passed**, no skips. One existing Starlette/httpx deprecation warning.
- `npm run test:web`: lint, **93 unit tests**, typecheck and production build passed. Final frontend contract/test-only changes were rechecked with lint, units and typecheck. Lint has **16 existing warnings, zero errors**.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3291 PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --grep-invert local_demo`: **27 passed**, no skips; API gateway configured with `ORDERLY_API_ORIGIN`.
- Local-demo safety with both test runner/server mode set to `local_demo`: **2 passed**, no skips.
- Migration 001–006 applied successfully to a new browser database; backend migrations likewise applied before tests. Catalog seed is explicit, gated and test-only. Restart never reseeds.
- `git diff --check`: passed before publication.

The database fault is actual connection refusal to a deliberately unavailable endpoint, **not a stopped production database or hosted failover drill**. Runtime snapshots are stored through the existing transaction-friendly helper; browser acceptance separately uses the full order-create API. No Redis-backed checkout readiness is claimed for the Redis-free restart test.

## Recovery and rollback

No migration or new dependency is introduced. Existing additive PG schemas/accepted snapshots remain intact. For rollback, preserve the database and quiesce writes before reverting to any version with weaker cart authority. Do not import legacy JSON/Redis carts or reconstruct old receipts. Reverting gateway pagination leaves backend pagination usable directly but would restore the browser bug.

## Limitations and publication

Hosted CI is queued and is not counted as local acceptance. PR merge, deployment, INT-01/INT-02, retention/operational drills and RELEASE-GATE remain outside this completion claim. Existing unrelated audit and graph outputs are preserved.

Graph indexing/export was unavailable because automatic approval review rejected exporting private repository contents; it was not bypassed. Existing local paths/source and runnable tests supplied the evidence.

Published [PR #48](https://github.com/anmolsansi/OrderlyApp/pull/48). At publication, hosted dependency/web/backend/Chromium checks are queued; no hosted pass is asserted. Local services are stopped and generated Next.js files restored/removed.
