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
