import { describe, expect, it } from 'vitest';
import { restaurants } from '../lib/mock-data';
import { getCartSubtotal, getItemTotal, validateCart, validateCartItem } from '../lib/cart';
import type { CartItem } from '../lib/types';

const item = restaurants[0].menu[1];
const validModifiers = [
  { groupId: 'size', optionIds: ['large'] },
  { groupId: 'toppings', optionIds: ['pepperoni', 'extra-cheese'] },
];

describe('cart logic', () => {
  it('calculates modifier totals', () => {
    expect(getItemTotal(item, validModifiers)).toBe(2424);
  });

  it('rejects missing required modifiers', () => {
    const result = validateCartItem(item, [{ groupId: 'size', optionIds: [] }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('needs a size');
  });

  it('rejects cross-restaurant cart conflicts', () => {
    const cart: CartItem[] = [
      { id: '1', restaurantId: restaurants[0].id, menuItemId: restaurants[0].menu[0].id, name: restaurants[0].menu[0].name, quantity: 1, basePriceCents: restaurants[0].menu[0].priceCents, modifiers: validModifiers },
      { id: '2', restaurantId: restaurants[1].id, menuItemId: restaurants[1].menu[0].id, name: restaurants[1].menu[0].name, quantity: 1, basePriceCents: restaurants[1].menu[0].priceCents, modifiers: validModifiers },
    ];
    expect(validateCart(cart).ok).toBe(false);
  });

  it('calculates subtotal', () => {
    const cart: CartItem[] = [
      { id: '1', restaurantId: restaurants[0].id, menuItemId: item.id, name: item.name, quantity: 2, basePriceCents: item.priceCents, modifiers: validModifiers },
    ];
    expect(getCartSubtotal(cart)).toBe(4848);
  });
});
