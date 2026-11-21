# RS-INT01 — Identity, catalog and live checkout — Not completed

[Setup and baseline](../../../development.md#02-establish-a-reproducible-local-baseline) · [Numbered checklist](../../ticket-execution-flow.md#run-rs-int01) · [Repository context](../../repo_context.md)

**Prerequisites in the serial plan.** RF-05, RS-06, RS-14, RS-18, RS-19.

## First check

Use two synthetic restaurants and two cookie jars. Before checkout, record the basket and row counts. Lose the response after commit and compare the counts after same-key recovery.

Start in the owned test file where one is listed. For a document or rehearsal, use the named evidence artifact. Keep the first observation, then work through all acceptance cases below.

**C-A acceptance.** Keep the original operation, normalized target and validated body bound to the key. Recheck authorization before replay. [Full cases](../../../development.md#18171-contract-corrections-required-before-fixture-freeze).

## Assignment

**Ordered execution for a new reviewer — RS-INT01**

1. Confirm CON-06/14/18/19 providers and fixtures match the candidate; apply additive schema on an isolated two-tenant database.
2. Submit takeaway and dine-in orders, preserving approved quote and immutable receipt for each; inactive/foreign table must fail with no writes.
3. Lose one response after commit and replay exact body/key. Count one order/command/cart clear; use guestB and foreign tenant to prove404 isolation.
4. Reset guestA and compare preserved business receipt/event bytes while access disappears. Run the exact backend files listed by this gate.
5. Write one row per scenario in `docs/qa/restaurant-service-int01.md`, with source/schema/fixture/result and defect owner. Unlock RS-44 only after reviewed PASS.

These are execution instructions, not newly passed evidence. Product corrections remain owned by their implementation packets; this reviewer owns only the stated evidence artifact.

- **Inputs/owner:** integration owner consumes RS-06, RS-14, RS-18, RS-19 and their exact CON outputs; no provider-internal knowledge required.
- **Environment:** isolated PostgreSQL16 + Redis7; two restaurants, two guests and role-scoped test identities.
- **Cross-component scenarios and negative cases:** Submit dine-in/takeaway; reject foreign/expired table and unauthorized access; lose response after commit and replay exact receipt; reset guest without deleting business receipt; compare all immutable totals to frozen vectors.
- **Compatibility/migration:** preserve mock receipt bytes and guest reset semantics; verify additive schema and fail-closed missing config. No destructive rollback.
- **Commands:** `python -m pytest backend/tests/test_live_checkout.py backend/tests/test_live_guest_access.py backend/tests/test_staff_memberships.py`. Each command runs separately; no passed result inferred from command presence.
- **Output:** **CREATE** `docs/qa/restaurant-service-int01.md` with SHA/environment, sanitized request/response examples, actual command results, pass/fail per case and recovery observations. No real PII/secret fixtures.
- **Defect owner:** failing contract's provider owns correction; consumer mapping failures belong to that consumer. Any interface change reopens all named consumers.
- **Exit:** every listed scenario passes and evidence is reviewed. Missing provider/policy/device proof is BLOCKED, not waived. Unlocks merge/handoff of RS-44; fixture preparation can occur earlier.
- **Effort/rollback:**0.5d plus defects; disable failing capability and preserve data rather than bypass gate. Checkpoint emits evidence only, not production activation.
