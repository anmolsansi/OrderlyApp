# OrderlyApp — restaurant pilot onboarding, measurement and evidence checklist

**Status:** DOCUMENT TEMPLATE ONLY. No customer onboarded, paid pilot accepted, real account connected or live tenant activated. Source: [RF-02](../tickets/restaurant-service/RF-02.md) · [offer](restaurant-offer.md) · [RS-65](../tickets/restaurant-service/RS-65.md) · [development roadmap](../../development.md).

## 1. How to use this private-evidence checklist

The provider's project owner makes a **separate private copy per restaurant** after permission to engage. Keep this committed template empty of names, phone numbers, e-mails, signed offers, personal data, real menu secrets, contracts, invoices, provider keys, audio recordings and private test results. Store those in access-controlled records and link only an opaque evidence reference if needed.

**Checklist statuses:** NOT STARTED, PENDING OWNER APPROVAL, BLOCKED, VERIFIED, FAILED, NOT APPLICABLE WITH REASON. VERIFIED requires the named reviewer, UTC observation time, source/build or document revision, exact result and restricted evidence pointer; "said to be ready" is not verification. Record unresolved fields explicitly as **OWNER DECISION REQUIRED**.

### Confidential pilot header (fill privately, not in Git)

| Field | Entry |
|---|---|
| Pilot code / private folder pointer | **OWNER DECISION REQUIRED** |
| Restaurant legal entity, location and signatory | **OWNER DECISION REQUIRED** (private record only) |
| Provider legal entity and commercial representative | **OWNER DECISION REQUIRED** |
| Restaurant operations approver, backup, data owner and finance approver | **OWNER DECISION REQUIRED** |
| Provider implementation lead, technical operator, privacy owner and named support contact/backup | **OWNER DECISION REQUIRED** |
| Proposal revision / signed agreement pointer | **NOT RECORDED** |
| Approved live build / tenant / observation environment | **NOT RECORDED** |
| Pilot duration, review date and private evidence custodian | **OWNER DECISION REQUIRED** |

### Role and account ownership register

- [ ] Authorized restaurant owner confirms business entity, location, authorized commercial and technical approvers, and who can request changes.
- [ ] Provider owner identifies a named primary/backup support contact and approved support channel/window, never just an unmonitored mailbox.
- [ ] Restaurant and provider agree who owns the hosting account, domain, backups, incident notification channel and renewal costs. Document approved read-only/admin access and revocation owner.
- [ ] Restaurant marketing owner and provider operator approve MSG91/SendGrid account holder, sender, templates, regions, budgets/caps, billing route and restricted credential custody. **No real send before U2/U3 and RS-65 verification**.
- [ ] Restaurant data owner and provider privacy owner approve controller/processor responsibilities, opt-in evidence, storage, retention, export and deletion rules (U2).
- [ ] Restaurant signatory approves setup/service/extra support fees, pilot duration, invoice dates, taxes, support coverage and exit/handoff terms in [commercial offer](restaurant-offer.md). No amount is defaulted.
- [ ] Both owners keep synthetic demo identities separate from real staff/member authentication. Never give a guest a real owner or cashier role.

**Account approvals:** named restaurant signatory + provider commercial owner for payment; restaurant data owner + provider privacy owner for personal data; restaurant marketing owner + provider operator for external sends; restaurant operations lead + provider technical lead for devices/live readiness. Every such owner is currently **OWNER DECISION REQUIRED**.

## 2. Restaurant business setup and owned records

Complete these items in the restaurant's controlled onboarding record; do not paste actual customer or employee details here.

| Input | Minimum acceptance check | Required approver |
|---|---|---|
| Restaurant profile | Legal/trading name, address, supported dine-in/takeaway modes, currency INR, active operating hours and closure periods validated against owner-approved records | Restaurant owner + provider technical lead (U1) |
| Menu items and modifiers | Category, name, variants, availability, price in INR paise, quantity limits, modifiers/options and unavailable behavior reviewed against restaurant-approved menu | Restaurant menu manager + provider pricing owner (U1) |
| Taxes, fees and receipt wording | Item and quote totals, legal tax treatment, rounding, cancellation/refund/external settlement policy, receipt wording and examples explicitly signed off. **Never infer tax rates** | Restaurant financial approver + technical/pricing lead (U1) |
| Dine-in tables and takeaway | Unique table labels, printed link/QR ownership, no privilege granted by table URL, correct tenant mapping and supported fallback | Restaurant floor manager + provider technical lead |
| Staff roster and permissions | Authorized owner/manager/cashier/staff membership, minimum roles, test revocation, no shared credentials, mobile/tablet access, staff shift owner and handoff | Restaurant owner/operations lead + provider identity lead |
| Payment recording and reconciliation | Cash or external UPI/card method **recorded as an assertion only**; only verified full amount marked recorded, reconcile separately to actual settlement | Restaurant finance/cashier lead + provider operations lead |
| Connectivity and hardware | Restaurant phone/tablet/browser versions, staff notification/accessibility, network failover, manual ticketing path, provider support escalation | Restaurant floor manager + technical operator (U4) |
| Marketing opt-in and suppression | Customer channel consent evidence, opt-out process, approved copy, operator spend caps, suppressed destinations, sender/domain verification | Restaurant marketing/data owners + provider U2/U3 owners |

- [ ] One named owner approves menu import and every tax/fee/receipt assumption before live quote verification.
- [ ] Restaurant staff review **unavailable** item and closed-hours behavior, table-to-tenant correctness and manual fallback.
- [ ] Permission owner demonstrates that a removed staff account cannot read/act on another restaurant's orders.
- [ ] Cashier and operations owners reconcile one test order's status separately from its recorded-payment status, and document an uncertain-response retry using the **original** request key.
- [ ] Operator records who updates menus, who can deploy changes, who owns inventory or scope exclusions, and who can sign a change order.

**No real tenant, production menu, device test or settlement is claimed by checking this template.** The deployed restaurant service and corresponding tests are still future RS/integration gates.

## 3. Training, help and operational handoff

**Required training session details:** session date/time, remote/on-site mode, language, trainer, staff list reference, devices tested, attendance evidence, task outcomes and next refresher are all **OWNER DECISION REQUIRED**. Contact/attendance identities live in the restricted pilot record.

Training rehearsal using approved **synthetic fixtures** before live service:
1. Guest orders from the correct menu and table/takeaway context, then opens a receipt. Label the transaction synthetic and payment nonexistent.
2. Staff sees a new/waiting order, acknowledges it, moves it through allowed status transitions and checks which actions are unavailable to their role.
3. Cashier records exactly one **simulated** full pay-at-counter payment; repeat a request with the original command identity after a deliberately lost response and verify there is not a duplicate.
4. Restaurant owner changes item availability or hours, verifies cross-role updates, and follows a marketing preview with a conspicuous **simulation only, zero actual sends** label.
5. Staff demonstrates browser voice **only if actually implemented and accepted**; otherwise trains typed ordering and records the voice limitation without claiming recognition accuracy.
6. Operator disables network/API availability; staff switches to the agreed manual order procedure, protects original identifiers, and reconciles recovered orders before reentry.
7. Staff escalates a support issue through the **named** contact and can locate the agreed response window and backup. Unnamed contact = **BLOCKED** for support handoff.
8. Operator and authorized owner rehearse stop/rollback, outstanding-order reconciliation and restricted data-export procedure, without actually deleting real data during a synthetic rehearsal.

| Training checkpoint | Expected evidence | Current status |
|---|---|---|
| Menu, guest ordering and staff queue | Named build, device, actor, observed workflow with screenshots in private record | NOT STARTED |
| Payment recording and duplicate prevention | Original command reference, idempotent response, receipt/payment state assertions | NOT STARTED |
| Marketing preview safety | Synthetic transport spy shows **zero** actual MSG91/SendGrid sends | NOT STARTED |
| Voice or typed fallback | Actual supported phone/locale and failure/fallback or explicit absent feature | NOT STARTED |
| Support route and manual outage | Named contact, staff response, manual reconciliation walkthrough | BLOCKED, owner/contact decisions pending |
| Exit drill and staff access removal | Authorized actor, export manifest draft and revocation proof | NOT STARTED |

**Change-control workflow:** restaurant requester submits a written request to the named provider lead. Provider scopes effort, pricing, risk, test impact and timing. Restaurant financial/operational signatories approve before work, and both sides update the offer revision. Urgent operational recovery does not silently expand promised features.

## 4. Evidence sources and commercial stage register

Record only **opaque references** in the repository or a review-safe PR. A real restaurant private evidence record must keep full original emails, signatures, receipts and observations under authorized access, with retention controlled by U2.

| Commercial stage | Minimum dated evidence needed | Not acceptable evidence |
|---|---|---|
| **interested** | Dated, attributable private consent/interest note and source reference | A website view, unsolicited contact, or fictional roleplay |
| **proposal_requested** | Dated owner-authorized request for a proposal, version/purpose and private source pointer | A sales presentation, demo page click or provider-written quote alone |
| **accepted_pilot** | Versioned signed terms by both authorized parties, agreed scope/price/period/support/exit, private executed-document reference and acceptance timestamp | Verbal intent or an unsigned draft |
| **paid_project** | Accepted pilot **plus independently verifiable received payment**, amount/currency/invoice reconciliation, date and restricted bank/receipt reference | "Cash recorded" in synthetic demo, invoice issued, provider send delivery or a pending transfer |

**No transition is automatic.** Payment must match the contract and be verified before moving to paid_project. A later dispute, refund or reversal requires a separate correction record rather than rewriting the original evidence. A stage may remain BLOCKED or revert to earlier status after verified cancellation.

### Evidence register template, private record only

| Evidence ID | Stage/gate | Observation UTC | Actor/approver role | Version/setting | Result | Restricted source pointer | Reviewer/date |
|---|---|---|---|---|---|---|---|
| **NOT RECORDED** | interested | NOT RECORDED | OWNER DECISION REQUIRED | NOT RECORDED | BLOCKED | NOT RECORDED | NOT RECORDED |
| **NOT RECORDED** | proposal_requested | NOT RECORDED | OWNER DECISION REQUIRED | NOT RECORDED | BLOCKED | NOT RECORDED | NOT RECORDED |
| **NOT RECORDED** | accepted_pilot | NOT RECORDED | OWNER DECISION REQUIRED | NOT RECORDED | BLOCKED | NOT RECORDED | NOT RECORDED |
| **NOT RECORDED** | paid_project | NOT RECORDED | OWNER DECISION REQUIRED | NOT RECORDED | BLOCKED | NOT RECORDED | NOT RECORDED |

**Suggested reference convention:** use an opaque case ID and a private storage location only; do not put restaurant names, phone numbers, email addresses or bank details into GitHub, Linear, Git commits or CI logs. The user of this template assigns access, retention and audit history in the private system.

Negative examples: "Owner liked the preview" cannot satisfy proposal_requested; a draft with terms cannot satisfy accepted_pilot; a pay-at-restaurant record cannot satisfy actual paid_project; an MSG91 request cannot prove delivered SMS or improved sales.

## 5. Pilot measurement agreement and observation sheet

**Agree all definitions, baseline, numeric targets and observation windows BEFORE the live pilot starts.** The owner and technical operator must confirm which analytics instrumentation or manual collection method supplies each numerator/denominator. If it does not exist, mark NOT MEASURED, not zero or PASS.

| Metric | Exact calculation and evidence | Baseline | Pilot target | Observation window | Observed |
|---|---|---|---|---|---|
| Staff acknowledgment time | Seconds from durable new-order creation to the first confirmed staff acknowledgement for the same order. Report sample count and median/P95 for eligible orders; exclude test/synthetic orders and annotate excluded/unacknowledged orders | **NOT MEASURED** | **OWNER DECISION REQUIRED** | **OWNER DECISION REQUIRED** | NOT MEASURED |
| Ordering completion rate | Numerator: distinct real guest sessions that complete one valid accepted live order. Denominator: eligible real guest ordering sessions that reach the agreed ordering-start event. Choose and freeze session/deduplication rules before baseline | **NOT MEASURED** | **OWNER DECISION REQUIRED** | **OWNER DECISION REQUIRED** | NOT MEASURED |
| Errors requiring staff intervention | Count of unique real order incidents needing manual correction, help or recovery; report count and rate per 100 accepted real orders, with incident reason, version and reconciliation outcome | **NOT MEASURED** | **OWNER DECISION REQUIRED** | **OWNER DECISION REQUIRED** | NOT MEASURED |
| Staff usability | Named staff complete an agreed representative task list without assistance; report successful tasks/attempted tasks and number of participants, and collect structured difficulty feedback separately | **NOT MEASURED** | **OWNER DECISION REQUIRED** | **OWNER DECISION REQUIRED** | NOT MEASURED |

**Measurement contract:** restaurant operations approver and provider evidence owner agree exactly what starts/ends the window, operating hours covered, what qualifies as real, sample adequacy and how missing/unacknowledged events count. Freeze the build and time zone per comparison, and record any mid-pilot feature change as a new segment. Do not silently exclude failures.

### Per-window private observation row

| Field | Value |
|---|---|
| Pilot/build/restaurant code | **NOT RECORDED** |
| Metric name, frozen numerator/denominator and source | **OWNER DECISION REQUIRED** |
| Baseline start/end UTC and sample size | **NOT RECORDED** |
| Pilot start/end UTC, device and environment | **NOT RECORDED** |
| Agreed threshold, minimum sample and evaluator | **OWNER DECISION REQUIRED** |
| Observed numerator, denominator, median/P95 where relevant | **NOT MEASURED** |
| Exclusions, incident references and confidence limitations | **NOT RECORDED** |
| Private raw-evidence pointer and approver/date | **NOT RECORDED** |
| Assessment | **BLOCKED** until actual observations and owner approval |

**No sales-uplift inference:** order count, payment recording, simulated results, SMS accepted by a provider and email delivered are not evidence of increased restaurant revenue or marketing ROI. Revenue attribution and financial success claims require a separately agreed, independently verifiable methodology and transaction evidence, outside this ticket.

