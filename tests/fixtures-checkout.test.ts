import { describe, expect, it } from 'vitest';
import { orderStatusSteps, restaurants, validateFixtures } from '../lib/mock-data';
import { createMockOrderId } from '../lib/cart';

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
});
