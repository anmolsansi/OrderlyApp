# RS-INT03 — Campaign approval, worker and feedback handoff — Not completed

[Setup and baseline](../../../development.md#02-establish-a-reproducible-local-baseline) · [Numbered checklist](../../ticket-execution-flow.md#run-rs-int03) · [Repository context](../../repo_context.md)

**Prerequisites in the serial plan.** RF-05, RS-37, RS-54, RS-66.

## First check

Run two fake workers against the last available daily allowance. Compare claims, reservations and transport calls, then lose a response and inspect whether either worker attempts a resend.

Start in the owned test file where one is listed. For a document or rehearsal, use the named evidence artifact. Keep the first observation, then work through all acceptance cases below.

**C-A acceptance.** Keep the original operation, normalized target and validated body bound to the key. Recheck authorization before replay. [Full cases](../../../development.md#18171-contract-corrections-required-before-fixture-freeze).

**C-B acceptance.** Reserve against both daily and approval limits. Keep uncertain reservations on their original budget date and never retry unknown acceptance. [Full cases](../../../development.md#18171-contract-corrections-required-before-fixture-freeze).

## Assignment

**Ordered execution for a new reviewer — RS-INT03**

1. Set two test workers, fake providers, current consent/config and a frozen approved campaign whose cap permits only one claim.
2. Withdraw consent and race claims/pause using coordinated connections. Confirm documented lock order, one reservation and no cap breach.
3. Make fake provider accept then crash before persistence. Restart: one network call, uncertain retained cost, no automatic resend; owner UI must show uncertainty.
4. Send signed/forged, duplicate, foreign-account and out-of-order feedback through the actual reducer boundaries. Only verified matching evidence changes delivery, and suppression remains effective.
5. Run listed claim/dispatch/event suites and save `docs/qa/restaurant-service-int03.md`. Real provider-account/live-send proof is separate U3/RS-65 evidence.

These are execution instructions, not newly passed evidence. Product corrections remain owned by their implementation packets; this reviewer owns only the stated evidence artifact.

- **Inputs/owner:** integration owner consumes RS-37, RS-54, RS-66 and their exact CON outputs; no provider-internal knowledge required.
- **Environment:** isolated PostgreSQL, two workers, fake MSG91/SendGrid transports; no real sends.
- **Cross-component scenarios and negative cases:** Freeze campaign, withdraw consent, race cap, pause, crash after provider accepts, restart without resend; forged/wrong-account/duplicate/out-of-order feedback; owner UI reflects accepted versus delivered and uncertain without ROI claims.
- **Compatibility/migration:** preserve mock receipt bytes and guest reset semantics; verify additive schema and fail-closed missing config. No destructive rollback.
- **Commands:** `python -m pytest backend/tests/test_campaign_claim.py backend/tests/test_campaign_dispatch.py backend/tests/test_sendgrid_events.py backend/tests/test_msg91_events.py`. Each command runs separately; no passed result inferred from command presence.
- **Output:** **CREATE** `docs/qa/restaurant-service-int03.md` with SHA/environment, sanitized request/response examples, actual command results, pass/fail per case and recovery observations. No real PII/secret fixtures.
- **Defect owner:** failing contract's provider owns correction; consumer mapping failures belong to that consumer. Any interface change reopens all named consumers.
- **Exit:** every listed scenario passes and evidence is reviewed. Missing provider/policy/device proof is BLOCKED, not waived. Unlocks merge/handoff of RS-59; fixture preparation can occur earlier.
- **Effort/rollback:**0.5d plus defects; disable failing capability and preserve data rather than bypass gate. Checkpoint emits evidence only, not production activation.
