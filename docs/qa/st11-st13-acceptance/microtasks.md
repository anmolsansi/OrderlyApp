# ST11–ST13 acceptance microtasks

Base: `1eaba8e396f1068f5da577aa29b78ed1cc6d2500`; branch: `fix/st11-st13-acceptance`.
Issues: #41 (operations), #43 (CI), #45 (release documentation). No merge, deployment, paid-plan change, or tracker status write is included in this push request.

Each check below is complete only when current evidence is recorded. Group related verified checks into focused microcommits; do not create empty commits. Dependencies: operations fixes precede recovery/CI; all local checks precede hosted CI; public acceptance requires a healthy identified deployment.

- [x] M01: Reconcile merged main and PR49 CI identity.
- [x] M02: Reuse existing ST11/12/13 GitHub issues.
- [x] M03: Confirm protected edit boundary and observer instructions.
- [x] M04: Record unavailable graph discovery and use local fallback.
- [x] M05: Inspect C8 readiness end to end.
- [x] M06: Bound readiness SQL execution and make it read only.
- [x] M07: Regression: mocked C8 positive response remains unchanged.
- [x] M08: Regression: real ledger lock returns 503 within bound.
- [x] M09: Regression: real PostgreSQL readiness succeeds after lock release.
- [x] M10: Verify process-only liveness during unavailable database.
- [x] M11: Verify expired guest cleanup includes complete receipt.
- [x] M12: Verify revoked guest cleanup includes idempotency ledger.
- [x] M13: Verify active guest receipt and ledger survive cleanup.
- [ ] M14: Verify cleanup batch bound and repeat safety.
- [x] M15: Verify cleanup skips checkout-held guest lock.
- [x] M16: Verify migration rerun preserves legacy order.
- [x] M17: Verify checksum drift fails closed without ledger mutation.
- [x] M18: Verify startup preserves edited catalog and orders.
- [ ] M19: Strengthen backup proof to exact full receipt equality.
- [ ] M20: Strengthen backup proof to exact migration ledger equality.
- [ ] M21: Rehearse PostgreSQL 16 custom dump and transaction restore.
- [x] M22: Reject skipped backend tests in hosted CI.
- [x] M23: Regression: backend skip causes failed CI exit.
- [x] M24: Reject focused Playwright tests in hosted CI.
- [x] M25: Reject skipped browser cases in hosted CI.
- [x] M26: Regression: browser report guard rejects skip/empty/error.
- [x] M27: Capture safe failure screenshots without credential traces.
- [ ] M28: Run current npm high-severity dependency audit.
- [ ] M29: Run current strict Python dependency audit.
- [ ] M30: Run genuine lint and frontend unit/contracts suite.
- [ ] M31: Run independent typecheck and production build.
- [ ] M32: Run full backend suite against isolated PostgreSQL.
- [ ] M33: Run API-mode Chromium product suite.
- [ ] M34: Run isolated local_demo safety suite.
- [x] M35: Push green operations microcommit.
- [ ] M36: Push green CI microcommit.
- [ ] M37: Reconcile all ST13-owned active and historical docs.
- [ ] M38: Refresh exact Vercel deployment identity read only.
- [ ] M39: Inspect Render service in explicitly selected workspace.
- [ ] M40: Record fresh unauthenticated public access result.
- [ ] M41: Record backend readiness and gateway result.
- [ ] M42: Prepare current acceptance ledger with honest blockers.
- [ ] M43: Publish focused PR and attach it to this chat.
- [ ] M44: Verify all seven hosted CI gates on candidate SHA.
- [ ] M45: Record ST11 and ST12 acceptance separately from public gate.
- [ ] M46: Run authorized public two-guest receipt acceptance after release prerequisites.

Evidence: `docs/qa/st11-st13-acceptance/results.md` and `docs/releases/stabilization-acceptance.md`. Public or staging criteria stay pending when prerequisites are missing.
