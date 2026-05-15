# OrderlyApp — Vision, Decisions, and Roadmap

## Purpose
This document is the tracked home for the product vision, planning notes, future ideas, and decisions discussed while building OrderlyApp. It should be updated whenever the project direction changes so the next development session can quickly recover context.

## Product Vision
OrderlyApp is a portfolio-ready, voice-first food ordering web app. The core experience proves that a user can browse restaurants, customize food, manage a cart, and place a mock order primarily through natural language while still receiving clear visual confirmation and correction options at each important step.

The long-term direction is to turn the MVP into a polished showcase for conversational commerce: a fast, accessible ordering flow where voice and touch/keyboard interactions work together rather than competing with each other.

## Target User
The primary user is a hungry desktop or mobile visitor who wants to order pizza quickly and safely. They should be able to use voice commands for speed, inspect every interpreted action visually, and correct the cart before checkout.

## MVP Promise
The MVP demonstrates an end-to-end mock ordering flow:

1. Browse pizza restaurants.
2. Pick a restaurant and menu item.
3. Customize size, toppings, sides, and quantity.
4. Add, edit, and remove items in the cart.
5. Use voice commands for key cart actions where browser support exists.
6. Review the order and totals.
7. Complete an explicitly mocked checkout with no real payment.
8. See a basic mock order status timeline.

## Current Product Principles
- **Voice-first, not voice-only:** every key voice action must have a visible fallback and confirmation path.
- **Safe checkout:** checkout is always clearly marked as mock/non-payment until real payment support is intentionally added.
- **Visible interpretation:** transcripts, parsed intent, assistant response, and resulting cart changes should be easy to inspect.
- **Accessible recovery:** users should be able to correct mistakes, retry failed voice commands, and complete the flow without speech input.
- **Demo reliability:** the project should remain runnable locally with clear setup, stable mock data, and passing checks.

## Decisions Already Made
- Build as a single Next.js app for the current MVP slice, with backend support available for API, persistence, and deploy demonstrations.
- Keep the MVP focused on pizza ordering instead of broad multi-category marketplace behavior.
- Use mock checkout and mock order status rather than real payments, real restaurant integrations, or real delivery tracking.
- Do not include user accounts, restaurant admin dashboards, real delivery tracking, real payment processing, or multi-vendor orders in the MVP.
- Treat voice as an enhancement: the non-voice ordering path must stay complete and usable.

## Completed Foundation
The project has already covered the initial restart, product design, app shell, mock data, voice parsing, cart logic, checkout/status flow, backend API, database/infrastructure setup, quality checks, and release preparation. Future work should build on this foundation rather than restarting it.

## Current Status
The app has been stabilized for deployment preparation. The local quality gate passes for TypeScript, unit tests, production build, backend Python compile, and Playwright smoke tests. The current customer-facing flow is backend-backed for restaurant data, anonymous cart sessions, mock order creation, order confirmation, and order history, with local fallback mirrors for demo resilience.

The next product-prototype milestone is deployed-demo verification and portfolio capture from the hosted frontend/API path.

## Future Roadmap

### Product Prototype
- Keep backend-backed session carts as the primary cart source across item customization and checkout.
- Keep order creation and confirmation hydration on backend APIs by stable order ID.
- Keep mock/no-payment checkout copy until real payment support is intentionally scoped.
- Continue expanding API contract coverage as backend behavior grows.

### Near-Term Polish
- Verify the deployed demo against the production smoke checklist.
- Capture final screenshots/video from the hosted demo.
- Improve voice command examples and onboarding so users know what to say.
- Add richer empty, loading, and error states for edge cases discovered during demo use.
- Tighten responsive behavior for smaller mobile screens.
- Refine copy around mock checkout, order status, and voice confidence.
- Expand visual regression or screenshot coverage for portfolio confidence.

### Voice and Assistant Enhancements
- Add richer natural-language parsing for substitutions, grouped modifiers, and multi-item commands.
- Support conversational clarification when a command is ambiguous.
- Track command confidence and ask for confirmation when confidence is low.
- Add a command history so users can review what voice actions changed.
- Explore server-side or model-backed interpretation behind the current parser abstraction.

### Product Expansion Ideas
- Add additional cuisine categories after the pizza flow is strong.
- Add saved favorites or repeat-order shortcuts.
- Add optional lightweight user profiles once auth becomes valuable.
- Add restaurant availability, prep-time estimates, and better status simulations.
- Add a restaurant/admin demo mode only after the customer ordering flow is fully polished.

### Technical Expansion Ideas
- Harden API validation and error boundaries.
- Add stronger persistence paths for carts and orders in deployed environments.
- Improve telemetry dashboards for voice failures, checkout completion, and cart corrections.
- Add accessibility automation and manual audit notes.
- Add CI coverage for linting, typecheck, unit tests, build, and end-to-end tests.

## Release and Demo Goals
A successful release should be easy to demo from a clean checkout. The README should explain setup, the demo script should walk through the full user journey, and screenshots or mockups should show the intended flow. The ideal portfolio demo highlights the combination of voice interaction, visual confirmation, safe correction, and mock checkout.

## Open Questions
- Which voice commands should be considered the canonical demo commands?
- Should future interpretation remain local/rule-based, become model-backed, or support both?
- What is the right next cuisine or marketplace category after pizza?
- Should order status stay simulated, or should it become event-driven through the backend?
- What metrics best prove that the voice-first ordering experience is working?

## Maintenance Notes
- Update this file when project goals, roadmap priorities, or major scope decisions change.
- Keep detailed implementation tasks in `docs/TASKS.md` and keep this file focused on vision and direction.
- Keep product constraints aligned with `PRODUCT_CHARTER.md` so the project does not drift away from the MVP promise.
