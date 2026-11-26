# OrderlyApp restaurant-service live-v1 contracts

**RS-01 shared synthetic contract source.** This document copies the full COMMON, DTO, storage and CON-01–CON-67 draft registry verbatim from [development.md §18.6](../../development.md#186-contract-registry) at source commit `a23ac285f9ecc983294823c0c0184c1def1c3ddf`. It is a contract proposal and fixture handoff, not evidence that any live provider, table or route exists. Each provider later requires its own conformance, U1–U4 approvals and merge evidence before activation.

All examples in `tests/fixtures/restaurant-service/v1.json` are synthetic. No real contact, receipt, payment, provider key or customer data belongs here. No migration or runtime fallback is created by RS-01.

## Source registry (verbatim)

#### Shared wire, authorization and failure semantics
**Wire rules:** Backend `/v1/live` is exposed through `/api/orderly/live`; `...` in a staff route below means `/v1/live/staff/restaurants/{rid}`. JSON fields are snake_case; schema_version=1. UUID fields validate as UUID; restaurant IDs preserve existing TEXT IDs (1–100 characters). UTC timestamps are ISO8601 with offset. Strict integers only, never booleans/floats/strings for money/revisions. Extra mutation fields rejected. Money is integer INR paise, range0..2147483647; arithmetic overflow422 money_out_of_range. A missing nullable field is rejected unless an explicit default is stated. Body cap64KiB (provider event endpoint has explicit256KiB exception and does not traverse the browser gateway).

**Errors:** `{error:{code:string,message:string,fields:string[],request_id:string}}`. 401 staff_auth_required or guest_session_required;403 permission_denied;404 not_found for missing/foreign entity;409 version_conflict/cart_conflict/quote_changed/approval_stale/idempotency_conflict;422 invalid_input with exact field paths;429 rate_limited with Retry-After;503 storage_unavailable/identity_unavailable/pricing_unconfigured. Safe messages: sign in, no access, not found, changed since review, check highlighted fields, try later. No provider/raw SQL/token messages. On mutation502/503/504/network/invalid success, UI remains uncertain until original identity is reconciled; auth loss alone cannot prove no prior commit.

**Command protocol:** Every POST with Idempotency-Key uses a UUID, scope(restaurant_id,actor_kind,actor_id,key), SHA256 of canonical {operation, target, body} and saved result/status. operation is a server-defined command name; target contains the normalized restaurant ID and every path resource ID (order/campaign/payment as applicable); body is the validated request. Never hash the body alone. A reused key with a different operation or target returns409 idempotency_conflict without returning another resource’s saved result. Same operation, target and body replay the prior result before current-version/cart checks; any difference returns409 with no writes. Membership is rechecked even on replay. Replays never grant another actor access. Reads may retry; writes never auto-create a fresh key after uncertainty. PUT config changes use expected_version; conflicts return current version with safe current object. Command locks and business writes share one transaction. No external network call inside a database transaction.

**Authorization:** Guest actions use existing verified active HttpOnly cookie and allowed Origin. Staff actions use verified Clerk sub plus active local membership each time. owner may configure/menu/campaign/report/transition/pay/reverse; order_staff may read orders, transition and change availability only; cashier may read order/payment data and record full payment only. A path rid or QR is not authority. Every query/join uses restaurant key, including referenced objects. Public catalog contains no private fields. Demo authority is separate and cannot authorize live operations.

**Limits/config:** Operational safety bounds proposed for local/synthetic implementation: page25 max50, cursor512 chars, queue poll5s/stale15s, JWKS cache5min/fetch5s, transport10s, worker one recipient/lease30s/poll2s. These are engineering bounds, not measured capacity or provider quotas. Live U3 values may lower them; increasing limits requires measured evidence and updated tests. Restaurant writes default disabled; marketing sends default disabled. Live submit uses the existing guest10/60s and aggregate120/60s limiter plus restaurant120/60s in the same Redis counting pattern, configurable downward for pilot. Redis failure503 prevents writes; no fallback bypass.

**Compatibility:** New live-v1 paths/tables/storage keys coexist with mock-v1. Additive schema first; keep all historical snapshots/old migrations. Breaking contract change requires architect record, complete consumer list, fixtures, negative tests and DAG resequencing before merging. Browser generations prevent late reads from changing another selection. No responsive remount owns a separate write controller.

#### DTO definitions
```typescript
// Proposed server JSON shapes, not existing TypeScript runtime code.
type UUID = string;
type UTC = string;
type Hours = { day: 1|2|3|4|5|6|7; opens_minute: number; closes_minute: number }[]; // 0<=open<close<=1440, <=14 entries, nonoverlapping per day
type Totals = { currency:"INR"; subtotal_minor:number; discount_minor:number; tax_minor:number; charges_minor:number; total_minor:number };
type ModifierSelection = { group_id:string; option_ids:string[] };
type CartItemInput = { id:string; restaurant_id:string; menu_item_id:string; quantity:number; modifiers:ModifierSelection[]; special_instructions:string|null };
type Line = CartItemInput & { name:string; unit_minor:number; line_minor:number };
type Cart = {schema_version:1; restaurant_id:string; revision:number; items:Line[]};
type PublicRestaurant = {id:string; name:string; brand_label:string; is_open:boolean; ordering_enabled:boolean; timezone:"Asia/Kolkata"};
type Settings = PublicRestaurant & {version:number;hours:Hours};
type Table = {id:UUID;restaurant_id:string;label:string;active:boolean;version:number;url:string};
type MenuItem = {id:string;name:string;description:string;price_cents:number;image_emoji:string;popular:boolean;available:boolean;modifier_groups:ModifierGroup[]};
type ModifierGroup = {id:string;name:string;type:"single"|"multiple";required:boolean;min_selected:number;max_selected:number;default_option_id:string|null;options:{id:string;name:string;price_delta_cents:number;available:boolean}[]};
type StaffPrincipal = {sub:string};
type Membership = {restaurant_id:string;clerk_user_id:string;role:"owner"|"order_staff"|"cashier";active:boolean;version:number};
type Menu = {restaurant_id:string;catalog_version:number;items:MenuItem[]};
type Fulfillment = {fulfillment:"dine_in"|"takeaway";table_id:UUID|null};
type ReceiptPreview = Fulfillment & {restaurant_id:string;restaurant_name:string;table_label:string|null;items:Line[];totals:Totals;pricing_version:number;promotion_code:string|null;offer_version:number|null;business_identity:Record<string,string>;synthetic:boolean};
type Quote = {schema_version:1;cart_revision:number;catalog_version:number;pricing_version:number;offer_version:number|null;quote_digest:string;receipt_preview:ReceiptPreview;totals:Totals}; // digest lowercase hex64
// Actual business_identity fields and tax/charge policy must be frozen by U1; empty only for labeled synthetic fixtures.
type LiveOrderReceipt = ReceiptPreview & {schema_version:1;kind:"live-v1";id:UUID;created_at:UTC;payment_instruction:"Pay at restaurant"};
type OrderState = {status:"Submitted"|"Accepted"|"Preparing"|"Ready"|"Completed"|"Rejected"|"Cancelled";version:number;reason:string|null;updated_at:UTC};
type PaymentState = {status:"Unpaid"|"Paid";amount_minor:number;currency:"INR";active_payment_event_id:UUID|null;settlement_required:boolean};
type OrderSummary = {id:UUID;created_at:UTC;fulfillment:"dine_in"|"takeaway";table_label:string|null;total_minor:number;currency:"INR";operation:OrderState;payment:PaymentState};
type OrderDetail = {receipt:LiveOrderReceipt;operation:OrderState;payment:PaymentState;events:{id:UUID;kind:string;at:UTC;actor:string;reason:string|null}[]};
type Offer = {id:UUID;restaurant_id:string;version:number;code:string;starts_at:UTC;ends_at:UTC;min_subtotal_minor:number;percent_bps:number;max_discount_minor:number;max_redemptions:number;consumed:number;active:boolean};
type Campaign = {id:UUID;restaurant_id:string;version:number;channel:"sms"|"email";offer_id:UUID;message:string;subject:string|null;status:"draft"|"approved"|"dispatching"|"paused"|"finished";approval_id:UUID|null};
type Preview = {preview_id:UUID;expires_at:UTC;recipient_count:number;estimated_cost_minor:number;currency:"INR";content_digest:string;offer_version:number;setup_ready:boolean};
type Approval = {id:UUID;campaign_id:UUID;version:number;recipient_count:number;max_cost_minor:number;currency:"INR";approved_at:UTC};
type SetupState = {configured:boolean;verified:boolean;reason_codes:string[];cost_version:number|null};
type DeliveryInput = {id:UUID;restaurant_id:string;approval_id:UUID;claim_token:UUID;channel:"sms"|"email";destination:string;message:string;subject:string|null;unsubscribe_url:string;reserved_cost_minor:number;config_version:number};
type DeliveryResult = {state:"accepted"|"delivered"|"failed"|"uncertain"|"safely_not_sent";provider_id:string|null;safe_code:string;actual_cost_minor:number|null};
type Summary = {from:string;to:string;currency:"INR";submitted:number;completed:number;cancelled:number;recorded_paid_minor:number;reversed_minor:number;unpaid_minor:number;settlement_required:number;promotion_submissions:number;campaigns:{accepted:number;delivered:number;uncertain:number;cost_reserved_minor:number}};
```

`MenuItem.price_cents`/modifier deltas reuse the existing catalog field names; for live restaurants they represent INR minor units. Never use the mock USD display helper for live values. Line totals use explicit `_minor` names to remove currency ambiguity. Catalog IDs and modifier IDs are1–100 chars; item names1–120, descriptions<=1000, emoji<=16, modifier groups<=20 and options<=30 each; no duplicate IDs. Quantity1–10, lines<=50, notes<=500. New config versions start1, cart revisions start0. Receipt ID and created_at are server generated; successful command response contains complete frozen result, not just an ID.

#### Proposed storage schema

##### DB-A

```sql
CREATE TABLE live_restaurants (
 restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE RESTRICT,
 version BIGINT NOT NULL DEFAULT 1 CHECK(version>0), catalog_version BIGINT NOT NULL DEFAULT 1 CHECK(catalog_version>0),
 brand_label TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata' CHECK(timezone='Asia/Kolkata'),
 hours JSONB NOT NULL DEFAULT '[]', ordering_enabled BOOLEAN NOT NULL DEFAULT false,
 pricing_version BIGINT NOT NULL DEFAULT 1, pricing_profile JSONB NULL,
 synthetic BOOLEAN NOT NULL DEFAULT false, demo_owner_id TEXT NULL REFERENCES guest_sessions(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE live_tables (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
 id UUID NOT NULL, label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 30),
 active BOOLEAN NOT NULL DEFAULT true, version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(restaurant_id,id), UNIQUE(restaurant_id,label)
);
```
Hours JSON validated by Pydantic against Hours before SQL; hours and is_open on existing restaurants jointly determine acceptance. demo_owner_id uses SET NULL; synthetic cleanup is a separately scoped purge, not guest cleanup. No live restaurant can be deleted by guest expiry. Pricing JSON is not executable code; U1 supplies allowlisted versioned fields before live pricing.

##### DB-B

```sql
CREATE TABLE live_carts (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
 guest_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0), items JSONB NOT NULL DEFAULT '[]',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(restaurant_id,guest_id)
);
CREATE TABLE live_orders (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
 id UUID NOT NULL, status TEXT NOT NULL CHECK(status IN ('Submitted','Accepted','Preparing','Ready','Completed','Rejected','Cancelled')),
 version BIGINT NOT NULL DEFAULT 1 CHECK(version>0), created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(restaurant_id,id)
);
CREATE TABLE live_receipts (
 restaurant_id TEXT NOT NULL,id UUID NOT NULL,snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 PRIMARY KEY(restaurant_id,id),FOREIGN KEY(restaurant_id,id) REFERENCES live_orders(restaurant_id,id) ON DELETE RESTRICT,
 CHECK(snapshot->>'id'=id::text),CHECK(snapshot->>'restaurant_id'=restaurant_id)
);
CREATE TABLE live_guest_access (
 restaurant_id TEXT NOT NULL,order_id UUID NOT NULL,guest_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
 revoked_at TIMESTAMPTZ NULL, PRIMARY KEY(restaurant_id,order_id,guest_id),
 FOREIGN KEY(restaurant_id,order_id) REFERENCES live_orders(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_order_events (
 restaurant_id TEXT NOT NULL,order_id UUID NOT NULL,id UUID NOT NULL,version BIGINT NOT NULL,
 from_status TEXT NULL,to_status TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NULL,created_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(restaurant_id,id),UNIQUE(restaurant_id,order_id,version),
 FOREIGN KEY(restaurant_id,order_id) REFERENCES live_orders(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_payment_events (
 restaurant_id TEXT NOT NULL,order_id UUID NOT NULL,id UUID NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('recorded','reversed')),
 reverses_id UUID NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),currency TEXT NOT NULL CHECK(currency='INR'),
 method TEXT NULL CHECK(method IN ('cash','upi','card','other')),actor TEXT NOT NULL,reason TEXT NULL,created_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(restaurant_id,id),UNIQUE(restaurant_id,order_id,id),UNIQUE(restaurant_id,reverses_id),
 FOREIGN KEY(restaurant_id,order_id) REFERENCES live_orders(restaurant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(restaurant_id,order_id,reverses_id) REFERENCES live_payment_events(restaurant_id,order_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_commands (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
 actor_kind TEXT NOT NULL,actor_id TEXT NOT NULL,key UUID NOT NULL,payload_sha256 TEXT NOT NULL,
 response JSONB NOT NULL,response_status INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(restaurant_id,actor_kind,actor_id,key)
);
CREATE INDEX live_orders_queue ON live_orders(restaurant_id,status,created_at DESC,id DESC);
CREATE INDEX live_access_guest ON live_guest_access(guest_id,restaurant_id,order_id);
CREATE INDEX live_payment_order ON live_payment_events(restaurant_id,order_id,created_at,id);
```
Immutable receipt/events: BEFORE UPDATE OR DELETE trigger raises an error for live_receipts/live_order_events/live_payment_events; destructive retention is not implemented until U2 contract change. Services enforce status/payment event consistency while holding live_orders row lock. Reversal target must match order as well as restaurant; enforce in service and composite constraint when implementing. Receipt has no guest FK. Guest actor stored as SHA256(session ID) in command ledger, not reusable cookie/token. Event version matches new operational version; payment actions advance same version, so order event versions need not be contiguous.

##### DB-C

```sql
CREATE TABLE live_memberships (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
 clerk_user_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','order_staff','cashier')),
 active BOOLEAN NOT NULL DEFAULT true,version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(restaurant_id,clerk_user_id)
);
```
Membership actions lock restaurant row before membership row; this serializes last-owner protection. Staff identity is external Clerk sub; never local passwords or demo profile name. Initial owner bootstrap is not exposed as an unauthenticated HTTP endpoint. Membership-change audit uses structured safe operator records until an explicit persisted audit contract is added; RS-04/06 must write append-only membership audit table with exact schema `(id UUID PK, restaurant_id TEXT FK RESTRICT, subject TEXT, actor TEXT, old_role TEXT NULL, new_role TEXT, old_active BOOLEAN NULL, new_active BOOLEAN, created_at TIMESTAMPTZ)` in migration009.

##### DB-D

```sql
CREATE TABLE live_offers (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,id UUID NOT NULL,
 version BIGINT NOT NULL DEFAULT 1,code TEXT NOT NULL,starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ NOT NULL,
 min_subtotal_minor INTEGER NOT NULL CHECK(min_subtotal_minor>=0),percent_bps INTEGER NOT NULL CHECK(percent_bps BETWEEN 1 AND 10000),
 max_discount_minor INTEGER NOT NULL CHECK(max_discount_minor>0),max_redemptions INTEGER NOT NULL CHECK(max_redemptions>0),
 consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed>=0 AND consumed<=max_redemptions),active BOOLEAN NOT NULL DEFAULT true,
 PRIMARY KEY(restaurant_id,id),UNIQUE(restaurant_id,code),CHECK(ends_at>starts_at)
);
CREATE TABLE live_redemptions (
 restaurant_id TEXT NOT NULL,offer_id UUID NOT NULL,order_id UUID NOT NULL,offer_version BIGINT NOT NULL,
 PRIMARY KEY(restaurant_id,order_id),FOREIGN KEY(restaurant_id,offer_id) REFERENCES live_offers(restaurant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(restaurant_id,order_id) REFERENCES live_orders(restaurant_id,id) ON DELETE RESTRICT
);
```
Lock live_offers before checking/incrementing consumed, after guest/cart/restaurant lock. Cancellation/rejection does not decrement. Counter and redemption/order commit together.

##### DB-E

```sql
CREATE TABLE live_contacts (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,id UUID NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('sms','email')),destination TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(restaurant_id,id),UNIQUE(restaurant_id,channel,destination)
);
CREATE TABLE live_consent_events (
 restaurant_id TEXT NOT NULL,contact_id UUID NOT NULL,id UUID NOT NULL,granted BOOLEAN NOT NULL,
 source TEXT NOT NULL,notice_version TEXT NOT NULL,evidence_ref TEXT NOT NULL,captured_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(restaurant_id,id),UNIQUE(restaurant_id,contact_id,evidence_ref),
 FOREIGN KEY(restaurant_id,contact_id) REFERENCES live_contacts(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_suppressions (
 restaurant_id TEXT NOT NULL,contact_id UUID NOT NULL,reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(restaurant_id,contact_id),FOREIGN KEY(restaurant_id,contact_id) REFERENCES live_contacts(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_unsubscribe_tokens (
 token_sha256 TEXT PRIMARY KEY,restaurant_id TEXT NOT NULL,contact_id UUID NOT NULL,
 FOREIGN KEY(restaurant_id,contact_id) REFERENCES live_contacts(restaurant_id,id) ON DELETE RESTRICT
);
```
One contact row represents one channel/destination, not a unified customer identity. Do not infer person identity or merge channels. Eligibility requires latest affirmative evidence AND no suppression. Re-opt-in does not automatically clear bounce/complaint suppression. Consent row is an event, not editable boolean on contact. Tokens are generated once per contact/campaign where needed, never logged.

##### DB-F

```sql
CREATE TABLE live_daily_send_budgets (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
 channel TEXT NOT NULL CHECK(channel IN ('sms','email')),budget_day DATE NOT NULL,
 cap_minor BIGINT NOT NULL CHECK(cap_minor>0),reserved_minor BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(restaurant_id,channel,budget_day),CHECK(reserved_minor>=0 AND reserved_minor<=cap_minor)
);
CREATE TABLE live_campaigns (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,id UUID NOT NULL,
 version BIGINT NOT NULL DEFAULT 1,channel TEXT NOT NULL CHECK(channel IN ('sms','email')),offer_id UUID NOT NULL,
 message TEXT NOT NULL,subject TEXT NULL,status TEXT NOT NULL DEFAULT 'draft',paused BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY(restaurant_id,id),FOREIGN KEY(restaurant_id,offer_id) REFERENCES live_offers(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_campaign_previews (
 restaurant_id TEXT NOT NULL,id UUID NOT NULL,campaign_id UUID NOT NULL,campaign_version BIGINT NOT NULL,
 snapshot JSONB NOT NULL,expires_at TIMESTAMPTZ NOT NULL,PRIMARY KEY(restaurant_id,id),
 FOREIGN KEY(restaurant_id,campaign_id) REFERENCES live_campaigns(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_campaign_approvals (
 restaurant_id TEXT NOT NULL,id UUID NOT NULL,campaign_id UUID NOT NULL,campaign_version BIGINT NOT NULL,
 snapshot JSONB NOT NULL,max_cost_minor INTEGER NOT NULL CHECK(max_cost_minor>=0),reserved_minor INTEGER NOT NULL DEFAULT 0,
 approved_by TEXT NOT NULL,approved_at TIMESTAMPTZ NOT NULL,invalidated_at TIMESTAMPTZ NULL,
 PRIMARY KEY(restaurant_id,id),CHECK(reserved_minor>=0 AND reserved_minor<=max_cost_minor),
 FOREIGN KEY(restaurant_id,campaign_id) REFERENCES live_campaigns(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_deliveries (
 restaurant_id TEXT NOT NULL,id UUID NOT NULL,approval_id UUID NOT NULL,contact_id UUID NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','claimed','accepted','uncertain','delivered','failed','suppressed')),
 claim_token UUID NULL,lease_until TIMESTAMPTZ NULL,attempts INTEGER NOT NULL DEFAULT 0,due_at TIMESTAMPTZ NOT NULL,
 reserved_minor INTEGER NOT NULL DEFAULT 0,provider_id TEXT NULL,config_version BIGINT NOT NULL,
 budget_channel TEXT NULL CHECK(budget_channel IN ('sms','email')),budget_day DATE NULL,
 CHECK((budget_channel IS NULL)=(budget_day IS NULL)),
 CHECK(reserved_minor=0 OR budget_day IS NOT NULL),
 FOREIGN KEY(restaurant_id,budget_channel,budget_day)
 REFERENCES live_daily_send_budgets(restaurant_id,channel,budget_day) ON DELETE RESTRICT,
 PRIMARY KEY(restaurant_id,id),UNIQUE(restaurant_id,approval_id,contact_id),
 FOREIGN KEY(restaurant_id,approval_id) REFERENCES live_campaign_approvals(restaurant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(restaurant_id,contact_id) REFERENCES live_contacts(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_delivery_events (
 restaurant_id TEXT NOT NULL,delivery_id UUID NOT NULL,id UUID NOT NULL,provider_event_id TEXT NULL,
 account_alias TEXT NOT NULL,state TEXT NOT NULL,safe_code TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(restaurant_id,id),UNIQUE(account_alias,provider_event_id),
 FOREIGN KEY(restaurant_id,delivery_id) REFERENCES live_deliveries(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE live_provider_configs (
 restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,channel TEXT NOT NULL,
 version BIGINT NOT NULL,account_alias TEXT NOT NULL UNIQUE,secret_alias TEXT NOT NULL,
 metadata JSONB NOT NULL,verified BOOLEAN NOT NULL DEFAULT false,PRIMARY KEY(restaurant_id,channel)
);
CREATE TABLE live_worker_heartbeat (worker_id TEXT PRIMARY KEY,source_sha TEXT NOT NULL,last_tick TIMESTAMPTZ NOT NULL);
CREATE INDEX live_deliveries_due ON live_deliveries(state,due_at,restaurant_id,id);
```
Snapshot JSON is strictly validated, containing campaign version/channel/content/subject/offer version, contact IDs, per-contact maximum cost, config version, currency and content digest. It is immutable after approval except invalidated_at and budget counters. Pending delivery states never imply provider non-acceptance. Provider metadata contains sender/template/account identity and bounded pricing/caps, never secret value; secrets resolve only from server environment. U3 must provide safe upper charge bounds including SMS segmentation before live dispatch; if bound cannot be proven, keep channel disabled.

##### CON-01 — Freeze live-v1 envelopes and synthetic consumer fixtures

- **Provider / source-of-truth owner:** RS-01 (contracts); source: **CREATE** `docs/contracts/restaurant-service-v1.md`.
- **Consumers:** RS-02, RS-03, RS-04, RS-05, RS-06, RS-07, RS-08, RS-09, RS-10, RS-11, RS-12, RS-13, RS-14, RS-15, RS-16, RS-17, RS-18, RS-19, RS-20, RS-21, RS-22, RS-23, RS-24, RS-25, RS-26, RS-27, RS-28, RS-29, RS-30, RS-31, RS-32, RS-33, RS-34, RS-35, RS-36, RS-37, RS-38, RS-39, RS-40, RS-41, RS-42, RS-43, RS-44, RS-45, RS-46, RS-47, RS-48, RS-49, RS-50, RS-51, RS-52, RS-53, RS-54, RS-55, RS-56, RS-57, RS-58, RS-59, RS-60, RS-61, RS-62, RS-63, RS-64, RS-65, RS-66, RS-67.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-01: Publish the COMMON, DTO and schema records below verbatim as live-v1. Fixture bundle has positive and negative cases keyed by contract ID, synthetic=true, schema_version=1; includes restaurant r-demo, guest g-one, item i-one, revision 0/1 and a deterministic receipt. Reject fixture mutations that remove fields or change money units. Fixtures are not runtime fallback data.
- **Preconditions:** verified repository and approved design; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Both readers accept identical live-v1 examples.; Mock c0–c8 fixtures remain byte-identical.; Negative examples reject money strings, unknown fields and cross-restaurant IDs.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** root; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I04; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-01` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-01 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test -- tests/restaurant-service-contracts.test.ts; python -m pytest backend/tests/test_live_contracts.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-02 — Add live restaurant configuration and table storage

- **Provider / source-of-truth owner:** RS-02 (data); source: **CREATE** `backend/migrations/007_live_restaurants.sql`.
- **Consumers:** RS-03, RS-67.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-02: CREATE live_restaurants and live_tables using DB-A below. Existing restaurant IDs remain TEXT; new live config references restaurants(id) with RESTRICT. Unconfigured rows are disabled. Hours use Asia/Kolkata, ISO weekday 1–7 and minute intervals; cross-midnight hours are represented as two day segments.
- **Preconditions:** RS-01; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Upgrade a database with existing catalog/mock receipts without modifying them.; Reject end<=start, duplicate table label, unknown restaurant and invalid config version.; Old application can read its original tables after migration.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-02` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-02 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python backend/scripts/migrate.py  # isolated test DATABASE_URL only; python -m pytest backend/tests/test_live_restaurant_schema.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-03 — Add restaurant-owned order, receipt and action ledgers

- **Provider / source-of-truth owner:** RS-03 (data); source: **CREATE** `backend/migrations/008_live_orders.sql`.
- **Consumers:** RS-04, RS-14, RS-63.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-03: CREATE DB-B live_carts, live_orders, live_receipts, live_guest_access, live_order_events, live_payment_events, live_commands. Only carts/access reference guest_sessions with CASCADE; all business history references restaurant/order with RESTRICT. Composite restaurant/order FKs prevent cross-tenant joins.
- **Preconditions:** RS-01; RS-02; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Guest deletion removes access/cart but leaves exact live receipt and all payment/order events.; Reject cross-restaurant event/receipt references and duplicate command key.; Rollback application version without dropping live tables.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-02; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I03, I05; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-03` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-03 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python backend/scripts/migrate.py  # isolated test DATABASE_URL only; python -m pytest backend/tests/test_live_order_schema.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-04 — Add memberships and an explicit initial-owner bootstrap

- **Provider / source-of-truth owner:** RS-04 (identity); source: **CREATE** `backend/migrations/009_staff_memberships.sql`.
- **Consumers:** RS-05, RS-24.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-04: DB-C memberships keyed (restaurant_id,clerk_user_id), role owner/order_staff/cashier, active, version. CLI input --restaurant-id and --clerk-user-id; command is an operator-only initial-owner action against an explicitly selected DB, returns safe restaurant/subject IDs. Repeat same association is no-op; conflicting existing owner is refused.
- **Preconditions:** RS-01; RS-03; RS-67; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** First bootstrap produces one active owner.; Identical rerun makes no duplicate; another subject cannot replace it.; Unknown restaurant and missing arguments fail without writes.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-03; RS-67; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I06; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-04` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-04 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python backend/scripts/migrate.py  # isolated test DATABASE_URL only; python -m pytest backend/tests/test_staff_bootstrap.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-05 — Verify Clerk session tokens in the backend

- **Provider / source-of-truth owner:** RS-05 (identity); source: **CREATE** `backend/app/staff_identity.py`.
- **Consumers:** RS-06.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-05: verify_staff_token(request)->StaffPrincipal{sub:string}. Only Bearer JWT accepted on /v1/live/staff routes. Use PyJWT[crypto] for RS256 verification, configured issuer/JWKS URL/authorized parties, exp and nbf; no decoded-but-unverified claims. Missing/invalid token ->401 staff_auth_required; key-fetch outage ->503 identity_unavailable. Cache keys bounded for 5 minutes, unknown kid triggers at most one refresh.
- **Preconditions:** RS-01; RS-04; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Accept signed test token with valid issuer/azp and time.; Reject altered signature, none/HS256 algorithm, expired/future token and wrong issuer/azp.; Simulate unknown kid rotation and key-fetch outage; no protected action runs.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-04; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I06; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-05` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-05 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_staff_identity.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-06 — Authorize restaurant roles and revoke staff membership

- **Provider / source-of-truth owner:** RS-06 (identity); source: **CREATE** `backend/app/staff_memberships.py`.
- **Consumers:** RS-07, RS-09, RS-13, RS-20, RS-28, RS-50, RS-INT01.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-06: require_role(conn,principal,rid,allowed)->Membership reads active membership on each action. GET /v1/live/staff/memberships ->{memberships:[{restaurant_id,role,version}]}. Owner GET/PUT /v1/live/staff/restaurants/{rid}/members/{subject}; PUT {expected_version,role,active}->Membership. GET .../members returns {memberships:Membership[]} sorted by subject. PUT creates with expected_version=0 (201), edits require current version (200). PUT unknown subject creates only after operator-verified Clerk subject; no public self-enrollment. Last active owner cannot be deactivated/demoted (409 last_owner).
- **Preconditions:** RS-01; RS-05; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Owner can grant order_staff to known subject; cashier cannot grant roles.; Revocation denies the next action even with still-valid JWT.; Two concurrent last-owner changes cannot remove all owners; foreign restaurant is indistinguishable from no access.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-05; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I06; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-06` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-06 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_staff_memberships.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-07 — Extend the same-origin gateway for explicit live routes

- **Provider / source-of-truth owner:** RS-07 (gateway); source: EDIT `app/api/orderly/[...path]/route.ts`.
- **Consumers:** RS-08, RS-41, RS-58.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-07: /api/orderly/live/* maps only the route/method pairs in LIVE ROUTES to fixed /v1/live/*. Forward Authorization only for staff routes, guest cookie for guest routes, Idempotency-Key only for command routes. Forward only documented query keys. Existing 64 KiB cap, origin validation, timeout, no-store and no redirects remain.
- **Preconditions:** RS-01; RS-06; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Unknown path/method fails404 without upstream call.; Foreign origin/oversized body rejected; timeout returns504 and does not claim non-commit.; Mock routes keep the same allowlist behavior; Authorization is absent from catalog/guest forwarding.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-06; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I06; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-07` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-07 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test -- tests/gateway.test.ts; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-08 — Provide staff sign-in and active restaurant selection

- **Provider / source-of-truth owner:** RS-08 (web-auth); source: **CREATE** `app/staff/sign-in/page.tsx`.
- **Consumers:** RS-40.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-08: /staff/sign-in uses Clerk Next SDK; staff shell requests CON-06 memberships then lets user choose an allowed restaurant. useStaffSession exposes {status:loading|signed_out|ready|unavailable,token,restaurantId,role}; token is memory-only. Unknown setup shows unavailable, never the mock demo profile.
- **Preconditions:** RS-01; RS-07; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Signed-out visitors reach staff sign-in, not fake profile form.; No membership yields no restaurant data; token never localStorage.; Clerk outage does not prevent guest menu; changing restaurant clears old selection/drafts after explicit unsaved-change warning.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-07; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I06; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-08` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-08 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/staff-sign-in.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-09 — Read and update restaurant branding and ordering hours

- **Provider / source-of-truth owner:** RS-09 (owner-api); source: **CREATE** `backend/app/live_settings.py`.
- **Consumers:** RS-10, RS-12, RS-16, RS-50.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-09: owner GET/PUT /v1/live/staff/restaurants/{rid}/settings; PUT {expected_version,name,timezone:"Asia/Kolkata",hours:Hours,is_open,brand_label}->Settings. Strings 1–120 chars; brand_label max60; no uploaded assets. Ordering enabled is not editable here. Owner identity/invoice fields remain U1 gated.
- **Preconditions:** RS-01; RS-06; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Sunday and midnight-boundary examples produce expected open/closed result.; Invalid timezone/overlap/blank name422 no writes.; Staff/cashier forbidden; concurrent owner edits one succeeds.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-06; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-09` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-09 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_settings.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-10 — Publish owner menu edits and staff availability edits

- **Provider / source-of-truth owner:** RS-10 (owner-api); source: **CREATE** `backend/app/live_menu.py`.
- **Consumers:** RS-12, RS-13, RS-51.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-10: GET /v1/live/staff/restaurants/{rid}/menu ->Menu; owner PUT .../menu/{item_id} {expected_catalog_version,item:MenuItem}->Menu. order_staff/owner PUT .../menu/{item_id}/availability {expected_catalog_version,available:boolean}->Menu. Owner may create item with new UUID; no deletes, use available=false. Modifier price/availability follows existing ModifierGroup shape; unknown foreign item404.
- **Preconditions:** RS-01; RS-09; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Owner price edit changes next quote but preserved receipt is byte-identical.; Order staff can disable item but cannot change price/modifiers.; Reject malformed min/max/default modifier rules; simultaneous edits produce409.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-09; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-10` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-10 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_menu.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-11 — Freeze restaurant-specific pricing and receipt inputs

- **Provider / source-of-truth owner:** RS-11 (launch-input); source: **CREATE** `docs/restaurant-service/pricing-profile.md`.
- **Consumers:** RS-15.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-11: U1 evidence gate. Produce versioned PricingProfile and receipt identity examples from the named restaurant/accountant: INR, minor-unit rounding, tax inclusion/basis, charges, required identity/receipt fields and worked examples. Synthetic profile uses no tax/fees and is labeled synthetic, never a production default. If real policy exceeds this plan, return a contract change before pricing implementation for live use.
- **Preconditions:** RS-01; COMMON authorization and relevant DB constraints. U1 required for live profile; synthetic vectors can complete first
- **Postconditions:** Every synthetic expected total is independently hand-calculated.; Missing evidence keeps live_ready=false.; Approved real sample receipt reconciles line sums and required identity fields; otherwise gate remains blocked.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I04, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-11` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-11 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** git diff --check; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-12 — Create active table links without granting order access

- **Provider / source-of-truth owner:** RS-12 (owner-api); source: **CREATE** `backend/app/live_tables.py`.
- **Consumers:** RS-13, RS-16, RS-50.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-12: owner GET/PUT /v1/live/staff/restaurants/{rid}/tables/{table_id}; PUT {expected_version,label,active}->Table. GET .../tables returns {tables:Table[]} sorted by label then ID. PUT creates UUID with expected_version=0 (201); existing table requires current version (200). Customer link /r/{rid}?table={table_id}; server validates active table at quote and checkout. IDs are UUID, label1–30 chars. URL may be encoded by native/downloadable link; a QR image is optional presentation, not auth.
- **Preconditions:** RS-01; RS-09; RS-10; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Valid link preselects dine_in context only.; Tampered foreign/inactive table422 table_invalid at quote/checkout.; Two guests at one table retain separate access and receipts.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-09; RS-10; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I06; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-12` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-12 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_tables.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-13 — Serve a scoped live menu and current availability

- **Provider / source-of-truth owner:** RS-13 (catalog); source: **CREATE** `backend/app/live_catalog.py`.
- **Consumers:** RS-14, RS-26, RS-42, RS-56.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-13: public GET /v1/live/restaurants/{rid}/menu ->{schema_version:1,restaurant:PublicRestaurant,catalog_version,items:MenuItem[]}. PublicRestaurant includes id,name,brand_label,is_open,ordering_enabled,timezone; no credentials/memberships/contacts. Only configured live restaurants or isolated demo scope resolve. Ordering-hours result is server-derived.
- **Preconditions:** RS-01; RS-10; RS-12; RS-06; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Two restaurants with same item name return only selected catalog.; Closed versus empty versus unavailable DB are distinct.; No owner-only fields escape serialization; read queries use restaurant index.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-10; RS-12; RS-06; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I04; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-13` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-13 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_catalog.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-14 — Persist a separate revisioned live basket

- **Provider / source-of-truth owner:** RS-14 (cart); source: **CREATE** `backend/app/live_cart.py`.
- **Consumers:** RS-15, RS-43, RS-INT01.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-14: verified guest GET/PUT/DELETE /v1/live/restaurants/{rid}/cart. PUT {expected_revision,items:CartItemInput[]} ->Cart; DELETE {expected_revision}->empty Cart. <=50 lines, quantity1–10, notes<=500, exactly rid on all lines; server canonical labels/prices. Foreign or invalid item422 catalog_invalid. Stale revision409 cart_conflict includes current cart.
- **Preconditions:** RS-01; RS-03; RS-13; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Two tabs updating same revision yield one acceptance and one409.; Reject injected labels/prices, mixed restaurants and unavailable modifiers.; Guest reset clears access to basket; live receipts remain unchanged.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-03; RS-13; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I03, I04; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-14` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-14 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_cart.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-15 — Calculate one versioned live quote

- **Provider / source-of-truth owner:** RS-15 (pricing); source: **CREATE** `backend/app/live_pricing.py`.
- **Consumers:** RS-17, RS-18.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-15: POST /v1/live/restaurants/{rid}/quote {expected_revision,fulfillment:"dine_in"|"takeaway",table_id:UUID|null,promotion_code:string|null}->Quote. Quote includes cart_revision,catalog_version,pricing_version,offer_version nullable,quote_digest,receipt_preview and totals. Fulfillment requires active table only for dine_in; takeaway table=null. No address/tip/online-payment fields. Unverified real profile503 pricing_unconfigured.
- **Preconditions:** RS-01; RS-11; RS-14; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** CON-11 vectors match exact totals at quote and receipt preview.; Closed restaurant/table invalid/stale basket fail without mutation.; Client amounts/unknown fields422; no float arithmetic.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-11; RS-14; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I03, I04, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-15` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-15 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_pricing.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-16 — Store owner-defined public promotion rules

- **Provider / source-of-truth owner:** RS-16 (promotions); source: **CREATE** `backend/migrations/010_live_promotions.sql`.
- **Consumers:** RS-17, RS-24, RS-27, RS-28, RS-66.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-16: DB-D promotions; owner GET/PUT /v1/live/staff/restaurants/{rid}/offers/{id}. PUT {expected_version,code,starts_at,ends_at,min_subtotal_minor,percent_bps,max_discount_minor,max_redemptions,active}->Offer. GET .../offers returns {offers:Offer[]} sorted by starts_at descending then ID; bounded to 100 with opaque next_cursor or null and limit1–100 default50. PUT creates with expected_version=0 (201), edits require current version (200). Code normalized uppercase ASCII [A-Z0-9-]{3,32}; percent1–10000 basis points; dates UTC start<end; positive cap and max_redemptions. One rule per restaurant/code; public transferable code.
- **Preconditions:** RS-01; RS-09; RS-12; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Same code allowed in different restaurants but not duplicated within one.; Invalid percentages/dates/caps422; stale version409.; Nonowner edit403 and foreign offer404.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-09; RS-12; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I07; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-16` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-16 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python backend/scripts/migrate.py  # isolated test DATABASE_URL only; python -m pytest backend/tests/test_live_promotions.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-17 — Apply promotion checks to live quotes

- **Provider / source-of-truth owner:** RS-17 (promotions); source: **CREATE** `backend/app/live_pricing.py`.
- **Consumers:** RS-18.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-17: quote accepts at most one code. Discount=min(floor(subtotal_minor*percent_bps/10000),max_discount_minor,subtotal_minor), then CON-11 tax policy determines tax basis. Quote does not reserve redemption. Invalid/expired/exhausted code409 offer_unavailable; preserve basket and show explicit removal/requote. Code normalization matches CON-16.
- **Preconditions:** RS-01; RS-15; RS-16; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Minimum boundary, start/end instant, cap and integer rounding are exact.; Quote leaves redemption count unchanged.; Expired/exhausted code never becomes full-price successful checkout.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-15; RS-16; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I04, I07; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-17` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-17 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_promotion_quote.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-18 — Commit or replay one live order atomically

- **Provider / source-of-truth owner:** RS-18 (orders); source: **CREATE** `backend/app/live_orders.py`.
- **Consumers:** RS-19, RS-20, RS-44, RS-INT01.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-18: POST /v1/live/restaurants/{rid}/orders + UUID Idempotency-Key; body {expected_revision,quote_digest,fulfillment,table_id,promotion_code}. First201/replay200 ->LiveOrderReceipt; same key changed body409 idempotency_conflict. Lock guest, live cart, restaurant config and offer in fixed order; replay before cleared-cart validation. Commit receipt, Submitted state/event, guest access, offer allocation, replay response and cart clear together.
- **Preconditions:** RS-01; RS-17; RS-15; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Two keys at one cart revision commit one order.; Final offer allocation race has one winner; same-key retry does not consume twice.; Crash after each write rolls back all; lost response same key/body returns identical receipt; malformed response is uncertain client-side.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-17; RS-15; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I03, I04, I07; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-18` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-18 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_checkout.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-19 — Read live receipts through revocable guest access

- **Provider / source-of-truth owner:** RS-19 (orders); source: **CREATE** `backend/app/live_receipts.py`.
- **Consumers:** RS-25, RS-46, RS-58, RS-INT01.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-19: guest GET /v1/live/restaurants/{rid}/orders/{oid}-> {receipt:LiveOrderReceipt,operation:OrderState,payment:PaymentState}. GET .../orders?limit=25&cursor=... ->{orders:[...],next_cursor:null|string}. Limit1–50, opaque cursor bounded512 chars scoped to rid/guest, sort(created_at,id) descending. Missing/foreign/revoked404 not_found. Guest reset cannot retrieve a previous receipt; operator business history remains.
- **Preconditions:** RS-01; RS-18; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Guest A cannot read/list guest B even at same table.; Reset/revocation denies old link, while authorized staff still see order.; Pagination ties do not duplicate/skip records in a stable fixture; invalid cursor422.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-18; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I03; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-19` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-19 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_guest_access.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-20 — Read a bounded staff queue and selected order

- **Provider / source-of-truth owner:** RS-20 (staff-api); source: **CREATE** `backend/app/live_staff_orders.py`.
- **Consumers:** RS-21, RS-22, RS-47.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-20: staff GET /v1/live/staff/restaurants/{rid}/orders?view=active|all|settlement&limit=25&cursor=... ->{orders:OrderSummary[],next_cursor,as_of:UTC}; GET .../orders/{oid}->OrderDetail. All roles may read; owner/order_staff see full operational detail; cashier sees payment-relevant snapshot. Active=Submitted/Accepted/Preparing/Ready only; completed-unpaid remains visible under all/settlement.
- **Preconditions:** RS-01; RS-06; RS-18; RS-30; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Foreign restaurant/access403; foreign order404.; 25-row page uses stable created_at/id ordering.; Empty active queue does not imply all paid; settlement includes paid cancellations awaiting resolution.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-06; RS-18; RS-30; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I05, I06; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-20` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-20 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_staff_queue.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-21 — Apply versioned staff order transitions

- **Provider / source-of-truth owner:** RS-21 (staff-api); source: **CREATE** `backend/app/live_transitions.py`.
- **Consumers:** RS-22, RS-23, RS-48.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-21: owner/order_staff POST .../orders/{oid}/transitions +Idempotency-Key {expected_version,target,reason:null|string}->OrderDetail. Submitted->Accepted or Rejected; Accepted->Preparing; Preparing->Ready; Ready->Completed; Accepted/Preparing/Ready->Cancelled with reason1–500. Terminal states immutable; replay precedes version check. cashier403. Payment status never changed by transition.
- **Preconditions:** RS-01; RS-20; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Every allowed transition and forbidden skip tested.; Two staff race same version: one accepted, other409 version_conflict.; Duplicate key returns stored result; changed body409; cancelled paid order retains receipt/allocation.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-20; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I05; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-21` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-21 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_transitions.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-22 — Record exactly one full payment

- **Provider / source-of-truth owner:** RS-22 (payments); source: **CREATE** `backend/app/live_payments.py`.
- **Consumers:** RS-23, RS-49.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-22: cashier/owner POST .../orders/{oid}/payments +Idempotency-Key {expected_version,method:"cash"|"upi"|"card"|"other"}->OrderDetail. Amount/currency come exclusively from immutable receipt; full amount only. Can record for Accepted/Preparing/Ready/Completed, never Submitted/Rejected/Cancelled. Existing active payment409 already_paid. This records staff assertion, not bank confirmation.
- **Preconditions:** RS-01; RS-20; RS-21; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Cashier records full receipt total only.; Simultaneous distinct keys produce one active payment.; Completion alone remains unpaid; foreign order/role denied; same key/body replay exact.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-20; RS-21; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I05; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-22` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-22 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_payments.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-23 — Append payment reversals and close settlement work

- **Provider / source-of-truth owner:** RS-23 (payments); source: **CREATE** `backend/app/live_payments.py`.
- **Consumers:** RS-37, RS-38, RS-49, RS-58, RS-INT02.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-23: owner POST .../orders/{oid}/payment-reversals +Idempotency-Key {expected_version,payment_event_id,reason:string1–500}->OrderDetail. Append one full reversal referencing active recorded payment; no event deletion or external refund. Payment becomes unpaid; settlement_required=false after recording refund/correction reason. Reversed reference409 already_reversed.
- **Preconditions:** RS-01; RS-21; RS-22; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Double reversal cannot reduce balance twice.; Paid cancellation appears in settlement until reversal recorded.; Audit preserves original payment actor/time and separate reversal actor/time.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-21; RS-22; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I05; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-23` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-23 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_payment_reversal.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-24 — Persist contacts and separate channel-consent evidence

- **Provider / source-of-truth owner:** RS-24 (contacts); source: **CREATE** `backend/migrations/011_live_contacts.sql`.
- **Consumers:** RS-25, RS-26, RS-27, RS-63.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-24: DB-E contacts/consent_events/suppressions. Per-restaurant normalized email/phone is unique; channel-specific affirmative consent carries source,capture_time,notice_version,evidence_ref. A contact is not consent. Store personal destination only in DB; no logs/fixtures with real contacts. New contact defaults ineligible.
- **Preconditions:** RS-01; RS-04; RS-16; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Ordering contact alone never produces eligibility.; Email consent does not grant SMS consent.; Same destination in two restaurants does not share consent; withdrawn/hard-bounce suppressed contact is excluded.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-04; RS-16; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-24` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-24 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python backend/scripts/migrate.py  # isolated test DATABASE_URL only; python -m pytest backend/tests/test_live_contacts.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-25 — Capture optional customer marketing consent independently

- **Provider / source-of-truth owner:** RS-25 (contacts); source: **CREATE** `backend/app/live_consent_routes.py`.
- **Consumers:** RS-35, RS-46.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-25: verified guest POST /v1/live/restaurants/{rid}/consents {order_id,channel:"sms"|"email",destination,notice_version,consent:true}-> {recorded:true}. Require guest access to order; each channel explicit unchecked checkbox and separate request after order. False/absent consent creates no opt-in. Approved notice version and proof policy under U3 before real capture; synthetic tests use fixture notice.
- **Preconditions:** RS-01; RS-24; RS-19; RS-26; COMMON authorization and relevant DB constraints. U3 for real consent notice/proof; synthetic implementation unblocked
- **Postconditions:** Unchecked or missing checkbox sends nothing.; Foreign order denied; repeated identical opt-in is idempotent by evidence key.; Consent DB failure leaves existing receipt unchanged and eligibility false.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-24; RS-19; RS-26; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-25` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-25 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_consent.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-26 — Suppress a channel through an unguessable unsubscribe link

- **Provider / source-of-truth owner:** RS-26 (contacts); source: **CREATE** `backend/app/live_unsubscribe.py`.
- **Consumers:** RS-25, RS-29.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-26: GET /v1/live/unsubscribe/{token} shows confirmation only; POST same route idempotently suppresses token-bound restaurant/contact/channel, returns {unsubscribed:true}. Token 32 random bytes base64url, only hash stored, no contact in URL. POST can arrive without guest/staff auth; token is narrowly scoped capability. Invalid token404, rate bound same-origin UI path; verified provider unsubscribes may also create suppression.
- **Preconditions:** RS-01; RS-24; RS-13; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Replay POST succeeds without duplicate state effects.; Token for email cannot suppress other restaurant or SMS.; Suppression before send eligibility check prevents delivery; already in-flight request may finish and is recorded.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-24; RS-13; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-26` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-26 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_unsubscribe.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-27 — Store campaign drafts, approvals and recipient work

- **Provider / source-of-truth owner:** RS-27 (campaign-data); source: **CREATE** `backend/migrations/012_live_campaigns.sql`.
- **Consumers:** RS-28, RS-63.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-27: DB-F campaigns, approvals, deliveries, delivery_events and provider_configs. Approval snapshot stores frozen recipients/message/channel/offer version/budget; recipient work unique(approval_id,contact_id). Durable states queued/claimed/accepted/uncertain/delivered/failed/suppressed. Reservation and accepted cost totals never exceed frozen max under worker locks.
- **Preconditions:** RS-01; RS-16; RS-24; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Cross-restaurant approval/contact FK rejected.; Duplicate delivery record cannot create second send unit.; Old application startup and existing tables unaffected.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-16; RS-24; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-27` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-27 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python backend/scripts/migrate.py  # isolated test DATABASE_URL only; python -m pytest backend/tests/test_live_campaign_schema.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-28 — Create and edit owner campaign drafts

- **Provider / source-of-truth owner:** RS-28 (campaign-api); source: **CREATE** `backend/app/live_campaigns.py`.
- **Consumers:** RS-29, RS-37, RS-52.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-28: owner GET/POST .../campaigns and GET/PUT .../campaigns/{cid}. POST {channel,offer_id,message,subject:null|string}->Campaign status draft; PUT adds expected_version. message1–1000 chars, email subject1–150, SMS subject=null. Audience v1 is all currently eligible restaurant contacts for selected channel; no CSV import or aggregator lists. Edit increments version, invalidates any non-dispatched approval and suppresses unsent old work; accepted work remains historical.
- **Preconditions:** RS-01; RS-27; RS-06; RS-16; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Owner creates draft before setup; no provider call occurs.; Staff/cashier403 and foreign offer404.; Editing approved-but-not-dispatched campaign invalidates snapshot atomically.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-27; RS-06; RS-16; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-28` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-28 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_campaign_drafts.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-29 — Freeze and approve a bounded campaign preview

- **Provider / source-of-truth owner:** RS-29 (campaign-api); source: **CREATE** `backend/app/live_campaign_approval.py`.
- **Consumers:** RS-30, RS-53.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-29: POST .../campaigns/{cid}/preview {expected_version}->Preview{preview_id,expires_at,recipient_count,estimated_cost_minor,currency:"INR",content_digest,offer_version,setup_ready}; POST .../approve +Idempotency-Key {expected_version,preview_id,max_cost_minor}->Approval. Preview expires after10min. Freeze distinct eligible contact IDs, channel, text, subject, offer version and conservative per-recipient cost bounds; never accept a client-supplied recipient list.
- **Preconditions:** RS-01; RS-28; RS-26; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Consent withdrawal between preview/approval removes recipient; newly opted-in contact not added.; Cost increase/offer edit expires approval; budget below estimate422.; Replay approval key creates one snapshot/work set.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-28; RS-26; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-29` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-29 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_campaign_approval.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-30 — Validate restaurant-owned provider configuration without exposing secrets

- **Provider / source-of-truth owner:** RS-30 (provider-config); source: **CREATE** `backend/app/live_provider_config.py`.
- **Consumers:** RS-20, RS-31, RS-32.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-30: owner GET .../messaging-setup ->{sms:SetupState,email:SetupState}; SetupState {configured,verified,reason_codes,cost_version}. Operator loads server-only config keyed restaurant/channel with account ID, secret env alias, verified sender/template IDs, currency=INR, config_version and cost_version positive integers, max_recipient_cost_minor, max_campaign_cost_minor, max_daily_cost_minor and max_audience (all positive integers; audience<=500 initially). Daily boundary is Asia/Kolkata; accepted and uncertain reservations count toward both caps. No default live budget. No credential value accepted by browser API or returned. Setup activation evidence belongs to U3; missing/unverified config blocks sends.
- **Preconditions:** RS-01; RS-29; COMMON authorization and relevant DB constraints. U3 live onboarding and conservative charge bounds
- **Postconditions:** Wrong-restaurant alias rejected before lookup.; Unknown sender/template or missing cost cap returns setup_ready=false.; Secrets absent from status JSON, logs and bundled frontend.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-29; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-30` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-30 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_provider_config.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-31 — Send one approved SMS through MSG91

- **Provider / source-of-truth owner:** RS-31 (sms); source: **CREATE** `backend/app/msg91_sms.py`.
- **Consumers:** RS-33.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-31: send_sms(config,DeliveryInput)->DeliveryResult (COMMON). HTTPS fixed MSG91 send endpoint; explicit timeout10s; no automatic HTTP retries. Template variables derive only from frozen approved text and verified DLT mapping. Include local delivery ID in documented correlation field when supported. Unknown acceptance returns uncertain. Exact vendor request/response fixture and authenticated reconciliation capability must be frozen from actual account/API before live_ready.
- **Preconditions:** RS-01; RS-30; COMMON authorization and relevant DB constraints. U3 vendor request shape, DLT mapping, cost ceiling and reconciliation proof
- **Postconditions:** Fake server accepts one recipient and returns accepted ID.; 429/5xx/malformed response/timeout do not trigger automatic resend.; Wrong account/template and cost mismatch stop before network.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-30; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-31` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-31 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_msg91_sms.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-32 — Send one approved email through SendGrid

- **Provider / source-of-truth owner:** RS-32 (email); source: **CREATE** `backend/app/sendgrid_email.py`.
- **Consumers:** RS-33.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-32: send_email(config,DeliveryInput)->DeliveryResult. POST https://api.sendgrid.com/v3/mail/send with Bearer server credential, one personalization/to recipient, verified from, frozen subject and text/plain content, custom_args.delivery_id; include unsubscribe URL. HTTP202 means accepted, never delivered. Timeout10s, no automatic HTTP retries; response ambiguity uncertain.
- **Preconditions:** RS-01; RS-30; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** 202 recorded accepted with zero delivered count.; Timeout and malformed failure classified uncertain; no second request.; No credentials/destination/body in logs and no unapproved content substitutions.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-30; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-32` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-32 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_sendgrid_email.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-33 — Claim recipient work with durable leases and cost reservations

- **Provider / source-of-truth owner:** RS-33 (worker); source: **CREATE** `backend/app/campaign_worker.py`.
- **Consumers:** RS-34.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-33: claim_next(conn,now)->DeliveryInput|null. Select a due candidate without locking, then acquire live_restaurants row (FOR UPDATE SKIP LOCKED for worker claims), daily budget row, campaign/approval, contact and delivery locks in that order; skip busy restaurant candidates and revalidate queued state. The restaurant row serializes day-row creation and cross-day reconciliation. DB-F live_daily_send_budgets and delivery budget_channel/budget_day hold the reservation identity; rules in section18.17.1 apply. All approval, pause, suppression and dispatch eligibility transactions use the same order; recheck unpaused approval/config/consent/offer and reserve maximum recipient charge before marking claimed. Batch size1; lease30s, poll2s. Recovery of expired claimed means uncertain, never queued. No network inside SQL transaction.
- **Preconditions:** RS-01; RS-31; RS-32; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Two workers cannot claim one recipient or exceed remaining budget.; Expired lease becomes uncertain and retains reservation.; Pause/withdrawal before claim prevents sending; unrelated restaurant can continue.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-31; RS-32; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-33` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-33 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_campaign_claim.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-34 — Dispatch claimed work and reconcile durable outcomes

- **Provider / source-of-truth owner:** RS-34 (worker); source: **CREATE** `backend/app/campaign_worker.py`.
- **Consumers:** RS-35, RS-36, RS-60.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-34: dispatch(delivery_id,claim_token) calls exactly one channel adapter for valid lease. Persist accepted/provider ID or uncertain after network. Only explicit safely_not_sent may retry, max3 attempts with30s/120s/600s backoff; any unknown result stops retries. Retain cost reservation for accepted/uncertain; release only proven no-send. Crash after request before persistence becomes uncertain.
- **Preconditions:** RS-01; RS-33; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Crash before claim, after claim, during request and after acceptance produce defined states.; Ambiguous timeout yields one call, no blind retry.; Budget exhaustion pauses remaining work visibly; duplicate result write idempotent.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-33; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I03, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-34` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-34 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_campaign_dispatch.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-35 — Authenticate and reduce SendGrid event callbacks

- **Provider / source-of-truth owner:** RS-35 (email); source: **CREATE** `backend/app/sendgrid_events.py`.
- **Consumers:** RS-37, RS-60.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-35: POST /v1/live/webhooks/sendgrid/{account_alias}; verify signed raw body/timestamp with pinned account public key before JSON parse. Limit body256KiB and events100; dedupe sg_event_id within account. Map correlated accepted/delivered/bounce/dropped/spamreport/unsubscribe events; bounce/complaint/unsubscribe suppress channel. Delivery history append-only; duplicate/out-of-order event cannot resurrect suppressed eligibility.
- **Preconditions:** RS-01; RS-34; RS-25; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Forged signature/wrong account/modified raw body401 no writes.; Duplicate event produces one reduction; delayed processed cannot downgrade delivered.; Complaint suppresses future email even after later delivered event.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-34; RS-25; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-35` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-35 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_sendgrid_events.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-36 — Reconcile SMS delivery using authenticated provider evidence

- **Provider / source-of-truth owner:** RS-36 (sms); source: **CREATE** `backend/app/msg91_events.py`.
- **Consumers:** RS-37.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-36: reconcile_sms(config,provider_id,delivery_id)->DeliveryResult. No unauthenticated webhook may mark delivered or release a cost reservation. U3 must supply supported authenticated status lookup or verified signed callback contract and exact fixture. Until then adapter can be tested against fixture but SMS live activation stays blocked; uncertain sends remain uncertain.
- **Preconditions:** RS-01; RS-34; COMMON authorization and relevant DB constraints. U3 authenticated MSG91 reconciliation is a true unresolved contract
- **Postconditions:** Forged callback hint never changes accepted/delivered/cost state.; Wrong account/provider ID cannot update another restaurant.; Authenticated duplicate/delayed status gives stable reduction; no proof leaves uncertain and no resend.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-34; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I08; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-36` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-36 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_msg91_events.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-37 — Pause campaigns and expose safe reconciliation status

- **Provider / source-of-truth owner:** RS-37 (campaign-api); source: **CREATE** `backend/app/live_campaigns.py`.
- **Consumers:** RS-38, RS-54, RS-58, RS-INT03.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-37: owner POST .../campaigns/{cid}/pause or /resume +Idempotency-Key {expected_version}->Campaign. Resume requires still-valid approved offer/config/budget and never queues uncertain work. GET .../campaigns/{cid}/deliveries returns paginated safe status rows (no full destination). POST .../reconcile asks authenticated provider lookup only, not resend.
- **Preconditions:** RS-01; RS-35; RS-36; RS-28; RS-23; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Pause before next claim blocks it; already accepted result still recorded.; Resume with changed template/cost returns409 approval_stale.; Repeated reconcile never calls send adapter.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-35; RS-36; RS-28; RS-23; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I07; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-37` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-37 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_campaign_controls.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-38 — Read operational and campaign summaries without revenue claims

- **Provider / source-of-truth owner:** RS-38 (reporting); source: **CREATE** `backend/app/live_reports.py`.
- **Consumers:** RS-54.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-38: owner GET .../summary?from=YYYY-MM-DD&to=YYYY-MM-DD ->Summary. Range<=31 days in restaurant timezone; values integer INR minor units. Separate submitted/completed/cancelled, recorded_paid, reversed, unpaid, settlement_required and promotion_submissions; campaigns report accepted/delivered/uncertain/cost_reserved. No attribution/ROI/accounting certification claim.
- **Preconditions:** RS-01; RS-23; RS-37; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Paid cancellation and reversal land in separate counters.; Different restaurant records never contribute.; UTC-to-Asia/Kolkata midnight boundary and31-day limit tested.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-23; RS-37; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I05, I07; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-38` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-38 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_reports.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-39 — Apply light/dark tokens with pre-paint preference restoration

- **Provider / source-of-truth owner:** RS-39 (theme); source: EDIT `app/layout.tsx`.
- **Consumers:** RS-40.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-39: html data-theme=light default; optional localStorage key orderlyapp.theme.v1 admits only light/dark. Minimal pre-paint bootstrap catches property/read failures; toggle catches writes and still works in memory. Native44px button names opposite theme. Apply approved D15–D20/D28–D30 tokens; no theme dependency or account sync. Task state never remounts on theme switch.
- **Preconditions:** RS-01; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Fresh load light, saved dark before first paint, invalid storage light.; Denied property/get/set still allows manual toggle; no hydration warnings.; Resize/toggle while typing preserves values; both themes meet approved contrast pairs.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I03, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-39` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-39 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-theme.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-40 — Build live role shells and stable accessible feedback

- **Provider / source-of-truth owner:** RS-40 (shell); source: **CREATE** `app/components/LiveShell.tsx`.
- **Consumers:** RS-42, RS-47, RS-50, RS-51, RS-52, RS-66.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-40: LiveShell{restaurant,role,children}; owner links Overview/Orders/Menu/Marketing/Settings below header at every width. Header contains labeled theme button, wraps in flow,44px targets. FormErrors{errors:[{field_id,message}],submitted:boolean} focuses linked summary only after explicit failed form submission, preserves fields; background errors announced without focus theft.
- **Preconditions:** RS-01; RS-08; RS-39; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Keyboard reaches every link/field at200% and400% zoom.; Only explicit validation moves focus; refresh error does not.; Signed-out shell hides protected content and retains sign-in destination.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-08; RS-39; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I06, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-40` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-40 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-shell.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-41 — Create a typed live API adapter with safe uncertainty

- **Provider / source-of-truth owner:** RS-41 (client); source: **CREATE** `lib/live-api.ts`.
- **Consumers:** RS-42, RS-44, RS-47, RS-50, RS-51, RS-52, RS-58, RS-66.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-41: browser live adapter explicitly maps snake_case live-v1 DTOs to camelCase types; Result<T>={ok:true,data:T}|{ok:false,error:{code,message,fields,kind:definitive|uncertain}}. Mutation network/5xx/malformed success ->uncertain. 4xx business response definitive only when server guarantees no commit; identity loss does not prove prior request failed. Fetch same-origin gateway, never provider URLs.
- **Preconditions:** RS-07; RS-01; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Valid live receipt accepted; wrong schema/missing amount classified uncertain after submit.; 404/409 bodies preserve safe structured fields.; Gateway502/504 and abort after send never create fresh action key.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-07; RS-01; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I03, I04; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-41` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-41 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test -- tests/live-api.test.ts; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-42 — Render menu-first live ordering with fulfillment context

- **Provider / source-of-truth owner:** RS-42 (customer-ui); source: **CREATE** `app/r/[restaurantId]/page.tsx`.
- **Consumers:** RS-43, RS-55, RS-57.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-42: /r/{rid}?table={id} displays menu first plus Speak your order control; dine_in/takeaway selector and Pay at restaurant. Query table is proposed context verified by backend, not auth. Catalog loading/error/empty/populated distinct. No items copy: No items are available to order right now; Check again plus ask-staff guidance; preserve existing basket/status links.
- **Preconditions:** RS-01; RS-13; RS-40; RS-41; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Wrong/disabled table cannot submit; takeaway clears table value.; No catalog error is rendered as empty success.; Restaurant switch cannot retain old items or late voice result; text/keyboard controls work.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-13; RS-40; RS-41; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-42` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-42 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-menu.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-43 — Render one live basket with responsive summary and review

- **Provider / source-of-truth owner:** RS-43 (customer-ui); source: **CREATE** `app/components/LiveBasket.tsx`.
- **Consumers:** RS-44, RS-57.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-43: one basket controller owns CON-14 state. >=64rem and menu>=22rem/summary>=18rem: read-only summary alongside menu; otherwise44px View basket · count bar with safe-area/reserved space, in-flow at constrained height. Review empty copy Your basket is empty + Browse menu. Retain unavailable rows labeled No longer available with Remove; no silent substitutions.
- **Preconditions:** RS-01; RS-14; RS-42; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Last-item removal shows empty state and no fees.; Unavailable item blocks checkout until explicit correction.; Wide/narrow transition preserves revision/items and never doubles requests.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-14; RS-42; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I03, I04, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-43` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-43 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-basket.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-44 — Review and submit a live pay-at-restaurant order

- **Provider / source-of-truth owner:** RS-44 (customer-ui); source: **CREATE** `app/r/[restaurantId]/checkout/page.tsx`.
- **Consumers:** RS-45.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-44: checkout obtains CON-15/17 quote, renders receipt preview and explicit Place order · Pay at restaurant. Before POST persist {schema_version:1,restaurant_id,key,body,summary,created_at} in sessionStorage under orderlyapp.liveCheckoutRecovery.v1. Failed write blocks submit. Body/key are immutable until definitive outcome. Unknown outcome routes recovery; confirmed receipt routes status. No online payment.
- **Preconditions:** RS-01; RS-18; RS-43; RS-41; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Accepted-but-lost response produces recovery with exact body/key.; Blocked session storage means zero POSTs.; Same-key replay yields one receipt; stale quote requires review; form details preserved on definitive rejection.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-18; RS-43; RS-41; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I03, I04, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-44` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-44 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-checkout.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-45 — Recover an uncertain live order across reload and theme changes

- **Provider / source-of-truth owner:** RS-45 (customer-ui); source: **CREATE** `app/r/[restaurantId]/recovery/page.tsx`.
- **Consumers:** RS-46.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-45: recovery view says We’re checking whether your order was received, shows frozen submitted summary and Check order status. That button replays CON-18 exact key/body. Confirmed receipt clears recovery and opens status; definitive no-commit returns basket review; ongoing outage remains uncertain. No automatic new attempt, no automatic polling required.
- **Preconditions:** RS-01; RS-44; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Reload, two clicks, theme toggle and viewport resize retain exact key/body.; Malformed201/500/503/timeout after commit remains uncertain.; Expired guest cannot produce a new order via recovery; existing business record survives.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-44; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I03, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-45` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-45 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-checkout-recovery.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-46 — Show receipt/status and separate optional marketing opt-in

- **Provider / source-of-truth owner:** RS-46 (customer-ui); source: **CREATE** `app/r/[restaurantId]/orders/[orderId]/page.tsx`.
- **Consumers:** RS-59, RS-INT02.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-46: status page reads CON-19 and separates Submitted/Accepted/etc from Unpaid/Paid. Refresh button obtains latest state; receipt totals fixed. MarketingConsent has separate unchecked SMS/email boxes, displayed approved notice, channel destination and explicit Save preference; consent failure never invalidates order.404 does not reveal foreign receipt.
- **Preconditions:** RS-01; RS-19; RS-25; RS-45; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Submitted never labeled accepted; Completed may be Unpaid.; Receipt remains same after menu edit/payment reversal.; Unchecked opt-in produces no request; denied consent save does not clear receipt.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-19; RS-25; RS-45; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I05, I08, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-46` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-46 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-order-status.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-47 — Render the staff queue with stale-data protection

- **Provider / source-of-truth owner:** RS-47 (staff-ui); source: **CREATE** `app/staff/[restaurantId]/orders/page.tsx`.
- **Consumers:** RS-48.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-47: queue polls every5s while visible and authenticated; pause on hidden tab, fetch before enabling actions after resume. Last success older than15s or any read failure marks stale, shows Connection lost — orders may be out of date plus last-updated and Retry, disables mutations. First-load error is unavailable; successful empty says No active orders right now.
- **Preconditions:** RS-01; RS-20; RS-40; RS-41; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Late A-restaurant result cannot populate B queue.; Offline retains visible snapshot but all mutations disabled.; Successful empty and unavailable render different copy/actions.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-20; RS-40; RS-41; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I05, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-47` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-47 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-staff-queue.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-48 — Use one order-detail controller across phone and wide layouts

- **Provider / source-of-truth owner:** RS-48 (staff-ui); source: **CREATE** `app/staff/[restaurantId]/orders/page.tsx`.
- **Consumers:** RS-49.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-48: phone queue->full-width detail with Back restoring queue position where practical. >=64rem with each pane>=22rem: same detail in split layout. All transition commands use CON-21 expected_version+UUID key. Late read for orderA ignored after selectingB. Unselected detail says Select an order to view details. No duplicated controllers.
- **Preconditions:** RS-01; RS-21; RS-47; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** A/B read race cannot enable action for wrong order.; Resize/theme preserve pending identity and reason text.; Forbidden transitions hidden but backend still enforced;409 shows current state before retry.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-21; RS-47; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I05, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-48` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-48 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-staff-detail.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-49 — Record payment and reversal through explicit inline forms

- **Provider / source-of-truth owner:** RS-49 (staff-ui); source: **CREATE** `app/components/StaffPaymentForm.tsx`.
- **Consumers:** RS-59, RS-INT02.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-49: inline full receipt amount/currency plus required method, single Record payment received button. Saving label until confirmed. Owner reversal requires reason and original payment selection; settlement task visible for paid cancelled orders. Same persistent action identity as CON-48; no confirmation modal, partial amount or online payment.
- **Preconditions:** RS-01; RS-22; RS-23; RS-48; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Double click and lost response create one payment event.; Order_staff cannot access payment action; cashier cannot reverse.; Completed-unpaid and cancelled-paid display distinct correct states.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-22; RS-23; RS-48; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I05, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-49` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-49 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-staff-payment.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-50 — Provide owner settings, tables and staff membership screens

- **Provider / source-of-truth owner:** RS-50 (owner-ui); source: **CREATE** `app/staff/[restaurantId]/settings/page.tsx`.
- **Consumers:** RS-RELEASE only; no direct implementation consumer.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-50: owner Settings presents separate forms for branding/hours, tables and verified-subject membership role. Uses CON-09/12/06; safe messaging readiness read-only via CON-30. No browser secret-entry, self-onboarding or live activation switch. Other roles get access-denied view.
- **Preconditions:** RS-01; RS-09; RS-12; RS-06; RS-40; RS-41; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Owner edits hours/table and reloads persisted value.; Unknown subject cannot self-enroll; last owner cannot be removed.; Secret values absent DOM/network; invalid field focus preserved.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-09; RS-12; RS-06; RS-40; RS-41; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I06, I09, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-50` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-50 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-owner-settings.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-51 — Provide owner menu pricing and staff availability controls

- **Provider / source-of-truth owner:** RS-51 (owner-ui); source: **CREATE** `app/staff/[restaurantId]/menu/page.tsx`.
- **Consumers:** RS-RELEASE only; no direct implementation consumer.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-51: owner Menu edits item name/description/price/modifier rules; order_staff sees availability toggles only. Currency INR with integer minor-unit conversion, no floating stored money. One versioned save; stale response requires review. Disable modifications while snapshot stale.
- **Preconditions:** RS-01; RS-10; RS-40; RS-41; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** 1 rupee10 paise entered as1.10 becomes110 integer.; Staff cannot inject price fields through availability form.; Concurrent owner update409 preserves entered draft for review.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-10; RS-40; RS-41; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-51` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-51 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-owner-menu.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-52 — Create a draft-first marketing screen

- **Provider / source-of-truth owner:** RS-52 (marketing-ui); source: **CREATE** `app/staff/[restaurantId]/marketing/page.tsx`.
- **Consumers:** RS-53.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-52: owner Marketing empty state No campaigns yet, primary Create campaign draft and secondary Settings. Draft fields channel, selected offer, message, email subject. Drafting works before provider setup; send controls remain gated. Plain text only; no AI auto-send, CSV audience import or delivery-platform contacts.
- **Preconditions:** RS-01; RS-28; RS-40; RS-41; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Create draft with no sender configuration, zero provider calls.; SMS subject hidden/null; email requires subject.; Role denial and network failure cannot appear as successful empty state.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-28; RS-40; RS-41; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I07, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-52` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-52 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-campaign-draft.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-53 — Review exact campaign recipients, content and maximum cost

- **Provider / source-of-truth owner:** RS-53 (marketing-ui); source: **CREATE** `app/staff/[restaurantId]/marketing/[campaignId]/page.tsx`.
- **Consumers:** RS-54.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-53: approval view displays frozen channel/text/offer-version/count/estimated-cost/max-cost INR. Owner explicitly approves preview_id; expired/changed preview requires new review. Audience is count plus masked summaries, never editable list. Disabled send when setup/consent/budget missing. Track same approval UUID/body until resolved.
- **Preconditions:** RS-01; RS-29; RS-52; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Late preview for prior draft cannot enable approval.; Offer/cost/recipient growth changes force rereview.; Double approve/lost response returns one snapshot, not two sends.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-29; RS-52; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I07, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-53` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-53 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-campaign-approval.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-54 — Display campaign outcomes and owner activity summaries

- **Provider / source-of-truth owner:** RS-54 (marketing-ui); source: **CREATE** `app/components/CampaignResults.tsx`.
- **Consumers:** RS-59, RS-INT03.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-54: campaign results separates accepted, delivered, uncertain, failed and suppressed; pause/resume/reconcile use CON-37, never retry-uncertain button. Overview uses CON-38 exact operational/payment metrics and labeled date range. Show last refresh and unavailable state; no inferred sales attribution.
- **Preconditions:** RS-01; RS-37; RS-38; RS-53; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** 202 accepted does not increment delivered.; Failed DB request does not display zero revenue.; Paid cancellation and later reversal visible; uncertain reconciliation never sends.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-37; RS-38; RS-53; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I05, I07, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-54` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-54 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-owner-summary.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-55 — Capture editable browser speech with manual fallback

- **Provider / source-of-truth owner:** RS-55 (voice); source: **CREATE** `app/components/VoiceCapture.tsx`.
- **Consumers:** RS-56.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-55: explicit Start/Stop listening with browser SpeechRecognition or webkit equivalent feature detection; transcript<=500 chars editable. Permission/unsupported/network/no-speech shows text fallback. Stop/unmount/restaurant change increments session generation; late results ignored. No audio upload/recording storage. Pilot locale requires U4; fixture uses explicit en-IN labeled unverified.
- **Preconditions:** RS-01; RS-42; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Denied microphone leaves typed input usable.; Late result after stop/change ignored.; No recognition API still supports full manual menu/basket workflow.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-42; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I08, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-55` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-55 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-voice-capture.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-56 — Parse voice against only the selected live catalog

- **Provider / source-of-truth owner:** RS-56 (voice); source: **CREATE** `lib/live-voice.ts`.
- **Consumers:** RS-57.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-56: propose(transcript,restaurantId,catalogVersion,items)->{kind:add|clarify|navigate,restaurantId,catalogVersion,itemId:null|string,quantity:1..10|null,modifiers,missingFields,transcript}. Deterministic exact normalized names/aliases from selected catalog; ambiguous same-name items clarify; unsupported multi-command clarifies. Never import mock-data or accept model-supplied prices.
- **Preconditions:** RS-01; RS-13; RS-55; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Same name in another restaurant never matched.; Ambiguous item/unsupported modifier/missing required option yields clarify, no mutation.; Quantity0/11, enormous transcript and closed/unavailable item rejected.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-13; RS-55; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-56` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-56 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test -- tests/live-voice.test.ts; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-57 — Apply reviewed voice proposals through the same basket path

- **Provider / source-of-truth owner:** RS-57 (voice); source: **CREATE** `app/components/VoiceProposal.tsx`.
- **Consumers:** RS-59.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-57: VoiceProposal shows editable item/quantity/modifiers and explicit Add to basket; Cancel discards only proposal. Apply consumes current cart revision through CON-14; current catalog/restaurant mismatch invalidates proposal. It cannot invoke checkout or campaign endpoints.
- **Preconditions:** RS-01; RS-43; RS-56; RS-42; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Capture or parsing alone yields zero writes.; Explicit apply gives exactly one canonical basket update.; Theme/resize/change restaurant cannot auto-confirm; typed fallback same review behavior.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-43; RS-56; RS-42; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I03, I04, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-57` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-57 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-voice-apply.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-58 — Isolate synthetic role demos and deny all external side effects

- **Provider / source-of-truth owner:** RS-58 (demo); source: **CREATE** `backend/app/live_demo.py`.
- **Consumers:** RS-59, RS-60.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-58: POST /v1/live/demo/session with {} and valid guest cookie returns201 {schema_version:1,restaurant_id:string,expires_at:UTC}; server records guest ownership in live_restaurants.demo_owner_id. Existing guest cookie is the capability, never a browser role or new bearer token. Scope expires with guest session. Dedicated /v1/live/demo/restaurants/{rid} prefix mirrors only GET orders, GET orders/{oid}, POST orders/{oid}/transitions, POST orders/{oid}/payments, POST orders/{oid}/payment-reversals, GET campaigns, POST campaigns, PUT campaigns/{cid}, POST campaigns/{cid}/preview and POST campaigns/{cid}/approve with identical staff DTOs and replay rules. Demo approval creates simulated outcomes only. Other methods/paths404. Customer paths retain normal guest checks and also require synthetic owner match. Gateway allowlist and typed client add only these paths in this ticket; same-origin checks apply. New copy of synthetic fixture per session; domain scope is server-resolved demo, never client boolean. Demo role commands may mutate only that copy; network transports and live activation denied regardless request/forged IDs. Reset/delete affects only demo scope; no paid state claims outside simulation.
- **Preconditions:** RS-01; RS-23; RS-37; RS-19; RS-07; RS-41; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Two demos never see each other’s carts/orders/campaigns.; Forged live restaurant/actor/channel cannot send or access staff data.; DB/provider outage never falls back from live to demo success.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-23; RS-37; RS-19; RS-07; RS-41; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I06, I07; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-58` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-58 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_demo_isolation.py; npm run test -- tests/live-api.test.ts; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-59 — Present a connected sales demo with visible simulation labels

- **Provider / source-of-truth owner:** RS-59 (demo); source: **CREATE** `app/demo/page.tsx`.
- **Consumers:** RS-62, RS-65, RS-INT04.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-59: /demo creates isolated CON-58 session and links Customer/Staff/Owner for same synthetic restaurant. Persistent Demo — no real orders, payments or messages label. Reset demo explicitly creates fresh scope; existing live browser/session cannot be converted into demo authority. Reuse real task components, do not build a second UI implementation.
- **Preconditions:** RS-01; RS-46; RS-49; RS-54; RS-57; RS-58; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Full role-switch journey retains only this demo records.; Reset does not affect another browser or live records.; No actual provider request across entire demo; browser forgery tests included.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-46; RS-49; RS-54; RS-57; RS-58; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I07, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-59` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-59 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-demo.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-60 — Expose live readiness, safe logs and worker heartbeat

- **Provider / source-of-truth owner:** RS-60 (operations); source: **CREATE** `backend/app/live_health.py`.
- **Consumers:** RS-61.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-60: GET /health/live-service ->{ready,source_sha,schema_ready,worker_ready,identity_ready,live_enabled,reason_codes},503 when required enabled capability unavailable. Worker heartbeat table records last_tick and source_sha; stale>30s unhealthy for marketing. Log request/restaurant/order/delivery IDs, state transitions and safe error codes only, never contact/text/token/secrets. Live disabled default.
- **Preconditions:** RS-01; RS-34; RS-58; RS-35; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Worker death becomes stale, queue still durable.; Missing live schema/config returns503 reason without credentials.; Old /health/live and mock readiness semantics preserved.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-34; RS-58; RS-35; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I07, I08, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-60` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-60 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_health.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-61 — Declare an opt-in worker and compatible deployment sequence

- **Provider / source-of-truth owner:** RS-61 (operations); source: EDIT `infra/render.yaml`.
- **Consumers:** RS-62, RS-64.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-61: worker process uses same backend image/modules/database, command python -m app.campaign_worker; no migrations in startup. ORDERLY_LIVE_ENABLED=0 and ORDERLY_MARKETING_SEND_ENABLED=0 defaults. Operator explicitly provisions worker only after U3 platform/cost authorization. Deploy additive schema -> API -> worker paused -> web -> synthetic smoke -> gated live enable.
- **Preconditions:** RS-01; RS-60; RS-63; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Docker Compose config parses with explicit safe placeholders.; No worker starts from default local command without opt-in.; Version-skew rehearsal old web/new API and new schema/old API retains mock paths; wrong schema fails closed.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-60; RS-63; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I07, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-61` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-61 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** git diff --check; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-62 — Add live contract and critical-path tests to existing CI

- **Provider / source-of-truth owner:** RS-62 (ci); source: EDIT `.github/workflows/ci.yml`.
- **Consumers:** RS-64, RS-INT04.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-62: existing CI adds live contract fixture conformance, PostgreSQL race/rollback tests and synthetic cross-role browser journey. Provider fake transports only; no live keys/sends in CI. Required checks fail on skipped required PG tests. Keep current security/web/backend/Chromium jobs, no duplicate test framework.
- **Preconditions:** RS-01; RS-59; RS-61; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** CI cannot green by skipping live PostgreSQL suite.; Forged demo/tenant and lost-response end-to-end cases run.; No secret fixture/provider network required; existing mock suites remain green.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-59; RS-61; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I03, I07, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-62` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-62 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-service-integration.spec.ts; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-63 — Specify retention, export and deletion policy before destructive work

- **Provider / source-of-truth owner:** RS-63 (launch-input); source: **CREATE** `docs/restaurant-service/data-lifecycle-policy.md`.
- **Consumers:** RS-61, RS-64, RS-INT04.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-63: U2 decision artifact states per-table retention, lawful deletion/export scope, requester authorization, backup treatment and restoration re-suppression procedure. Live deletion remains disabled until approved policy and a separately reviewed implementation delta exist. Existing guest cleanup remains active only for its original/access records. No invented retention duration.
- **Preconditions:** RS-01; RS-03; RS-24; RS-27; COMMON authorization and relevant DB constraints. U2 owner/legal policy required
- **Postconditions:** All live tables assigned retention/hold/export owner or marked unresolved.; Guest reset is never documented as erasing restaurant receipts.; Missing policy blocks live activation and destructive jobs; no test claims a policy approval.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-03; RS-24; RS-27; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I08, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-63` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-63 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** git diff --check; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-64 — Prove backup, restore and compatible rollback in isolation

- **Provider / source-of-truth owner:** RS-64 (recovery); source: **CREATE** `docs/qa/restaurant-service-recovery.md`.
- **Consumers:** RS-65.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-64: evidence packet records exact source/schema, isolated DB target, backup hash, restore result, row/event/receipt hashes, consent suppression restored, uncertain claims preserved and rollback compatible version. No production fault injection. Missing backup permission/environment is blocked, not passed.
- **Preconditions:** RS-01; RS-61; RS-62; RS-63; COMMON authorization and relevant DB constraints. U2 backup/restore policy and authorized isolated staging access
- **Postconditions:** Restored immutable receipts byte-identical and tenant access preserved.; Suppressed contacts never re-enabled by restore.; Uncertain sends not replayed after restart/rollback; alert/runbook route exercised.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-61; RS-62; RS-63; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I03, I07, I08, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-64` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-64 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** git diff --check; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-65 — Collect pilot pricing, provider and real-device acceptance evidence

- **Provider / source-of-truth owner:** RS-65 (pilot); source: **CREATE** `docs/qa/restaurant-service-pilot.md`.
- **Consumers:** RS-RELEASE.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-65: U1–U4 evidence matrix names restaurant/owner, signed-off pricing/receipt, staff roles, devices/browser/locale, microphone test conditions, provider account ownership/onboarding, consented test recipients, conservative budgets/caps and support owner. Live channel tests require explicit permission before any send; no credentials or personal destinations committed.
- **Preconditions:** RS-01; RS-59; RS-64; COMMON authorization and relevant DB constraints. U1–U4 and explicit permission for hosted actions or real sends
- **Postconditions:** Every G1–G8/E1–E5 acceptance row has named build/environment and pass/fail/blocked evidence.; Real phone/locale works or fallback limitation is explicit and accepted.; Unresolved U1–U4 leaves release blocked; no payment/provider account purchased by this task definition.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-59; RS-64; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I03, I04, I05, I06, I07, I08, I09, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-65` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-65 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** git diff --check; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-66 — Edit public offers in the owner marketing workspace

- **Provider / source-of-truth owner:** RS-66 (marketing-ui); source: **CREATE** `app/staff/[restaurantId]/marketing/offers/page.tsx`.
- **Consumers:** RS-INT03, RS-RELEASE.
- **Type:** UI state/component.
- **Inputs / outputs / constraints:** CON-66: owner offer list/form uses CON-16 fields, displays public/transferable/no-stacking warning and cancellation does not restore allocation. Dates entered in restaurant timezone converted to UTC; percent displayed0.01–100.00 maps integer basis points. Inactive/expired/exhausted labels derive server state. No recipient-exclusive promise.
- **Preconditions:** RS-01; RS-16; RS-40; RS-41; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** 10.25% maps1025 basis points; paise conversion exact.; Expired offer cannot be silently reactivated by editing unrelated field.; Keyboard field errors point at labels; foreign owner denied.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-16; RS-40; RS-41; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I02, I04, I07, I10; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-66` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-66 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** npm run test:e2e -- e2e/live-offers.spec.ts; npm run lint; npm run typecheck; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

##### CON-67 — Provision a disabled live restaurant without adopting mock data

- **Provider / source-of-truth owner:** RS-67 (onboarding); source: **CREATE** `backend/scripts/provision_live_restaurant.py`.
- **Consumers:** RS-04.
- **Type:** schema/API/function/config boundary as specified below.
- **Inputs / outputs / constraints:** CON-67: operator CLI --input <private JSON> accepts new restaurant_id,name,cuisine,brand_label,timezone=Asia/Kolkata and Hours; create restaurants compatibility row plus live_restaurants row transactionally, ordering_enabled=false. Existing ID refused; never convert fixture catalog into live restaurant automatically. Compatibility fields rating=0,delivery_minutes="Not offered",delivery_fee_cents=0,image_emoji="",tags=[] are display placeholders, not live pricing inputs.
- **Preconditions:** RS-01; RS-02; COMMON authorization and relevant DB constraints. No additional external decision for synthetic implementation.
- **Postconditions:** Existing restaurant ID collision fails with zero changes.; Fault after first insert rolls back both tables.; New owner bootstrap works only after this step and cannot activate ordering.
- **Errors:** COMMON status/envelope applies to HTTP; internal/CLI operations return typed safe failure/nonzero with no partial success. Packet failures below are mandatory.
- **Retry/idempotency:** COMMON command protocol for writes, versioned PUT for edits, bounded read retry. Read-only/artifact contracts have no side effect to deduplicate. Worker exceptions are explicitly stricter in CON33/34.
- **Ordering/concurrency:** RS-01; RS-02; database changes transactionally locked; UI reads generation-scoped. Shared-file serialization edges are gates, not new business APIs.
- **Security:** I01, I02, I09; COMMON actor/tenant rules; never accept browser role/price/provider secrets.
- **Lifecycle/version/compatibility:** live-v1 additive; preserve old mock paths. This source task alone changes contract shape.
- **Fixture/mock:** **CREATE** tests/fixtures/restaurant-service/v1.json entry `CON-67` in RS-01, including positive shape and each negative case above. External U3 fixtures may be placeholders marked blocked until provider evidence; they cannot certify live acceptance.
- **Freeze point:** RS-01 shared fixture plus RS-67 behavior/conformance checks, reviewed diff and recorded source SHA. For external gates require named input approval too.
- **Change protocol:** identify these consumers; update contract, fixtures, packet copies and DAG; rerun all consumer assertions before accepting a breaking change.
- **Verification:** python -m pytest backend/tests/test_live_provisioning.py; a future file is executable only after its owner creates it. Consumers assert input/output/error shape from fixture, never private provider internals.

## Approved amendments to freeze before readers

The following corrections are copied verbatim from [development.md §18.17.1](../../development.md#18171-contract-corrections-required-before-fixture-freeze). They override earlier generic details where applicable. These are draft live contracts, not permission to apply the proposed schema.

#### 18.17.1 Contract corrections required before fixture freeze

**C-A — Bind command identity to operation and target.** Owner: RS-01/03 and each command provider RS-18/21/22/23/29/37/58; consumers: RS-41/44/45/48/49/53/59 and INT01–03. Retain the existing restaurant/actor/key uniqueness scope. Store the fingerprint of a canonical envelope containing the server-defined operation, normalized target IDs and validated body in `live_commands.payload_sha256`; no second command ledger is needed. Define one cross-runtime canonicalization fixture in RS-01: sorted object keys recursively, stable array order, compact UTF-8 JSON, strict integers and explicit nullable fields after validation. Reject extra fields before hashing. Authorization and restaurant/target scope are checked before replay. Do not hash raw URLs, query ordering or raw request bytes.

Acceptance: (1) identical operation/target/body/key returns the saved result after commit and after the cart/version changes; (2) same actor/key/body against order B after order A returns409 and neither pays B nor returns A as B’s result; (3) reuse across command kinds returns409; (4) a changed body returns409; (5) revoked membership or foreign target never gains access through replay. Put these assertions in the provider’s already-owned test file and the shared fixture readers. Existing mock-v1 behavior is unchanged. Since these are draft live tables, no deployed ledger rewrite is authorized; if live command rows exist when work starts, require a compatible version/migration decision before changing fingerprints.

**C-B — Make daily send reservations durable.** Owners: RS-27 (draft migration012/DB-F), RS-30 (configuration), RS-33/34 (reservation/dispatch) and RS-35/36/37 (feedback/reconciliation). The DB-F copies now define `live_daily_send_budgets`, keyed by restaurant, channel and local budget date, and the delivery’s reference to that row. Channel caps are separate; approval and daily caps must both admit the same maximum charge. Dates are computed server-side in Asia/Kolkata at claim. No browser date, budget or cost is authoritative.

- Start each reservation transaction with the restaurant row lock, followed by daily budget, campaign/approval, contact and delivery. All mutations touching these resources follow the same order; a path may omit an unused lock but may not reverse the order. No network call occurs while locks are held.
- Create the current day/channel row under that restaurant lock using the verified configured cap. Reserve the conservative maximum in both daily and approval counters and persist the delivery’s budget reference in the same transaction that marks it claimed. A duplicate claim/result must not increment or release twice.
- Midnight creates a new row; it never clears yesterday’s counters or moves old reservations. Accepted, delivered, uncertain and potentially billable failed attempts retain their original reservation. Do not subtract a cost merely because delivery failed or reported actual cost is lower.
- Release only with authenticated or transport evidence proving no send and no charge. Lock the original referenced day, even after midnight, and decrement the approval counter atomically. A proven no-send retry obtains a fresh reservation for its new claim date; retain the prior attempt outcome in the existing append-only delivery events. Unknown acceptance is never retryable.
- Configuration rotation invalidates unclaimed approvals. Freeze each existing day’s cap: a lower newly configured cap also bounds further reservations; increasing configuration does not enlarge the existing day row. Accepted/uncertain reservations remain counted. New days use the then-verified cap. This prevents a cap change from violating retained accounting or reopening spend silently.
- Immediately before dispatch, recheck whether the claim’s budget day is still current. A claimed attempt not yet dispatched across midnight must be marked proven no-send and re-reserved under the new day before networking; an attempt already in flight retains its original reservation and may settle later. This budget counts dispatch attempts by start day, not a promise about the provider’s invoice date.

Acceptance: actual PostgreSQL tests race two workers/two campaigns for the final daily allowance; cross-channel and cross-restaurant counters stay isolated; fail after reservation and after provider acceptance; roll over midnight with an uncertain prior-day attempt; replay proven no-send reconciliation twice; lower the cap below existing reservations. No case may exceed the permitted new reservation bound, release twice or retry uncertainty. Extend the existing RS-27/30/33–37 test ownership and INT03; fake-provider proof is separate from U3 live charge-bound evidence. Retain rows on rollback; no destructive cleanup before U2 policy.

**C-C — One reversal route suffix.** CON-23 and CON-58 both use `orders/{oid}/payment-reversals` beneath their respective staff/demo prefixes. Owners: RS-23/58; consumers: RS-07/41/49/59. Shared DTOs and command rules remain identical; demo authorization remains separate. Acceptance: live and demo clients invoke the documented suffix, the gateway permits only their exact method/path pairs, undocumented `/reversals` returns404, and a demo identity cannot reach the live reversal handler. Use the existing owned gateway/client/backend tests; no compatibility alias is needed for a route that has not shipped.


#### CON-06 conformance amendment — proposed for independent approval

The original RS-01 registry and C-A/C-B/C-C amendments above remain verbatim. This narrowly scoped CON-06 amendment resolves the observed fixture and error-envelope discrepancies; it does not change other contracts or certify live activation.

- The own-membership response is exactly `{memberships:[{restaurant_id,role,version}]}`. Full Membership remains the owner-only member detail/list and PUT response. The shared CON-06-1 fixture and both readers enforce the summary shape.
- **CON-06-specific exception to COMMON PUT conflict recovery:** stale membership version returns HTTP 409, code `version_conflict`, fields `["expected_version"]`, in the exact COMMON error envelope without a current object. A fresh owner-authorized GET of that member retrieves the current Membership/version; revoked/foreign/missing access uses the normal 403/404 response. Never automatically retry a mutation with a new version. Other PUT contracts retain the original COMMON rule.
- Identical current-version membership PUT is a no-op with no audit record; changed writes increment version and append audit atomically.
- For the synthetic/initial pilot, `ORDERLY_OPERATOR_VERIFIED_STAFF_SUBJECTS` is a server-only JSON map from restaurant IDs to arrays of independently operator-verified exact Clerk subjects. Absent config denies new enrollment; malformed config returns 503 identity_unavailable. No public self-enrollment, browser assertion or live provider approval.
- Acceptance requires shared Python/TypeScript/HTTP conformance, green CI and explicit independent reviewer/owner acceptance of this clarification and the operator verification policy. Until then CON-06 remains not frozen. CON-05 formal approval remains separate.


#### CON-05/06 audit remediation amendment — proposed, not frozen

This amendment is additive to the verbatim RS-01 registry and the previous CON-06 clarification. It is not production approval. The independent audit of `2e5037d79bc862587bb0e67afea8be76656c6752` failed both gates; this proposal requires green CI and renewed independent review.

- **CON-05 session profile:** only Clerk v2 signed session tokens are accepted, not JWT templates. Require the existing iss/exp/nbf/sub/azp plus integer iat, integer v=2, and a bounded nonempty Clerk session ID (sid). Reject pending or other explicit non-active sts, impersonation (act), non-integer times, invalid temporal ordering and lifetimes above 120 seconds. Absent sts is accepted under Clerk v2's normal active-session convention; real instance claims, token purpose separation and configuration must be verified before live activation. No online provider session lookup or instantaneous provider revocation is claimed. Local membership is always checked separately. Use a dedicated Clerk application/issuer; audience is not required unless a future approved profile supplies it. See [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens) and [JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates).
- **CON-06 transaction boundary:** staff connections explicitly use READ COMMITTED before any query. Direct membership writers and owner bootstrap reject other isolation levels. All downstream protected mutations must preauthorize, lock the restaurant, reauthorize with fresh state under the lock, then lock target rows and mutate/audit in the same transaction. The bare require_role helper is not a standalone write authorization boundary. Staff DB lock/statement limits are 2s/4s; DB failure returns redacted 503. 
- **CON-06 reactivation:** inactive to active requires an active owner, current version and separate exact operator approval of the current inactive version. Server-only `ORDERLY_OPERATOR_VERIFIED_STAFF_REACTIVATIONS` maps restaurant IDs to objects mapping subjects to approved inactive versions. Initial enrollment allowlist entries do not authorize reactivation. An approval for version 2 cannot authorize version 4 after another revocation. The operator verifies the subject out of band after revocation and records the current inactive version; it is not a browser-supplied grant. Stale edits remain 409; absent/wrong approval 404; malformed approval 503. Existing active membership is not revoked by removing an allowlist entry. A still-valid session token can regain access after explicit approved reactivation; for compromised credentials, revoke the provider session and do not reapprove until independently verified.
- **CON-06 audit storage:** additive migration010 rejects TRUNCATE as defense in depth; migration009 remains unchanged. Live staff requires an unprivileged dedicated login that is neither the migration/schema owner nor a privileged role/member; audit INSERT allowed, mutation/TRUNCATE/DDL denied. Actual runtime role is verified at the staff connection boundary; unsafe configuration fails closed. Administrative/database-owner tampering is outside this guarantee and requires separately controlled audit evidence if in scope.

These are synthetic acceptance requirements. F6 staff ingress/list bounds, F7 JWKS recovery, F10 hosted configuration and F11 production image evidence remain explicit pre-live gates. F9 access-log/retention validation is also pre-live. No deployment is activated by this amendment.
