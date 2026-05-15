import { describe, expect, it } from 'vitest';
import { restaurants } from '../lib/mock-data';
import {
  BACKEND_SESSION_STORAGE_KEY,
  canAddItemToCart,
  clampCartQuantity,
  createBackendSessionId,
  getOrCreateBackendSessionId,
  getCartSubtotal,
  getItemTotal,
  updateCartItemQuantity,
  validateCart,
  validateCartItem,
  validateCheckoutDetails,
} from '../lib/cart';
import type { CartItem, CheckoutDetails } from '../lib/types';

const item = restaurants[0].menu[1];
const validModifiers = [
  { groupId: 'size', optionIds: ['large'] },
  { groupId: 'crust', optionIds: ['classic'] },
  { groupId: 'cheese', optionIds: ['extra-cheese'] },
  { groupId: 'toppings', optionIds: ['pepperoni'] },
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

  it('clamps cart item quantities', () => {
    const cart: CartItem[] = [
      { id: '1', restaurantId: restaurants[0].id, menuItemId: item.id, name: item.name, quantity: 9, basePriceCents: item.priceCents, modifiers: validModifiers },
    ];

    expect(clampCartQuantity(99)).toBe(10);
    expect(updateCartItemQuantity(cart, '1', 5)[0].quantity).toBe(10);
    expect(updateCartItemQuantity(cart, '1', -20)[0].quantity).toBe(1);
  });

  it('rejects adding a second restaurant to an active cart', () => {
    const cart: CartItem[] = [
      { id: '1', restaurantId: restaurants[0].id, menuItemId: item.id, name: item.name, quantity: 1, basePriceCents: item.priceCents, modifiers: validModifiers },
    ];

    expect(canAddItemToCart(cart, restaurants[1].id).ok).toBe(false);
    expect(canAddItemToCart(cart, restaurants[0].id).ok).toBe(true);
  });

  it('validates checkout details', () => {
    const details: CheckoutDetails = {
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

    expect(validateCheckoutDetails(details).ok).toBe(true);
    expect(validateCheckoutDetails({ ...details, email: 'bad-email' }).ok).toBe(false);
    expect(validateCheckoutDetails({ ...details, postalCode: 'abc' }).ok).toBe(false);
  });

  it('creates and reuses backend cart session ids', () => {
    const storage = new Map<string, string>();
    const mockStorage = {
      get length() { return storage.size; },
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => { storage.set(key, value); },
    } as Storage;

    const sessionId = getOrCreateBackendSessionId(mockStorage);
    expect(sessionId).toMatch(/^session-/);
    expect(getOrCreateBackendSessionId(mockStorage)).toBe(sessionId);
    expect(storage.get(BACKEND_SESSION_STORAGE_KEY)).toBe(sessionId);
    expect(createBackendSessionId()).toMatch(/^session-/);
  });
});
