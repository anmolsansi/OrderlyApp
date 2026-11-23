# RS-11 / CON-11 — Restaurant pricing and receipt evidence gate

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
2. For the independently frozen CON-17 synthetic promotion, `raw_discount_minor = floor(subtotal_minor * percent_bps / 10000)`, then `discount_minor = min(raw_discount_minor, max_discount_minor, subtotal_minor)`. All operands are integers. This is **the CON-17 percentage discount rule**, not a restaurant-specific U1 tax-rounding decision.
3. For *these synthetic vectors only*, `tax_minor=0` and `charges_minor=0`. Their actual computation order, per-line vs aggregate rounding, inclusive/exclusive tax treatment, taxable base and fee behavior **require U1**. Do not infer a real result from step 3.
4. `total_minor = subtotal_minor - discount_minor + tax_minor + charges_minor`. Validate resulting nonnegative integer range and exact receipt-total reconciliation.
5. Record the `pricing_version` in quote and immutable receipt preview. After any approved pricing change, use a new version and require fresh quote review; never silently reuse the old amount. RS-11 does not create quote digests or persistence.

Use integer division (floor for nonnegative CON-17 promotion products) rather than floating-point `round()`. Non-discount real tax or cash rounding remains `OWNER DECISION REQUIRED`.

## 4. Independently hand-calculated synthetic baskets

All amounts in this table are **paise**, not rupees. The examples are pinned in `pricing.json` and are **not legal tax examples**.

| Case | Canonical line calculation | Promotion calculation | Tax | Charges | Expected total |
|---|---|---|---:|---:|---:|
| zero_discount | 1 × 1,200 = 1,200 | 0 bps → 0 | 0 | 0 | **1,200** |
| capped_discount | 1 × 1,200 = 1,200 | floor(1,200 × 2,500 / 10,000) = 300; cap 200 → 200 | 0 | 0 | **1,000** |
| multiline_capped | (2 × 1,999) + (1 × 501) = 4,499 | floor(4,499 × 1,250 / 10,000) = 562; cap 500 → 500 | 0 | 0 | **3,999** |
| sub_paise_floor | 1 × 1 = 1 | floor(1 × 5,000 / 10,000) = floor(0.5) = 0 | 0 | 0 | **1** |
| above_half_paise | 1 × 3 = 3 | floor(3 × 5,000 / 10,000) = floor(1.5) = 1 | 0 | 0 | **2** |
| exact_integer | 1 × 200 = 200 | floor(200 × 500 / 10,000) = 10 | 0 | 0 | **190** |
| full_discount | 1 × 1,200 = 1,200 | 10,000 bps, cap 2,147,483,647 → 1,200 | 0 | 0 | **0** |
| maximum_total | 1 × 2,147,483,647 | 0 bps → 0 | 0 | 0 | **2,147,483,647** |

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
