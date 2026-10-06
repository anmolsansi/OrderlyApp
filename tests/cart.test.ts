import { afterEach, describe, expect, it, vi } from 'vitest';
import { restaurants } from '../lib/mock-data';
import {
  API_CART_DRAFT_STORAGE_KEY,
  canAddItemToCart,
  CART_STORAGE_KEY,
  clampCartQuantity,
  getCartSubtotal,
  getItemTotal,
  LOCAL_DEMO_CART_STORAGE_KEY,
  mirrorAcceptedApiCart,
  readApiCartDraft,
  readLocalDemoCart,
  updateCartItemQuantity,
  validateCart,
  validateCartItem,
  validateCheckoutDetails,
  writeApiCartDraft,
  writeLocalDemoCart,
} from '../lib/cart';
import type { CartItem, CheckoutDetails, Restaurant } from '../lib/types';

const item = restaurants[0].menu[1];
const validModifiers = [
  { groupId: 'size', optionIds: ['large'] },
  { groupId: 'crust', optionIds: ['classic'] },
  { groupId: 'cheese', optionIds: ['extra-cheese'] },
  { groupId: 'toppings', optionIds: ['pepperoni'] },
];

function makeMemoryWindow() {
  const values = new Map<string, string>();
  return {
    values,
    window: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
    },
  };
}

describe('cart logic', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['instructions', 'lines', 'duplicate'])('rejects invalid persisted %s without clearing unrelated storage', kind => {
    const memory = makeMemoryWindow();
    vi.stubGlobal('window', memory.window);
    const line: CartItem = { id: 'line', restaurantId: restaurants[0].id, menuItemId: item.id, name: item.name, quantity: 1, basePriceCents: item.priceCents, modifiers: validModifiers };
    const items = kind === 'instructions' ? [{ ...line, specialInstructions: 'x'.repeat(501) }]
      : kind === 'lines' ? Array.from({ length: 51 }, (_, index) => ({ ...line, id: String(index) }))
      : [line, line];
    memory.values.set(LOCAL_DEMO_CART_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items }));
    memory.values.set('unrelated', 'preserve');
    expect(readLocalDemoCart()).toEqual([]);
    expect(memory.values.get('unrelated')).toBe('preserve');
    expect(memory.values.has(LOCAL_DEMO_CART_STORAGE_KEY)).toBe(true);
  });

  it('calculates modifier totals', () => {
    expect(getItemTotal(item, validModifiers)).toBe(2424);
  });

  it('rejects missing required modifiers', () => {
    const result = validateCartItem(item, [{ groupId: 'size', optionIds: [] }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('needs a size');
  });

  it('rejects cross-restaurant cart conflicts before deliberate replacement', () => {
    const cart: CartItem[] = [
      { id: '1', restaurantId: restaurants[0].id, menuItemId: restaurants[0].menu[0].id, name: restaurants[0].menu[0].name, quantity: 1, basePriceCents: restaurants[0].menu[0].priceCents, modifiers: validModifiers },
      { id: '2', restaurantId: restaurants[1].id, menuItemId: restaurants[1].menu[0].id, name: restaurants[1].menu[0].name, quantity: 1, basePriceCents: restaurants[1].menu[0].priceCents, modifiers: validModifiers },
    ];
    expect(validateCart(cart).ok).toBe(false);
  });

  it('calculates subtotal from the supplied canonical catalog rather than global fixtures', () => {
    const cart: CartItem[] = [
      { id: '1', restaurantId: restaurants[0].id, menuItemId: item.id, name: item.name, quantity: 2, basePriceCents: item.priceCents, modifiers: validModifiers },
    ];
    const canonicalRestaurant: Restaurant = {
      ...restaurants[0],
      menu: restaurants[0].menu.map(candidate => candidate.id === item.id ? { ...candidate, priceCents: candidate.priceCents + 1000 } : candidate),
      menuCategories: restaurants[0].menuCategories.map(category => ({
        ...category,
        items: category.items.map(candidate => candidate.id === item.id ? { ...candidate, priceCents: candidate.priceCents + 1000 } : candidate),
      })),
    };

    expect(getCartSubtotal(cart)).toBe(4848);
    expect(getCartSubtotal(cart, [canonicalRestaurant])).toBe(6848);
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

  it('keeps local_demo, API draft, and legacy accepted mirror namespaces separate', () => {
    const memory = makeMemoryWindow();
    vi.stubGlobal('window', memory.window);
    const cart: CartItem[] = [{
      id: 'local-line',
      restaurantId: restaurants[0].id,
      menuItemId: item.id,
      name: item.name,
      quantity: 1,
      basePriceCents: item.priceCents,
      modifiers: validModifiers,
    }];
    const apiDraft = [{ ...cart[0], id: 'draft-line' }];

    expect(writeLocalDemoCart(cart)).toBe(true);
    expect(writeApiCartDraft(apiDraft)).toBe(true);
    expect(mirrorAcceptedApiCart([])).toBe(true);

    expect(readLocalDemoCart()).toEqual(cart);
    expect(readApiCartDraft()).toEqual(apiDraft);
    expect(JSON.parse(memory.values.get(CART_STORAGE_KEY) ?? 'null')).toEqual([]);
    expect(memory.values.has(LOCAL_DEMO_CART_STORAGE_KEY)).toBe(true);
    expect(memory.values.has(API_CART_DRAFT_STORAGE_KEY)).toBe(true);
  });

  it('rejects malformed local preview storage instead of trusting it', () => {
    const memory = makeMemoryWindow();
    memory.values.set(LOCAL_DEMO_CART_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [{ id: 'bad' }] }));
    vi.stubGlobal('window', memory.window);

    expect(readLocalDemoCart()).toEqual([]);
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
});
