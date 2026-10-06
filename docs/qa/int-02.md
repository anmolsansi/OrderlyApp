# INT-02 — Local release and recovery rehearsal

**Status:** Not completed as a hosted staging/release gate. Local synthetic rehearsal passed on 2026-10-06.

Runtime candidate: `64a6f412c03731e997c9a96e91e849bc4cf998e4`; prior compatible backend: `1eaba8e396f1068f5da577aa29b78ed1cc6d2500`. Runtime API code is unchanged since `beda36db30a092c0d85a1475275acdd22ded2e90`; audit lock follows in the candidate above. Subsequent evidence/docs-only commits do not imply public deployment.

| Case | Local result | Evidence |
| --- | --- | --- |
| INT-02.01 complete matrix | PASS | 145 backend, 110 frontend, 35 API Chromium, two preview tests; genuine lint (19 disclosed pre-existing warnings), typecheck/build; no skipped assertions. Seven hosted CI jobs pass on exact candidate. |
| INT-02.02 additive legacy upgrade | PASS locally | Disposable old 001 schema and old ledger copied; two concurrent migrators serialized, filled checksums and applied remaining migrations; legacy order retained and not adopted into guest receipts. |
| INT-02.03 real failure/restart | PASS locally | Edited catalog; 12 actual synthetic API receipts. Live/ready/write under real stopped DB: 200/503/503; recover ready 200; complete receipt/cart/catalog digest unchanged after DB restart and Uvicorn restart. |
| INT-02.04 backup/rollback | PASS locally | Exported transaction snapshot; PG16 custom dump/one-transaction restore to separate DB; nine public table digests equal, full receipt/cart revision/catalog checked. Prior main backend ready 200 with edited catalog and no durable-data change. |
| INT-02.05 retention/abuse | PASS locally | Expired/revoked cascades, active preservation, 100-row batch, idempotent rerun, checkout-held guest lock; real Redis per-guest/aggregate bounds; 429 Retry-After response and fail-closed limiter regressions. |
| INT-02.06 responsive/keyboard/recovery | PASS locally | Current API browser suite includes 375px keyboard checkout, selected address receipt preservation, denied/corrupt storage, safe return navigation, ambiguous response retry and exact receipt reload. |

Local environment: macOS, PostgreSQL 16.13 on isolated port 55439, disposable Redis on 56391, FastAPI 8041, gateway 3291. Preview ran sequentially on 3292 because Next dev permits one server per checkout. Synthetic data only; signing secrets/cookies/addresses/dumps excluded from exported evidence. [Detailed results and runnable backup rehearsal](st11-st13-acceptance/results.md).

These local results do not establish current hosted staging topology, current Render database/Redis linkage, actual daily cleanup execution or public receipt acceptance. INT-02 remains Not completed until its hosted staging/release obligations pass. See [current release ledger](../releases/stabilization-acceptance.md).
