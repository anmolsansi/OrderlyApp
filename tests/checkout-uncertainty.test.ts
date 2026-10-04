import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitCheckoutOrder } from '../lib/api';
import type { OrderSubmission } from '../lib/types';

const submission: OrderSubmission = {
  expectedRevision: 7,
  catalogFingerprint: 'a'.repeat(64),
  checkout: {
    name: 'Recovery Demo',
    phone: '+1-555-0100',
    email: 'demo@example.test',
    street: '100 Demo Street',
    city: 'Demo City',
    state: 'CA',
    postalCode: '94105',
    paymentMethod: 'mock',
    tipCents: 500,
  },
  promotionCode: 'DEMO5',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('C6 gateway uncertainty classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('treats a gateway timeout after order submission as an uncertain network result', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url === '/api/orderly/session') {
        return jsonResponse({ schema_version: 1, expires_at: '2030-01-31T00:00:00Z' });
      }
      expect(url).toBe('/api/orderly/orders');
      return jsonResponse({
        error: {
          code: 'upstream_timeout',
          message: 'API request timed out',
          request_id: 'synthetic-timeout',
          fields: [],
        },
      }, 504);
    });

    await expect(submitCheckoutOrder('11111111-1111-4111-8111-111111111111', submission)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      error: { code: 'upstream_timeout', requestId: 'synthetic-timeout' },
    });
  });

  it('keeps a real backend storage 503 as a definitive server rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url === '/api/orderly/session') {
        return jsonResponse({ schema_version: 1, expires_at: '2030-01-31T00:00:00Z' });
      }
      expect(url).toBe('/api/orderly/orders');
      return jsonResponse({
        error: {
          code: 'storage_unavailable',
          message: 'Order storage is unavailable',
          request_id: 'synthetic-storage',
          fields: [],
        },
      }, 503);
    });

    await expect(submitCheckoutOrder('22222222-2222-4222-8222-222222222222', submission)).resolves.toMatchObject({
      ok: false,
      kind: 'server',
      error: { code: 'storage_unavailable', requestId: 'synthetic-storage' },
    });
  });
});
