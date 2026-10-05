import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, POST, PUT } from '../app/api/orderly/[...path]/route';

type Handler = typeof GET | typeof POST | typeof PUT | typeof DELETE;
type GatewayRequestInit = { headers?: HeadersInit; body?: BodyInit };

function context(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function request(method: string, path: string, init: GatewayRequestInit = {}): NextRequest {
  return new NextRequest(`https://orderly.test/api/orderly/${path}`, {
    method,
    body: init.body,
    headers: {
      origin: 'https://orderly.test',
      ...(init.headers ?? {}),
    },
  });
}

async function call(handler: Handler, method: string, path: string, init?: GatewayRequestInit) {
  return handler(request(method, path, init), context(...path.split('/')));
}

describe('same-origin Orderly API gateway', () => {
  it('forwards receipt pagination on GET while ignoring caller ownership and unrelated queries', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }));
    const cursor = '11111111-1111-4111-8111-111111111112';
    await GET(new NextRequest(`https://orderly.test/api/orderly/orders?limit=2&cursor=${cursor}&owner_id=other&debug=1`), context('orders'));
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.orderly.test/v1/orders?limit=2&cursor=${cursor}`);
  });

  it('does not forward list parameters on order submission or individual receipt reads', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
    await POST(new NextRequest('https://orderly.test/api/orderly/orders?limit=2&cursor=ignored', {
      method: 'POST', headers: { origin: 'https://orderly.test' },
    }), context('orders'));
    await GET(new NextRequest('https://orderly.test/api/orderly/orders/order-id?limit=2'), context('orders', 'order-id'));
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.orderly.test/v1/orders');
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://api.orderly.test/v1/orders/order-id');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ORDERLY_API_ORIGIN;
  });

  it('forwards only allowlisted routes to the fixed upstream origin', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const response = await call(GET, 'GET', 'restaurants');

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.orderly.test/v1/restaurants');

    const blocked = await call(GET, 'GET', 'admin/secrets');
    expect(blocked.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards C5 checkout quote POSTs through the existing same-origin boundary', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    let forwardedBody = '';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      forwardedBody = typeof init?.body === 'string'
        ? init.body
        : init?.body instanceof ArrayBuffer
          ? new TextDecoder().decode(init.body)
          : '';
      return new Response(JSON.stringify({
        schema_version: 1,
        cart_revision: 7,
        catalog_fingerprint: 'a'.repeat(64),
        totals: {
          subtotal_cents: 1000,
          discount_cents: 500,
          delivery_fee_cents: 199,
          service_fee_cents: 249,
          tax_cents: 44,
          tip_cents: 200,
          total_cents: 1192,
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const response = await call(POST, 'POST', 'checkout/quote', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expected_revision: 7, tip_cents: 200, promotion_code: 'DEMO5' }),
    });

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.orderly.test/v1/checkout/quote');
    expect(JSON.parse(forwardedBody)).toEqual({ expected_revision: 7, tip_cents: 200, promotion_code: 'DEMO5' });
  });

  it('rejects unsafe cross-origin requests before contacting the backend', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await POST(
      new NextRequest('https://orderly.test/api/orderly/session', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
      context('session'),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'origin_forbidden' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts an originless browser same-origin POST using Sec-Fetch-Site', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    let forwarded: Headers | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      forwarded = new Headers(init?.headers);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const response = await POST(
      new NextRequest('https://orderly.test/api/orderly/session', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
      context('session'),
    );

    expect(response.status).toBe(200);
    expect(forwarded?.get('origin')).toBe('https://orderly.test');
    expect(forwarded?.get('x-forwarded-proto')).toBe('https');
  });

  it('drops spoofable identity headers and non-order idempotency headers', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    let forwarded: Headers | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      forwarded = new Headers(init?.headers);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const response = await call(PUT, 'PUT', 'cart', {
      headers: {
        origin: 'https://orderly.test',
        'content-type': 'application/json',
        cookie: 'orderly_guest=signed-token',
        'x-orderly-owner': 'guest-forged',
        'x-user-id': 'guest-forged',
        'idempotency-key': '11111111-1111-4111-8111-111111111111',
      },
      body: '{"items":[]}',
    });

    expect(response.status).toBe(200);
    expect(forwarded?.get('cookie')).toBe('orderly_guest=signed-token');
    expect(forwarded?.get('origin')).toBe('https://orderly.test');
    expect(forwarded?.get('x-forwarded-proto')).toBe('https');
    expect(forwarded?.has('x-orderly-owner')).toBe(false);
    expect(forwarded?.has('x-user-id')).toBe(false);
    expect(forwarded?.has('idempotency-key')).toBe(false);
  });

  it('forwards the idempotency key only for C6 order submission', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    const key = '11111111-1111-4111-8111-111111111111';
    let forwarded: Headers | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      forwarded = new Headers(init?.headers);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const response = await call(POST, 'POST', 'orders', {
      headers: {
        origin: 'https://orderly.test',
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(forwarded?.get('idempotency-key')).toBe(key);
  });

  it('rejects request bodies larger than 64 KiB', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await call(POST, 'POST', 'orders', {
      headers: { origin: 'https://orderly.test', 'content-type': 'application/json' },
      body: 'x'.repeat(64 * 1024 + 1),
    });

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rewrites guest Set-Cookie to the browser gateway path with secure flags', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ schema_version: 1, expires_at: '2030-01-31T00:00:00Z' }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'orderly_guest=v1.token; Path=/v1; HttpOnly; SameSite=lax; Secure',
        },
      },
    ));

    const response = await call(POST, 'POST', 'session');
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(cookie).toContain('orderly_guest=v1.token');
    expect(cookie).toContain('Path=/api/orderly');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).not.toContain('Path=/v1');
  });

  it('rejects upstream redirects instead of exposing a redirect target', async () => {
    process.env.ORDERLY_API_ORIGIN = 'https://api.orderly.test';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://evil.example' },
    }));

    const response = await call(GET, 'GET', 'cart');

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'upstream_redirect_rejected' } });
    expect(response.headers.has('location')).toBe(false);
  });
});
