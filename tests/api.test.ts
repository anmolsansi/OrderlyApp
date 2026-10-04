import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackendOrder, fetchCart, fetchOrder, fetchOrders, saveCart } from '../lib/api';
import { restaurants } from '../lib/mock-data';
import type { CartItem, CheckoutDetails } from '../lib/types';

const cartItem: CartItem = {
  id: 'cart-test',
  restaurantId: 'marios-pizza',
  menuItemId: 'pepperoni-feast',
  name: 'Pepperoni Feast',
  quantity: 2,
  basePriceCents: 1499,
  modifiers: [
    { groupId: 'size', optionIds: ['large'] },
    { groupId: 'crust', optionIds: ['classic'] },
  ],
  specialInstructions: 'Extra napkins',
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

describe('backend API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and normalizes cookie-owned backend carts', async () => {
    const fetchMock = gatewayMock(url => {
      expect(url).toBe('/api/orderly/cart');
      return mockJsonResponse({
        updated_at: '2026-05-13T09:00:00Z',
        items: [{
          id: cartItem.id,
          restaurant_id: cartItem.restaurantId,
          menu_item_id: cartItem.menuItemId,
          name: cartItem.name,
          quantity: cartItem.quantity,
          base_price_cents: cartItem.basePriceCents,
          modifiers: [{ group_id: 'size', option_ids: ['large'] }],
          special_instructions: cartItem.specialInstructions,
        }],
      });
    });

    await expect(fetchCart()).resolves.toMatchObject([{ specialInstructions: 'Extra napkins' }]);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('session-test'))).toBe(false);
  });

  it('saves cart payloads without browser ownership fields', async () => {
    let operationInit: RequestInit | undefined;
    gatewayMock((url, init) => {
      expect(url).toBe('/api/orderly/cart');
      operationInit = init;
      return mockJsonResponse({});
    });

    await expect(saveCart([cartItem])).resolves.toBe(true);
    expect(JSON.parse(operationInit?.body as string)).toEqual({
      items: [{
        id: 'cart-test',
        restaurant_id: 'marios-pizza',
        menu_item_id: 'pepperoni-feast',
        name: 'Pepperoni Feast',
        quantity: 2,
        base_price_cents: 1499,
        modifiers: [
          { group_id: 'size', option_ids: ['large'] },
          { group_id: 'crust', option_ids: ['classic'] },
        ],
        special_instructions: 'Extra napkins',
      }],
    });
  });

  it('submits checkout details without session_id and normalizes backend orders', async () => {
    let operationInit: RequestInit | undefined;
    gatewayMock((url, init) => {
      expect(url).toBe('/api/orderly/orders');
      operationInit = init;
      return mockJsonResponse({
        id: 'ORD-BACKEND',
        cart_items: [{
          id: cartItem.id,
          restaurant_id: cartItem.restaurantId,
          menu_item_id: cartItem.menuItemId,
          name: cartItem.name,
          quantity: cartItem.quantity,
          base_price_cents: cartItem.basePriceCents,
          modifiers: [{ group_id: 'size', option_ids: ['large'] }],
        }],
        subtotal_cents: 3998,
        status: 'Placed',
        created_at: '2026-05-13T09:00:00Z',
      });
    });

    const order = await createBackendOrder([cartItem], 3998, checkoutDetails);
    const body = JSON.parse(operationInit?.body as string);

    expect(body).toMatchObject({
      subtotal_cents: 3998,
      tip_cents: 500,
      customer_name: 'Jamie Demo',
      customer_email: 'jamie@example.com',
      delivery_address: '123 Demo Street',
    });
    expect(body).not.toHaveProperty('session_id');
    expect(order).toMatchObject({
      id: 'ORD-BACKEND',
      status: 'Placed',
      checkoutDetails,
      totals: { tipCents: 500 },
    });
  });

  it('returns undefined when protected order fetches fail', async () => {
    gatewayMock(() => mockJsonResponse({}, false, 404));
    await expect(fetchOrder('missing')).resolves.toBeUndefined();
    await expect(fetchOrders()).resolves.toBeUndefined();
  });

  it('normalizes guest-scoped backend order lists', async () => {
    gatewayMock(url => {
      expect(url).toBe('/api/orderly/orders');
      return mockJsonResponse([{
        id: 'ORD-LIST',
        cart_items: [{
          id: 'line-1',
          restaurant_id: restaurants[0].id,
          menu_item_id: restaurants[0].menu[0].id,
          name: restaurants[0].menu[0].name,
          quantity: 1,
          base_price_cents: restaurants[0].menu[0].priceCents,
          modifiers: [],
        }],
        subtotal_cents: restaurants[0].menu[0].priceCents,
        status: 'Placed',
        created_at: '2026-05-13T09:00:00Z',
      }]);
    });

    await expect(fetchOrders()).resolves.toMatchObject([{ id: 'ORD-LIST' }]);
  });
});
