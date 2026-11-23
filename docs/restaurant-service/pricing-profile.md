# RS-11 / CON-11 — Restaurant pricing and receipt evidence gate

**Status:** SYNTHETIC INPUTS DOCUMENTED, LIVE U1 BLOCKED, NOT FROZEN FOR REAL ORDERS.
**Prepared:** 2026-11-23. **Source:** RS-01 CON-11 registry at `docs/contracts/restaurant-service-v1.md`, RS-11 task packet, CON-17 discount formula, and the RS-01 synthetic contract fixture.
**Base source:** `21c2b1f060db23790580b3b4bbbbc195112b2171`. **Contract version:** `schema_version=1`, `pricing_version=1` (synthetic example only).
**Owner:** RS-11 supplies an evidence artifact, not a runtime provider. RS-15 consumes this only after its applicable conformance gates. Named restaurant/accountant approval (U1) is absent.

This file is a reviewable pricing policy **template**, not a live DB configuration, executable pricing profile, regulatory opinion, production tax table, or customer receipt. All invented names, numbers and identifiers below are intentionally synthetic. The companion [machine-readable vectors](../../tests/fixtures/restaurant-service/pricing.json) are isolated test evidence and **never** runtime fallback data.
