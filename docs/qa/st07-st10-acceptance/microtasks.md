# ST-07–ST-10 completion microtasks

Base: latest main `e81ad40`; branch `fix/st07-st10-acceptance`. Existing issues #32/#34/#36/#38; #32 is the primary combined progress thread. Existing implementations are retained. No merge, deployment or production changes authorized here. Each item is done only with its named observed result; related red/green units share atomic verified commits. Code changes update the relevant ST guide; pure checks map to acceptance evidence rather than duplicating runtime documentation.

- [x] 01/40 Verify main, PR48 merge and actual hosted CI state
- [x] 02/40 Read global observer instructions and ticket criteria
- [x] 03/40 Create focused branch, preserve unrelated audit files
- [x] 04/40 Recheck C6 digest/key validation and owner-scoped uniqueness
- [x] 05/40 Prove concurrent identical requests create one receipt/key
- [x] 06/40 Prove different keys against one cart revision cannot both commit
- [x] 07/40 Inject failures after receipt insertion
- [x] 08/40 Inject failures after ledger insertion
- [x] 09/40 Inject failures after basket clear, verify full rollback
- [x] 10/40 Replay accepted request after catalog edit and newer basket
- [x] 11/40 Reproduce ambiguous 500/503/malformed submit unlocking new key
- [x] 12/40 Preserve same-key recovery on ambiguous server results
- [x] 13/40 Preserve definitive validation/conflict/session rejection behavior
- [x] 14/40 Reproduce exact receipt read accepting mismatched ID
- [x] 15/40 Reject mismatched receipt at shared adapter boundary
- [x] 16/40 Align C7 positive examples to C3/C4/C5/C6
- [x] 17/40 Execute catalog/cart/quote/receipt C7 adapter conformance
- [x] 18/40 Check stored recovery UUID and schema validity
- [x] 19/40 Validate recovery storage failures before network submission
- [x] 20/40 Real backend canonical discovery/customize/add/edit/remove/reload
- [x] 21/40 Actual two-browser-tab CAS conflict and deliberate reapply
- [x] 22/40 Cross-restaurant replacement explicit cancel/confirm
- [x] 23/40 Failed saves retain accepted state and separate attempted intent
- [x] 24/40 Verify obsolete read suppression and mutation serialization
- [x] 25/40 Lost accepted response survives checkout reload and same-key replay
- [x] 26/40 Real accepted response replaced by 500/503, same exact replay
- [x] 27/40 Definitive 422/stale quote preserves basket and honest error
- [x] 28/40 Duplicate submit controls, one durable order and one cart clear
- [x] 29/40 Exact confirmation refresh/back/history and foreign/unknown IDs
- [x] 30/40 Selected/default/alternate address equality and late-load protection
- [x] 31/40 Malformed profile/storage denial and recoverable temporary profile
- [x] 32/40 Safe next destination rejection and allowlist
- [x] 33/40 Keyboard/mobile validation, disabled buttons and no overflow
- [x] 34/40 Explicit local_demo labels, isolated basket namespace and reload
- [x] 35/40 Preview direct checkout/receipt/history zero API/order claims
- [x] 36/40 Current INT01 manual product walkthrough and handoff evidence
- [x] 37/40 Full backend PostgreSQL/Redis regressions and migrations
- [x] 38/40 Full lint/unit/typecheck/build/API/local-demo browser regressions
- [x] 39/40 Map every numbered criterion, reconcile development.md and ST guides
- [x] 40/40 Review diff, push all microcommits, open PR, report CI separately

Publication: [PR49](https://github.com/anmolsansi/OrderlyApp/pull/49), targeting main. All planned fixes and evidence are pushed; hosted CI is queued/in progress, not a completed local acceptance check. No merge/deployment.
