# RS-11 / CON-11 — Restaurant pricing and receipt evidence gate

**Status:** SYNTHETIC INPUTS DOCUMENTED, LIVE U1 BLOCKED, NOT FROZEN FOR REAL ORDERS.
**Prepared:** 2026-11-23. **Source:** RS-01 CON-11 registry at `docs/contracts/restaurant-service-v1.md`, RS-11 task packet, CON-17 discount formula, and the RS-01 synthetic contract fixture.
**Base source:** `21c2b1f060db23790580b3b4bbbbc195112b2171`. **Contract version:** `schema_version=1`, `pricing_version=1` (synthetic example only).
**Owner:** RS-11 supplies an evidence artifact, not a runtime provider. RS-15 consumes this only after its applicable conformance gates. Named restaurant/accountant approval (U1) is absent.

This file is a reviewable pricing policy **template**, not a live DB configuration, executable pricing profile, regulatory opinion, production tax table, or customer receipt. All invented names, numbers and identifiers below are intentionally synthetic. The companion [machine-readable vectors](../../tests/fixtures/restaurant-service/pricing.json) are isolated test evidence and **never** runtime fallback data.

## 1. Frozen shared boundary and units

CON-11 consumes RS-01 COMMON/DTO and hands inputs to RS-15. Backend `/v1/live` is exposed via same-origin `/api/orderly/live`. No route or database schema is created by RS-11. Restaurant IDs are TEXT (1–100 characters). JSON names are snake_case. Money is **strict integer INR paise**, `0..2147483647` inclusive. No strings, booleans, floats, negative numbers, implicit paisa-to-rupee conversion, or floating-point intermediate arithmetic are accepted as money. Overflows are invalid, `422 money_out_of_range` where a live API boundary applies.

Existing public total shape is exactly `{currency:"INR",subtotal_minor,discount_minor,tax_minor,charges_minor,total_minor}`. All five amounts are nonnegative integers in paise. Arithmetic must be checked before persisting or returning a quote. This artifact does not add fields to existing shared DTOs and does not modify the USD-cent `mock-v1` service.
