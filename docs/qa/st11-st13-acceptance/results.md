# Current ST11–ST13 evidence

Date: 2026-10-06. Base main: `1eaba8e396f1068f5da577aa29b78ed1cc6d2500`.

## ST11 readiness

Added a read-only readiness transaction and a two-second statement timeout. Real PostgreSQL 16.13 ACCESS EXCLUSIVE ledger lock returns 503 in under five seconds; process liveness stays 200; releasing the lock restores readiness to 200. Existing C8 success shape is unchanged.

`backend/tests/test_operations.py`: **18 passed**, zero skipped, against isolated migrated PostgreSQL. Also verifies cleanup lock safety, checksum drift rejection, legacy preservation and startup without catalog seeding.

## Pending

Full retention cascades, exact backup/restore equality, full suite and hosted candidate CI are not yet accepted. Public deployment and staging operations require separate evidence; no deployment, merge or paid resource change performed.

Retention now checks both expired and explicitly revoked guests: receipt and idempotency rows cascade away, active guest rows remain, and a second cleanup is safe. Operations suite: 18 passed with CI mode enabled.

CI guard regressions: backend subprocess with a deliberately skipped assertion exits 1; browser report guard accepts a nonempty green report and rejects empty, skipped, failed, flaky, errored or missing stats. Targeted Vitest and independent typecheck pass.

Full backend suite after provisioning required Redis: 143 passed, zero skipped (before two additional operations regressions). Web checks passed genuine lint (19 existing warnings, zero errors), frontend units, independent typecheck and production build. npm audit returned zero vulnerabilities. Public alias returned HTTP 200 without credentials; the Render readiness request timed out at 45 seconds. Historical protection claims must be corrected; a functioning public ordering backend is still unproven.

The disposable venv initially contained vulnerable pip 25.3 (installer tooling, not application request handling). The strict audit correctly failed. Pinning pip 26.2 in the test/audit lock addresses the published fixes instead of suppressing advisories. Both audit tooling and request-path dependencies must pass the new candidate scan.

Backup rehearsal compares **9** public tables (not 10); the runnable rehearsal exports one repeatable-read snapshot and verifies all table digests, complete receipt, cart revision and edited catalog after restoring into a separate database.

After pinning pip 26.2, the current strict third-party Python audit reports **no known vulnerabilities**. Official source: [pip 26.2 changelog](https://pip.pypa.io/en/stable/news/#v26-2). Hosted run [37427653835](https://github.com/anmolsansi/OrderlyApp/actions/runs/37427653835) passed all seven gates at `beda36db30a092c0d85a1475275acdd22ded2e90`; final candidate rerun remains required after the audit-lock change.
