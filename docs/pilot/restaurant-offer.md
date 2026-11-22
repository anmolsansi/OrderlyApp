# OrderlyApp — configurable paid restaurant pilot offer

**Status:** DRAFT FOR OWNER REVIEW. Not sent, approved, signed, invoiced or paid.
**Source:** [RF-02 assignment](../tickets/restaurant-service/RF-02.md) · [RF-01 sales-demo plan](../demo/restaurant-sales-walkthrough.md) · [Current roadmap](../../development.md).

## 1. What is being proposed

A **restaurant-specific pilot proposal**, not a live order-taking service or an accepted customer contract. The intended first pilot is one restaurant using dine-in/takeaway ordering and pay-at-restaurant, with restaurant staff handling orders and recording full payment, owner menu/hours/table/staff controls, and approved consent-based marketing only after separate provider and policy gates. Browser voice is proposed as an **editable suggestion** with typed fallback. There is no online card collection, delivery marketplace, automatic marketing send, or real bank settlement by OrderlyApp in this scope.

OrderlyApp currently has a **mock-only ordering portfolio demo**. The RF-01 four-capability DEMO-SALES walkthrough is a **planned, synthetic** demonstration, not a running live restaurant pilot. The restaurant must receive a capability-by-capability demonstration and acceptance record before any capability is advertised as delivered.

**Commercial parties:** Service provider/legal entity: **OWNER DECISION REQUIRED**. Restaurant legal entity, location, authorized signatory and invoice recipient: **OWNER DECISION REQUIRED**. Preferred proposal currency: **OWNER DECISION REQUIRED**. Proposed scope and charges are not enforceable until reviewed and signed by both authorized parties.

### First-check owner test (desk review only)

| Question a restaurant owner should ask | Answer in this draft | Acceptance gate |
|---|---|---|
| Who pays for one SMS? | **Restaurant bears actual MSG91 messaging charges**; account ownership, billing path, rate and cap are **OWNER DECISION REQUIRED**. No message may be sent during a synthetic demo. | Restaurant signoff on provider owner and capped spend |
| Who provides support? | Support contact, backup and agreed coverage are **OWNER DECISION REQUIRED**. This draft does not imply round-the-clock support. | Named provider lead, restaurant escalation owner and approved coverage |
| How do we leave? | Stop live ordering safely, export agreed restaurant-owned records, revoke access and reconcile outstanding costs under a documented exit plan. Timelines, file format, retention and responsible signatories are **OWNER DECISION REQUIRED**. | Signed exit and data-handling terms |

**Observed outcome:** These are questions and draft answers prepared for review. No real restaurant owner participated; owner approval and real feedback are **NOT RECORDED**.

## 2. Commercial terms and invoice decision register

Every **OWNER DECISION REQUIRED** cell blocks a contractual offer or price claim. No number in a sample or demo is a quote. Charges must be written in the chosen currency, with taxes, timing and payer shown separately.

| Commercial term | Proposed contract value | Decision owner / required evidence |
|---|---|---|
| One-time onboarding/setup charge | **OWNER DECISION REQUIRED** | Provider commercial owner proposes; restaurant signatory accepts in signed offer |
| Recurring service charge and cadence | **OWNER DECISION REQUIRED** | Both signatories approve amount, billing frequency and included features |
| Included support hours per billing period | **OWNER DECISION REQUIRED** | Provider support owner and restaurant signatory approve exact hours |
| Additional support hourly rate and approval | **OWNER DECISION REQUIRED** | Provider quotes; restaurant approves *before* extra billable time |
| Proposal currency, rounding, tax/GST and invoice details | **OWNER DECISION REQUIRED** | Provider billing owner and restaurant finance owner; qualified tax review if needed |
| Deposit, first invoice, subsequent payment dates and due terms | **OWNER DECISION REQUIRED** | Both authorized signatories approve dates and conditions |
| Late-payment treatment, disputed charges and refund/credit terms | **OWNER DECISION REQUIRED** | Both signatories and legal review as applicable |
| Pilot budget ceiling and change-order approval | **OWNER DECISION REQUIRED** | Restaurant financial approver and provider commercial owner |
| Any discount or conversion to ongoing service | **OWNER DECISION REQUIRED** | Explicit later written amendment, never assumed |

**Billing rule:** A proposal request is not an accepted pilot. A signed pilot is not a paid project. Record **paid_project** only after a real matched payment receipt or verified settlement confirmation, held privately. Do not create invoices, initiate payment collection or assert customer acceptance from this document. This project does not implement online payments.

## 3. Who pays and owns each operating dependency

| Cost / account | Commercial responsibility | Required approval before use |
|---|---|---|
| MSG91 SMS account, usage and approved templates | **Restaurant-funded messaging expense**. Whether the restaurant pays MSG91 directly or reimburses a disclosed pass-through cost: **OWNER DECISION REQUIRED** | Restaurant owner, provider account administrator, approved U3 spend cap and signed template/consent policy |
| SendGrid email account and per-message/plan usage | **Restaurant-funded messaging expense**. Account billing method, ownership, sender/domain and cap: **OWNER DECISION REQUIRED** | Restaurant owner, provider account administrator, approved U3 domain/sender/consent controls |
| App/API hosting, database, backups, domain and operational monitoring | Hosting owner and whether included in recurring service vs separately billed: **OWNER DECISION REQUIRED** | Both commercial signatories and technical operator approve responsibility, account owner and cost ceiling |
| Device, connectivity, printer/terminal and restaurant Wi-Fi | Who supplies/pays each local dependency: **OWNER DECISION REQUIRED** | Restaurant operations lead and provider technical lead |
| External taxes, delivery, payment processors or extras | Not included or integrated in first pilot unless separately scoped. No online payment service is supplied. | Written change order required, not implied |
| Customer personal data and consent records | Restaurant control/operator role, provider processing role, retention/export/deletion rules: **OWNER DECISION REQUIRED** under U2 | Restaurant owner, privacy decision owner and provider data custodian |

**Do not collect real provider credentials into this repository or the pilot evidence sheet.** Keep provider keys, customer contact details, signed agreements and proof of payment in separately restricted systems. Before provider activation, obtain cost caps, allowed regions and approved templates. Failed/uncertain sends are not proof of successful delivery.

## 4. Support and incident handling

**Support service owner:** **OWNER DECISION REQUIRED**.
**Named support contact/channel and backup:** **OWNER DECISION REQUIRED**.
**Restaurant primary contact and authorized escalation contact:** **OWNER DECISION REQUIRED**.
**Time zone, operating days, included support window and total hours:** **OWNER DECISION REQUIRED**.
**Initial response targets by severity and exclusions for holidays/after-hours:** **OWNER DECISION REQUIRED**.
**Service coverage and maintenance windows:** **OWNER DECISION REQUIRED**.

Proposed operating procedure, subject to both parties' approval:
1. Restaurant staff report a problem using the approved support channel and only a safe incident ID, time, affected workflow and severity. No customer phone, receipt secret, raw email or credential belongs in the ticket.
2. The named provider owner acknowledges within the **agreed** response window, records whether ordering, staff progress, or a provider integration is affected, and names who is investigating.
3. For unavailable/uncertain service, the restaurant switches to its agreed manual ordering procedure. Staff **must reconcile the original order/payment reference before retrying**, never submit fresh payment identities just because a browser timed out.
4. Provider and restaurant owners record impact, fix, recovery verification and any customer-facing communication after agreement. Marketing is disabled independently if provider status or consent is uncertain.

**This section establishes a process, not a promised SLA.** Escalation phone, compensation and response deadlines remain unapproved until named and signed.

## 5. Included work, exclusions and changes

**Candidate deliverables, only after implementation evidence and written scope approval:** one restaurant's dine-in/takeaway web ordering; restaurant-scoped menu/availability, hours and tables; staff order queue and status transitions; recording a full pay-at-restaurant payment; owner administration; optional consent-based marketing after U2/U3 acceptance; and editable voice proposals with typed fallback where supported.

**Explicit exclusions:** online card/UPI collection, bank settlement, delivery/driver dispatch, third-party aggregators, payroll, inventory, accounting or tax advice, split/partial bills, hardware procurement, bulk import without agreed mapping, guaranteed campaign sales uplift, and unrestricted support. Synthetic DEMO-SALES screens and mock order receipts **do not** constitute live restaurant delivery.

**Change requests:** Restaurant authorized requester documents the desired outcome, reason and priority. Provider responds with changed scope, price, deployment/test effect and expected acceptance evidence. Both authorized commercial signatories approve the written change **before** work or cost begins. Unapproved changes remain excluded. No verbal discussion or demo click amends the pilot.

**Acceptance is per feature and environment.** Record the actual deployed build, tenant, reviewer, test case and acceptance result privately. Failure/blocked work may not be represented as successfully supplied.

## 6. Pilot calendar, start gate and payment conditions

| Milestone | Condition | Approved date or duration |
|---|---|---|
| Proposal delivered | Restaurant requests review; no binding terms | **OWNER DECISION REQUIRED** |
| Pilot accepted | Authorized provider and restaurant owners sign versioned scope and cost schedule | **OWNER DECISION REQUIRED** |
| Pilot environment setup | Agreed U1/U2/U3 inputs, accounts, menu, staff and access, disabled initial provisioning | **OWNER DECISION REQUIRED** |
| Staff orientation and dry-run | Named staff perform guest-to-staff-to-recorded-payment flows with documented fallback | **OWNER DECISION REQUIRED** |
| Live pilot start | RS-INT01–04, RS-64, RS-65, RS-RELEASE and U1–U4 acceptance all pass on the approved build | **OWNER DECISION REQUIRED**, no auto-start |
| Baseline and observation windows | Agreed before measuring; record dates, eligible denominator and sampling method | **OWNER DECISION REQUIRED** |
| Midpoint review and final continue/revise/stop decision | Named commercial and operational owners approve outcome with observed evidence | **OWNER DECISION REQUIRED** |
| Pilot end / renewal decision | Fixed pilot duration, renewal price and end date agreed in writing | **OWNER DECISION REQUIRED** |

**No agreed start date, free trial, implied service term or auto-renewal exists in this draft.** The pilot must not go live because a synthetic demo passed. No one should promise a delivery date until engineering and external restaurant/provider/device gates are signed off.

Billing follows the explicitly approved charge schedule in section 2. Any deposit, accepted-project milestone or actual paid-project event requires separate private evidence.

## 7. Exit, outage and data handoff

Both parties must approve the exit approach before onboarding real data. The restaurant owner controls the business decision to stop accepting live orders. The technical operator must disable new live/marketing work, preserve already accepted immutable orders and unresolved external effects, and provide a clear manual handoff.

| Exit topic | Required documented decision |
|---|---|
| End notice, early termination and termination fees | **OWNER DECISION REQUIRED**: timing, triggers, refunds/credits and both approvers |
| Shutdown owner, scheduled maintenance, manual fallback | **OWNER DECISION REQUIRED**: named operator and restaurant lead; recorded communication channel |
| Open orders and recorded on-site payments | Restaurant reconciles outstanding service and actual cash/UPI settlement externally; provider supplies safe event references. No implied refund processor |
| Marketing and provider shutdown | Disable scheduling/worker before revoking provider access; settle known or uncertain provider charges; retain consent/suppression evidence under approved U2 policy |
| Restaurant-owned export scope and format | **OWNER DECISION REQUIRED**: menu/tables/orders/receipts/staff business records, permitted customer data, output format and secure delivery |
| Export delivery timing, recipient and proof of receipt | **OWNER DECISION REQUIRED**: authorized recipient, deadline, transport, checksum or acknowledgement |
| Data retention, deletion and legal exceptions | **OWNER DECISION REQUIRED** under U2. Never promise immediate deletion contrary to lawful retention/settlement evidence |
| Provider account closure/transfer and backup policy | **OWNER DECISION REQUIRED**: who disables keys, hands over domains/data, and retains verified backup/restore evidence |

**Exit acceptance record:** end date, signed handoff manifest, export provenance, open-issue list, access revocation, reconciled invoices and approved residual retention plan, all private. Do not put customer contacts, exported files or executed terms in Git.

## 8. Claims-to-evidence register

Use this table before showing a demonstration or sending an offer. An architecture plan is not product acceptance.

| Claim or requested capability | Evidence currently supportable | Wording allowed in sales material |
|---|---|---|
| Guest can browse and place a mock pizza order and reopen its receipt | Existing [README mock demo](../../README.md) and historical [stabilization record](../releases/stabilization-acceptance.md); separate hosted release gates remain unfinished | "Existing **mock-only** manual ordering demo; no payment collected." |
| Connected restaurant guest → staff → pay-at-restaurant recording | [RF-01 walkthrough](../demo/restaurant-sales-walkthrough.md), DS and RS implementation proposed, not accepted | "**Planned** restaurant pilot capability; not yet live or verified." |
| Owner can change live menus, hours, staff or table settings | RS-09/10/12/50/51 and DS owner proposal packets not live accepted | "**Planned**; preview/mock only where labeled." |
| Campaign previews and reporting | DEMO-SALES marketing **simulation** defined, not built. No verified provider sends | "**Planned simulated preview**; zero real messages or sales claims." |
| Real opted-in MSG91/SendGrid sends | U2/U3 and RS-30–37/INT03/RS-65 incomplete | "Not offered until separately approved and demonstrated." |
| Browser voice proposal and manual typed fallback | Proposed RS-55/56/57 and test-only RF-01 design; mock parser is not accepted live voice | "**Planned** user-reviewed voice; typed entry remains available." |
| Verified restaurant conversion, order-completion uplift or ROI | No private real pilot baseline, observation period or customer verification recorded | **Do not claim** uplift, satisfaction, conversion or return on investment |

**Verification rule:** Before making any stronger claim, add a dated private build/test/participant reference and its exact observed result to the onboarding evidence ledger. Do not treat provider-accepted as delivered, a recorded payment assertion as settled funds, or an interested lead as paid work.

