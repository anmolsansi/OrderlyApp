# RS-INT04 — Whole synthetic service and compatibility — Not completed

[Setup and baseline](../../../development.md#02-establish-a-reproducible-local-baseline) · [Numbered checklist](../../ticket-execution-flow.md#run-rs-int04) · [Repository context](../../repo_context.md)

**Prerequisites in the serial plan.** RF-05, RS-59, RS-62, RS-63.

## First check

Open the synthetic service with two independent guest sessions and an instrumented transport. Run the role walkthrough and retain the zero-live-egress evidence alongside mock regression results.

Start in the owned test file where one is listed. For a document or rehearsal, use the named evidence artifact. Keep the first observation, then work through all acceptance cases below.

## Assignment

**Ordered execution for a new reviewer — RS-INT04**

1. Pin integrated synthetic build, disabled external transports and independent guestA/B demo scopes; include original mock receipt canaries.
2. Walk customer→staff→payment→owner campaign in each theme with keyboard/phone/zoom and typed voice fallback; retain visible simulation labels.
3. Try foreign/live IDs and forged demo authority; assert zero prohibited writes and zero provider calls, not just hidden UI controls.
4. Run web/backend/browser regression and compare mock receipt/guest behavior. Rehearse compatible app against retained schema in isolation; keep U2 policy acceptance separate.
5. Save criterion evidence in `docs/qa/restaurant-service-int04.md`, then unlock RS-64 rehearsal only after reviewed pass. Fake microphone or simulated send cannot close pilot criteria.

These are execution instructions, not newly passed evidence. Product corrections remain owned by their implementation packets; this reviewer owns only the stated evidence artifact.

- **Inputs/owner:** integration owner consumes RS-59, RS-62, RS-63 and their exact CON outputs; no provider-internal knowledge required.
- **Environment:** named staged build in isolated data environment; provider transports disabled.
- **Cross-component scenarios and negative cases:** Run connected role demo, voice/manual fallback, two-session isolation, invalid demo IDs, both themes/zoom; run original mock regression; validate compatible schema/application rollback before any live activation.
- **Compatibility/migration:** preserve mock receipt bytes and guest reset semantics; verify additive schema and fail-closed missing config. No destructive rollback.
- **Commands:** `npm run test:web; python -m pytest backend/tests; npm run test:e2e`. Each command runs separately; no passed result inferred from command presence.
- **Output:** **CREATE** `docs/qa/restaurant-service-int04.md` with SHA/environment, sanitized request/response examples, actual command results, pass/fail per case and recovery observations. No real PII/secret fixtures.
- **Defect owner:** failing contract's provider owns correction; consumer mapping failures belong to that consumer. Any interface change reopens all named consumers.
- **Exit:** every listed scenario passes and evidence is reviewed. Missing provider/policy/device proof is BLOCKED, not waived. Unlocks merge/handoff of RS-64; fixture preparation can occur earlier.
- **Effort/rollback:**0.5d plus defects; disable failing capability and preserve data rather than bypass gate. Checkpoint emits evidence only, not production activation.
