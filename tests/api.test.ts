import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKOUT_RECOVERY_STORAGE_KEY,
  clearCheckoutRecovery,
  clearRevisionedCart,
  fetchCheckoutQuote,
  fetchOrderReceipt,
  fetchOrderReceipts,
  fetchRestaurants,
  fetchRevisionedCart,
  getOrderlyDataMode,
  loadCheckoutRecovery,
  saveCheckoutRecovery,
  saveRevisionedCart,
  submitCheckoutOrder,
} from '../lib/api';
import { restaurants } from '../lib/mock-data';
import type { CartItem, CheckoutDetails, CheckoutRecovery, OrderSubmission } from '../lib/types';

const cartItem: CartItem = {
  id: 'cart-test',
  restaurantId: 'fixture-r1',
  menuItemId: 'fixture-i1',
  name: 'Client supplied name must not be trusted',
  quantity: 2,
  basePriceCents: 1,
  modifiers: [{ groupId: 'size', optionIds: ['large'] }],
  specialInstructions: 'Extra napkins',
};

const canonicalCartItem = {
  id: 'cart-test',
  restaurant_id: 'fixture-r1',
  menu_item_id: 'fixture-i1',
  name: 'Fixture meal',
  quantity: 2,
  base_price_cents: 1000,
  modifiers: [{ group_id: 'size', option_ids: ['large'] }],
  special_instructions: 'Extra napkins',
};

const canonicalRestaurant = {
  id: 'fixture-r1',
  name: 'Fixture cafe',
  cuisine: 'Pizza',
  rating: 4.9,
  delivery_minutes: '20–30 min',
  delivery_fee_cents: 199,
  image_emoji: '🍕',
  is_open: true,
  tags: ['Pizza'],
  menu: [{
    id: 'fixture-i1',
    name: 'Fixture meal',
    description: 'Canonical fixture meal',
    price_cents: 1000,
    image_emoji: '🍕',
    popular: true,
    available: true,
    modifier_groups: [{
      id: 'size',
      name: 'Size',
      type: 'single',
      required: true,
      min_selected: 1,
      max_selected: 1,
      default_option_id: 'small',
      options: [
        { id: 'small', name: 'Small', price_delta_cents: 0, available: true },
        { id: 'large', name: 'Large', price_delta_cents: 300, available: true },
        { id: 'sold-out', name: 'Sold out', price_delta_cents: 100, available: false },
      ],
    }],
  }],
};

const checkoutDetails: CheckoutDetails = {
  name: 'Jamie Demo',
  phone: '+1-555-0100',
  email: 'jamie@example.test',
  street: '123 Demo Street',
  apartment: '5A',
  city: 'Demo City',
  state: 'CA',
  postalCode: '94105',
  deliveryInstructions: 'Synthetic fixture only',
  paymentMethod: 'mock',
  tipCents: 500,
};

const orderSubmission: OrderSubmission = {
  expectedRevision: 7,
  catalogFingerprint: 'a'.repeat(64),
  checkout: checkoutDetails,
  promotionCode: 'DEMO5',
};

const canonicalReceipt = {
  schema_version: 1,
  id: '11111111-1111-4111-8111-111111111112',
  status: 'Placed',
  created_at: '2030-01-01T00:00:00Z',
  items: [{
    id: 'line-1',
    restaurant_id: 'fixture-r1',
    menu_item_id: 'fixture-i1',
    name: 'Fixture meal',
    unit_price_cents: 1000,
    quantity: 1,
    line_total_cents: 1300,
    modifiers: [{
      group_id: 'size',
      name: 'Size',
      options: [{ id: 'large', name: 'Large', price_delta_cents: 300 }],
    }],
    special_instructions: 'Synthetic fixture only',
  }],
  checkout: {
    name: checkoutDetails.name,
    phone: checkoutDetails.phone,
    email: checkoutDetails.email,
    street: checkoutDetails.street,
    apartment: checkoutDetails.apartment,
    city: checkoutDetails.city,
    state: checkoutDetails.state,
    postal_code: checkoutDetails.postalCode,
    delivery_instructions: checkoutDetails.deliveryInstructions,
    payment_method: 'mock',
    tip_cents: checkoutDetails.tipCents,
  },
  totals: {
    subtotal_cents: 1300,
    discount_cents: 500,
    delivery_fee_cents: 199,
    service_fee_cents: 249,
    tax_cents: 55,
    tip_cents: 500,
    total_cents: 1803,
  },
  pricing_version: 'mock-v1',
};

function mockJsonResponse(payload: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => payload,
  } as Response;
}

function gatewayMock(operation: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === '/api/orderly/session') {
      return mockJsonResponse({ schema_version: 1, expires_at: '2030-01-31T00:00:00Z' });
    }
    return operation(url, init);
  });
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('C7 web API adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses API by default and requires explicit local_demo selection', () => {
    expect(getOrderlyDataMode(undefined)).toBe('api');
    expect(getOrderlyDataMode('api')).toBe('api');
    expect(getOrderlyDataMode('local_demo')).toBe('local_demo');
    expect(() => getOrderlyDataMode('fallback')).toThrow(/api or local_demo/);
  });

  it('normalizes canonical snake_case catalog prices, defaults, and availability', async () => {
    gatewayMock(url => {
      expect(url).toBe('/api/orderly/restaurants');
      return mockJsonResponse([canonicalRestaurant]);
    });

    const result = await fetchRestaurants();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({
      id: 'fixture-r1',
      deliveryFeeCents: 199,
      isOpen: true,
      menu: [{ priceCents: 1000, modifierGroups: [{ defaultOptionId: 'small' }] }],
    });
    expect(result.data[0].menu[0].modifierGroups[0].options[2].available).toBe(false);
  });

  it('does not turn an API error into fixture restaurant success', async () => {
    gatewayMock(() => mockJsonResponse({ error: { code: 'storage_unavailable', message: 'Catalog unavailable', fields: [] } }, false, 503));

    const result = await fetchRestaurants();
    expect(result).toMatchObject({ ok: false, kind: 'server', error: { code: 'storage_unavailable' } });
  });

  it('rejects malformed successful catalog payloads', async () => {
    gatewayMock(() => mockJsonResponse([{ ...canonicalRestaurant, delivery_fee_cents: 'free' }]));

    const result = await fetchRestaurants();
    expect(result).toMatchObject({ ok: false, kind: 'server', error: { code: 'invalid_response' } });
  });

  it('serves explicit local_demo catalog without any API request', async () => {
    vi.stubEnv('NEXT_PUBLIC_ORDERLY_DATA_MODE', 'local_demo');
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await fetchRestaurants();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(restaurants);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads revisioned cookie-owned backend carts', async () => {
    const fetchMock = gatewayMock(url => {
      expect(url).toBe('/api/orderly/cart');
      return mockJsonResponse({ schema_version: 1, revision: 7, items: [canonicalCartItem] });
    });

    const result = await fetchRevisionedCart();
    expect(result).toMatchObject({
      ok: true,
      data: { schemaVersion: 1, revision: 7, items: [{ name: 'Fixture meal', basePriceCents: 1000 }] },
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('session-test'))).toBe(false);
  });

  it('saves only C4-authorized client fields with expected_revision', async () => {
    let operationInit: RequestInit | undefined;
    gatewayMock((url, init) => {
      expect(url).toBe('/api/orderly/cart');
      operationInit = init;
      return mockJsonResponse({ schema_version: 1, revision: 8, items: [canonicalCartItem] });
    });

    const result = await saveRevisionedCart(7, [cartItem]);
    expect(result.ok).toBe(true);
    const body = JSON.parse(operationInit?.body as string);
    expect(body).toEqual({
      expected_revision: 7,
      items: [{
        id: 'cart-test',
        restaurant_id: 'fixture-r1',
        menu_item_id: 'fixture-i1',
        quantity: 2,
        modifiers: [{ group_id: 'size', option_ids: ['large'] }],
        special_instructions: 'Extra napkins',
      }],
    });
    expect(body.items[0]).not.toHaveProperty('name');
    expect(body.items[0]).not.toHaveProperty('base_price_cents');
  });

  it('maps C4 conflict current_cart into the typed C7 recovery envelope', async () => {
    gatewayMock(() => mockJsonResponse({
      error: {
        code: 'cart_conflict',
        message: 'Basket changed in another tab',
        request_id: 'request-conflict',
        fields: [],
      },
      current_cart: { schema_version: 1, revision: 9, items: [] },
    }, false, 409));

    const result = await saveRevisionedCart(7, [cartItem]);
    expect(result).toMatchObject({
      ok: false,
      kind: 'conflict',
      error: {
        code: 'cart_conflict',
        requestId: 'request-conflict',
        currentCart: { schemaVersion: 1, revision: 9, items: [] },
      },
    });
  });

  it('deletes a cart with the accepted revision', async () => {
    let operationInit: RequestInit | undefined;
    gatewayMock((url, init) => {
      expect(url).toBe('/api/orderly/cart');
      operationInit = init;
      return mockJsonResponse({ schema_version: 1, revision: 10, items: [] });
    });

    await expect(clearRevisionedCart(9)).resolves.toMatchObject({ ok: true, data: { revision: 10, items: [] } });
    expect(JSON.parse(operationInit?.body as string)).toEqual({ expected_revision: 9 });
  });

  it('classifies an obsolete aborted read without returning stale data', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return mockJsonResponse([canonicalRestaurant]);
    });

    const result = await fetchRestaurants({ signal: controller.signal });
    expect(result).toMatchObject({ ok: false, kind: 'network', error: { code: 'request_aborted' } });
  });

  it('serializes cart mutations instead of racing writes in one tab', async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    let putCalls = 0;
    gatewayMock((_url, init) => {
      if (init?.method !== 'PUT') return mockJsonResponse({});
      putCalls += 1;
      if (putCalls === 1) {
        return new Promise<Response>(resolve => {
          resolveFirst = resolve;
        });
      }
      return mockJsonResponse({ schema_version: 1, revision: 3, items: [canonicalCartItem] });
    });

    const first = saveRevisionedCart(1, [cartItem]);
    const second = saveRevisionedCart(2, [cartItem]);
    await vi.waitFor(() => expect(putCalls).toBe(1));
    resolveFirst?.(mockJsonResponse({ schema_version: 1, revision: 2, items: [canonicalCartItem] }));
    await expect(first).resolves.toMatchObject({ ok: true, data: { revision: 2 } });
    await expect(second).resolves.toMatchObject({ ok: true, data: { revision: 3 } });
    expect(putCalls).toBe(2);
  });
});

describe('ST-09 C5/C6 checkout adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('requests the server quote with revision, tip, and server-owned promotion policy', async () => {
    let operationInit: RequestInit | undefined;
    gatewayMock((url, init) => {
      expect(url).toBe('/api/orderly/checkout/quote');
      operationInit = init;
      return mockJsonResponse({
        schema_version: 1,
        cart_revision: 7,
        catalog_fingerprint: 'a'.repeat(64),
        totals: canonicalReceipt.totals,
      });
    });

    const result = await fetchCheckoutQuote(7, 500, 'DEMO5');

    expect(result).toMatchObject({
      ok: true,
      data: {
        schemaVersion: 1,
        cartRevision: 7,
        catalogFingerprint: 'a'.repeat(64),
        totals: { totalCents: 1803, tipCents: 500 },
      },
    });
    expect(JSON.parse(operationInit?.body as string)).toEqual({
      expected_revision: 7,
      tip_cents: 500,
      promotion_code: 'DEMO5',
    });
  });

  it('rejects a malformed successful quote instead of calculating a local replacement', async () => {
    gatewayMock(() => mockJsonResponse({
      schema_version: 1,
      cart_revision: 7,
      catalog_fingerprint: 'a'.repeat(64),
      totals: { ...canonicalReceipt.totals, total_cents: '1803' },
    }));

    await expect(fetchCheckoutQuote(7, 500, 'DEMO5')).resolves.toMatchObject({
      ok: false,
      kind: 'server',
      error: { code: 'invalid_response' },
    });
  });

  it('submits the immutable C6 body with the caller-owned UUID idempotency key', async () => {
    let operationInit: RequestInit | undefined;
    gatewayMock((url, init) => {
      expect(url).toBe('/api/orderly/orders');
      operationInit = init;
      return mockJsonResponse(canonicalReceipt, true, 201);
    });

    const key = '11111111-1111-4111-8111-111111111111';
    const result = await submitCheckoutOrder(key, orderSubmission);

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: canonicalReceipt.id,
        status: 'Placed',
        checkout: { street: checkoutDetails.street, tipCents: 500 },
        totals: { totalCents: 1803 },
        pricingVersion: 'mock-v1',
      },
    });
    expect(new Headers(operationInit?.headers).get('Idempotency-Key')).toBe(key);
    expect(JSON.parse(operationInit?.body as string)).toEqual({
      expected_revision: 7,
      catalog_fingerprint: 'a'.repeat(64),
      checkout: {
        name: checkoutDetails.name,
        phone: checkoutDetails.phone,
        email: checkoutDetails.email,
        street: checkoutDetails.street,
        apartment: checkoutDetails.apartment,
        city: checkoutDetails.city,
        state: checkoutDetails.state,
        postal_code: checkoutDetails.postalCode,
        delivery_instructions: checkoutDetails.deliveryInstructions,
        payment_method: 'mock',
        tip_cents: 500,
      },
      promotion_code: 'DEMO5',
    });
  });

  it('treats a 200 idempotent replay as the same accepted immutable receipt', async () => {
    gatewayMock(() => mockJsonResponse(canonicalReceipt, true, 200));

    await expect(submitCheckoutOrder('11111111-1111-4111-8111-111111111111', orderSubmission)).resolves.toMatchObject({
      ok: true,
      data: { id: canonicalReceipt.id, totals: { totalCents: 1803 } },
    });
  });

  it('keeps a lost POST response as a network failure instead of inventing an order', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connection reset'));

    await expect(submitCheckoutOrder('11111111-1111-4111-8111-111111111111', orderSubmission)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      error: { code: 'network_error' },
    });
  });

  it('normalizes exact receipt reads and preserves immutable address, modifier, and totals snapshots', async () => {
    gatewayMock(url => {
      expect(url).toBe(`/api/orderly/orders/${canonicalReceipt.id}`);
      return mockJsonResponse(canonicalReceipt);
    });

    const result = await fetchOrderReceipt(canonicalReceipt.id);
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: canonicalReceipt.id,
        checkout: { apartment: '5A', street: '123 Demo Street' },
        items: [{ modifiers: [{ name: 'Size', options: [{ name: 'Large', priceDeltaCents: 300 }] }] }],
        totals: { subtotalCents: 1300, totalCents: 1803 },
      },
    });
  });

  it('returns the server 404 for an unknown exact order instead of another receipt', async () => {
    gatewayMock(() => mockJsonResponse({
      error: { code: 'order_not_found', message: 'Order not found', request_id: 'missing-order', fields: [] },
    }, false, 404));

    await expect(fetchOrderReceipt('missing')).resolves.toMatchObject({
      ok: false,
      kind: 'validation',
      error: { code: 'order_not_found', requestId: 'missing-order' },
    });
  });

  it('normalizes only the current guest scoped receipt list returned by C5', async () => {
    gatewayMock(url => {
      expect(url).toBe('/api/orderly/orders');
      return mockJsonResponse([canonicalReceipt]);
    });

    await expect(fetchOrderReceipts()).resolves.toMatchObject({
      ok: true,
      data: [{ id: canonicalReceipt.id, totals: { totalCents: 1803 } }],
    });
  });

  it('rejects malformed receipt snapshots rather than reconstructing them from fixtures', async () => {
    gatewayMock(() => mockJsonResponse({ ...canonicalReceipt, totals: { ...canonicalReceipt.totals, tip_cents: -1 } }));

    await expect(fetchOrderReceipt(canonicalReceipt.id)).resolves.toMatchObject({
      ok: false,
      kind: 'server',
      error: { code: 'invalid_response' },
    });
  });

  it('makes checkout and receipt APIs explicitly unavailable in local_demo without network calls', async () => {
    vi.stubEnv('NEXT_PUBLIC_ORDERLY_DATA_MODE', 'local_demo');
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(fetchCheckoutQuote(1, 0)).resolves.toMatchObject({ ok: false, error: { code: 'local_demo_checkout_unavailable' } });
    await expect(submitCheckoutOrder('11111111-1111-4111-8111-111111111111', orderSubmission)).resolves.toMatchObject({ ok: false, error: { code: 'local_demo_checkout_unavailable' } });
    await expect(fetchOrderReceipt('receipt')).resolves.toMatchObject({ ok: false, error: { code: 'local_demo_orders_unavailable' } });
    await expect(fetchOrderReceipts()).resolves.toMatchObject({ ok: false, error: { code: 'local_demo_orders_unavailable' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ST-09 checkout recovery storage', () => {
  it('roundtrips one immutable key/body recovery record', () => {
    const storage = memoryStorage();
    const recovery: CheckoutRecovery = {
      schemaVersion: 1,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      submission: orderSubmission,
    };

    expect(saveCheckoutRecovery(storage, recovery)).toBe(true);
    expect(loadCheckoutRecovery(storage)).toEqual(recovery);
    expect(clearCheckoutRecovery(storage)).toBe(true);
    expect(storage.getItem(CHECKOUT_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it('rejects malformed persisted recovery data instead of repairing or retrying it', () => {
    const storage = memoryStorage({
      [CHECKOUT_RECOVERY_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        idempotencyKey: 'not-a-key',
        submission: orderSubmission,
      }),
    });

    expect(loadCheckoutRecovery(storage)).toBeUndefined();
  });

  it('fails closed when required recovery storage cannot be written', () => {
    const brokenStorage = memoryStorage();
    brokenStorage.setItem = () => { throw new Error('quota'); };

    expect(saveCheckoutRecovery(brokenStorage, {
      schemaVersion: 1,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      submission: orderSubmission,
    })).toBe(false);
  });
});
