# OrderlyApp — RF-01 synthetic restaurant sales demonstration

> **Planning artifact, not a working demo.** RF-01 defines the proposed DEMO-SALES prerequisite graph and acceptance contract. No route, role, component, transport or test described as *planned* exists merely because it appears here. The full restaurant-service release still requires RS-INT01–04, RS-64/65, RS-RELEASE and evidence U1–U4.

**Baseline:** GitHub `main` at `ed738ada2cdf9610a780a09e7bb24f690b7d80ba` (RS-01 PR #61). The frozen RS-01 cross-language synthetic fixtures and shared wire rules are the design input, not proof that any RS-02–67 runtime provider exists. See [RF-01](../tickets/restaurant-service/RF-01.md), [contracts](../contracts/restaurant-service-v1.md), [execution order](../ticket-execution-flow.md) and [canonical graph](../../development.md#187-dependency-dag).

## 1. Goal, non-goals, and design verdict

**Outcome:** in a single isolated synthetic restaurant, show guest ordering, staff accepting/preparing/completing and recording a pay-at-restaurant payment, owner menu availability, a draft/preview with clearly **simulated** marketing outcomes, and browser speech producing a reviewable cart proposal with manual text fallback. All four capabilities are observable in one five-minute demonstration.

**Keep:** the real live-v1 domain, revision/idempotency guarantees, PostgreSQL owner isolation, typed API boundary, shared customer/staff/owner components, existing demo guest cookie and frozen fixture formats. A demonstration never generates Clerk membership, implies settlement, touches production addresses, or calls a provider.

**Do not add:** online payment, actual SMS/email, provider credentials, restaurant integration, an AI auto-ordering agent, a second ordering business model, or a second unprotected copy of the app. The original mock portfolio routes and C0–C8 fixtures remain unchanged.

**Decision:** split **synthetic capability** from **production-provider acceptance**. The earlier DEMO-SALES graph is additive. Preserve every live provider, campaign reconciliation, release gate and rollback check in the full-service graph. RS-58/59 remain full-release conformance owners, while bounded DS packets below supply reusable early demo slices. The existing packet copies are drafts and must be reconciled before a builder executes changed ownership.

## 2. Facts versus proposed behavior

| Boundary | Already merged | Proposed by later RS/DS packets |
|---|---|---|
| Synthetic contracts | RS-01 fixture freeze, both language readers and C-A/B/C corrections | Implemented live-v1 providers and actual synthetic demonstration |
| Existing product | Mock ordering, guest-scoped cart/receipt and no-real-payment checkout | Restaurant-scoped live cart/receipt and staff states |
| Identity | Mock guest cookie; local demo profile is **not** staff auth | Real staff require Clerk + local membership; synthetic demo uses server-verified guest-owned demo scope only |
| Marketing | No live provider integration | Drafts/preview and hypothetical simulated outcomes independent of MSG91/SendGrid |
| Voice | Historical mock parser, not proof of new live voice | Deterministic selected-catalog proposal, explicit review, typed fallback |

**Entry condition for building the DS packets:** the RS-01 synthetic freeze is merged; each additional direct provider must be merged and pass its own tests before its consumer may merge. A PR containing this plan does **not** satisfy those provider gates.

