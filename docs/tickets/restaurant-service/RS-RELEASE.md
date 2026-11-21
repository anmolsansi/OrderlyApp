# RS-RELEASE — Controlled restaurant pilot release — Not completed

[Setup and baseline](../../../development.md#02-establish-a-reproducible-local-baseline) · [Numbered checklist](../../ticket-execution-flow.md#run-rs-release) · [Repository context](../../repo_context.md)

**Prerequisites in the serial plan.** Every other entry in this guide; all original release requirements and U1–U4 evidence.

## First check

Write down the exact candidate and deployment target. Take one required scenario from each integration report and verify its source, schema and fixture versions match that candidate. Record discrepancies before considering activation.

Start in the owned test file where one is listed. For a document or rehearsal, use the named evidence artifact. Keep the first observation, then work through all acceptance cases below.

## Assignment

**Ordered execution for a new reviewer — RS-RELEASE**

1. Assemble all67 packet results, INT01–04 evidence and signed-off U1–U4 inputs into the owned release artifact; any missing required policy implementation keeps NOT READY.
2. Compare exact source/schema/web/API/worker identities and current required CI results. Verify named backup/restore target and compatible rollback before enabling a capability.
3. Use the documented staged deployment sequence with ordering/sends disabled; prove synthetic journey and no demo egress. Operator enables ordering/channels separately only when each prerequisite is accepted.
4. Observe named real pilot/device/channel checks from RS-65 with authorized recipients and verified cost caps. Distinguish provider accepted/delivered, recorded payment and willingness-to-pay evidence.
5. Record support/incident owner, disabling procedure, preserved uncertainty/suppression data and actual alert proof in `docs/qa/restaurant-service-release.md`. Release stays incomplete on any failed/blocked mandatory criterion.

These are execution instructions, not newly passed evidence. Product corrections remain owned by their implementation packets; this reviewer owns only the stated evidence artifact.

**RS-RELEASE — Not completed.** Inputs: INT01–04, RS65 pilot evidence, RS66 offer UI, all67 packet acceptance results and U1–U4 resolved for the named restaurant. Owner: release operator plus restaurant owner. Output: **CREATE** `docs/qa/restaurant-service-release.md`; no release authorization implied by this ticket plan.

1. Run existing web/unit/type/build, full PostgreSQL backend and browser suites on named source; required CI checks pass with zero required-test skips. Store actual results, not old green badges.
2. Apply additive007–012 migrations through current runner, with checksum/rerun/mixed-version evidence. Production schema changes require verified target and backup. Do not seed mock fixtures into live tenant.
3. Deploy API against new schema, worker initially send-disabled, then web. Confirm source/readiness/heartbeat and synthetic role journey. Enable live ordering only after real pricing/receipt and policy checks. Enable each marketing channel separately after account/consent/cap/authenticated feedback proof.
4. Rollback trigger: duplicate order/payment/send, cross-tenant access, invalid totals, missing suppression, uncertain worker auto-retry, unavailable recovery or unexpected provider spend. Owner immediately disables affected live/send capability, retains DB state, reconciles uncertain records and rolls back to proven compatible application version.
5. Observe safe request IDs, worker heartbeat/age, failures and reservations; verify support recipient and actual failure alert/runbook. No secrets/PII in CI, logs or evidence.
6. Record measured test menu/queue/audience bounds and query plans; no invented production SLA. Before changing pilot limits, rerun cap/race/latency checks at proposed scale. Deployment no-send check must show no egress for demo, not only a disabled button.
7. Named staff completes dine-in/takeaway, rejection/cancellation, full payment/reversal, both-theme keyboard/phone use and actual speech/manual fallback. Approved test recipients verify each channel and suppression. Marketing acceptance is separate from proof of buyer willingness to pay.
8. Retention/export/delete/backup policy must be approved and any required implementation delta separately ticketed before activation. No destructive policy job invented in this plan. Missing policy implementation or unsupported provider reconciliation keeps release NOT READY.

Release rollback never drops retained business history. No canary infrastructure is currently verified; use an explicitly selected isolated staging/one-restaurant enable gate rather than invent a deployment system. Online payment, delivery and aggregator integrations are future projects with separate contracts.
