# RS-11 / CON-11: Restaurant pricing and receipt evidence gate

**Status:** SYNTHETIC INPUTS DOCUMENTED, LIVE U1 BLOCKED, NOT FROZEN FOR REAL ORDERS.
**Prepared:** 2026-11-23. **Source:** RS-01 CON-11 registry at `docs/contracts/restaurant-service-v1.md`, RS-11 task packet, CON-17 discount formula, and the RS-01 synthetic contract fixture.
**Base source:** `21c2b1f060db23790580b3b4bbbbc195112b2171`. **Contract version:** `schema_version=1`, `pricing_version=1` (synthetic example only).
**Owner:** RS-11 supplies an evidence artifact, not a runtime provider. RS-15 consumes this only after its applicable conformance gates. Named restaurant/accountant approval (U1) is absent.

This file is a reviewable pricing policy **template**, not a live DB configuration, executable pricing profile, regulatory opinion, production tax table, or customer receipt. All invented names, numbers and identifiers below are intentionally synthetic. The companion [machine-readable vectors](../../tests/fixtures/restaurant-service/pricing.json) are isolated test evidence and **never** runtime fallback data.

## 1. Frozen shared boundary and units

CON-11 consumes RS-01 COMMON/DTO and hands inputs to RS-15. Backend `/v1/live` is exposed via same-origin `/api/orderly/live`. No route or database schema is created by RS-11. Restaurant IDs are TEXT (1–100 characters). JSON names are snake_case. Money is **strict integer INR paise**, `0..2147483647` inclusive. No strings, booleans, floats, negative numbers, implicit paisa-to-rupee conversion, or floating-point intermediate arithmetic are accepted as money. Overflows are invalid, `422 money_out_of_range` where a live API boundary applies.

Existing public total shape is exactly `{currency:"INR",subtotal_minor,discount_minor,tax_minor,charges_minor,total_minor}`. All five amounts are nonnegative integers in paise. Arithmetic must be checked before persisting or returning a quote. This artifact does not add fields to existing shared DTOs and does not modify the USD-cent `mock-v1` service.

## 2. Synthetic-only PricingProfile example

The following is an **evidence record**, not a newly approved serialized `live_restaurants.pricing_profile` schema. Any real JSON validation/storage mapping is owned by downstream implementation after U1 sign-off. No app may auto-install this record, treat the `synthetic` flag as live authority, or use null U1 fields as defaults.

```json
{
  "schema_version": 1,
  "pricing_version": 1,
  "restaurant_id": "r-demo",
  "currency": "INR",
  "synthetic": true,
  "live_ready": false,
  "minor_unit": "paise",
  "discount_rounding": "floor_nonnegative_percent_product",
  "tax_minor": 0,
  "charges_minor": 0,
  "tax_inclusion": null,
  "taxable_basis": null,
  "charge_policy": null,
  "business_identity": {},
  "source_kind": "synthetic_test_fixture",
  "source_date": "2026-11-23",
  "approved_by": null
}
```

Zero tax and charges are **test-only constants**, never a claim that an Indian restaurant owes no tax or fees. Empty `business_identity` is allowed only for labeled synthetic examples. No live profile, government registration number, address, formula, fee, invoice wording or policy is inferred.

## 3. Deterministic synthetic calculation order

1. Derive each `line_minor = unit_minor * quantity` from server-canonical prices. Validate each line and accumulated `subtotal_minor = sum(line_minor)` against integer paise bounds.
2. With **no promotion** (`promotion_code=null`, `offer=null` in the isolated fixture), `discount_minor=0`. For a valid CON-16 promotion (`percent_bps` from 1 to 10,000 and `max_discount_minor` positive), the independently frozen CON-17 calculation is `raw_discount_minor = floor(subtotal_minor * percent_bps / 10000)`, then `discount_minor = min(raw_discount_minor, max_discount_minor, subtotal_minor)`. All operands are integers. This is **the CON-17 percentage discount rule**, not a restaurant-specific U1 tax-rounding decision.
3. For *these synthetic vectors only*, `tax_minor=0` and `charges_minor=0`. Their actual computation order, per-line vs aggregate rounding, inclusive/exclusive tax treatment, taxable base and fee behavior **require U1**. Do not infer a real result from step 3.
4. `total_minor = subtotal_minor - discount_minor + tax_minor + charges_minor`. Validate resulting nonnegative integer range and exact receipt-total reconciliation.
5. Record the `pricing_version` in quote and immutable receipt preview. After any approved pricing change, use a new version and require fresh quote review; never silently reuse the old amount. RS-11 does not create quote digests or persistence.

Use integer division (floor for nonnegative CON-17 promotion products) rather than floating-point `round()`. Non-discount real tax or cash rounding remains `OWNER DECISION REQUIRED`.

## 4. Independently hand-calculated synthetic baskets

All amounts in this table are **paise**, not rupees. The examples are pinned in `pricing.json` and are **not legal tax examples**.

| Case | Canonical line calculation | Promotion calculation | Tax | Charges | Expected total |
|---|---|---|---:|---:|---:|
| zero_discount | 1 × 1,200 = 1,200 | no offer → 0 | 0 | 0 | **1,200** |
| capped_discount | 1 × 1,200 = 1,200 | floor(1,200 × 2,500 / 10,000) = 300; cap 200 → 200 | 0 | 0 | **1,000** |
| multiline_capped | (2 × 1,999) + (1 × 501) = 4,499 | floor(4,499 × 1,250 / 10,000) = 562; cap 500 → 500 | 0 | 0 | **3,999** |
| sub_paise_floor | 1 × 1 = 1 | floor(1 × 5,000 / 10,000) = floor(0.5) = 0 | 0 | 0 | **1** |
| above_half_paise | 1 × 3 = 3 | floor(3 × 5,000 / 10,000) = floor(1.5) = 1 | 0 | 0 | **2** |
| exact_integer | 1 × 200 = 200 | floor(200 × 500 / 10,000) = 10 | 0 | 0 | **190** |
| full_discount | 1 × 1,200 = 1,200 | 10,000 bps, cap 2,147,483,647 → 1,200 | 0 | 0 | **0** |
| maximum_total | 1 × 2,147,483,647 | no offer → 0 | 0 | 0 | **2,147,483,647** |

The rounding boundary above is **discount floor in paise**. It does not establish tax/GST/invoice rounding. If `sum(line_minor)`, `subtotal_minor + charges_minor`, or a final amount exceeds 2,147,483,647, reject it instead of wrapping or truncating.

## 5. Receipt snapshot and identity boundary

The synthetic receipt example in `pricing.json` mirrors the frozen RS-01 `LiveOrderReceipt` shape: `schema_version=1`, `kind="live-v1"`, UUID `id`, UTC `created_at`, `payment_instruction="Pay at restaurant"`, `fulfillment`, optional `table_id`/`table_label`, `restaurant_id`, `restaurant_name`, server-validated `items`, `totals`, `pricing_version`, `promotion_code`, `offer_version`, `business_identity`, and `synthetic=true`. No online-payment or tip field is present.

Fixture example: `r-demo`, one pizza line at 1,200 paise, 0 discount, 0 tax, 0 charges, total 1,200 INR paise. `business_identity={}` is valid **only** because the example is synthetic. Actual legal name, address, registration or tax numbers, jurisdiction-specific receipt fields, invoice title/numbering, exemptions, rounding presentation, transaction date/time, mandatory text and evidence must be supplied and approved by the **named restaurant owner/accountant**. Do not guess which fields or wording are legally required.

## 6. U1 approval packet, owner/accountant must supply

| Evidence needed for one actual restaurant | Record to request | Current status |
|---|---|---|
| Accountable identity | Restaurant ID, legal/trading name, approver name/role and privately stored evidence reference | **OWNER DECISION REQUIRED** |
| Real catalog pricing | Source price list, item/modifier tax applicability, tax-inclusive or tax-exclusive label, effective date | **OWNER DECISION REQUIRED** |
| Tax policy | Applicable jurisdiction, rates/categories, tax inclusion, before/after-discount basis, exemption handling, per-line vs subtotal rounding, who approved formula | **OWNER DECISION REQUIRED** |
| Other charges | Charge name, fixed/percentage basis, applicability, taxability, caps, calculation order, refund/cancellation treatment | **OWNER DECISION REQUIRED** |
| Cash/invoice rounding | Minor-unit precision, all intermediate and final rounding modes, per-line vs aggregate handling, worked boundary receipt | **OWNER DECISION REQUIRED** |
| Receipt identity | Exact approved business identity key names and values, required disclosures and invoice fields, signed sample without customer PII | **OWNER DECISION REQUIRED** |
| One reconciled real sample | Itemized prices, discounts, tax/charges breakdown, total, date, approval link and source-policy version | **OWNER DECISION REQUIRED** |
| Operational change control | `pricing_version` owner, effective timestamp, approval workflow, rollback and stale quote revalidation | **OWNER DECISION REQUIRED** |

Record a **source date** and **approval date** separately; they need not be the same. Keep actual customer, payment, tax-registration or contact details in access-controlled private evidence, with only a safe opaque pointer in this repository. An empty/synthetic reference is not U1 acceptance.

## 7. Live activation gate: fail closed

`live_ready=false` whenever **any** required U1 policy, receipt identity, version, source, date, approver or reconciled sample is missing, unverified, inconsistent, expired or not tied to the exact restaurant. The synthetic profile always has `live_ready=false` even though its own arithmetic passes.

| Candidate | Synthetic vectors | Named U1 approval | Reconciled real receipt | Live-ready |
|---|---|---|---|---|
| This `r-demo` fixture | yes | no | no | **false** |
| Real restaurant, one missing tax/receipt field | maybe | incomplete | no | **false** |
| Real restaurant, policy or identity changed after approval | n/a | stale | must renew | **false** |
| Future real restaurant with complete signed evidence | separate checks needed | possible | possible | **not asserted by RS-11** |

For an unverified actual restaurant, downstream quote must respond `503 pricing_unconfigured` using the COMMON error envelope, **not** return a zero-tax fixture quote. Deployment, menu access, owner role or path `rid` is not a substitute for this check. Restaurant-specific policy must be actively selected by a verified owner/operator, never inferred from demo data.

## 8. Negative cases, privacy and authority

The companion fixture records missing approval, missing tax inclusion or taxable basis, unknown charges, missing receipt identity, stale `pricing_version`, foreign `restaurant_id`, mismatched receipt line sums, missing source date, fractional/negative/boolean/string paise, out-of-range amounts, and unsupported live tax/rounding policy. They are **contract-level rejected/blocked examples**, not claims that an as-yet-unbuilt provider returned a specific HTTP status.

Once a live API exists: malformed money is `422 invalid_input` or `422 money_out_of_range`; an unknown/foreign resource is `404 not_found` without leaking existence; stale pricing/cart is `409 quote_changed` or the contract-specific stale code; missing profile is `503 pricing_unconfigured`; missing staff identity `401`, denied active membership `403`. Follow the frozen COMMON `{error:{code,message,fields,request_id}}` shape; do not invent success responses, alter shared error discriminants, or trust browser-provided prices/taxes.

Privacy: only synthetic identifiers in source control. No receipts from real customers, staff token, GST registration, address, accountant contact, signed private source, or provider account credential here. Future owner approval and tenant scope must be rechecked at the actual write/read boundary. No database writes or network calls belong to this document ticket.

## 9. RS-15 integration handoff

RS-15 consumes CON-11 (this policy gate), CON-14 canonical cart and RS-01 shapes; it owns actual `backend/app/live_pricing.py` and scoped quote tests/route wiring. The consumer must:

1. Use the **same** strict INR-paise totals shape, receipt/quote identity and exact numerical vectors in the machine-readable fixture. Verify discount floor/cap without floats.
2. Obtain tax, charges, basis and receipt identity from the **named U1-approved restaurant profile** before enabling any real quote. Unverified profile returns `503 pricing_unconfigured`, not a synthetic zero result.
3. Bind quote and receipt to `pricing_version`, cart revision, catalog version and quote digest. A version/price change demands revalidation. Preserve immutable snapshots; never retroactively recalculate a paid or accepted receipt.
4. Check restaurant/verified actor authorization at the provider boundary. The guest session/QR/browser cannot author a production profile or choose a different restaurant's pricing.
5. Add real validation, PostgreSQL-backed money/immutability, stale/conflict, auth and outage tests in **RS-15 or its actual owning integration ticket**, not by mutating frozen RS-01 fixtures or inventing an RS-11 runtime.

**Interface boundary:** this document/JSON file defines example inputs, expected totals and U1 evidence gates; no additional shared DTO is approved. If an actual tax policy, receipt identity or rounding requirement cannot be expressed by current live-v1 contracts, raise `Needs Architect Decision: contract mismatch` and submit a reviewed contract change before code.

## 10. Verification, acceptance and rollback

**Owned files only:** `docs/restaurant-service/pricing-profile.md` and `tests/fixtures/restaurant-service/pricing.json`. No migration, UI, runtime API, provider, external call, secret, payment, tax/legal assertion, change to `tests/fixtures/restaurant-service/v1.json`, or update to integrator-owned `development.md`.

**Local verification:** parse the JSON, assert unique scenario IDs and integer/range constraints, recompute each subtotal, floor/capped discount and final total independently, and compare receipt shape and zero-discount preview with RS-01 shared fixture. Run `git diff --check` and check the exact two-path diff. Full CI is applicable for regressions, but no upstream mock test success can prove U1 signed evidence.

**RS-11 ticket acceptance status on 2026-11-23:**
1. Synthetic hand-calculated vector fixture: **evidence prepared; verify using JSON assertions and PR checks**.
2. Missing approval implies `live_ready=false`: **documented and fixture-negative, provider runtime not built**.
3. Approved real sample receipt: **BLOCKED, U1 absent**.
4. Shared provider/consumer conformance including real invalid/auth/stale behavior: **BLOCKED pending downstream RS-15 provider and real policy**.
5. Mock regressions: **no mock files changed; execute/check branch CI before any PASS claim**.

**Freeze verdict:** only the **synthetic example/blocked-U1 handoff** is reviewable. **CON-11 must not be described as fully live-ready or production-frozen** until owner/accountant evidence and the actual downstream contract tests pass. RS-15, RS-65 and the integrator own their separate acceptance records.

**Rollback:** revert the isolated RS-11 documentation/fixture commits if the reviewed policy/evidence proves incorrect. Reverting these files does not activate/deactivate a service, alter migrations or modify stored receipts. An integrator can update the roadmap after its own review, not as an unauthorized edit in this ticket.
