# OrderlyApp — Quality + Safety

## Automated checks
Run before every handoff:

```bash
npm run test
npm run test:e2e
npm run build
npm run lint
python3 -m py_compile backend/app/*.py backend/scripts/*.py
```

On macOS sandboxed runs, use a writable bytecode cache path for the Python compile check:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/orderly-pycache python3 -m py_compile backend/app/*.py backend/scripts/*.py
```

## Test coverage added in Phase 9
- Schema/fixture validation via `validateFixtures`
- Voice parser tests for add/view/remove/clear commands
- Cart logic tests for totals, required modifiers, and restaurant conflicts
- Checkout primitive tests for mock order IDs and status timeline
- Telemetry hook tests
- Playwright E2E smoke tests for restaurant loading, cart, typed voice command, checkout, and status timeline
- Playwright runs serially against the local Next.js server to avoid dev-manifest races during smoke validation.

## Accessibility checklist
- Voice features must always have typed/manual alternatives.
- Cart mutation confirmations are shown in visible toast/status text.
- Checkout clearly says no real payment is charged.
- Interactive controls use buttons/inputs/labels, not only clickable divs.
- Status updates are text-visible, not color-only.
- Validation errors use `role="alert"` where applicable.

## Error logging strategy
Current MVP logging lives in `lib/telemetry.ts`:
- `reportError(error, context)` for local structured console errors
- `trackEvent(name, properties)` for key app events

Future production integrations can forward this to Sentry, PostHog, OpenTelemetry, or a backend `/events` endpoint.

## Safety notes
- Checkout is mock-only.
- No cards/payments are collected.
- Browser voice support is optional and falls back to typed commands.
- Current backend JSON persistence is local/dev only.
