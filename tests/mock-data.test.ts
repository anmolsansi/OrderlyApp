import { describe, expect, it } from 'vitest';
import {
  calculateCartTotals,
  emptyRestaurants,
  findMenuItem,
  findRestaurant,
  mockAddresses,
  mockCartItems,
  mockOrders,
  restaurantWithoutMenu,
  restaurants,
} from '../lib/mock-data';

describe('shared mock data', () => {
  it('provides enough restaurant and categorized menu data for listing and menu flows', () => {
    expect(restaurants.length).toBeGreaterThanOrEqual(6);
    for (const restaurant of restaurants) {
      expect(restaurant.distanceMiles).toBeGreaterThanOrEqual(0);
      expect(restaurant.imageAlt).toBeTruthy();
      expect(restaurant.menuCategories).toHaveLength(3);
      expect(restaurant.menu.length).toBeGreaterThanOrEqual(9);
    }
  });

  it('includes explicit empty, unavailable, and no-menu edge case data', () => {
    expect(emptyRestaurants).toEqual([]);
    expect(restaurantWithoutMenu.menuCategories).toEqual([]);
    expect(restaurants.some(restaurant => !restaurant.isOpen)).toBe(true);
    expect(restaurants.some(restaurant => restaurant.menu.some(item => item.available === false))).toBe(true);
    expect(mockAddresses.some(address => address.apartment === undefined)).toBe(true);
  });

  it('finds restaurants and menu items deterministically', () => {
    expect(findRestaurant('marios-pizza')?.name).toBe("Mario's Pizza Lab");
    expect(findMenuItem('marios-pizza', 'pepperoni-feast')?.priceCents).toBe(1499);
    expect(findMenuItem('missing', 'pepperoni-feast')).toBeUndefined();
  });

  it('calculates base cart totals with fees, tax, discount, and total', () => {
    const totals = calculateCartTotals(mockCartItems, 'marios-pizza', 500);
    expect(totals).toEqual({
      subtotalCents: 2424,
      discountCents: 500,
      deliveryFeeCents: 199,
      serviceFeeCents: 249,
      taxCents: 168,
      totalCents: 2540,
    });
  });

  it('includes seeded orders with stable IDs and timestamps', () => {
    expect(mockOrders[0].id).toMatch(/^ORD-/);
    expect(mockOrders[0].createdAt).toBe('2026-05-11T18:30:00.000Z');
    expect(mockOrders[0].estimatedDeliveryAt).toBe('2026-05-11T19:05:00.000Z');
  });
});
