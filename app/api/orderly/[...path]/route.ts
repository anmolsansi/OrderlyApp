import { NextRequest, NextResponse } from 'next/server';

const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 5_000;
const SAFE_RESPONSE_HEADERS = ['content-type', 'x-request-id'] as const;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

type AllowedRoute = {
  pattern: RegExp;
  methods: ReadonlySet<string>;
};

const ALLOWED_ROUTES: AllowedRoute[] = [
  { pattern: /^session$/, methods: new Set(['POST']) },
  { pattern: /^session\/reset$/, methods: new Set(['POST']) },
  { pattern: /^restaurants$/, methods: new Set(['GET']) },
  { pattern: /^restaurants\/[A-Za-z0-9._~-]+$/, methods: new Set(['GET']) },
  { pattern: /^cart$/, methods: new Set(['GET', 'PUT', 'DELETE']) },
  { pattern: /^cart\/pricing$/, methods: new Set(['POST']) },
  { pattern: /^orders$/, methods: new Set(['GET', 'POST']) },
  { pattern: /^orders\/[A-Za-z0-9._~-]+$/, methods: new Set(['GET']) },
];

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message, request_id: crypto.randomUUID(), fields: [] } },
    { status },
  );
}

function upstreamOrigin(): string {
  const configured = process.env.ORDERLY_API_ORIGIN?.trim()
    || process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
    || 'http://127.0.0.1:8000';

  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') {
    throw new Error('ORDERLY_API_ORIGIN must be an http(s) origin without credentials or a path');
  }
  return url.origin;
}

function firstForwardedValue(value: string | null): string | undefined {
  const first = value?.split(',', 1)[0]?.trim();
  return first || undefined;
}

function publicRequestOrigin(request: NextRequest): string {
  const protocol = firstForwardedValue(request.headers.get('x-forwarded-proto'))
    ?? request.nextUrl.protocol.replace(':', '');
  const host = firstForwardedValue(request.headers.get('x-forwarded-host'))
    ?? request.headers.get('host')?.trim()
    ?? request.nextUrl.host;

  if (!['http', 'https'].includes(protocol) || !host) {
    throw new Error('Unable to determine public request origin');
  }
  return `${protocol}://${host}`;
}

function normalizedPath(segments: string[]): string | undefined {
  if (segments.length === 0 || segments.length > 2) return undefined;
  if (segments.some(segment => !/^[A-Za-z0-9._~-]+$/.test(segment))) return undefined;
  return segments.join('/');
}

function routeAllowed(path: string, method: string): boolean {
  return ALLOWED_ROUTES.some(route => route.pattern.test(path) && route.methods.has(method));
}

function sameOriginAllowed(request: NextRequest, publicOrigin: string): boolean {
  if (!UNSAFE_METHODS.has(request.method)) return true;

  const origin = request.headers.get('origin');
  if (origin) return origin === publicOrigin;

  // Some same-origin browser POSTs omit Origin. Sec-Fetch-Site is a forbidden
  // request header for page JavaScript, so it can safely distinguish a real
  // same-origin browser navigation/fetch from a scripted cross-site request.
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

async function boundedBody(request: NextRequest): Promise<ArrayBuffer | undefined> {
  if (!UNSAFE_METHODS.has(request.method)) return undefined;

  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new RangeError('request_body_too_large');
  }

  const data = await request.arrayBuffer();
  if (data.byteLength > MAX_BODY_BYTES) {
    throw new RangeError('request_body_too_large');
  }
  return data.byteLength > 0 ? data : undefined;
}

function upstreamHeaders(request: NextRequest, publicOrigin: string): Headers {
  const headers = new Headers();
  const accept = request.headers.get('accept');
  const contentType = request.headers.get('content-type');
  const cookie = request.headers.get('cookie');

  if (accept) headers.set('accept', accept);
  if (contentType) headers.set('content-type', contentType);
  if (cookie) headers.set('cookie', cookie);

  headers.set('origin', publicOrigin);
  headers.set('x-forwarded-proto', new URL(publicOrigin).protocol.replace(':', ''));
  return headers;
}

function rewriteGuestCookie(rawCookie: string, secureRequest: boolean): string {
  const parts = rawCookie
    .split(';')
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .filter(part => !/^domain=/i.test(part))
    .filter(part => !/^path=/i.test(part))
    .filter(part => !/^samesite=/i.test(part))
    .filter(part => !/^secure$/i.test(part));

  parts.push('Path=/api/orderly', 'HttpOnly', 'SameSite=Lax');
  if (secureRequest) parts.push('Secure');
  return [...new Set(parts)].join('; ');
}

async function proxy(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path: segments } = await context.params;
  const path = normalizedPath(segments);
  if (!path || !routeAllowed(path, request.method)) {
    return errorResponse(404, 'not_found', 'API route not found');
  }

  let publicOrigin: string;
  try {
    publicOrigin = publicRequestOrigin(request);
  } catch {
    return errorResponse(400, 'invalid_request_origin', 'Unable to determine request origin');
  }

  if (!sameOriginAllowed(request, publicOrigin)) {
    return errorResponse(403, 'origin_forbidden', 'Request origin is not allowed');
  }

  let body: ArrayBuffer | undefined;
  try {
    body = await boundedBody(request);
  } catch (error) {
    if (error instanceof RangeError) {
      return errorResponse(413, 'request_too_large', 'Request body exceeds 64 KiB');
    }
    throw error;
  }

  let target: URL;
  try {
    target = new URL(`/v1/${path}`, upstreamOrigin());
  } catch {
    return errorResponse(503, 'invalid_config', 'API gateway is not configured');
  }

  if (path === 'restaurants' || path.startsWith('restaurants/')) {
    target.search = request.nextUrl.search;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders(request, publicOrigin),
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      return errorResponse(502, 'upstream_redirect_rejected', 'API returned an unexpected redirect');
    }

    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    for (const headerName of SAFE_RESPONSE_HEADERS) {
      const value = upstream.headers.get(headerName);
      if (value) responseHeaders.set(headerName, value);
    }

    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) {
      responseHeaders.append(
        'set-cookie',
        rewriteGuestCookie(setCookie, new URL(publicOrigin).protocol === 'https:'),
      );
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse(504, 'upstream_timeout', 'API request timed out');
    }
    return errorResponse(502, 'upstream_unavailable', 'API is unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}
