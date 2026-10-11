# Restaurant service test plan
Updated by /plan-eng-review follow-up on 2026-10-11; retains the 2026-10-09 baseline
Branch: chore/st13-hosted-staging
Repo: anmolsansi/OrderlyApp (verified local origin)
Status: planned assertions only; no tests executed by this review.

## Affected Pages/Routes
Existing customer boundaries: restaurant/menu, cart, checkout, order confirmation and orders. Live staff/owner/campaign pages and API paths are proposed; pin exact URLs when implementation adds them. Do not reinterpret old mock routes silently.

## Key Interactions to Verify
Customer → reviewed order → staff acceptance → preparation → collection/service → separately recorded payment. Owner → approved offer/campaign → controlled worker send → suppression/delivery/reconciliation.

## Critical Paths
- **G1: Live orders and guest access** — Live checkout, receipt/status and guest reset. Submit dine-in and takeaway orders; same key/body returns the exact receipt after response loss/reload. Different keys at one revision commit once. Inject failure after each write: no partial receipt, operational state, redemption or cleared cart. Guest reset/expiry removes access but retains restaurant records; another guest cannot read them.
  Value: protects=preserves one durable order and revocable access; fails_when=retries duplicate orders or cleanup deletes live records; why_new=existing tests exercise guest-owned mock records; seam=none
- **G2: Staff identity and restaurant isolation** — Staff sign-in, invites, queue, owner setup and reports. Reject malformed/expired/wrong-issuer tokens, wrong-restaurant IDs and revoked membership on the next protected action. Verify owner/order-staff/cashier permissions and invitation identity binding; unknown provider keys fail closed. Exercise two staff accounts in two restaurants.
  Value: protects=enforces staff roles and tenant boundaries; fails_when=browser roles or stale claims grant unauthorized access; why_new=existing identity is anonymous guest scope; seam=none
- **G3: Lifecycle and payment records** — Staff order detail and cashier actions. Run Submitted through Accepted, Preparing, Ready, Completed. Reject before acceptance and cancel later with authorization/reason. Concurrent stale transitions cannot overwrite one another. Full payment is separate from completion; duplicate payment is safe and reversal appends history. Paid cancellation exposes settlement work.
  Value: protects=keeps operational and payment history consistent; fails_when=completion marks paid or corrections erase history; why_new=live operational/payment paths do not exist; seam=none
- **G4: Live pricing and promotions** — Menu setup, basket quote, checkout and receipt. Use restaurant-approved currency/charges. Price edits preserve receipts. Test invalid/expired/exhausted public codes, minimum amount and discount cap. Concurrent final redemption has one winner; replay does not consume again. Offer changes require reviewed quote; cancellation retains allocation. Check rounding with independently calculated examples.
  Value: protects=prices and consumes offers atomically; fails_when=mock fees leak or concurrent checkout exceeds offer cap; why_new=mock-v1 tests cannot prove restaurant live rules; seam=none
- **G5: Browser speech and typed proposals** — Customer voice control and basket review. Test real microphone on named pilot devices/language/noise conditions. Denial, unsupported browser, network failure, empty/ambiguous speech and missing modifiers retain manual ordering. Edit transcript; confirm before mutation. Late result after restaurant change/cancel is ignored. Same-name menu items in another restaurant are never selected.
  Value: protects=keeps voice reviewable and restaurant scoped; fails_when=speech submits directly or applies stale cross-tenant results; why_new=fixture parser tests have no microphone or live catalog; seam=none
- **G6: Campaign approval and delivery recovery** — Owner campaigns, worker and provider callbacks. Verify exact recipient/message/channel/offer/cost approval snapshot; edits invalidate it. Withdraw consent, pause, exhaust cap or revoke provider credentials before sending: no affected send. Race two workers at the cap. Crash before/during/after provider acceptance; uncertain outcomes do not blindly resend. Forged/wrong-account/duplicate/out-of-order callbacks cannot corrupt state. Suppress unsubscribes, hard bounces and complaints.
  Value: protects=prevents unauthorized duplicate or over-budget sends; fails_when=worker ignores approval or retries an uncertain acceptance; why_new=no live campaign integration is present; seam=none
- **G7: Synthetic demo and onboarding** — Public demo plus restaurant owner setup. Open two demo sessions: no interference with live data. Attempt live IDs and protected actions from the demo. Verify server-side no-send enforcement even if the UI request is forged. Owner completes menu/hours/tables, staff roles and provider setup; missing sender/domain/consent/pricing/retention evidence blocks live activation.
  Value: protects=separates demonstration from real operations; fails_when=demo sends real campaigns or exposes live records; why_new=existing local_demo is a limited fixture preview; seam=none
- **G8: Deployment recovery and pilot acceptance** — API, web, worker and first restaurant. Run migrations with existing mock data, validate backward-compatible rollback and restore a backup including live records and consent evidence. Interrupt DB/Redis/providers/worker: visible failure with no synthetic success. Reconcile ST-13/INT-02 release evidence against named build. Real staff complete dine-in/takeaway and payment correction; consented live test verifies each channel, separately from synthetic tests.
  Value: protects=proves recovery and real service usability; fails_when=green mocks hide broken provider or persistence paths; why_new=current hosted acceptance is not proof of new workflow; seam=none

## Edge Cases
- **Repeated actions and disconnection:** Double-click, two tabs, reload, navigate away and return after a lost response; preserve the original key/body and show recovery.
  Value: protects=safe recovery without duplicate writes; fails_when=UI creates a fresh key after uncertain result; why_new=new live receipt paths need existing recovery assertions; seam=none
- **Zero, stale and invalid data:** Empty basket/audience/queue, unavailable menu item, stale revision, invalid quantity, wrong currency and a single remaining promotion allocation show useful corrections.
  Value: protects=validation before side effects; fails_when=invalid input reaches money or send operations; why_new=live shapes and constraints differ from mock fixtures; seam=none
- **Scale and bounds:** Record tested restaurant/menu/audience size; verify paginated reads, bounded worker memory and no unrelated-restaurant catalog load. Exact operational limits need implementation measurement.
  Value: protects=bounded resources and scoped reads; fails_when=audience materializes unboundedly or queries scan other tenants; why_new=new live worker and tenant reads need measurement; seam=none

## Tests to Retire
None. Preserve existing mock-v1 and local_demo regression contracts.

## Pending Decisions
No unanswered engineering option remains through follow-up D10/R8=A. Actual provider budgets/limits, pilot devices/language, live receipt/tax configuration and retention periods require restaurant/provider evidence before live acceptance. They are not silently defaulted.

## Execution evidence
Run existing Vitest, pytest and Playwright tools during implementation; record commands, environment, build and results. PostgreSQL concurrency tests require real PostgreSQL. Provider test doubles are not live delivery proof. Microphone simulation is not real-device proof.

## UI engineering follow-up: Critical Paths
All E1–E5 are planned GAP coverage, not passed tests. Preserve G1–G8 above.

- **E1: Theme and startup** — All role pages: default light; saved light/dark before visible paint; absent/invalid/blocked storage; denied reads/writes; toggle and reload. Verify actual script policy, hydration logs and readable delayed-font fallback.
  Value: protects=saved preference without blocking ordering; fails_when=startup flashes the wrong saved theme or storage failure breaks tasks; why_new=R8 and D16 introduce browser-local theming; seam=none

- **E2: Recovery across presentation changes** — Checkout and uncertain-order recovery: toggle theme and resize while submitting, then reload and retry. Assert the exact original key/body and one receipt; no fresh attempt or lost form values.
  Value: protects=one recoverable order; fails_when=theme or viewport change loses the frozen attempt; why_new=existing recovery assertions do not cover new presentation changes; seam=none

- **E3: Customer states** — Menu, basket, summary and review: distinguish loading/error/empty; retain unavailable items with correction; remove last item; maintain one basket across widths; require fresh quote review with no automatic submission.
  Value: protects=explicit accurate order review; fails_when=duplicate layout state or stale prices reach checkout; why_new=approved menu and basket views add new states; seam=none

- **E4: Staff safety** — Queue and order detail: no-snapshot versus stale-snapshot; disabled stale mutations; delayed A response after selecting B; resize preserves selection. Exercise completed-unpaid, repeated payment and response-loss reconciliation with original identity.
  Value: protects=correct order and payment actions; fails_when=late reads enable actions for another order or repeat payment; why_new=staff selection and responsive detail are new; seam=none

- **E5: Accessible role journeys** — Customer/staff/owner in both themes: keyboard links, focus ring, linked validation summary, retained fields, announcements, zoom, reserved basket space and narrow/wide transitions. Draft campaigns before setup cannot bypass send gates; voice remains reviewed. Real devices stay under U4.
  Value: protects=usable and explicit role actions; fails_when=focus becomes unreachable or presentation bypasses confirmation; why_new=new theme and role layouts need integrated acceptance; seam=none

## Follow-up execution limits
Current Playwright config covers desktop Chromium only. No browser, unit or backend tests were run during this planning review. Extend existing checkout-recovery coverage and the already-proposed restaurant-service/campaign suites during implementation. Do not create a test-only preference abstraction. Script-policy, font-build and actual pilot-device evidence remain required.
