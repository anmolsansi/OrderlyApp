# ST-07–ST-10 local acceptance — 2026-10-06

**Result:** All four tickets' implementation and local acceptance are Completed on `fix/st07-st10-acceptance`. Hosted CI/merge are separate pending gates. No deployment was performed. INT-02, ST-11–ST-13 and public release remain Not completed.

**Candidate:** `a9440b791870cb3ade823b7eff6569b4650a3243`, based on merged main `e81ad40` (PR48). Documentation-only commits follow. The final frontend/build, 35 API browser checks and repeated critical manual checkout used this candidate. Backend and fixture-preview providers were unchanged since their passing full checks; the last correction affects only empty API checkout recovery records. Broad manual search/filter/remove observations preceded that narrow guard, and final real browser regressions rechecked the whole journey. See [microtasks](microtasks.md).

## Defects fixed

1. Backend 500/503 and malformed accepted replies unlocked a fresh checkout key. They now preserve the unresolved original key/body. A server error can conceal a commit acknowledgement loss; it cannot prove rejection. Known 4xx remain definitive. Real accepted orders followed by dropped/500/503/malformed responses replay safely after reload.
2. Exact receipt reads accepted a different response ID. The shared adapter now rejects mismatches.
3. Invalid or empty recovery JSON/schema/storage was indistinguishable from no record. It now blocks fresh checkout without deleting the record; canonical UUID syntax is validated.
4. Persisted basket/draft reads accepted duplicate IDs, 51 lines or 501-character instructions. The shared parser rejects these bounds without clearing other keys.
5. C7 scaffold examples differed from C3/C4/C5/C6. Complete examples now execute through the real browser adapters. Browser errors use camelCase requestId and retain HTTP status when present; transport/local errors invent neither server IDs nor fields. Cross-language validators distinguish browser and HTTP envelopes.
6. Visible route descriptions still promised removed order fallback/auth/reorder behavior. They now describe actual guest-owned receipts, explicit preview restrictions and password-free presentation profiles.

## Criterion mapping

| Criterion | Result | Runnable/observed evidence |
| --- | --- | --- |
| ST-07-AC1: one order per guest/key concurrently | PASS | `backend/tests/test_checkout.py`: canonical digest/UUID, guest-scoped key uniqueness, concurrent identical key, different keys/same revision, changed-payload conflict. |
| ST-07-AC2: complete precommit rollback | PASS | Exceptions after each actual SQL helper: receipt insert, ledger insert, basket clear. Both counts remain zero; full basket model including revision/time equals accepted pre-state. Existing before-write injection remains. |
| ST-07-AC3: exact replay, one clear | PASS | First 201/replay 200, receipt equality and counts; replay after catalog mutation/new basket does not clear newer basket. Browser response loss/500/503/malformed tests restore original key/body after checkout reload. |
| ST-08-AC1: canonical catalog/cart prices | PASS | Shared C3/C4/C5 examples through actual C7 adapters; real browser selects Large/Jalapeños, persists $21.99, edits to $43.98 and reloads. |
| ST-08-AC2: failed/stale save preserves accepted state | PASS | Harness save failure preserves accepted revision/quantity and separate draft; real shared-cookie tabs conflict on old revision, show current basket, explicitly reapply, then remove/reload to durable empty revision 4. Real cross-restaurant cancel leaves entire cart unchanged; confirmation accepts only new restaurant. API units prove mutation serialization/abort behavior. |
| ST-08-AC3: no implicit fixture fallback | PASS | Browser API failure stays error; separate local_demo run has persistent preview label, customization/basket reload, disabled checkout and zero API traffic. Cart units prove isolated preview/draft/mirror namespaces. |
| ST-09-AC1: failure cannot invent success | PASS | Four real accepted-but-obscured responses remain uncertain; definitive 422 retains durable basket without confirmation. 500/502/503/504/malformed adapter units retain recovery; 401/409/422/429 remain definitive. Damaged/denied storage sends zero new order POSTs. Backend faults roll back. |
| ST-09-AC2: lost response exact total/address/tip | PASS | Real POST reaches PG, first 201 captured, response withheld/replaced, checkout reloaded, same-key/body retry returns 200 with identical ID/totals/checkout. Pending second form submit sends one request, creates one order and advances basket once. |
| ST-09-AC3: exact/scoped receipt/history | PASS | Unknown ID shows not found, mismatched receipt adapter rejected, fresh guest empty history. Existing real guest browser foreign-ID/list/cursor tests and backend forged identity/isolation regressions pass. |
| ST-09-AC4: address precedence and saved equality | PASS | Default office then explicit home in recovery browser; late corrupt-profile recovery preserves deliberate address; keyboard/mobile alternate address equals saved receipt after reload. Manual home selection and $3 tip retained after refresh. |
| ST-09-AC5: direct preview routes unavailable | PASS | Actual local_demo checkout, receipt, history URLs show unavailable with zero API requests; no locally cached order is accepted. |
| ST-10-AC1: selected address exact, no late overwrite | PASS | `e2e/profile-address.spec.ts`: selected address saved/reloaded; deliberate-input/corrupt-profile recovery and preferred-address units. Manual receipt screenshot corroborates $49.87/home/$3 tip. |
| ST-10-AC2: malformed/denied storage recoverable | PASS | Profile/storage units; denied localStorage getter on sign-in/account/checkout; denied sessionStorage getter both at load and submit blocks POST; temporary profile explicit; malformed recovery and cache bounds validated. Unrelated keys preserved. |
| ST-10-AC3: safe next, keyboard/mobile | PASS | Return-path unit matrix and browser external/protocol-relative/encoded attempts remain inside app. 375px flow has no horizontal overflow, keyboard invalid-submit focuses associated errors; selected address survives receipt refresh. |

The numbered TODOs ST-07.01–.05, ST-08.01–.05, ST-09.01–.07 and ST-10.01–.05 are covered by these criteria and their existing source/tests. The disclosed [INT-01 separate pass](../int-01.md) records which actions were manual and which negatives were automated. This is local integration acceptance, not hosted or public acceptance.

## Current checks and reproducibility

| Command/check | Result | Saved output |
| --- | --- | --- |
| Python 3.12, `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend ORDERLY_TEST_DATABASE_URL=<disposable pg> REDIS_URL=<disposable redis> python -m pytest backend/tests -q` | 140 passed; no skips | [backend.log](backend.log) |
| Node 24.19.0, `npm run test:web` | lint, 109 units, typecheck and production build passed | [web.log](web.log) |
| API runner/build, `npx playwright test --grep-invert local_demo` (equivalent selection; run also excluded fixture preview names) | 35 passed; no skips | [api-e2e.log](api-e2e.log) |
| Separate runner/build both `NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo`, `npx playwright test --grep 'local_demo'` | 2 passed; no skips | [preview-e2e.log](preview-e2e.log) |
| Native in-app browser real ordering walkthrough | PASS; explicit separate testing pass | [manual receipt](manual-receipt.jpg), [INT-01](../int-01.md) |

Local stack: PG16 with migrations 001–006 applied to fresh backend and separately seeded browser databases; Redis disposable and persistence disabled; FastAPI 127.0.0.1:8041; Next gateway 127.0.0.1:3291; allowed origin exactly that gateway. Seed is explicit, not application startup. API browser mode uses ORDERLY_API_ORIGIN; final API E2E used the passing production build via next start (standalone warning disclosed; deployment startup remains ST11). Manual and preview used development servers. Playwright uses PLAYWRIGHT_BASE_URL and PLAYWRIGHT_SKIP_WEBSERVER=1. Synthetic session secret and addresses only. No cookies, credentials or raw browser traces exported. Disposable services stopped after checks.

Initial red checks reproduced six ambiguous-response/ID failures and three cache-bound failures. Final broad runs also found old contract expectations in baseline/recovery tests, corrected to the intentionally updated behavior before rerunning. Browser launch requires normal macOS process permissions; a sandbox-blocked launch was rerun with approval and is not counted as product acceptance.

## Contracts, compatibility and handoff

C6 schema/migration are unchanged; PostgreSQL remains the only checkout authority. C7 v1 gets additive optional HTTP status metadata and corrected executable fixture examples. Order submission treats server failure/malformed acceptance as uncertain; catalog/cart server errors stay typed errors. Recovery read distinguishes absent (`undefined`) from invalid/unavailable (`null`); its checkout consumer is updated. ST-09/10 regression and docs consume these changes. C6/C7 are locally refrozen with this evidence.

No dependency, production configuration or database migration was changed. Reverting this branch should not restore the known fresh-key-on-uncertain bug; use original-key replay while investigating. No automatic uncertain-record deletion or new-order fallback is introduced. ST-11 operations, ST-12 hosted/release CI and ST-13 public acceptance still have separate obligations.

Existing GitHub issues #32/#34/#36/#38 were already closed; no duplicates or completion inferred from labels. Progress uses #32. No exact active ST07–10 Linear tickets were found; no Linear write was made. Graph tools reported this project unindexed; repository export/indexing had been rejected by automatic approval review, so private-code export was not retried. Local source/tests supplied evidence.

Hosted CI is recorded independently in the PR. Prior main PR48's jobs were cancelled/skipped or failed release evidence; they are not current green proof. Do not merge or deploy solely from this local report.
