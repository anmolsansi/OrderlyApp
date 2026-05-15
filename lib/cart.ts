import { calculateCartSubtotal, calculateItemTotal, createMockOrderId as createSeededMockOrderId, findMenuItem } from './mock-data';
import type { CartItem, CartItemModifier, CheckoutDetails, MenuItem } from './types';

export const CART_STORAGE_KEY = 'orderlyapp.marketplace.cart.v1';
export const ORDER_STORAGE_KEY = 'orderlyapp.marketplace.order.v1';
export const ORDER_HISTORY_STORAGE_KEY = 'orderlyapp.marketplace.orders.v1';
export const SESSION_STORAGE_KEY = 'orderlyapp.marketplace.session.v1';
export const BACKEND_SESSION_STORAGE_KEY = 'orderlyapp.marketplace.backendSession.v1';
export const PROFILE_STORAGE_KEY = 'orderlyapp.marketplace.profile.v1';
export const ADDRESSES_STORAGE_KEY = 'orderlyapp.marketplace.addresses.v1';
export const MAX_CART_QUANTITY = 10;

export interface CartValidationResult {
  ok: boolean;
  errors: string[];
}

export function findCartMenuItem(cartItem: CartItem): MenuItem | undefined {
  return findMenuItem(cartItem.restaurantId, cartItem.menuItemId);
}

export function getItemTotal(item: MenuItem, modifiers: CartItemModifier[]): number {
  return calculateItemTotal(item, modifiers);
}

export function getCartLineTotal(cartItem: CartItem): number {
  const item = findCartMenuItem(cartItem);
  if (!item) return cartItem.basePriceCents * cartItem.quantity;
  return getItemTotal(item, cartItem.modifiers) * cartItem.quantity;
}

export function getCartLineUnitTotal(cartItem: CartItem): number {
  const item = findCartMenuItem(cartItem);
  if (!item) return cartItem.basePriceCents;
  return getItemTotal(item, cartItem.modifiers);
}

export function clampCartQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_CART_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

export function getCartSubtotal(cartItems: CartItem[]): number {
  return calculateCartSubtotal(cartItems);
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

export function validateCart(cartItems: CartItem[]): CartValidationResult {
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
    const item = findCartMenuItem(cartItem);
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
    return { ok: false, errors: ['Start a new cart before ordering from a different restaurant.'] };
  }
  return { ok: true, errors: [] };
}

export function updateCartItemQuantity(cartItems: CartItem[], cartItemId: string, delta: number): CartItem[] {
  return cartItems.map(item => item.id === cartItemId ? { ...item, quantity: clampCartQuantity(item.quantity + delta) } : item);
}

export function removeCartItem(cartItems: CartItem[], cartItemId: string): CartItem[] {
  return cartItems.filter(item => item.id !== cartItemId);
}

export function getSelectedModifierLabels(cartItem: CartItem): string[] {
  const item = findCartMenuItem(cartItem);
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

export function createBackendSessionId(): string {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return `session-${globalThis.crypto.randomUUID()}`;
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateBackendSessionId(storage: Storage): string {
  const existing = storage.getItem(BACKEND_SESSION_STORAGE_KEY);
  if (existing) return existing;
  const sessionId = createBackendSessionId();
  storage.setItem(BACKEND_SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}
