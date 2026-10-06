# OrderlyApp — Vision, Decisions, and Roadmap

## Purpose

This document records the current product direction and future ideas. The implementation contract and release gates live in [`development.md`](../development.md); the current repository architecture lives in [`repo_context.md`](repo_context.md). Future ideas here are not claims about the accepted release.

## Current Product Vision

OrderlyApp is a portfolio-ready **manual mock-ordering demo** focused on truthful state, safe recovery, and clear evidence. A visitor should be able to browse a canonical pizza catalog, customize an item, maintain a private guest basket, review server-calculated totals, place an idempotent mock order, and reopen the immutable receipt without creating a real account or supplying payment credentials.

The stabilization release deliberately narrows the earlier voice-first concept. Voice remains a future enhancement; keyboard/touch/manual ordering is the required release path.

## Current Product Principles

- **Manual path first:** the full accepted journey must work without speech input.
- **One durable authority:** API-mode catalog/cart/order correctness comes from the server/PostgreSQL path, not browser fixtures or hidden fallback.
- **Private guest ownership:** server-issued opaque guest identity is separate from local demo-profile presentation.
- **Safe checkout:** checkout remains mock-only and clearly states that no real payment is charged.
- **Truthful failures:** network/storage/conflict/unknown outcomes remain errors or recovery states; they do not become invented success.
- **Exact recovery:** uncertain checkout retries reuse the same idempotency key/body, and receipt reload uses immutable server snapshots.
- **Explicit preview mode:** `local_demo` is labelled, isolated, and has no accepted checkout path.
- **Operational honesty:** liveness, readiness, migrations, seed, retention, backup, and recovery are separate lifecycle concerns.

## Current Stabilized Architecture Decisions

- Next.js App Router frontend with a bounded same-origin `/api/orderly` gateway.
- FastAPI backend with versioned ordering contracts.
- PostgreSQL as durable authority for guest identity, canonical catalog data, revisioned carts, immutable receipts, and idempotency state.
- Redis only for ephemeral checkout abuse counters, never durable cart/order authority.
- Server-issued opaque HttpOnly guest cookie; no public owner ID in localStorage or request bodies.
- Password-free local demo profile and synthetic addresses as presentation/input only.
- Deterministic `mock-v1` quote pricing and atomic idempotent mock checkout.
- `api` and `local_demo` are explicit browser modes; an API failure does not switch modes.
- Serving startup does not migrate or seed. Migrations are explicit/serialized/checksummed; fixture seeding is explicit and non-production only.
- Anonymous guest cleanup is an explicit bounded operational job.

## Current Release Status

The current runtime/audit candidate `64a6f412c03731e997c9a96e91e849bc4cf998e4` passed all seven required [hosted CI jobs](https://github.com/anmolsansi/OrderlyApp/actions/runs/37428142914). ST11 has current local operation/recovery proof.

PR #50 is merged at `c0931252fe652d8f14254db6687c228f4db8c5c5`; both public platforms deploy that SHA, and all seven merged-main CI jobs passed. In the user-confirmed Render workspace, `OrderlyApp` at `https://orderlyapp.onrender.com` returns readiness 200 after API-mode, signing-secret and private limiter configuration repairs. A fresh visitor saves a mock order (201) and reloads the exact complete receipt (200); a second guest has empty history and receives 404 for that receipt. The public alias opens anonymously; the immutable Vercel URL returns 302. ST-13 remains Not completed pending isolated hosted recovery and actual cleanup scheduling. See [current acceptance ledger](releases/stabilization-acceptance.md).

## Immediate Roadmap — Finish Stabilization Acceptance

1. Produce/approve an eligible public frontend + current backend candidate through the separately authorized release operation.
2. Complete INT-02 candidate/recovery rehearsal and save criterion-indexed evidence.
3. Verify two fresh unauthenticated visitors can reach the identified public build.
4. Run the manual browse → customize → cart → quote → mock checkout → exact receipt reload journey against that candidate.
5. Re-prove guest isolation and required controlled failure/recovery cases.
6. Capture portfolio screenshots/video only from a candidate whose public identity and behavior are verified.
7. Mark the release gate complete only when every mandatory criterion has current evidence.

## Future Roadmap — After Stabilization

### Voice and Conversational Interaction

Voice is deferred from the current release. A future ticket may evaluate:

- browser speech capture or an alternative provider;
- richer natural-language add/edit/remove commands;
- ambiguity/clarification handling;
- visible transcript/intent confidence;
- model-backed interpretation behind a validated deterministic contract;
- failure/degradation behavior that never blocks the manual path.

### Real Accounts

Only add real authentication if a product use case needs durable customer identity. Any future account system must remain separate from current guest ownership and must define migration, authorization, privacy, recovery, and logout semantics before implementation.

### Real Payments and Restaurant Integrations

Real payment collection, restaurant submission, refunds, dispatch, and live delivery status are future product scopes with materially different security/operational requirements. They must not be inferred from the current mock receipt/checkout UI.

### Broader Marketplace/Product Polish

Possible later work includes more cuisine categories, saved favorites, richer accessibility testing, visual regression coverage, performance budgets, improved operational dashboards, and refined mobile UI.

## Open Decisions for Future Work

- Is voice valuable enough to reintroduce after the manual portfolio release is accepted?
- If voice returns, should interpretation remain deterministic, model-backed, or hybrid?
- Is a real account useful before real restaurant/payment integration exists?
- Which additional observability metrics would meaningfully improve operation of the demo rather than add complexity?
- What evidence would justify turning this portfolio demo into a product prototype?

## Maintenance Notes

- Keep current implementation facts aligned with `development.md` and `repo_context.md`.
- Keep release proof in `releases/stabilization-acceptance.md`; do not use roadmap prose as evidence.
- Preserve historical planning documents as dated history rather than rewriting old decisions to look current.
- When a future feature changes a contract or security boundary, update its owning architecture/evidence before changing this roadmap.
