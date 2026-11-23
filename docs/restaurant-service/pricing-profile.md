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
