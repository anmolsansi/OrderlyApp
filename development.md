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
