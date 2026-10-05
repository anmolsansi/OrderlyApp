# ST-04–ST-06 follow-up microtasks

Base: `9c96d405472432492620e98dfb89d20a43fd482c`; branch: `fix/st04-st06-acceptance`.
Existing issues: #26 (catalog), #28 (basket), #30 (receipt). No duplicate issue or Linear task is needed. Existing implementations are reused. Scope is code/conformance corrections and local restart/fault/acceptance proof; no production deployment or merge.

Thirty meaningful units represent the remaining work; related red/green tests and fixes share atomic green commits rather than making artificial empty commits.

- [x] 01/30 Refresh main and verify ST-02/ST-03 merge
- [x] 02/30 Inspect C3/C4/C5 and ticket criteria
- [x] 03/30 Create follow-up branch and preserve unrelated files
- [x] 04/30 Reproduce gateway dropping receipt-list limit/cursor
- [x] 05/30 Forward only receipt pagination parameters on GET
- [x] 06/30 Prove query strings cannot affect receipt ownership or order POST
- [x] 07/30 Expose optional pagination on the receipt consumer adapter
- [x] 08/30 Verify default calls and paginated consumer transport
- [x] 09/30 Validate C3 positive fixture against actual catalog schema
- [x] 10/30 Complete authoritative fixture fields and valid modifier selections
- [x] 11/30 Consume C3/C4/C5 through canonicalization/pricing/snapshot code
- [x] 12/30 Make invalid catalog fixtures executable as actual requests
- [x] 13/30 Verify closed/unavailable/unknown catalog choices preserve accepted state
- [x] 14/30 Verify modifier bounds and duplicate/unknown IDs before persistence
- [x] 15/30 Verify strict quantities/text/line bounds and spoofed fields before persistence
- [x] 16/30 Verify authoritative search/filter/sort from PostgreSQL
- [x] 17/30 Recheck concurrent basket writes and exact conflict envelope
- [x] 18/30 Prove committed basket rollback on an injected post-update failure
- [x] 19/30 Prove actual API process restart preserves basket without Redis
- [x] 20/30 Prove real PostgreSQL connection refusal returns failure without fallback
- [x] 21/30 Recover the same database and verify exact accepted basket
- [x] 22/30 Verify exact 1192-cent totals and complete checkout snapshot
- [x] 23/30 Verify immutable receipt after catalog edits and process restart
- [x] 24/30 Verify same-timestamp newest-first cursor boundaries
- [x] 25/30 Verify real gateway pages, invalid bounds and foreign cursors
- [x] 26/30 Verify incomplete legacy receipts stay offline
- [x] 27/30 Run complete applicable web/backend/browser regressions
- [x] 28/30 Reconcile current C3/C4/C5 documentation and handoff
- [x] 29/30 Map every numbered criterion and update development guide
- [x] 30/30 Review scope, push microcommits, publish PR and report hosted CI separately

Each unit's done condition is its named observed result and passing regression/rehearsal. Discovery/setup units have no runtime documentation impact. Behavior units update C3/C4/C5 guides; evidence units add criterion-indexed artifacts. No public release gate is checked by a local rehearsal.

Publication evidence and lifecycle status are recorded in acceptance.md. Task 20 uses real connection refusal, not stopping a database service. Related units share green atomic microcommits.
