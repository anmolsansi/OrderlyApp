# OrderlyApp — Restart Plan

> **Historical plan — superseded for execution and acceptance as of October 5, 2026.** This file records the original restart/MVP intent and is retained for project history. Use [development.md](development.md) for the current stabilization contract, [docs/repo_context.md](docs/repo_context.md) for the implemented architecture, and [docs/releases/stabilization-acceptance.md](docs/releases/stabilization-acceptance.md) for current release evidence. Checked/planned items in this historical file do not prove current public acceptance. Voice was part of the original MVP concept but is deferred from the current stabilization release.

## Historical Status
Restarted from scratch. Original development root: `~/Documents/Projects/OrderlyApp`.

## Historical Goal
Build a voice-first food ordering web app with mock checkout and order status.

## Historical Locked MVP
- Restaurant browsing
- Menu/item details
- Voice add/edit/remove cart actions
- Cart review and editing
- Mock checkout confirmation
- Basic order status after checkout
- Transcript + assistant response panel
- Accessible visual confirmations

## Historical Start Order
1. Finalize repo scaffold
2. Lock stack and folder structure
3. Implement shared contracts and mock data
4. Build frontend shell
5. Add voice + cart logic
6. Add checkout + order status
7. Add backend/database if retained
8. Test, polish, release

## Historical Task List
See `docs/TASKS.md`.

## Current Direction
The current candidate is a manual mock-ordering release with voice deferred. API mode uses server-issued guest ownership and PostgreSQL-backed canonical cart/receipt authority; `local_demo` is an explicit fixture preview with no accepted checkout path. Current completion and public-release status must be read from `development.md` and the stabilization acceptance record rather than inferred from this original plan.