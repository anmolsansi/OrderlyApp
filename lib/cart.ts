import { createMockOrderId as createSeededMockOrderId, restaurants as localDemoRestaurants } from './mock-data';
import type { CartItem, CartItemModifier, CheckoutDetails, MenuItem, Restaurant } from './types';

// Legacy accepted-cart mirror retained only until ST-09 migrates checkout. ST-08
// pages never read it as API authority and only write it after an accepted API response.
export const CART_STORAGE_KEY = 'orderlyapp.marketplace.cart.v1';
export const LOCAL_DEMO_CART_STORAGE_KEY = 'orderlyapp.marketplace.localDemoCart.v1';
export const API_CART_DRAFT_STORAGE_KEY = 'orderlyapp.marketplace.apiCartDraft.v1';
export const ORDER_STORAGE_KEY = 'orderlyapp.marketplace.order.v1';
export const ORDER_HISTORY_STORAGE_KEY = 'orderlyapp.marketplace.orders.v1';
export const SESSION_STORAGE_KEY = 'orderlyapp.marketplace.session.v1';
export const PROFILE_STORAGE_KEY = 'orderlyapp.marketplace.profile.v1';
export const ADDRESSES_STORAGE_KEY = 'orderlyapp.marketplace.addresses.v1';
export const MAX_CART_QUANTITY = 10;

interface StoredCartV1 {
  schemaVersion: 1;
  items: CartItem[];
}

export interface CartValidationResult {
  ok: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredCartItem(value: unknown): value is CartItem {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string'
    || typeof value.restaurantId !== 'string'
    || typeof value.menuItemId !== 'string'
    || typeof value.name !== 'string'
    || !Number.isInteger(value.quantity)
    || Number(value.quantity) < 1
    || Number(value.quantity) > MAX_CART_QUANTITY
    || !Number.isInteger(value.basePriceCents)
    || Number(value.basePriceCents) <= 0
    || !Array.isArray(value.modifiers)
  ) return false;
  if (value.specialInstructions !== undefined && typeof value.specialInstructions !== 'string') return false;

  return value.modifiers.every(modifier => isRecord(modifier)
    && typeof modifier.groupId === 'string'
    && Array.isArray(modifier.optionIds)
    && modifier.optionIds.every(optionId => typeof optionId === 'string'));
}

function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.every(isStoredCartItem) ? parsed.items : [];
  } catch {
    return [];
  }
}

function readCartStorage(key: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseStoredCart(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function writeCartStorage(key: string, items: CartItem[]): boolean {
  if (typeof window === 'undefined') return false;
  const payload: StoredCartV1 = { schemaVersion: 1, items };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readLocalDemoCart(): CartItem[] {
  return readCartStorage(LOCAL_DEMO_CART_STORAGE_KEY);
}

export function writeLocalDemoCart(items: CartItem[]): boolean {
  return writeCartStorage(LOCAL_DEMO_CART_STORAGE_KEY, items);
}

export function readApiCartDraft(): CartItem[] {
  return readCartStorage(API_CART_DRAFT_STORAGE_KEY);
}

export function writeApiCartDraft(items: CartItem[]): boolean {
  return writeCartStorage(API_CART_DRAFT_STORAGE_KEY, items);
}

export function clearApiCartDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(API_CART_DRAFT_STORAGE_KEY);
  } catch {
    // Browser storage is only recovery convenience. Accepted server state remains authoritative.
  }
}

export function mirrorAcceptedApiCart(items: CartItem[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function findCartMenuItem(cartItem: CartItem, catalog: Restaurant[] = localDemoRestaurants): MenuItem | undefined {
  return catalog
    .find(restaurant => restaurant.id === cartItem.restaurantId)
    ?.menu.find(item => item.id === cartItem.menuItemId);
}

export function getItemTotal(item: MenuItem, modifiers: CartItemModifier[]): number {
  const modifierDelta = modifiers.reduce((total, modifier) => {
    const group = item.modifierGroups.find(candidate => candidate.id === modifier.groupId);
    if (!group) return total;
    return total + group.options
      .filter(option => modifier.optionIds.includes(option.id))
      .reduce((sum, option) => sum + option.priceDeltaCents, 0);
  }, 0);
  return item.priceCents + modifierDelta;
}

export function getCartLineTotal(cartItem: CartItem, catalog: Restaurant[] = localDemoRestaurants): number {
  const item = findCartMenuItem(cartItem, catalog);
  if (!item) return cartItem.basePriceCents * cartItem.quantity;
  return getItemTotal(item, cartItem.modifiers) * cartItem.quantity;
}

export function getCartLineUnitTotal(cartItem: CartItem, catalog: Restaurant[] = localDemoRestaurants): number {
  const item = findCartMenuItem(cartItem, catalog);
  if (!item) return cartItem.basePriceCents;
  return getItemTotal(item, cartItem.modifiers);
}

export function clampCartQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_CART_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

export function getCartSubtotal(cartItems: CartItem[], catalog: Restaurant[] = localDemoRestaurants): number {
  return cartItems.reduce((total, item) => total + getCartLineTotal(item, catalog), 0);
}

export function validateCartItem(item: MenuItem, modifiers: CartItemModifier[]): CartValidationResult {
  const errors: string[] = [];

  for (const group of item.modifierGroups) {
    const selected = modifiers.find(modifier => modifier.groupId === group.id)?.optionIds ?? [];
    if (group.required && selected.length === 0) {
      errors.push(`${item.name} needs a ${group.name.toLowerCase()} selection.`);
    }
    if (group.minSelected && selected.length < group.minSelected) {
      errors.push(`${item.name} needs at least ${group.minSelected} ${group.name.toLowerCase()} option${group.minSelected === 1 ? '' : 's'}.`);
    }
    if (group.maxSelected && selected.length > group.maxSelected) {
      errors.push(`${item.name} allows at most ${group.maxSelected} ${group.name.toLowerCase()} option${group.maxSelected === 1 ? '' : 's'}.`);
    }
    const invalidOption = selected.find(optionId => !group.options.some(option => option.id === optionId));
    if (invalidOption) {
      errors.push(`${item.name} has an invalid ${group.name.toLowerCase()} option: ${invalidOption}.`);
    }
    const unavailableOption = selected.find(optionId => group.options.find(option => option.id === optionId)?.available === false);
    if (unavailableOption) {
      errors.push(`${item.name} includes an unavailable ${group.name.toLowerCase()} option: ${unavailableOption}.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateCart(cartItems: CartItem[], catalog: Restaurant[] = localDemoRestaurants): CartValidationResult {
  const errors: string[] = [];
  const restaurantIds = new Set(cartItems.map(item => item.restaurantId));

  if (restaurantIds.size > 1) {
    errors.push('Cart can only contain items from one restaurant for this MVP.');
  }

  for (const cartItem of cartItems) {
    if (cartItem.quantity < 1) {
      errors.push(`${cartItem.name} quantity must be at least 1.`);
    }
    if (cartItem.quantity > MAX_CART_QUANTITY) {
      errors.push(`${cartItem.name} quantity cannot exceed ${MAX_CART_QUANTITY}.`);
    }
    const item = findCartMenuItem(cartItem, catalog);
    if (!item || item.available === false) {
      errors.push(`${cartItem.name} is no longer available.`);
      continue;
    }
    errors.push(...validateCartItem(item, cartItem.modifiers).errors);
  }

  return { ok: errors.length === 0, errors };
}

export function validateCheckoutDetails(details: CheckoutDetails): CartValidationResult {
  const errors: string[] = [];
  if (!details.name.trim()) errors.push('Name is required.');
  if (!/^\+?[0-9 ()-]{7,}$/.test(details.phone.trim())) errors.push('Enter a valid phone number.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email.trim())) errors.push('Enter a valid email address.');
  if (!details.street.trim()) errors.push('Delivery address is required.');
  if (!details.city.trim()) errors.push('City is required.');
  if (!details.state.trim()) errors.push('State is required.');
  if (!/^\d{5}(-\d{4})?$/.test(details.postalCode.trim())) errors.push('Enter a valid ZIP code.');
  if (details.tipCents < 0) errors.push('Tip cannot be negative.');
  return { ok: errors.length === 0, errors };
}

export function getCartRestaurantId(cartItems: CartItem[]): string | undefined {
  return cartItems[0]?.restaurantId;
}

export function canAddItemToCart(cartItems: CartItem[], restaurantId: string): CartValidationResult {
  const existingRestaurantId = getCartRestaurantId(cartItems);
  if (existingRestaurantId && existingRestaurantId !== restaurantId) {
    return { ok: false, errors: ['Your basket contains items from another restaurant. Review before replacing it.'] };
  }
  return { ok: true, errors: [] };
}

export function updateCartItemQuantity(cartItems: CartItem[], cartItemId: string, delta: number): CartItem[] {
  return cartItems.map(item => item.id === cartItemId ? { ...item, quantity: clampCartQuantity(item.quantity + delta) } : item);
}

export function removeCartItem(cartItems: CartItem[], cartItemId: string): CartItem[] {
  return cartItems.filter(item => item.id !== cartItemId);
}

export function getSelectedModifierLabels(cartItem: CartItem, catalog: Restaurant[] = localDemoRestaurants): string[] {
  const item = findCartMenuItem(cartItem, catalog);
  if (!item) return [];

  return cartItem.modifiers.flatMap(modifier => {
    const group = item.modifierGroups.find(candidate => candidate.id === modifier.groupId);
    if (!group) return [];
    const names = group.options.filter(option => modifier.optionIds.includes(option.id)).map(option => option.name);
    return names.length > 0 ? [`${group.name}: ${names.join(', ')}`] : [];
  });
}

export function createMockOrderId(seed = Math.random().toString(36)): string {
  return createSeededMockOrderId(seed);
}
