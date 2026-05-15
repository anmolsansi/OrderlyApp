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

function mockJsonResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

describe('backend API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and normalizes backend carts with special instructions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({
      session_id: 'session-test',
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
    }));

    await expect(fetchCart('session-test')).resolves.toMatchObject([{ specialInstructions: 'Extra napkins' }]);
  });

  it('saves cart payloads using backend field names', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({}));

    await expect(saveCart('session-test', [cartItem])).resolves.toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
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

  it('submits checkout details and normalizes backend orders', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({
      id: 'ORD-BACKEND',
      session_id: 'session-test',
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
    }));

    const order = await createBackendOrder('session-test', [cartItem], 3998, checkoutDetails);
    const [, init] = fetchMock.mock.calls[0];

    expect(JSON.parse(init?.body as string)).toMatchObject({
      session_id: 'session-test',
      subtotal_cents: 3998,
      tip_cents: 500,
      customer_name: 'Jamie Demo',
      customer_email: 'jamie@example.com',
      delivery_address: '123 Demo Street',
    });
    expect(order).toMatchObject({
      id: 'ORD-BACKEND',
      status: 'Placed',
      checkoutDetails,
      totals: { tipCents: 500 },
    });
  });

  it('returns undefined when backend order fetches fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({}, false));
    await expect(fetchOrder('missing')).resolves.toBeUndefined();
    await expect(fetchOrders()).resolves.toBeUndefined();
  });

  it('normalizes backend order lists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse([{
      id: 'ORD-LIST',
      session_id: 'session-test',
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
    }]));

    await expect(fetchOrders()).resolves.toMatchObject([{ id: 'ORD-LIST' }]);
  });
});
