# OrderlyApp — current development roadmap

**Updated:** November 22, 2026. **Scope:** restaurant-service implementation planning and delivery, without confusing the earlier mock demo with a real restaurant product. This guide was split by RF-05 from the [preserved 9,014-line historical guide](docs/plans/orderly-history.md). It is the entrypoint for **status, priority, decision summary, and release gates**, not a copy of every ticket's SQL and DTOs.

## How to read and execute the project

1. Start with the [current repository architecture](docs/repo_context.md) and the [ticket execution flow](docs/ticket-execution-flow.md); the latter retains its original baseline wave listing. **For accepted RF-01 sequencing use the new [authoritative proposed DAG and waves](docs/contracts/restaurant-service-plan.md#187-dependency-dag)** instead of a stale pre-RF-01 table.
2. Select **one** [RS/RF/RS-INT/RS-RELEASE packet](docs/tickets/restaurant-service/) or [DS proposal packet](docs/tickets/restaurant-service/DS-01.md) after verifying actual merged prerequisite evidence and same-file serialization. The full provider contracts have not been implemented merely because they are documented.
3. Read the packet in full, its source files, [RS-01 frozen shared contracts](docs/contracts/restaurant-service-v1.md), the [contract/change-control map](docs/contracts/restaurant-service-plan.md), and the [RF-01 simulation overlay](docs/demo/restaurant-sales-walkthrough.md) when applicable. The packet's copied schemas/DTOs are self-contained execution snapshots. If different from the maintained source, return `Needs Architect Decision: contract mismatch` and update producer, fixtures and consumers together.
4. Execute the packet's first scenario and its negative/failure/security tests. Keep each change atomic and separately validated. Record commit SHA, target environment, commands, observed results, documentation impact and remaining blockers. Review combined changes after five implemented packets.
5. Open a PR, run the required CI and review the integration gates. **Do not mark a ticket complete just because a plan, PR, test fixture or draft exists.** A builder may not change live auth, money, send or database contracts on its own.

[Original intern handbook and exact local baseline](docs/plans/orderly-history.md#0-intern-execution-handbook) · [Local test/Compose instructions](docs/plans/orderly-history.md#02-establish-a-reproducible-local-baseline) · [Historical mock acceptance](docs/releases/stabilization-acceptance.md)

## Scope and decisions

OrderlyApp currently runs a deliberately **mock-only** guest pizza ordering flow using Next.js, FastAPI, PostgreSQL and a same-origin gateway. The proposed first restaurant pilot is a distinct restaurant-owned live-v1 system: customers order dine-in/takeaway and pay **at the restaurant**, staff handle operational and full recorded payments, owners manage menu/hours/tables/staff and approve consented MSG91/SendGrid campaigns, and browser speech produces a **reviewed** cart proposal. The demo operates only within isolated synthetic sessions and cannot send messages, collect money or grant live staff authority.

**No-go scope:** online payments, deliveries, aggregators, automatic provider/LLM actions, payroll/inventory/accounting, split/partial bills, cross-tenant authorization shortcuts, new broker services or uncontrolled provider accounts. Keep mock USD cents separate from live INR paise. Protect the mock receipt/session/checkout contracts while adding live tables and routes.

**Key architectural decisions:** restaurant-scoped durable ledgers and composite foreign keys; server-side Clerk-subject plus live membership checks for staff; bounded live-v1 versioned cart/order/payment command identity; immutable receipts and uncertain-write reconciliation; consent-checked opt-in marketing with durable per-channel daily cost reservations; allowlisted gateway routes; deterministic, reviewed browser speech; native accessible UI with explicit loading/empty/stale/failure states. Synthetic demo uses only server-issued guest ownership, not a browser role or forged staff token. See [frozen definitions](docs/contracts/restaurant-service-v1.md), [proposed DAG and conflict/rollout rules](docs/contracts/restaurant-service-plan.md), [design](docs/designs/restaurant-service.md), and the [RF-01 walkthrough](docs/demo/restaurant-sales-walkthrough.md).

## 0. Intern execution handbook

### 0.2 Establish a reproducible local baseline

This legacy deep link now points to the [original full baseline commands and failure examples](docs/plans/orderly-history.md#02-establish-a-reproducible-local-baseline). Do not claim a test passed without running it on the named branch/build.

## 18. Restaurant service implementation tickets

**RS-01:** synthetic cross-language contract registry, fixture readers and negative examples merged in [PR #61](https://github.com/anmolsansi/OrderlyApp/pull/61). This is a **completed synthetic freeze only**, not a live provider.

**RF-01:** provider-independent four-capability DEMO-SALES **planning** merged in [PR #63](https://github.com/anmolsansi/OrderlyApp/pull/63). Its revised graph is an accepted proposed plan, not an implemented demo. Earlier tracking text saying PR #63 is still unmerged is obsolete.

**RF-05:** documentation split and packet synchronization on review branch [docs/rf-05-compact-roadmap-packets](https://github.com/anmolsansi/OrderlyApp/tree/docs/rf-05-compact-roadmap-packets), tracked in [issue #64](https://github.com/anmolsansi/OrderlyApp/issues/64) and [OPE-348](https://linear.app/openclaw-neutron/issue/OPE-348). **Unmerged until explicit review/approval**.

**RS-02–RS-67, DS-01–DS-06 and live integration/hosted pilot gates:** not claimed completed; read actual merged source and recorded evidence at execution before changing a status. The old 0/67 planning number is not an implementation metric after RS-01 merged. Treat remaining implementation as **66 RS packets**, plus independent DS/INT and release work, subject to dependency checks. No paid customer acceptance is on record.

## Readiness and release gates

| Gate | Required observable evidence | Current claim |
|---|---|---|
| **DEMO-SALES** | DS-01–06, real PostgreSQL/Chromium browser journey, A1–A9 and two-guest isolation, simulation labels, **zero** provider calls and money movement | **Proposed, NOT built or passed** |
| **RS-INT01** | Identity, catalog and live checkout with tenant authorization, money vectors and replay | Not completed |
| **RS-INT02** | Real customer/staff/cashier transaction and UI recovery | Not completed; no bypass for full service |
| **RS-INT03** | Campaign claim/dispatch/callback feedback, worker race and budget tests | Not completed; no provider acceptance implied |
| **RS-INT04** | Combined role/voice/demo compatibility on isolated stack, negative provider spies, mock regression | Not completed |
| **RS-64 / RS-65** | Failure/rollback rehearsal and real provider/customer/device/pilot acceptance | Not completed; U1–U4 outstanding |
| **RS-RELEASE** | Controlled live tenant activation after all integration evidence, on-call/rollback/retention gates and external signoff | Not completed |
| **Older mock ST-13, INT-02, RELEASE-GATE** | Hosted restart, cleanup scheduling and separate public mock release evidence | Deferred/incomplete, not waived by restaurant plan |

**External decisions (must not be invented):** U1 restaurant-specific prices/tax/fees/receipt wording; U2 retention/export/deletion/consent/privacy policy; U3 MSG91/SendGrid account ownership, approved send templates and conservative charge bounds; U4 actual restaurant/staff/device/network and pilot signoffs. Production activation is disabled until these inputs and verified providers exist.

**Failure/rollback:** keep the old mock routes and schema intact; all new live changes are additive with compatible app/schema rollout. A lost command response is uncertain until reconciled with its **original** identity. Never repeat with a fresh key or claim a completed payment/send from synthetic fixtures. For documentation extraction, revert the RF-05 branch as a unit if acceptance/link/coverage checks fail. Do not modify secrets, live configuration or applied migrations in RF-05.

## Proposed sequence

Follow the **[79-node/258-edge RF-01 graph and 30-wave schedule](docs/contracts/restaurant-service-plan.md#187-dependency-dag)**, not numerical ID order. Initial path: **RS-01 (merged synthetic) → RF-01 (merged planning) → RF-05 (docs review) → RS-02 / RS-11 / RS-39**; **RS-67 before RS-04**; **RS-20 before RS-30** for serialized staff route ownership; DS-01→06 only after their exact provider dependency gates. The earlier **DEMO-SALES W22** is an additive synthetic milestone. Provider send, reconciliation, INT and full-release gates remain binding.

[Detailed dependency table and file-ownership edges](docs/contracts/restaurant-service-plan.md#187-dependency-dag) · [All 30 proposed waves](docs/contracts/restaurant-service-plan.md#188-workstreams-and-execution-waves) · [RF-01 A1–A9 gate](docs/demo/restaurant-sales-walkthrough.md#8-acceptance-matrix)

### 18.9 Task index

**Original 67 RS packet files are preserved with their first-check scenario, consumed DTO/SQL schemas, owned paths, error rules, acceptance and rollback.** The contract column links to the RS-01 shared registry; use the [proposed DAG](docs/contracts/restaurant-service-plan.md#187-dependency-dag) for latest direct dependencies and waves, not historical copied prerequisites.

| Packet | Goal | Evidence status | Maintained shared contract source |
|---|---|---|---|
| <a id="rs-01"></a>[RS-01](docs/tickets/restaurant-service/RS-01.md) | Freeze live-v1 envelopes and synthetic consumer fixtures | Synthetic freeze merged, PR #61 | [CON-01](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-02"></a>[RS-02](docs/tickets/restaurant-service/RS-02.md) | Add live restaurant configuration and table storage | Not completed | [CON-02](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-03"></a>[RS-03](docs/tickets/restaurant-service/RS-03.md) | Add restaurant-owned order, receipt and action ledgers | Not completed | [CON-03](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-04"></a>[RS-04](docs/tickets/restaurant-service/RS-04.md) | Add memberships and an explicit initial-owner bootstrap | Not completed | [CON-04](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-05"></a>[RS-05](docs/tickets/restaurant-service/RS-05.md) | Verify Clerk session tokens in the backend | Not completed | [CON-05](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-06"></a>[RS-06](docs/tickets/restaurant-service/RS-06.md) | Authorize restaurant roles and revoke staff membership | Not completed | [CON-06](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-07"></a>[RS-07](docs/tickets/restaurant-service/RS-07.md) | Extend the same-origin gateway for explicit live routes | Not completed | [CON-07](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-08"></a>[RS-08](docs/tickets/restaurant-service/RS-08.md) | Provide staff sign-in and active restaurant selection | Not completed | [CON-08](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-09"></a>[RS-09](docs/tickets/restaurant-service/RS-09.md) | Read and update restaurant branding and ordering hours | Not completed | [CON-09](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-10"></a>[RS-10](docs/tickets/restaurant-service/RS-10.md) | Publish owner menu edits and staff availability edits | Not completed | [CON-10](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-11"></a>[RS-11](docs/tickets/restaurant-service/RS-11.md) | Freeze restaurant-specific pricing and receipt inputs | Not completed | [CON-11](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-12"></a>[RS-12](docs/tickets/restaurant-service/RS-12.md) | Create active table links without granting order access | Not completed | [CON-12](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-13"></a>[RS-13](docs/tickets/restaurant-service/RS-13.md) | Serve a scoped live menu and current availability | Not completed | [CON-13](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-14"></a>[RS-14](docs/tickets/restaurant-service/RS-14.md) | Persist a separate revisioned live basket | Not completed | [CON-14](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-15"></a>[RS-15](docs/tickets/restaurant-service/RS-15.md) | Calculate one versioned live quote | Not completed | [CON-15](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-16"></a>[RS-16](docs/tickets/restaurant-service/RS-16.md) | Store owner-defined public promotion rules | Not completed | [CON-16](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-17"></a>[RS-17](docs/tickets/restaurant-service/RS-17.md) | Apply promotion checks to live quotes | Not completed | [CON-17](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-18"></a>[RS-18](docs/tickets/restaurant-service/RS-18.md) | Commit or replay one live order atomically | Not completed | [CON-18](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-19"></a>[RS-19](docs/tickets/restaurant-service/RS-19.md) | Read live receipts through revocable guest access | Not completed | [CON-19](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-20"></a>[RS-20](docs/tickets/restaurant-service/RS-20.md) | Read a bounded staff queue and selected order | Not completed | [CON-20](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-21"></a>[RS-21](docs/tickets/restaurant-service/RS-21.md) | Apply versioned staff order transitions | Not completed | [CON-21](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-22"></a>[RS-22](docs/tickets/restaurant-service/RS-22.md) | Record exactly one full payment | Not completed | [CON-22](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-23"></a>[RS-23](docs/tickets/restaurant-service/RS-23.md) | Append payment reversals and close settlement work | Not completed | [CON-23](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-24"></a>[RS-24](docs/tickets/restaurant-service/RS-24.md) | Persist contacts and separate channel-consent evidence | Not completed | [CON-24](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-25"></a>[RS-25](docs/tickets/restaurant-service/RS-25.md) | Capture optional customer marketing consent independently | Not completed | [CON-25](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-26"></a>[RS-26](docs/tickets/restaurant-service/RS-26.md) | Suppress a channel through an unguessable unsubscribe link | Not completed | [CON-26](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-27"></a>[RS-27](docs/tickets/restaurant-service/RS-27.md) | Store campaign drafts, approvals and recipient work | Not completed | [CON-27](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-28"></a>[RS-28](docs/tickets/restaurant-service/RS-28.md) | Create and edit owner campaign drafts | Not completed | [CON-28](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-29"></a>[RS-29](docs/tickets/restaurant-service/RS-29.md) | Freeze and approve a bounded campaign preview | Not completed | [CON-29](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-30"></a>[RS-30](docs/tickets/restaurant-service/RS-30.md) | Validate restaurant-owned provider configuration without exposing secrets | Not completed | [CON-30](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-31"></a>[RS-31](docs/tickets/restaurant-service/RS-31.md) | Send one approved SMS through MSG91 | Not completed | [CON-31](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-32"></a>[RS-32](docs/tickets/restaurant-service/RS-32.md) | Send one approved email through SendGrid | Not completed | [CON-32](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-33"></a>[RS-33](docs/tickets/restaurant-service/RS-33.md) | Claim recipient work with durable leases and cost reservations | Not completed | [CON-33](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-34"></a>[RS-34](docs/tickets/restaurant-service/RS-34.md) | Dispatch claimed work and reconcile durable outcomes | Not completed | [CON-34](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-35"></a>[RS-35](docs/tickets/restaurant-service/RS-35.md) | Authenticate and reduce SendGrid event callbacks | Not completed | [CON-35](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-36"></a>[RS-36](docs/tickets/restaurant-service/RS-36.md) | Reconcile SMS delivery using authenticated provider evidence | Not completed | [CON-36](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-37"></a>[RS-37](docs/tickets/restaurant-service/RS-37.md) | Pause campaigns and expose safe reconciliation status | Not completed | [CON-37](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-38"></a>[RS-38](docs/tickets/restaurant-service/RS-38.md) | Read operational and campaign summaries without revenue claims | Not completed | [CON-38](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-39"></a>[RS-39](docs/tickets/restaurant-service/RS-39.md) | Apply light/dark tokens with pre-paint preference restoration | Not completed | [CON-39](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-40"></a>[RS-40](docs/tickets/restaurant-service/RS-40.md) | Build live role shells and stable accessible feedback | Not completed | [CON-40](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-41"></a>[RS-41](docs/tickets/restaurant-service/RS-41.md) | Create a typed live API adapter with safe uncertainty | Not completed | [CON-41](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-42"></a>[RS-42](docs/tickets/restaurant-service/RS-42.md) | Render menu-first live ordering with fulfillment context | Not completed | [CON-42](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-43"></a>[RS-43](docs/tickets/restaurant-service/RS-43.md) | Render one live basket with responsive summary and review | Not completed | [CON-43](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-44"></a>[RS-44](docs/tickets/restaurant-service/RS-44.md) | Review and submit a live pay-at-restaurant order | Not completed | [CON-44](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-45"></a>[RS-45](docs/tickets/restaurant-service/RS-45.md) | Recover an uncertain live order across reload and theme changes | Not completed | [CON-45](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-46"></a>[RS-46](docs/tickets/restaurant-service/RS-46.md) | Show receipt/status and separate optional marketing opt-in | Not completed | [CON-46](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-47"></a>[RS-47](docs/tickets/restaurant-service/RS-47.md) | Render the staff queue with stale-data protection | Not completed | [CON-47](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-48"></a>[RS-48](docs/tickets/restaurant-service/RS-48.md) | Use one order-detail controller across phone and wide layouts | Not completed | [CON-48](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-49"></a>[RS-49](docs/tickets/restaurant-service/RS-49.md) | Record payment and reversal through explicit inline forms | Not completed | [CON-49](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-50"></a>[RS-50](docs/tickets/restaurant-service/RS-50.md) | Provide owner settings, tables and staff membership screens | Not completed | [CON-50](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-51"></a>[RS-51](docs/tickets/restaurant-service/RS-51.md) | Provide owner menu pricing and staff availability controls | Not completed | [CON-51](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-52"></a>[RS-52](docs/tickets/restaurant-service/RS-52.md) | Create a draft-first marketing screen | Not completed | [CON-52](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-53"></a>[RS-53](docs/tickets/restaurant-service/RS-53.md) | Review exact campaign recipients, content and maximum cost | Not completed | [CON-53](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-54"></a>[RS-54](docs/tickets/restaurant-service/RS-54.md) | Display campaign outcomes and owner activity summaries | Not completed | [CON-54](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-55"></a>[RS-55](docs/tickets/restaurant-service/RS-55.md) | Capture editable browser speech with manual fallback | Not completed | [CON-55](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-56"></a>[RS-56](docs/tickets/restaurant-service/RS-56.md) | Parse voice against only the selected live catalog | Not completed | [CON-56](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-57"></a>[RS-57](docs/tickets/restaurant-service/RS-57.md) | Apply reviewed voice proposals through the same basket path | Not completed | [CON-57](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-58"></a>[RS-58](docs/tickets/restaurant-service/RS-58.md) | Isolate synthetic role demos and deny all external side effects | Not completed | [CON-58](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-59"></a>[RS-59](docs/tickets/restaurant-service/RS-59.md) | Present a connected sales demo with visible simulation labels | Not completed | [CON-59](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-60"></a>[RS-60](docs/tickets/restaurant-service/RS-60.md) | Expose live readiness, safe logs and worker heartbeat | Not completed | [CON-60](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-61"></a>[RS-61](docs/tickets/restaurant-service/RS-61.md) | Declare an opt-in worker and compatible deployment sequence | Not completed | [CON-61](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-62"></a>[RS-62](docs/tickets/restaurant-service/RS-62.md) | Add live contract and critical-path tests to existing CI | Not completed | [CON-62](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-63"></a>[RS-63](docs/tickets/restaurant-service/RS-63.md) | Specify retention, export and deletion policy before destructive work | Not completed | [CON-63](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-64"></a>[RS-64](docs/tickets/restaurant-service/RS-64.md) | Prove backup, restore and compatible rollback in isolation | Not completed | [CON-64](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-65"></a>[RS-65](docs/tickets/restaurant-service/RS-65.md) | Collect pilot pricing, provider and real-device acceptance evidence | Not completed | [CON-65](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-66"></a>[RS-66](docs/tickets/restaurant-service/RS-66.md) | Edit public offers in the owner marketing workspace | Not completed | [CON-66](docs/contracts/restaurant-service-v1.md) |
| <a id="rs-67"></a>[RS-67](docs/tickets/restaurant-service/RS-67.md) | Provision a disabled live restaurant without adopting mock data | Not completed | [CON-67](docs/contracts/restaurant-service-v1.md) |

### 18.10 Full implementation packets

Every ticket above is an independently readable assignment. The [old inlined master packet copy](docs/plans/orderly-history.md#1810-full-implementation-packets) is historical only. A builder packet must still contain the exact CON/DTO/SQL/schema definitions, security boundary, request/response examples, failure behavior, owned files, negative tests and rollback for its dependency slice. Do not hand off a bare contract ID or treat a draft as an implemented API.

### 18.11 Integration checkpoints and release

| ID | Exact assignment | State |
|---|---|---|
| RS-INT01 | [Identity, catalog, live checkout](docs/tickets/restaurant-service/RS-INT01.md) | Not completed |
| RS-INT02 | [Customer/staff/pay-at-restaurant](docs/tickets/restaurant-service/RS-INT02.md) | Not completed |
| RS-INT03 | [Approved campaign/worker/feedback](docs/tickets/restaurant-service/RS-INT03.md) | Not completed |
| RS-INT04 | [Whole synthetic service/compatibility](docs/tickets/restaurant-service/RS-INT04.md) | Not completed |
| RS-RELEASE | [Controlled activation](docs/tickets/restaurant-service/RS-RELEASE.md) | Not completed |

### 18.17 Review amendments and follow-up tickets

The [C-A command fingerprint](docs/contracts/restaurant-service-v1.md), [C-B durable daily budgets](docs/contracts/restaurant-service-v1.md), and [C-C canonical payment-reversals suffix](docs/contracts/restaurant-service-v1.md) belong to the frozen proposal registry plus explicit [historical amendment](docs/plans/orderly-history.md#18171-contract-corrections-required-before-fixture-freeze). All provider and consumer conformance remains unimplemented unless independently verified.

| Follow-up | Assignment | Evidence status |
|---|---|---|
| <a id="rf-01"></a>RF-01 | [Define earlier synthetic sales-demo planning](docs/tickets/restaurant-service/RF-01.md) | Merged planning in PR #63, not a built demo |
| <a id="rf-02"></a>RF-02 | [Prepare the paid pilot offer and evidence checklist](docs/tickets/restaurant-service/RF-02.md) | Not completed |
| <a id="rf-03"></a>RF-03 | [Make waiting orders noticeable to staff](docs/tickets/restaurant-service/RF-03.md) | Not completed |
| <a id="rf-04"></a>RF-04 | [Rehearse manual outage recovery](docs/tickets/restaurant-service/RF-04.md) | Not completed |
| <a id="rf-05"></a>RF-05 | [Split the guide and synchronize packets](docs/tickets/restaurant-service/RF-05.md) | Review branch unmerged |

**Six proposed DEMO-SALES child packets** preserve RF-01's earlier provider-independent contract and do not replace RS-58/59 full-release conformance.

| Child | Role and implementation handoff | State |
|---|---|---|
| DS-01 | [Private demo session and staff action kernel](docs/tickets/restaurant-service/DS-01.md) | Proposed, not implemented |
| DS-02 | [Owner settings and hypothetical campaign outcomes](docs/tickets/restaurant-service/DS-02.md) | Proposed, not implemented |
| DS-03 | [Exact same-origin demo gateway and typed client](docs/tickets/restaurant-service/DS-03.md) | Proposed, not implemented |
| DS-04 | [Demo staff role and shared component adaptation](docs/tickets/restaurant-service/DS-04.md) | Proposed, not implemented |
| DS-05 | [Demo owner role and simulated preview](docs/tickets/restaurant-service/DS-05.md) | Proposed, not implemented |
| DS-06 | [Connected demo launcher, reset and real-browser A1–A9](docs/tickets/restaurant-service/DS-06.md) | Proposed, not implemented |

[Full demo route/permission/side-effect matrix](docs/demo/restaurant-sales-walkthrough.md) · [Source and consumer handoff map](docs/contracts/restaurant-service-plan.md) · [RF-05 issue checklist](https://github.com/anmolsansi/OrderlyApp/issues/64)

## Historical bookmark redirects

The retired stabilization (sections 1–16) and history/discovery/voice plan (section 17) are preserved **verbatim in substance** in [the historical guide](docs/plans/orderly-history.md). The fragment aliases below keep older links targeting `development.md#...` navigable. They are not current implementation authority; opening the linked archived heading shows the original acceptance evidence and unfinished gates.

<a id="orderlyapp-intern-development-guide"></a> [OrderlyApp intern development guide](docs/plans/orderly-history.md#orderlyapp-intern-development-guide)  
<a id="earlier-stabilization-and-product-roadmap"></a> [Earlier stabilization and product roadmap](docs/plans/orderly-history.md#earlier-stabilization-and-product-roadmap)  
<a id="navigation"></a> [Navigation](docs/plans/orderly-history.md#navigation)  
<a id="01-what-to-receive-before-starting-one-task"></a> [0.1 What to receive before starting one task](docs/plans/orderly-history.md#01-what-to-receive-before-starting-one-task)  
<a id="03-use-disposable-services-for-database-and-browser-verification"></a> [0.3 Use disposable services for database and browser verification](docs/plans/orderly-history.md#03-use-disposable-services-for-database-and-browser-verification)  
<a id="04-complete-one-small-verified-change-at-a-time"></a> [0.4 Complete one small verified change at a time](docs/plans/orderly-history.md#04-complete-one-small-verified-change-at-a-time)  
<a id="05-worked-scenarios-evidence-and-handoff"></a> [0.5 Worked scenarios, evidence and handoff](docs/plans/orderly-history.md#05-worked-scenarios-evidence-and-handoff)  
<a id="06-diagnose-failures-without-weakening-the-checks"></a> [0.6 Diagnose failures without weakening the checks](docs/plans/orderly-history.md#06-diagnose-failures-without-weakening-the-checks)  
<a id="1-project-charter"></a> [1. Project charter](docs/plans/orderly-history.md#1-project-charter)  
<a id="2-codebase-reconnaissance"></a> [2. Codebase reconnaissance](docs/plans/orderly-history.md#2-codebase-reconnaissance)  
<a id="3-architecture-decision-register"></a> [3. Architecture Decision Register](docs/plans/orderly-history.md#3-architecture-decision-register)  
<a id="4-system-invariants"></a> [4. System invariants](docs/plans/orderly-history.md#4-system-invariants)  
<a id="5-component-graph"></a> [5. Component graph](docs/plans/orderly-history.md#5-component-graph)  
<a id="6-contract-registry"></a> [6. Contract registry](docs/plans/orderly-history.md#6-contract-registry)  
<a id="c0-mode-and-verification-baseline"></a> [C0 — Mode and verification baseline](docs/plans/orderly-history.md#c0-mode-and-verification-baseline)  
<a id="c1-guest-session-and-ownership"></a> [C1 — Guest session and ownership](docs/plans/orderly-history.md#c1-guest-session-and-ownership)  
<a id="c2-password-free-presentation-profile"></a> [C2 — Password-free presentation profile](docs/plans/orderly-history.md#c2-password-free-presentation-profile)  
<a id="c3-canonical-catalog-and-cart-validation"></a> [C3 — Canonical catalog and cart validation](docs/plans/orderly-history.md#c3-canonical-catalog-and-cart-validation)  
<a id="c4-durable-revisioned-cart"></a> [C4 — Durable revisioned cart](docs/plans/orderly-history.md#c4-durable-revisioned-cart)  
<a id="c5-server-quote-and-immutable-receipt"></a> [C5 — Server quote and immutable receipt](docs/plans/orderly-history.md#c5-server-quote-and-immutable-receipt)  
<a id="c6-atomic-idempotent-checkout"></a> [C6 — Atomic idempotent checkout](docs/plans/orderly-history.md#c6-atomic-idempotent-checkout)  
<a id="c7-web-adapter-and-recovery-state"></a> [C7 — Web adapter and recovery state](docs/plans/orderly-history.md#c7-web-adapter-and-recovery-state)  
<a id="c8-readiness-lifecycle-and-restart"></a> [C8 — Readiness, lifecycle and restart](docs/plans/orderly-history.md#c8-readiness-lifecycle-and-restart)  
<a id="c5-pricing-and-checkout-details-exact-rules"></a> [C5 pricing and checkout details — exact rules](docs/plans/orderly-history.md#c5-pricing-and-checkout-details-exact-rules)  
<a id="7-dependency-dag"></a> [7. Dependency DAG](docs/plans/orderly-history.md#7-dependency-dag)  
<a id="machine-readable-edge-table"></a> [Machine-readable edge table](docs/plans/orderly-history.md#machine-readable-edge-table)  
<a id="8-workstreams-and-execution-waves"></a> [8. Workstreams and execution waves](docs/plans/orderly-history.md#8-workstreams-and-execution-waves)  
<a id="9-task-index-and-remaining-work"></a> [9. Task index and remaining work](docs/plans/orderly-history.md#9-task-index-and-remaining-work)  
<a id="priority-and-execution-rationale"></a> [Priority and execution rationale](docs/plans/orderly-history.md#priority-and-execution-rationale)  
<a id="10-full-implementation-packets"></a> [10. Full implementation packets](docs/plans/orderly-history.md#10-full-implementation-packets)  
<a id="st-01-reproduce-the-baseline-and-publish-executable-contracts"></a> [ST-01 — Reproduce the baseline and publish executable contracts](docs/plans/orderly-history.md#st-01-reproduce-the-baseline-and-publish-executable-contracts)  
<a id="st-02-give-each-visitor-a-private-server-issued-guest-session"></a> [ST-02 — Give each visitor a private server-issued guest session](docs/plans/orderly-history.md#st-02-give-each-visitor-a-private-server-issued-guest-session)  
<a id="st-03-replace-local-passwords-with-honest-demo-profiles"></a> [ST-03 — Replace local passwords with honest demo profiles](docs/plans/orderly-history.md#st-03-replace-local-passwords-with-honest-demo-profiles)  
<a id="st-04-validate-and-price-items-from-one-canonical-catalog"></a> [ST-04 — Validate and price items from one canonical catalog](docs/plans/orderly-history.md#st-04-validate-and-price-items-from-one-canonical-catalog)  
<a id="st-05-persist-baskets-with-revisions-and-no-hidden-failover"></a> [ST-05 — Persist baskets with revisions and no hidden failover](docs/plans/orderly-history.md#st-05-persist-baskets-with-revisions-and-no-hidden-failover)  
<a id="st-06-save-complete-receipts-with-deterministic-money-rules"></a> [ST-06 — Save complete receipts with deterministic money rules](docs/plans/orderly-history.md#st-06-save-complete-receipts-with-deterministic-money-rules)  
<a id="st-07-make-checkout-atomic-and-safe-to-retry"></a> [ST-07 — Make checkout atomic and safe to retry](docs/plans/orderly-history.md#st-07-make-checkout-atomic-and-safe-to-retry)  
<a id="st-08-connect-discovery-customization-and-basket-to-the-api"></a> [ST-08 — Connect discovery, customization and basket to the API](docs/plans/orderly-history.md#st-08-connect-discovery-customization-and-basket-to-the-api)  
<a id="st-09-make-checkout-confirmation-and-history-recover-honestly"></a> [ST-09 — Make checkout, confirmation and history recover honestly](docs/plans/orderly-history.md#st-09-make-checkout-confirmation-and-history-recover-honestly)  
<a id="st-10-finish-address-selection-safe-navigation-and-resilient-ui"></a> [ST-10 — Finish address selection, safe navigation and resilient UI](docs/plans/orderly-history.md#st-10-finish-address-selection-safe-navigation-and-resilient-ui)  
<a id="st-11-make-startup-readiness-retention-and-recovery-truthful"></a> [ST-11 — Make startup, readiness, retention and recovery truthful](docs/plans/orderly-history.md#st-11-make-startup-readiness-retention-and-recovery-truthful)  
<a id="st-12-expand-ci-and-refresh-release-dependencies"></a> [ST-12 — Expand CI and refresh release dependencies](docs/plans/orderly-history.md#st-12-expand-ci-and-refresh-release-dependencies)  
<a id="st-13-reconcile-documentation-and-verify-the-public-candidate"></a> [ST-13 — Reconcile documentation and verify the public candidate](docs/plans/orderly-history.md#st-13-reconcile-documentation-and-verify-the-public-candidate)  
<a id="11-integration-checkpoints"></a> [11. Integration checkpoints](docs/plans/orderly-history.md#11-integration-checkpoints)  
<a id="int-01-real-manual-ordering-journey-completed-disclosed-separate-local-pass"></a> [INT-01 — Real manual ordering journey — Completed (disclosed separate local pass)](docs/plans/orderly-history.md#int-01-real-manual-ordering-journey-completed-disclosed-separate-local-pass)  
<a id="int-02-release-persistence-and-recovery-rehearsal-not-completed"></a> [INT-02 — Release, persistence and recovery rehearsal — Not completed](docs/plans/orderly-history.md#int-02-release-persistence-and-recovery-rehearsal-not-completed)  
<a id="12-test-matrix"></a> [12. Test matrix](docs/plans/orderly-history.md#12-test-matrix)  
<a id="13-critical-path-and-parallelization"></a> [13. Critical path and parallelization](docs/plans/orderly-history.md#13-critical-path-and-parallelization)  
<a id="14-release-migration-rollback-and-observability-gates"></a> [14. Release, migration, rollback, and observability gates](docs/plans/orderly-history.md#14-release-migration-rollback-and-observability-gates)  
<a id="release-gate-stable-public-mock-demo-not-completed"></a> [RELEASE-GATE — Stable public mock demo — Not completed](docs/plans/orderly-history.md#release-gate-stable-public-mock-demo-not-completed)  
<a id="evidence-ledger-template"></a> [Evidence ledger template](docs/plans/orderly-history.md#evidence-ledger-template)  
<a id="15-risks-and-true-blockers"></a> [15. Risks and true blockers](docs/plans/orderly-history.md#15-risks-and-true-blockers)  
<a id="16-delegation-readiness-report"></a> [16. Delegation readiness report](docs/plans/orderly-history.md#16-delegation-readiness-report)  
<a id="st-01-implementation-evidence-2026-10-04"></a> [ST-01 implementation evidence — 2026-10-04](docs/plans/orderly-history.md#st-01-implementation-evidence-2026-10-04)  
<a id="verified-source-and-runners"></a> [Verified source and runners](docs/plans/orderly-history.md#verified-source-and-runners)  
<a id="dependency-assessment-and-decisions"></a> [Dependency assessment and decisions](docs/plans/orderly-history.md#dependency-assessment-and-decisions)  
<a id="contract-freeze-status"></a> [Contract freeze status](docs/plans/orderly-history.md#contract-freeze-status)  
<a id="17-product-implementation-roadmap-history-discovery-voice"></a> [17. Product implementation roadmap — history, discovery, voice](docs/plans/orderly-history.md#17-product-implementation-roadmap-history-discovery-voice)  
<a id="171-project-charter"></a> [17.1 Project charter](docs/plans/orderly-history.md#171-project-charter)  
<a id="172-codebase-reconnaissance"></a> [17.2 Codebase reconnaissance](docs/plans/orderly-history.md#172-codebase-reconnaissance)  
<a id="173-architecture-decision-register"></a> [17.3 Architecture Decision Register](docs/plans/orderly-history.md#173-architecture-decision-register)  
<a id="174-system-invariants"></a> [17.4 System invariants](docs/plans/orderly-history.md#174-system-invariants)  
<a id="175-component-graph"></a> [17.5 Component graph](docs/plans/orderly-history.md#175-component-graph)  
<a id="176-contract-registry"></a> [17.6 Contract registry](docs/plans/orderly-history.md#176-contract-registry)  
<a id="fh-guest-history-pages"></a> [FH — Guest history pages](docs/plans/orderly-history.md#fh-guest-history-pages)  
<a id="fp-reorder-proposal-from-an-immutable-receipt"></a> [FP — Reorder proposal from an immutable receipt](docs/plans/orderly-history.md#fp-reorder-proposal-from-an-immutable-receipt)  
<a id="fa-reviewed-proposal-application-and-conflict-recovery"></a> [FA — Reviewed proposal application and conflict recovery](docs/plans/orderly-history.md#fa-reviewed-proposal-application-and-conflict-recovery)  
<a id="fd-canonical-discovery-url-and-selection"></a> [FD — Canonical discovery URL and selection](docs/plans/orderly-history.md#fd-canonical-discovery-url-and-selection)  
<a id="fm-searchable-restaurant-menu"></a> [FM — Searchable restaurant menu](docs/plans/orderly-history.md#fm-searchable-restaurant-menu)  
<a id="fv-catalog-grounded-voice-interpretation"></a> [FV — Catalog-grounded voice interpretation](docs/plans/orderly-history.md#fv-catalog-grounded-voice-interpretation)  
<a id="fs-deliberate-microphonetext-input"></a> [FS — Deliberate microphone/text input](docs/plans/orderly-history.md#fs-deliberate-microphonetext-input)  
<a id="feature-integration-gate-contracts-fg1-fg2-fg3"></a> [Feature integration gate contracts FG1, FG2, FG3](docs/plans/orderly-history.md#feature-integration-gate-contracts-fg1-fg2-fg3)  
<a id="177-dependency-dag"></a> [17.7 Dependency DAG](docs/plans/orderly-history.md#177-dependency-dag)  
<a id="178-workstreams-and-execution-waves"></a> [17.8 Workstreams and execution waves](docs/plans/orderly-history.md#178-workstreams-and-execution-waves)  
<a id="179-task-index"></a> [17.9 Task index](docs/plans/orderly-history.md#179-task-index)  
<a id="1710-full-implementation-packets"></a> [17.10 Full implementation packets](docs/plans/orderly-history.md#1710-full-implementation-packets)  
<a id="oh-01-make-guest-history-browseable-beyond-the-first-page"></a> [OH-01 — Make guest history browseable beyond the first page](docs/plans/orderly-history.md#oh-01-make-guest-history-browseable-beyond-the-first-page)  
<a id="oh-02-build-a-safe-reorder-draft-using-todays-catalog"></a> [OH-02 — Build a safe reorder draft using today’s catalog](docs/plans/orderly-history.md#oh-02-build-a-safe-reorder-draft-using-todays-catalog)  
<a id="oh-03-review-and-atomically-apply-reorder-with-safe-recovery"></a> [OH-03 — Review and atomically apply reorder with safe recovery](docs/plans/orderly-history.md#oh-03-review-and-atomically-apply-reorder-with-safe-recovery)  
<a id="g1-accept-history-and-reorder-on-the-integrated-candidate"></a> [G1 — Accept history and reorder on the integrated candidate](docs/plans/orderly-history.md#g1-accept-history-and-reorder-on-the-integrated-candidate)  
<a id="ds-01-freeze-one-discovery-query-url-and-matching-contract"></a> [DS-01 — Freeze one discovery query, URL and matching contract](docs/plans/orderly-history.md#ds-01-freeze-one-discovery-query-url-and-matching-contract)  
<a id="ds-02-make-restaurant-discovery-controls-useful-and-consistent"></a> [DS-02 — Make restaurant discovery controls useful and consistent](docs/plans/orderly-history.md#ds-02-make-restaurant-discovery-controls-useful-and-consistent)  
<a id="ds-03-find-dishes-within-a-restaurant-without-losing-customization"></a> [DS-03 — Find dishes within a restaurant without losing customization](docs/plans/orderly-history.md#ds-03-find-dishes-within-a-restaurant-without-losing-customization)  
<a id="g2-accept-discovery-and-menu-browsing-before-voice-work"></a> [G2 — Accept discovery and menu browsing before voice work](docs/plans/orderly-history.md#g2-accept-discovery-and-menu-browsing-before-voice-work)  
<a id="vo-01-interpret-short-commands-using-the-selected-real-menu"></a> [VO-01 — Interpret short commands using the selected real menu](docs/plans/orderly-history.md#vo-01-interpret-short-commands-using-the-selected-real-menu)  
<a id="vo-02-capture-speech-deliberately-with-an-editable-text-fallback"></a> [VO-02 — Capture speech deliberately with an editable text fallback](docs/plans/orderly-history.md#vo-02-capture-speech-deliberately-with-an-editable-text-fallback)  
<a id="vo-03-review-voice-proposals-through-the-existing-safe-basket-flow"></a> [VO-03 — Review voice proposals through the existing safe basket flow](docs/plans/orderly-history.md#vo-03-review-voice-proposals-through-the-existing-safe-basket-flow)  
<a id="g3-accept-all-three-features-and-real-microphone-behavior"></a> [G3 — Accept all three features and real microphone behavior](docs/plans/orderly-history.md#g3-accept-all-three-features-and-real-microphone-behavior)  
<a id="1711-integration-checkpoints"></a> [17.11 Integration checkpoints](docs/plans/orderly-history.md#1711-integration-checkpoints)  
<a id="1712-test-matrix"></a> [17.12 Test matrix](docs/plans/orderly-history.md#1712-test-matrix)  
<a id="1713-critical-path-and-parallelization-plan"></a> [17.13 Critical path and parallelization plan](docs/plans/orderly-history.md#1713-critical-path-and-parallelization-plan)  
<a id="1714-release-migration-rollback-and-observability-gates"></a> [17.14 Release, migration, rollback, and observability gates](docs/plans/orderly-history.md#1714-release-migration-rollback-and-observability-gates)  
<a id="1715-risks-and-true-blockers"></a> [17.15 Risks and true blockers](docs/plans/orderly-history.md#1715-risks-and-true-blockers)  
<a id="1716-delegation-readiness-report"></a> [17.16 Delegation readiness report](docs/plans/orderly-history.md#1716-delegation-readiness-report)

**Original ticket/milestone bookmarks:** <a id="orderlyapp-development-guide--stabilization-and-product-roadmap"></a>[orderlyapp-development-guide--stabilization-and-product-roadmap](docs/plans/orderly-history.md#orderlyapp-development-guide--stabilization-and-product-roadmap) · <a id="st-01"></a>[st-01](docs/plans/orderly-history.md#st-01) · <a id="st-02"></a>[st-02](docs/plans/orderly-history.md#st-02) · <a id="st-03"></a>[st-03](docs/plans/orderly-history.md#st-03) · <a id="st-04"></a>[st-04](docs/plans/orderly-history.md#st-04) · <a id="st-05"></a>[st-05](docs/plans/orderly-history.md#st-05) · <a id="st-06"></a>[st-06](docs/plans/orderly-history.md#st-06) · <a id="st-07"></a>[st-07](docs/plans/orderly-history.md#st-07) · <a id="st-08"></a>[st-08](docs/plans/orderly-history.md#st-08) · <a id="st-09"></a>[st-09](docs/plans/orderly-history.md#st-09) · <a id="st-10"></a>[st-10](docs/plans/orderly-history.md#st-10) · <a id="st-11"></a>[st-11](docs/plans/orderly-history.md#st-11) · <a id="st-12"></a>[st-12](docs/plans/orderly-history.md#st-12) · <a id="st-13"></a>[st-13](docs/plans/orderly-history.md#st-13) · <a id="int-01"></a>[int-01](docs/plans/orderly-history.md#int-01) · <a id="int-02"></a>[int-02](docs/plans/orderly-history.md#int-02) · <a id="release-gate"></a>[release-gate](docs/plans/orderly-history.md#release-gate) · <a id="oh-01"></a>[oh-01](docs/plans/orderly-history.md#oh-01) · <a id="oh-02"></a>[oh-02](docs/plans/orderly-history.md#oh-02) · <a id="oh-03"></a>[oh-03](docs/plans/orderly-history.md#oh-03) · <a id="g1"></a>[g1](docs/plans/orderly-history.md#g1) · <a id="ds-01"></a>[ds-01](docs/plans/orderly-history.md#ds-01) · <a id="ds-02"></a>[ds-02](docs/plans/orderly-history.md#ds-02) · <a id="ds-03"></a>[ds-03](docs/plans/orderly-history.md#ds-03) · <a id="g2"></a>[g2](docs/plans/orderly-history.md#g2) · <a id="vo-01"></a>[vo-01](docs/plans/orderly-history.md#vo-01) · <a id="vo-02"></a>[vo-02](docs/plans/orderly-history.md#vo-02) · <a id="vo-03"></a>[vo-03](docs/plans/orderly-history.md#vo-03) · <a id="g3"></a>[g3](docs/plans/orderly-history.md#g3)

### 18.6 Contract registry

Shared schema and CON-01–67: [RS-01 frozen registry](docs/contracts/restaurant-service-v1.md). Proposed demo-only contract extension and the corrected execution graph: [contract plan](docs/contracts/restaurant-service-plan.md). Original inlined plan: [archived section 18.6](docs/plans/orderly-history.md#186-contract-registry).

### 18.7 Dependency DAG

[Canonical accepted RF-01 proposed graph](docs/contracts/restaurant-service-plan.md#187-dependency-dag).

### 18.8 Workstreams and execution waves

[Canonical accepted RF-01 30-wave schedule](docs/contracts/restaurant-service-plan.md#188-workstreams-and-execution-waves).

### 18.17.1 Contract corrections required before fixture freeze

[C-A/B/C proposal and detailed acceptance](docs/plans/orderly-history.md#18171-contract-corrections-required-before-fixture-freeze), incorporated into the [frozen shared RS-01 registry](docs/contracts/restaurant-service-v1.md). No live provider acceptance is implied.

### 18.17.2 Follow-up index and scheduling

See the RF table above and [archived original estimates](docs/plans/orderly-history.md#18172-follow-up-index-and-scheduling).

### 18.17.3 RF-01 provider-independent DEMO-SALES overlay (proposed, not implemented)

[RF-01 original amendment](docs/plans/orderly-history.md#18173-rf-01-provider-independent-demo-sales-overlay-proposed-not-implemented) and [accepted five-minute handoff](docs/demo/restaurant-sales-walkthrough.md).
