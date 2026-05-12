import { describe, expect, it } from 'vitest';
import { filterRestaurants, sortRestaurants } from '../lib/marketplace';
import { restaurants } from '../lib/mock-data';

describe('marketplace restaurant discovery', () => {
  it('treats all pizza as the default discovery filter', () => {
    expect(filterRestaurants('', 'All pizza').length).toBe(restaurants.length);
  });

  it('searches by menu item names', () => {
    const matches = filterRestaurants('pepperoni', 'All pizza');
    expect(matches.some(restaurant => restaurant.id === 'marios-pizza')).toBe(true);
  });

  it('sorts restaurants by rating, fee, and distance', () => {
    const byRating = sortRestaurants(restaurants, 'rating');
    expect(byRating[0].rating).toBeGreaterThanOrEqual(byRating[1].rating);

    const byFee = sortRestaurants(restaurants, 'fee');
    expect(byFee[0].deliveryFeeCents).toBeLessThanOrEqual(byFee[1].deliveryFeeCents);

    const byDistance = sortRestaurants(restaurants, 'distance');
    expect(byDistance[0].distanceMiles).toBeLessThanOrEqual(byDistance[1].distanceMiles);
  });
});
