ST-02/ST-03 follow-up on latest main, branch `fix/st02-st03-acceptance`.

Scope: UTC-safe returning guest cookies, transactional deletion on explicit guest reset, password-free profile cleanup and criterion-indexed current acceptance. Prior implementations remain in place. No deployment or merge requested.

Twenty meaningful verification/implementation units; fewer than fifty because these tickets are already implemented. Each checked item requires its expected behavior, validation and documentation assessment. Related test/fix units may share one atomic green commit; no empty commits.

- [x] 01/20 Inspect current C1/C2 criteria and existing code/tests
- [x] 02/20 Verify current main, preserve unrelated files and create follow-up branch
- [x] 03/20 Establish isolated migrated PostgreSQL fixture
- [x] 04/20 Reproduce returning guest bootstrap with non-UTC database expiry
- [x] 05/20 Normalize cookie expiry without extending session lifetime
- [x] 06/20 Verify UTC/GMT cookie flags and stable token
- [x] 07/20 Seed current guest cart/receipt/idempotency reset regression
- [x] 08/20 Assert immediate deletion of old durable guest rows
- [x] 09/20 Delete old guest by FK cascades inside reset transaction
- [x] 10/20 Verify another guest remains unchanged
- [x] 11/20 Verify failed replacement rolls back deletion and revocation
- [x] 12/20 Update C1 lifecycle/reset/compatibility documentation
- [x] 13/20 Reproduce invalid versioned profile retaining password field
- [x] 14/20 Purge rejected C2 profile/address records safely
- [x] 15/20 Verify cleanup failure is visible and unrelated storage survives
- [x] 16/20 Verify browser profile name/id changes preserve actual receipt access and exclude other guest receipts
- [x] 17/20 Verify browser legacy-key cleanup, malformed/storage errors and explicit reset
- [x] 18/20 Run full applicable web/backend/API browser regression suites
- [x] 19/20 Map all ST-02/ST-03 criteria and update guide/status with scoped evidence
- [x] 20/20 Review staged scope, push microcommits and publish a reviewable PR with CI status

C1 reset deletes current owner-scoped rows; no legacy row adoption. C2 profile labels never authorize server data. Release-wide INT-01/INT-02/ST-13 remain separate.

Implementation/local acceptance: PASS on `a9537931c57cbf636466bf3f791e440e24ce74bd`. Unit 12 includes aborting old-scope requests and clearing checkout recovery. Source/discovery units have no runtime documentation impact; behavior units update C1/C2 guides. Publication: PR #47 targets main; the final progress microcommit is pushed and remote SHA verified. Hosted CI and merge remain pending, separately from this publication unit.

Review: https://github.com/anmolsansi/OrderlyApp/pull/47. Existing GitHub issues #22 and #24 reused; no duplicate issue or Linear task created. Nine meaningful microcommits group related red/green regression and implementation units.
