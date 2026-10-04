import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRevisionedCart,
  createBackendOrder,
  fetchOrder,
  fetchOrders,
  fetchRestaurants,
  fetchRevisionedCart,
  getOrderlyDataMode,
  saveRevisionedCart,
} from '../lib/api';
import { restaurants } from '../lib/mock-data';
import type { CartItem, CheckoutDetails } from '../lib/types';

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
  phone: '555-0100',
  email: 'jamie@example.com',
  street: '123 Demo Street',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94105',
  paymentMethod: 'Mock Visa 4242',
  tipCents: 500,
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

describe('legacy order adapter retained for ST-09 handoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('submits legacy checkout details without client ownership fields', async () => {
    const legacyCartItem: CartItem = {
      ...cartItem,
      restaurantId: restaurants[0].id,
      menuItemId: restaurants[0].menu[0].id,
      name: restaurants[0].menu[0].name,
      basePriceCents: restaurants[0].menu[0].priceCents,
      modifiers: [],
    };
    let operationInit: RequestInit | undefined;
    gatewayMock((url, init) => {
      expect(url).toBe('/api/orderly/orders');
      operationInit = init;
      return mockJsonResponse({
        id: 'ORD-BACKEND',
        cart_items: [{
          id: legacyCartItem.id,
          restaurant_id: legacyCartItem.restaurantId,
          menu_item_id: legacyCartItem.menuItemId,
          name: legacyCartItem.name,
          quantity: legacyCartItem.quantity,
          base_price_cents: legacyCartItem.basePriceCents,
          modifiers: [],
        }],
        subtotal_cents: legacyCartItem.basePriceCents,
        status: 'Placed',
        created_at: '2026-05-13T09:00:00Z',
      });
    });

    const order = await createBackendOrder([legacyCartItem], legacyCartItem.basePriceCents, checkoutDetails);
    const body = JSON.parse(operationInit?.body as string);
    expect(body).not.toHaveProperty('session_id');
    expect(body).not.toHaveProperty('owner_id');
    expect(order).toMatchObject({ id: 'ORD-BACKEND', status: 'Placed' });
  });

  it('returns undefined when protected legacy order fetches fail', async () => {
    gatewayMock(() => mockJsonResponse({}, false, 404));
    await expect(fetchOrder('missing')).resolves.toBeUndefined();
    await expect(fetchOrders()).resolves.toBeUndefined();
  });
});
