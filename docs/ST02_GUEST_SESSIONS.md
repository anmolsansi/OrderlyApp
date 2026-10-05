# ST-02 guest sessions

ST-02 replaces browser-chosen cart/order ownership with a private server-issued guest session. The browser never sends or receives the internal guest owner ID.

## Why this exists

The original MVP let the browser create a `session-*` string and place it in cart URLs and order bodies. Anyone who learned another session or order identifier could cross the ownership boundary. ST-02 moves ownership to a verified server cookie and makes every protected query owner-scoped.

## Identity model

The backend generates two different values:

1. **Guest ID** — server-only ownership key such as `guest-...`. Current `guest_carts`, `guest_orders`, and `order_idempotency` rows reference it through `owner_id`. Legacy `session_id` rows are not adopted.
2. **Opaque cookie token** — random nonce + expiry + HMAC signature. Only this token reaches the browser. PostgreSQL stores only the SHA-256 hash of the random nonce, not the browser token.

The cookie does not contain the guest ID. Decoding the cookie therefore cannot reveal the database ownership key.

## Cookie lifecycle

- Name: `orderly_guest`
- Lifetime: 30 days from creation, no sliding extension
- HttpOnly: always
- SameSite: `Lax`
- Secure: enabled when the browser request is HTTPS
- Backend path: `/v1`
- Browser path after gateway rewrite: `/api/orderly`
- Cookie expiry is formatted in UTC/GMT even if PostgreSQL returns the same instant in a different session timezone. Repeated bootstrap never extends the original expiry.

`POST /api/orderly/session` is safe to call repeatedly. A valid unexpired cookie keeps the same guest identity. An absent, expired, or invalid cookie creates a new isolated guest.

`POST /api/orderly/session/reset` locks/revokes the current guest, deletes its owner row, creates a new guest, and rotates the cookie. Existing foreign-key cascades immediately delete that guest's current basket, receipts, and idempotency records. Legacy rows with that exact guest ID are also deleted. All database changes share one transaction: if replacement fails, the old guest and its data remain intact. The old token no longer authorizes protected requests after a successful reset; other guests are unchanged.

Expired/revoked guest rows and their guest-scoped cart/order rows are removed by the explicit bounded retention job documented in `docs/runbooks/stabilization.md`. Bootstrap does not run cleanup or migrations. Legacy browser-generated session rows are never adopted by a new guest.

## Protected API

Browser code calls the same-origin gateway at `/api/orderly`. The gateway forwards only these versioned backend routes:

| Browser route | Backend route | Methods | Ownership |
|---|---|---|---|
| `/api/orderly/session` | `/v1/session` | POST | bootstrap |
| `/api/orderly/session/reset` | `/v1/session/reset` | POST | verified current guest |
| `/api/orderly/restaurants` | `/v1/restaurants` | GET | public |
| `/api/orderly/restaurants/:id` | `/v1/restaurants/:id` | GET | public |
| `/api/orderly/cart` | `/v1/cart` | GET, PUT, DELETE | verified guest |
| `/api/orderly/cart/pricing` | `/v1/cart/pricing` | POST | verified guest |
| `/api/orderly/orders` | `/v1/orders` | GET, POST | verified guest |
| `/api/orderly/orders/:id` | `/v1/orders/:id` | GET | verified guest |

The old `/sessions/{id}/cart` ownership API and the public global `/orders` listing are not exposed by the FastAPI application.

Cart and order responses do not include `session_id`. Order creation bodies do not accept `session_id`.

## Same-origin gateway protections

`app/api/orderly/[...path]/route.ts` is an allowlisted gateway, not a generic reverse proxy.

It:

- forwards to one configured `ORDERLY_API_ORIGIN`;
- permits only the route/method combinations above;
- rejects unsafe cross-origin requests before contacting FastAPI;
- rebuilds request headers, so browser-supplied owner/internal headers are dropped;
- forwards only `Accept`, `Content-Type`, and the guest cookie plus trusted Origin/protocol metadata;
- caps request bodies at 64 KiB;
- uses a 5 second upstream timeout;
- rejects upstream redirects;
- forwards only safe response headers;
- rewrites the backend cookie path from `/v1` to `/api/orderly`.

Do not turn this gateway into an arbitrary-path proxy.

## Backend origin protection

FastAPI checks the exact `Origin` on unsafe guest/session, cart, pricing, and order mutations. Wildcards and origin paths are rejected by configuration parsing.

Protected reads derive ownership only from the verified `orderly_guest` cookie. Spoofed headers do not select an owner. A foreign order ID is returned as the same generic 404 used for a nonexistent order.

## Required environment variables

Backend:

```text
ORDERLY_DATA_MODE=api
ORDERLY_SESSION_SECRET=<private random value of at least 32 bytes>
ORDERLY_ALLOWED_ORIGINS=http://localhost:3000
DATABASE_URL=postgresql://...
```

Generate a development secret with:

```bash
openssl rand -hex 32
```

Never commit the generated value. Changing `ORDERLY_SESSION_SECRET` invalidates all existing guest cookies.

Next.js server:

```text
ORDERLY_API_ORIGIN=http://127.0.0.1:8000
```

Docker Compose uses `http://api:8000` internally. Hosted deployments must configure the actual backend origin and exact frontend origin.

## Error contract

Guest identity failures use the stable error envelope:

```json
{
  "error": {
    "code": "session_required",
    "message": "Guest session is required",
    "request_id": "...",
    "fields": []
  }
}
```

Important statuses:

- `401 session_required` — protected route has no guest cookie
- `401 session_invalid` — malformed, forged, revoked, or unknown cookie
- `401 session_expired` — signed token is expired
- `403 origin_forbidden` — unsafe request came from an unapproved origin
- `404 not_found` — nonexistent or foreign order ID
- `503 invalid_config` — identity mode/secret/origin configuration is unsafe or incomplete
- `503 storage_unavailable` — guest session storage is unavailable

Storage error details, signing secrets, cookie values, token hashes, database URLs, and checkout contact/address payloads must not be logged or returned.

## Validation

Focused coverage lives in:

- `backend/tests/test_identity.py` — config, signing, tamper detection, fixed expiry
- `backend/tests/test_identity_errors.py` — expired-cookie and storage-outage behavior
- `backend/tests/test_guest_isolation.py` — two independent cookie jars against real PostgreSQL, cart/order isolation, spoofed header, forged cookie, foreign order, reset
- `tests/gateway.test.ts` — gateway allowlist, origin, header stripping, size cap, cookie rewrite, redirect rejection
- `tests/api.test.ts` — browser transport contains no caller-selected owner ID
- `tests/fixtures/contracts/c1.json` — frozen C1 contract
- `e2e/orderly.spec.ts` — browser bootstrap/reset and cookie attributes

Run the complete validation set through CI or locally with the repository scripts:

```bash
npm run test:contracts
npm run test
npm run typecheck
npm run build
python -m pytest backend/tests -q
npm run test:e2e
```

The PostgreSQL integration tests require `ORDERLY_TEST_DATABASE_URL` or `DATABASE_URL` pointing at a test database with migrations applied.

## Rollback

The schema change is additive. Rolling application code back to the pre-ST-02 version leaves `guest_sessions` unused and preserves historical carts/orders. Do not automatically migrate guest-owned rows back into caller-chosen browser sessions.

If emergency rollback is required:

1. roll back application code;
2. leave `guest_sessions` in place until data retention/cleanup is reviewed;
3. rotate `ORDERLY_SESSION_SECRET` if token exposure is suspected;
4. do not copy guest IDs into browser storage or public API responses.
