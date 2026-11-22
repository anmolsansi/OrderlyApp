# RS-INT02 — Customer and staff operational/payment handoff — Not completed

[Setup and baseline](../../../development.md#02-establish-a-reproducible-local-baseline) · [Numbered checklist](../../ticket-execution-flow.md#run-rs-int02) · [Repository context](../../repo_context.md)

**Prerequisites in the serial plan.** RF-03, RF-05, RS-23, RS-46, RS-49.

**RF-01 gate separation:** This checkpoint remains mandatory for full-service RS-59 and RS-RELEASE. It is **not** a prerequisite for the earlier provider-independent DEMO-SALES milestone, whose independent A1–A9 PostgreSQL/Chromium, role and uncertainty proofs are recorded only after DS-01–06 implementation. The early demo does not certify real staff identities, send/settlement policy or this checkpoint. [Canonical graph](../../contracts/restaurant-service-plan.md#187-dependency-dag).

## First check

Use a guest, order_staff member and cashier. Complete an order operationally before recording payment and capture the intermediate Completed/Unpaid state.

Start in the owned test file where one is listed. For a document or rehearsal, use the named evidence artifact. Keep the first observation, then work through all acceptance cases below.

**C-A acceptance.** Keep the original operation, normalized target and validated body bound to the key. Recheck authorization before replay. [Full cases](../../../development.md#18171-contract-corrections-required-before-fixture-freeze).

## Assignment

**Ordered execution for a new reviewer — RS-INT02**

1. Use integrated customer/staff/cashier/owner screens, real test database and test-only identity fixtures; pin one Next/API source.
2. Customer submits; staff progresses the allowed states; verify completed order is still unpaid. Cashier records one full payment and customer sees separate payment status.
3. Lose payment response, reload and reconcile original key. Owner cancellation/reversal creates settlement/event evidence without rewriting receipt or issuing an online refund.
4. Delay detailA after selectingB, make queue stale, resize/change theme and deny action storage. No wrong-order/duplicate command may occur. Run listed browser files.
5. Store request/event/state assertions in `docs/qa/restaurant-service-int02.md`. UI failures return to RS-46/47–49; transaction failures return to RS-21–23.

These are execution instructions, not newly passed evidence. Product corrections remain owned by their implementation packets; this reviewer owns only the stated evidence artifact.

- **Inputs/owner:** integration owner consumes RS-23, RS-46, RS-49 and their exact CON outputs; no provider-internal knowledge required.
- **Environment:** same isolated stack plus Next/Chromium, synthetic staff tokens guarded in test mode.
- **Cross-component scenarios and negative cases:** Customer submits; staff accept/prepare/ready/complete; completed remains unpaid until cashier records; lost payment response reconciles once; owner cancels paid order and appends reversal; stale queue and A/B selection race never enable wrong command.
- **Compatibility/migration:** preserve mock receipt bytes and guest reset semantics; verify additive schema and fail-closed missing config. No destructive rollback.
- **Commands:** `npm run test:e2e -- e2e/live-order-status.spec.ts e2e/live-staff-payment.spec.ts e2e/live-staff-detail.spec.ts`. Each command runs separately; no passed result inferred from command presence.
- **Output:** **CREATE** `docs/qa/restaurant-service-int02.md` with SHA/environment, sanitized request/response examples, actual command results, pass/fail per case and recovery observations. No real PII/secret fixtures.
- **Defect owner:** failing contract's provider owns correction; consumer mapping failures belong to that consumer. Any interface change reopens all named consumers.
- **Exit:** every listed scenario passes and evidence is reviewed. Missing provider/policy/device proof is BLOCKED, not waived. Unlocks merge/handoff of RS-59; fixture preparation can occur earlier.
- **Effort/rollback:**0.5d plus defects; disable failing capability and preserve data rather than bypass gate. Checkpoint emits evidence only, not production activation.
