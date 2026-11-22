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

## 4. Synthetic authority and exact route boundary

**Proposed server-side demo capability:** `POST /v1/live/demo/session` requires the same verified active HttpOnly guest cookie and exact Origin rules as existing guest actions, responds `201 {schema_version:1,restaurant_id,expires_at}`, and creates a new synthetic restaurant copy with `demo_owner_id` bound to that guest. Demo scope is looked up from the session and database. A caller-supplied `role`, `synthetic`, `demo`, `restaurant_id`, request header or URL alone has **no** authority. Separate browsers have separate restaurant copies. Unauthenticated demo access returns 401, another owner's tenant/order returns 404, and an attempted live staff action returns 401/403 even from a demo role screen.

**Approved demo staff command methods only:** `GET orders`, `GET orders/{oid}`, `POST orders/{oid}/transitions`, `POST orders/{oid}/payments`. A later full RS-58 can add `POST orders/{oid}/payment-reversals` behind its reviewed acceptance. The five-minute script does not require a reversal. Command keys follow C-A canonical `{operation,target,body}` fingerprinting and authorization-before-replay; uncertain writes reuse the **same key**, not a new one.

**Proposed owner read/edit expansion, subject to DS-02 review:**

| Method and demo-only suffix | Input | Output / failure |
|---|---|---|
| `GET settings` | None | CON-09 Settings snapshot. 404 wrong owner |
| `GET menu` | None | CON-10 Menu and catalog_version |
| `PUT menu/{item_id}/availability` | `{expected_catalog_version:int,available:boolean}` | Updated CON-10 Menu; 409 stale; 404 foreign item; 422 wrong types |
| `GET offers` | `limit=1..100` optional | CON-16 `{offers,next_cursor}`; no private marketing contacts |
| `GET setup` | None | `{schema_version:1,synthetic:true,provider_mode:"disabled",sms_ready:false,email_ready:false,reason_codes:["DEMO_ONLY"]}` |
| `GET simulation-summary` | None | `{schema_version:1,synthetic:true,submitted:int,completed:int,simulated_recorded_payment_minor:int,campaign_previews:int,actual_messages_sent:0,actual_revenue_minor:0}` |

All routes have the explicit prefix `/v1/live/demo/restaurants/{rid}/`, exact method/path allowlist in both server and gateway, and per-request demo-owner check. These are **additive proposals** for DS-02, not changes to the established real owner-staff routes. The same-owned UI controls receive a typed `demo` data adapter; they never call the live staff endpoint with a guest cookie. No query string may switch into demo authority.

**Reset:** a fresh `POST /v1/live/demo/session` creates a fresh scoped fixture. Old scope must no longer authorize the initiating guest, and resetting guest A cannot change B or a real tenant. An interrupted reset or uncertain POST remains an error/reconciliation state, not a silent fallback to the shared fixture. Historical real business records are never cascaded by demo reset.

## 5. Marketing split and transport safety

**Scope comparison:**

| Feature | DEMO-SALES | Real restaurant service |
|---|---|---|
| Campaign draft and offer | Synthetic owner-owned data; reuse CON-16/28 | Real Clerk owner and restaurant-owned contacts |
| Audience preview | Synthetic eligible/suppressed test contacts, count only | Real consent, suppression, provider configuration, signed-off U3 |
| Approve | Stores only synthetic scenario state with replay protection | Frozen approval plus verified caps, budgets and queued recipient work |
| Results | **Would be eligible / queued / suppressed** scenario numbers, not delivery evidence | Authenticated MSG91/SendGrid send/callback/reconciliation states |
| Monetary claim | `actual_spend_minor=0`, `actual_revenue_minor=0`, simulated recorded cash/UPI assertion explicitly labeled | Real receipt and staff record, separate from settlement; no auto-confirmed payments |
| Provider transport | No worker claim, no SDK, no HTTP egress and **zero provider calls** | RS-30–37, separate U3 evidence, signed webhooks/budgets/uncertainty |

**Proposed `GET /v1/live/demo/restaurants/{rid}/campaigns/{cid}/simulation`:** only for a saved synthetic campaign and owned demo scope. Returns `200` with
```json
{
  "schema_version": 1,
  "synthetic": true,
  "restaurant_id": "r-demo-session-specific",
  "campaign_id": "00000000-0000-4000-8000-000000000001",
  "preview_id": "00000000-0000-4000-8000-000000000002",
  "scenario": {"would_be_eligible": 2, "would_be_queued": 2, "would_be_suppressed": 1},
  "actual_sent": 0,
  "actual_delivered": 0,
  "actual_spend_minor": 0,
  "label": "Simulation only. No messages sent.",
  "as_of": "2026-11-22T00:00:00Z"
}
```
Identifiers and counts are illustrative synthetic *test vectors*, not provider evidence. No real person or send target is permitted. Expired, edited or missing preview returns 409/404 with the common safe error envelope; a zero-eligible scenario returns all zero counts. A second read is deterministic and side-effect free. This read is **not** the RS-37 live reconciliation status or CON-38 live revenue summary.

**Negative proof:** inject an outbound HTTP/MSG91/SendGrid transport spy into demo tests. Assert zero constructed provider clients, network sends, worker claims, payment gateway operations, credential lookups or money movement from session creation through reset. A request that attempts `send`, `dispatch`, `retry` or a non-allowlisted demo method returns 404/403 and produces no durable outbox work. The worker, when implemented in RS-34, must reject synthetic restaurants at claim **and** immediately before transport. Fake email/SMS is never called “delivered.” Actual live launch continues to require full U3 consent, provider shape, cost caps and callbacks.

## 6. Implementation handoff: six bounded child packets

These are **proposed new tickets**, not implemented providers and not additional GitHub issues. RF-05 should extract each into a self-contained packet, synchronize the original RS-20/30/58/59 copies, and preserve the source contracts/negative tests. Each packet is deliberately five or fewer owned files. None may create a second business/order subsystem.

| Child | Responsibility and direct inputs | Exact owned implementation/test files | Gate |
|---|---|---|---|
| **DS-01** — demo isolation kernel | After RS-01/07/19/22/29/41. Server-authoritative private demo session/copy; scoped order, transition, payment and existing campaign draft/preview commands. Reuse RS-14/18/21/22/28/29/CON-58 rules | CREATE `backend/app/live_demo.py`; EDIT `backend/app/live_routes.py` after RS-19; CREATE `backend/tests/test_live_demo_isolation.py` | PG-backed guest A/B separation, cross-tenant 404, replay conflict, no live staff authority, no outbox/provider call |
| **DS-02** — owner reads + hypothetical outcomes | After DS-01, RS-09/10/16/29. Strict demo-owner menu availability, setup, offers, scenario summary and approved-campaign *would-be* counts | CREATE `backend/app/live_demo_views.py`; EDIT `backend/app/live_demo.py`; EDIT `backend/app/live_routes.py` after DS-01; CREATE `backend/tests/test_live_demo_views.py` | Version conflicts, missing/expired preview, foreign IDs and no network or real sends |
| **DS-03** — exact browser transport | After DS-02, RS-07/41. Gateway allowlist for **only** named demo methods; explicit typed adapter, no live route fallback | EDIT `app/api/orderly/[...path]/route.ts`; EDIT `lib/live-api.ts`; EDIT `tests/live-api.test.ts` | Method/path negatives, origin/body/cookie/replay behavior, never broad wildcard |
| **DS-04** — staff role reuse | After DS-03, RS-47/48/49. A synthetic staff page reuses queue, detail and payment components via a typed demo adapter; no Clerk impersonation | CREATE `lib/demo-role-api.ts`; CREATE `app/demo/[restaurantId]/staff/page.tsx`; EDIT `app/components/StaffQueue.tsx`; EDIT `app/components/StaffOrderDetail.tsx`; CREATE `e2e/demo-staff-role.spec.ts` | Same order state/amount across customer, queue, detail; forged live staff access rejected |
| **DS-05** — owner role reuse | After DS-03, RS-51/52/53. Synthetic owner page reuses menu/marketing/approval components and displays scenario results without a provider setup prerequisite | CREATE `app/demo/[restaurantId]/owner/page.tsx`; EDIT `app/components/OwnerMenu.tsx`; EDIT `app/components/CampaignDraft.tsx`; EDIT `app/components/CampaignApproval.tsx`; CREATE `e2e/demo-owner.spec.ts` | Read/edit availability, offer/setup read, preview hypothetical result; no Send button |
| **DS-06** — connected five-minute entry | After DS-04/05, RS-44/45/46/57. One `/demo` launcher, role links, warning, reset and complete real-browser exercise | CREATE `app/demo/page.tsx`; CREATE `app/components/DemoRoleSwitch.tsx`; CREATE `e2e/live-demo.spec.ts`; CREATE `e2e/demo-sales.spec.ts` | One role-continuous journey, speech fallback, uncertain request, reset, 2-browser isolation, zero send/money spies |

**Shared-file sequence:** RS-19 → DS-01 → DS-02 → later RS-58 for `live_routes.py`; DS-01 → DS-02 → later RS-58 for `live_demo.py`; RS-07/41 → DS-03 → later RS-58 for the gateway/client/tests; RS-47/48/49 → DS-04 for staff components; RS-51/52/53 → DS-05 for owner components; DS-06 → later RS-59 for `app/demo/page.tsx`, `DemoRoleSwitch.tsx` and `e2e/live-demo.spec.ts`. RS-58/59 must **EDIT/extend**, not recreate, these paths after the DS merge; RF-05 must repair the duplicated packet copies before implementing either.

**Build contract details:** DS-01 returns the existing CON-58 session and staff/demo error envelopes. DS-02 uses the explicit additional routes and types in sections 4–5, with strict request/response fields and never a live financial report. DS-03 preserves the 64 KiB body limit, fixed upstream, exact origin, cookie forwarding and bounded timeout. DS-04/05 make components consume the typed demo adapter by injection; they must not change their default Clerk-protected live mode or create local success when the API fails. DS-06 uses the same customer/cart UI and server revisioned write path, not a fixture-only checkout bypass.

**Non-goals for child packets:** no real delivery feedback, no real currency settlement, no SMS/SendGrid dependency, no new database broker, no AI model call, no production tenant provisioning. If a reused component cannot accept an injected demo adapter without broadening its public contract, stop and file `Needs Architect Decision: component adapter contract` with the exact conflict; do not add an implicit auth bypass.

## 7. Dependency correction and two separate exit gates

**Source problem:** draft RS-20's staff order **read** depends on RS-30 provider setup solely through a shared edit to `backend/app/staff_routes.py`. Its CON-20 staff queue/order responses contain no provider readiness field and require no vendor credentials. Provider setup must not gate reading, transitioning or recording a synthetic order. Make this a reviewed **schedule-only** correction in the canonical DAG: remove `RS-30 → RS-20`, add `RS-20 → RS-30` as an exact-file serialization edge. This reverses the authoring order of their edits without dropping RS-30 from production scope. If implementation reveals a hidden provider read in RS-20, halt that slice rather than bypassing a runtime requirement.

**Earlier demo path:** `RS-01, RS-07, RS-19, RS-22, RS-29, RS-41 → DS-01 → DS-02 → DS-03`, split into `DS-04` (staff, after RS-47/48/49) and `DS-05` (owner, after RS-51/52/53), then `DS-04 + DS-05 + RS-44/45/46/57 → DS-06 → DEMO-SALES`. Every arrow is a merge prerequisite, not permission to start a consumer before its provider is ready. Live customer checkout still depends on **RS-INT01** via RS-44.

**Original full-release path remains:** RS-30 → RS-31/32 → RS-33/34 → RS-35/36 → RS-37 → RS-38/54; RS-37 → RS-58 → RS-59, plus RS-INT02/03 → RS-59, then RS-62/INT04/64/65/RELEASE. Add DS-01/02/03 → RS-58 and DS-06 → RS-59 for safe file ownership and conformance handoff. Demo approval is never a substitute for RS-33/34/35/36, RS-INT03, live U3 evidence or RS-60 readiness.

**DEMO-SALES acceptance is explicitly independent of provider credentials**, but not independent of correct storage, order idempotency, synthetic tenant isolation, real browser coverage, or the listed component builds. Full-release gates cannot consume DEMO-SALES as evidence of real sends, real financial settlement, signed callbacks, real staff login or U1–U4 signoff.

**Before any DS implementation:** the integrator must update the standalone draft copies of RS-20/30/58/59 and the RS-INT02/03/04 consumer notes to reflect this approved split. RF-05 owns guide extraction/link reconciliation, not an authorization to silently change runtime contracts. If that sync has not happened, child implementation is **WAITING_DEPENDENCY**, not ready.

**Rollback:** if a live staff queue unexpectedly needs RS-30 or demo mode cannot be isolated, revert the schedule/child overlay and keep the prior full-release DAG. Do not revert RS-01, change already-shipped mock behavior, delete restaurant business data or ship a weaker gateway. Stop fake transport entirely if zero-send enforcement cannot be proved.

## 8. Waves, critical path and file-ownership proof

RF-01's candidate DAG preserves the original live tasks/checkpoints and adds six DS packets plus one `DEMO-SALES` gate. The schedule-only RS-20/RS-30 edge reversal is necessary. Dependency levels (W0, W1, …) are **topological levels**, not weeks, dates or implementation completion claims.

**Computed candidate (before running any child code):** RS-20 W14, RS-21 W15, RS-22 W16, DS-01 W17, DS-02 W18, DS-03 W19, DS-04 W20, DS-05 W20, DS-06 W21, DEMO-SALES W22. RS-30 stays required for live providers, not DS. Earlier DEMO-SALES precedes the full provider-dependent RS-59 merge/RS-INT04/RS-RELEASE. The only planned same-wave DS pair is DS-04/DS-05, which own different staff versus owner UI files. The linearly reused demo kernel, gateway and page paths have directed handoff edges, never parallel writers.

**File-serialization checks to rerun after any DAG edit:** `backend/app/staff_routes.py` RS-20 → RS-30; `backend/app/live_routes.py` RS-19 → DS-01 → DS-02 → RS-58; `backend/app/live_demo.py` DS-01 → DS-02 → RS-58; gateway/`lib/live-api.ts` RS-07/41 → DS-03 → RS-58; `StaffOrderDetail.tsx` RS-49 → DS-04; owner components RS-51/52/53 → DS-05; `app/demo/page.tsx` DS-06 → RS-59. Other existing shared-file gates in §18.8 remain binding.

**Acyclicity proof method:** parse the machine-readable §18.7 edge list, remove only the single `RS-30 → RS-20` edge, add the single `RS-20 → RS-30` serialization edge plus all DS/DEMO edges, then Kahn-sort every node and calculate `wave(node) = 1 + max(wave(predecessors))`. Assert all nodes visit exactly once, DEMO-SALES has no provider-send/real-feedback ancestor, and each shared-file pair has an ordered path. This is a **structural planning check**, not unit/E2E/hosted evidence.

## 9. Five-minute operator walkthrough, one synthetic restaurant

All screens/routes below are **planned**, and acceptance must be shown in a real browser after DS implementation. Use fixture-only sample data and an isolated test database. A demonstrator must not use a real restaurant or real customer contact.

| Clock | Action and screen | Expected visible proof | Owning packet |
|---|---|---|---|
| **0:00–0:30** | Open `/demo`; create a demo session. Say, “This is a safe simulation, no real orders, payments or messages.” | Persistent **DEMO, NO REAL ORDERS / PAYMENTS / MESSAGES** banner. Fresh `rid` and customer/staff/owner role links for the same synthetic restaurant | DS-01, DS-06 |
| **0:30–1:20** | Customer link `/r/{rid}`. Browse menu. Choose a synthetic item; say a simple order request via Start/Stop speech **or** type it when microphone is denied. Inspect and edit the voice proposal before pressing **Add to basket** | Selected catalog and modifier/quantity proposal, no automatic mutation; cart revision increases only after explicit Add. Unsupported/ambiguous transcript clarifies, not guesses | RS-13/42/43/55/56/57 |
| **1:20–2:00** | Review basket and pay-at-restaurant quote; submit once with its UUID key. Open `/r/{rid}/orders/{oid}` | `Submitted`, canonical INR-paise total and immutable receipt; no card charging or money-moving action | RS-14/15/18/19/44/46, DS-01 |
| **2:00–3:00** | Staff role link `/demo/{rid}/staff`. Show the same `oid`. Explicitly perform **Accepted → Preparing → Ready → Completed**. Record “cash” or “UPI” as an asserted full payment | Single order transitions and versions, `Paid` *recorded by staff* and no bank/PSP confirmation. Still no Clerk impersonation or access to real staff route | RS-20/21/22/47/48/49, DS-01/04 |
| **3:00–4:05** | Owner role link `/demo/{rid}/owner`. View menu and toggle one item unavailable, then open a synthetic campaign draft against an existing offer, review channel/content and eligible/suppressed counts | New menu catalog version; draft and preview show exact synthetic audience and no real addresses. Setup shows `provider_mode=disabled` | RS-09/10/16/24/26/27/28/29/51/52/53, DS-02/05 |
| **4:05–4:35** | Open campaign's **Simulation** result and overview. Do not offer a real-send button | “Would be queued” and “Would be suppressed,” `actual_sent=0`, `actual_delivered=0`, `actual_spend_minor=0`. No claims of campaign performance or revenue | DS-02/05 |
| **4:35–5:00** | Use Reset to open a new demo scope, revisit former order ID and show it cannot be opened. Refresh current demo; return to role links | Old `rid` inaccessible. Fresh fixture has an empty cart, no prior recorded payments or campaigns; no silent shared fixture fallback | DS-01/06 |

**Every visual route is an explicit permission boundary.** The customer route is guest-authenticated, staff and owner **demo** routes are server-bound to the creating guest, and real staff routes still require active Clerk membership. Do not expose a direct demo switch inside the real /staff route or treat a URL `rid` as authorization.

**Presenter talk track:** “This demonstrates a restaurant-owned workflow. The guest reviews a voice suggestion before placing an order. Staff moves that same order through fulfillment and records an on-premises payment assertion. The owner can change availability and prepare an outreach campaign. Every marketing result in this screen is a **simulation**. We have not sent any messages or collected any money. Real restaurant launch requires separate security, pricing, compliance, provider and device testing.”

## 10. Uncertain request, negative paths and acceptance evidence

### Uncertain-request recovery demonstration

After guest checkout, simulate a network failure *after* the server might commit: the client has stored original `Idempotency-Key`, quote digest, restaurant and original request payload before making the POST. Show **“We are checking whether the order was placed”**, not “failed, submit again.” On the existing `/r/{rid}/recovery` route, query the owner-scoped order/receipt or retry the **identical command key and body** per CON-18 replay rules. Expected: exactly one order, one receipt, one payment state, no duplicate basket write. If there is no safe resolution, retain uncertainty and stop. Changing the key, restaurant, order target, total or body returns 409/not_found, not a second order. The original guest's reset cannot recover the revoked receipt, which must not erase live business history.

For an ambiguous voice instruction, e.g., “add something spicy and send it,” the selected-catalog parser must propose clarification instead of inventing an item or sending anything. If microphone permissions are denied, the typed field remains available and the edited proposal still requires explicit Add. New item availability changed by owner invalidates a stale cart/proposal/quote until reviewed.

### Mandatory acceptance matrix for DS-01–06 and DEMO-SALES

| Case | Positive proof | Negative / failure proof | Evidence owner |
|---|---|---|---|
| A1, consistent order | One guest `oid` appears in receipt, staff queue, transition history and recorded payment exactly once | Duplicate command key with new target/body 409; stale version 409; no order/cash charge duplication | DS-01, RS-18/21/22, DS-04/06 |
| A2, tenant/session | Guest A and B each get distinct `rid` and can't see/mutate the other's order or campaign | Forged demo flag, foreign UUID, fake role, lost cookie and direct real staff route all denied; no leaking another tenant's existence | DS-01/02/03, DS-06 |
| A3, reset | A reset starts fresh synthetic data and old ID no longer authorizes A | B and live tenant unchanged; no resurrection from client cache; unknown old ID 404 | DS-01, DS-06 |
| A4, owner management | Owner reads synthetic settings/offers/menu and versioned availability update reflects in customer menu | Another guest cannot edit; stale catalog version 409, unsupported edit method 404 | DS-02/05 |
| A5, marketing preview | Draft/offer, consent-filtered synthetic audience and deterministic approved preview | Expired/changed preview 409; suppressed count remains excluded; zero eligible accepted with zero result; no live contact exposed | RS-24/26/28/29, DS-01/02/05 |
| A6, zero external side effects | Transport spy sees **0** MSG91 HTTP, **0** SendGrid HTTP, **0** worker claims, **0** PSP/bank operations, **0** real send records | `/send`, `/dispatch`, `/retry`, non-allowlisted methods rejected; later worker refuses demo at claim and just before transport | DS-01/02/03/06, later RS-34/58 |
| A7, voice safety | Current-catalog, version-tagged proposal, visible edit and manual fallback; only explicit Add mutates cart | Ambiguous/cross-restaurant/stale catalog/denied mic cannot execute or silently price/submit | RS-55–57, DS-06 |
| A8, UI/accessibility | Five-minute flow and clear persistent demo banner; form errors, empty/loading/unavailable state, keyboard actions | Network error never falls back to fixture or reports paid/sent; typed fallback survives denial | DS-04/05/06 |
| A9, full release preserved | Graph still contains RS-30–37, RS-INT01–04, RS-64/65 and release evidence | No production or signed-provider U1–U4 acceptance inferred from synthetic result | RF-01 structural validator, later RS-58/59/62 |

**For the RF-01 planning PR:** the only valid proofs are that the source packets were inspected, route/owner inventory is complete, the revised DAG parses and is acyclic, its predecessor graph excludes all live-send/feedback gates for DEMO-SALES, same-wave file ownership is disjoint, documentation links resolve, and full-release gates are still reachable. Run structural checks against `development.md` and record exact SHA. **Do not claim that A1–A8 have been executed** until the DS packets supply real PostgreSQL, Vitest and Playwright output.

**For implementing DEMO-SALES:** run existing test/CI gates plus `python -m pytest backend/tests/test_live_demo_isolation.py backend/tests/test_live_demo_views.py`, `npm run test -- tests/live-api.test.ts`, and `npm run test:e2e -- e2e/demo-staff-role.spec.ts e2e/demo-owner.spec.ts e2e/live-demo.spec.ts e2e/demo-sales.spec.ts` after their owner files exist. The actual CI environment must include isolated PostgreSQL and real Chromium. Observe full zero-transport negative evidence with spy counters and record the exact source SHA. An unrun test, a mocked database-only success or a blocked provider account is not a PASS.

### Handoff checklist, risk and rollback

- **RF-02:** use the script only as a planned demo offer. Prices, signatures, onboarding responsibilities, and a paid customer remain unverified until genuine evidence is collected.
- **RF-05:** reconcile changed RS-20/30/58/59 packet copies, extract DS-01–06 with exact owner/tests and update the execution guide; never silently change a frozen RS-01 fixture.
- **RS-58/59:** later complete the broader isolated demo rules, payment reversal and full live integration proof. Existing provider-dependent merge gates remain.
- **RS-62/INT04:** incorporate the demo E2E as a synthetic compatibility proof, not real-provider/launch evidence.
- **Risk register:** P1, accidental demo-to-live authorization (block on scope check and negative tests); P1, provider network leakage (hard-disable + transport spy); P1, staff queue hidden provider dependency (restore original ordering if shown); P2, concurrent component edits (serialize owned files); P2, optimistic marketing claims (persistent explicit hypothetical labels).
- **Rollback:** revert the proposed DS overlay and RS-20/30 ordering change on the planning branch if reviewer rejects the split. Runtime rollback after later DS implementation requires disabled demo entrypoints, preserved live ledgers, no deletion of business receipts and revalidation of original mock routes. The existing full-service DAG and all live external-input gates remain intact.

**Final state:** RF-01 documentation and graph analysis may be accepted in a review PR. **DEMO-SALES implementation remains Not completed** until its six child packets and runtime acceptance are merged and tested. No actual providers, new screens, demo tenant databases or hosted configuration are delivered by this document.

## 11. RF-01 planning verification record

**Evidence date:** 2026-11-22. **Baseline:** `ed738ada2cdf9610a780a09e7bb24f690b7d80ba`. **Graph candidate before this evidence-only commit:** `d3d6d7323781969f8c434b29d3be1d39b65f07ee`. Tracking: GitHub [#62](https://github.com/anmolsansi/OrderlyApp/issues/62) and Linear [OPE-347](https://linear.app/openclaw-neutron/issue/OPE-347/rf-01-plan-earlier-synthetic-four-capability-demo-sales-gate).

| Structural or documentation check | Actual result |
|---|---|
| Parse revised §18.7 machine-readable edge JSON | PASS: 79 unique nodes, 258 directed edges |
| Topological sort of every node | PASS: 79/79 nodes consumed, 0 cycles |
| Mermaid graph equivalent to JSON edge list | PASS: all 258 edges present in each, 0 missing/extra |
| Full §18.8 wave table | PASS: W0–W29 (30 wave rows), every node listed exactly once |
| DEMO-SALES prerequisite safety | PASS: W22; no RS-30–38, RS-54/58/59, RS-INT02/03 provider/feedback task among ancestors |
| Full-service gates preserved | PASS: RS-58/59, RS-INT01–04, RS-RELEASE remain reachable; RS-RELEASE W29 |
| Shared-file serialization | PASS against explicitly declared RF-01 ownership pairs; DS-04 and DS-05 share a wave but no owned file |
| Changed-file scope from GitHub compare | PASS: exactly `development.md` and `docs/demo/restaurant-sales-walkthrough.md` |
| Named source documentation links | PASS: RF-01 ticket, RS-01 contract, ticket execution guide resolve from GitHub branch |
| Markdown fence balance | PASS: even opening/closing fence counts in both changed files |
| Runtime PostgreSQL/browser/send isolation, staff/device U1–U4 | **NOT RUN / NOT IMPLEMENTED**. Deferred to DS-01–06, RS-58/59 and RS-INT evidence owners |
| Current PR required CI | **Not claimed here**. Must be inspected on the exact open PR head |

The checks above evaluate the **planning artifact**, not a running service. If an assigned builder finds a source/contract mismatch or a live dependency on the earlier demo path, report `Needs Architect Decision` and do not mark the corresponding runtime check passed. Standalone RS-20/30/58/59 packet sync by RF-05 remains an explicit prerequisite. This branch is intended for review and **must not be merged without a new explicit request**.
