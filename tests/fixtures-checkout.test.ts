import { describe, expect, it } from 'vitest';
import { SYNTHETIC_DEMO_ADDRESSES } from '../lib/auth';
import { createMockOrderId, validateCheckoutDetails } from '../lib/cart';
import { orderStatusSteps, restaurants, validateFixtures } from '../lib/mock-data';
import type { CheckoutDetails } from '../lib/types';

describe('fixtures and checkout primitives', () => {
  it('has valid expanded restaurant fixtures', () => {
    expect(validateFixtures()).toEqual([]);
    expect(restaurants.length).toBeGreaterThanOrEqual(10);
    expect(restaurants.every(restaurant => restaurant.menu.length >= 4)).toBe(true);

    const firstItemModifiers = restaurants[0].menu[0].modifierGroups;
    expect(firstItemModifiers.find(group => group.id === 'toppings')?.options.length).toBeGreaterThanOrEqual(12);
    expect(firstItemModifiers.find(group => group.id === 'cheese')?.options.length).toBeGreaterThanOrEqual(8);
  });

  it('has complete order status timeline', () => {
    expect(orderStatusSteps.map(step => step.status)).toEqual([
      'Placed',
      'Confirmed',
      'Preparing',
      'Out for delivery',
      'Delivered',
    ]);
  });

  it('creates stable mock order ids', () => {
    expect(createMockOrderId('abc123')).toBe('ORD-ABC1230');
  });

  it('keeps both ST-03 synthetic addresses valid as deliberate checkout inputs', () => {
    expect(SYNTHETIC_DEMO_ADDRESSES).toHaveLength(2);
    expect(SYNTHETIC_DEMO_ADDRESSES[0].id).not.toBe(SYNTHETIC_DEMO_ADDRESSES[1].id);
    expect(SYNTHETIC_DEMO_ADDRESSES[0].street).not.toBe(SYNTHETIC_DEMO_ADDRESSES[1].street);

    for (const address of SYNTHETIC_DEMO_ADDRESSES) {
      const details: CheckoutDetails = {
        name: 'Demo visitor',
        phone: '+1-555-0100',
        email: 'demo@example.test',
        street: address.street,
        apartment: address.apartment,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        deliveryInstructions: address.deliveryInstructions,
        paymentMethod: 'mock',
        tipCents: 500,
      };
      expect(validateCheckoutDetails(details)).toEqual({ ok: true, errors: [] });
    }
  });
});
