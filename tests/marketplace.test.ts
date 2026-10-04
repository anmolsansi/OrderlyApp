import { describe, expect, it } from 'vitest';
import { filterRestaurants, getDefaultModifiers, sortRestaurants } from '../lib/marketplace';
import { restaurants } from '../lib/mock-data';
import type { MenuItem } from '../lib/types';

describe('marketplace restaurant discovery', () => {
  it('treats all pizza as the default discovery filter over the supplied catalog', () => {
    expect(filterRestaurants(restaurants, '', 'All pizza').length).toBe(restaurants.length);
  });

  it('searches by menu item names only inside the supplied catalog', () => {
    const matches = filterRestaurants(restaurants, 'pepperoni', 'All pizza');
    expect(matches.some(restaurant => restaurant.id === 'marios-pizza')).toBe(true);
    expect(filterRestaurants(restaurants.slice(1), 'pepperoni', 'All pizza').some(restaurant => restaurant.id === 'marios-pizza')).toBe(false);
  });

  it('sorts restaurants by rating, fee, and distance', () => {
    const byRating = sortRestaurants(restaurants, 'rating');
    expect(byRating[0].rating).toBeGreaterThanOrEqual(byRating[1].rating);

    const byFee = sortRestaurants(restaurants, 'fee');
    expect(byFee[0].deliveryFeeCents).toBeLessThanOrEqual(byFee[1].deliveryFeeCents);

    const byDistance = sortRestaurants(restaurants, 'distance');
    expect(byDistance[0].distanceMiles).toBeLessThanOrEqual(byDistance[1].distanceMiles);
  });

  it('uses only an explicit available canonical default option', () => {
    const base = restaurants[0].menu[0];
    const item: MenuItem = {
      ...base,
      modifierGroups: [{
        id: 'size',
        name: 'Size',
        type: 'single',
        required: true,
        minSelected: 1,
        maxSelected: 1,
        defaultOptionId: 'large',
        options: [
          { id: 'small', name: 'Small', priceDeltaCents: 0, available: true },
          { id: 'large', name: 'Large', priceDeltaCents: 300, available: true },
        ],
      }],
    };

    expect(getDefaultModifiers(item)).toEqual([{ groupId: 'size', optionIds: ['large'] }]);
    expect(getDefaultModifiers({
      ...item,
      modifierGroups: [{ ...item.modifierGroups[0], options: item.modifierGroups[0].options.map(option => ({ ...option, available: option.id !== 'large' })) }],
    })).toEqual([{ groupId: 'size', optionIds: [] }]);
  });
});
