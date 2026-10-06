# Current ST11–ST13 evidence

Date: 2026-10-06. Base main: `1eaba8e396f1068f5da577aa29b78ed1cc6d2500`.

## ST11 readiness

Added a read-only readiness transaction and a two-second statement timeout. Real PostgreSQL 16.13 ACCESS EXCLUSIVE ledger lock returns 503 in under five seconds; process liveness stays 200; releasing the lock restores readiness to 200. Existing C8 success shape is unchanged.

`backend/tests/test_operations.py`: **18 passed**, zero skipped, against isolated migrated PostgreSQL. Also verifies cleanup lock safety, checksum drift rejection, legacy preservation and startup without catalog seeding.

## Pending

Full retention cascades, exact backup/restore equality, full suite and hosted candidate CI are not yet accepted. Public deployment and staging operations require separate evidence; no deployment, merge or paid resource change performed.

Retention now checks both expired and explicitly revoked guests: receipt and idempotency rows cascade away, active guest rows remain, and a second cleanup is safe. Operations suite: 18 passed with CI mode enabled.

CI guard regressions: backend subprocess with a deliberately skipped assertion exits 1; browser report guard accepts a nonempty green report and rejects empty, skipped, failed, flaky, errored or missing stats. Targeted Vitest and independent typecheck pass.
