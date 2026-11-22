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

## 3. Four-capability inventory with exact owners

The following routes are **planned** under the frozen draft contract. Browser calls to `/v1/live/...` traverse the existing same-origin `/api/orderly/live/...` gateway **only after RS-07 explicitly allows the method and path**. No wildcard proxy is authorized.

| Walkthrough capability | Planned API / route | Actor and fixture | Source owner and preconditions |
|---|---|---|---|
| Create private demo | `POST /v1/live/demo/session` `{}` | Active guest cookie; new copy of `r-demo` for this guest | DS-01, extracting CON-58 isolation from RS-58; RS-01, RS-07, RS-19 |
| Guest menu | `GET /v1/live/restaurants/{rid}/menu`; page `/r/{rid}` | Same demo guest/session, `i-one`, catalog version | RS-13, RS-42, DS-01 guest synthetic ownership check |
| Edit cart | `GET/PUT /v1/live/restaurants/{rid}/cart`; page `/r/{rid}/basket` | Guest + restaurant; revision 0/1 | RS-14, RS-43 |
| Quote/order | `POST /v1/live/restaurants/{rid}/quote`, `POST /v1/live/restaurants/{rid}/orders`; page `/r/{rid}/checkout` | Guest, quote digest, UUID key, synthetic INR paise | RS-15/17/18, RS-44, RS-INT01 |
| Receipt and uncertainty | `GET /v1/live/restaurants/{rid}/orders/{oid}`; `/r/{rid}/orders/{oid}` and `/r/{rid}/recovery` | Original guest only | RS-19, RS-45/46 |
| Staff queue/detail | `GET /v1/live/demo/restaurants/{rid}/orders[/{oid}]` | Demo guest's scoped role screen, never Clerk staff role | DS-01 CON-58 slice, RS-20/47/48 |
| Staff transitions | `POST /v1/live/demo/restaurants/{rid}/orders/{oid}/transitions` | Same synthetic restaurant/order; versioned command | RS-21, DS-01, RS-48 |
| Record payment | `POST /v1/live/demo/restaurants/{rid}/orders/{oid}/payments` | Same demo owner scope; **recorded assertion**, not bank settlement | RS-22, DS-01, RS-49 |
| Owner settings/menu | Demo-only `GET .../settings`, `GET .../menu`, `PUT .../menu/{item_id}/availability` | Demo owner capability derived server-side; never live settings route | DS-02; reuse RS-09/10/51 domain and visual controls |
| Offer read | Demo-only `GET .../offers` | Synthetic offer scoped to `r-demo` copy | DS-02, RS-16/66 |
| Marketing draft/preview | Demo-only `GET/POST .../campaigns`, `GET/PUT .../campaigns/{cid}`, `POST .../campaigns/{cid}/preview`, `POST .../campaigns/{cid}/approve` | Synthetic contacts/offer; preview uses frozen snapshot | DS-01 CON-58 slice, RS-24/26/27/28/29, RS-52/53 |
| Marketing setup/results/summary | Demo-only `GET .../setup`, `GET .../campaigns/{cid}/simulation`, `GET .../simulation-summary` | Synthetic and labeled hypothetical data only | DS-02. **Missing in CON-58/59: must not invent a live equivalent** |
| Voice and reviewed add | Browser speech/typed text; selected-catalog proposal; same revisioned cart PUT | Current demo restaurant/catalog, no LLM/automatic side effect | RS-55/56/57, reused RS-42/43 |
| Demo navigation/reset | `/demo`, `/demo/{rid}/staff`, `/demo/{rid}/owner`, reset via fresh `POST /v1/live/demo/session` | Original guest cookie, new isolated tenant/fixtures | DS-03/04, RS-59 later conformance |

`...` in the **demo** rows means `/v1/live/demo/restaurants/{rid}`, not the real Clerk-protected `/v1/live/staff/restaurants/{rid}`. An actual staff page must **not** accept a demo guest as authorization. Browser-visible role labels are presentation only.

**Minimum fixture consumers:** `r-demo` restaurant/menu/table (DB-A), `g-one` guest nonce scope (DB-B), item `i-one` and modifier prices, 0→1 cart revision, deterministic INR-paise quote/receipt/order, synthetic contacts including one suppressed channel, one transferable offer, draft campaign with version/preview ID, and stable test timestamps. All demo records are copied into a distinct scope per guest. Do not reuse a shared fixture row as the writable authority.

