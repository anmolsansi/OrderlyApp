import { restaurants } from './mock-data';
import type { CartItem, CartItemModifier, MenuItem } from './types';

export interface CartValidationResult {
  ok: boolean;
  errors: string[];
}

export function findCartMenuItem(cartItem: CartItem): MenuItem | undefined {
  const restaurant = restaurants.find(candidate => candidate.id === cartItem.restaurantId);
  return restaurant?.menu.find(item => item.id === cartItem.menuItemId);
}

export function getItemTotal(item: MenuItem, modifiers: CartItemModifier[]): number {
  const modifierTotal = modifiers.reduce((sum, modifier) => {
    const group = item.modifierGroups.find(candidate => candidate.id === modifier.groupId);
    if (!group) return sum;
    return sum + group.options
      .filter(option => modifier.optionIds.includes(option.id))
      .reduce((optionSum, option) => optionSum + option.priceDeltaCents, 0);
  }, 0);

  return item.priceCents + modifierTotal;
}

export function getCartLineTotal(cartItem: CartItem): number {
  const item = findCartMenuItem(cartItem);
  if (!item) return cartItem.basePriceCents * cartItem.quantity;
  return getItemTotal(item, cartItem.modifiers) * cartItem.quantity;
}

export function getCartSubtotal(cartItems: CartItem[]): number {
  return cartItems.reduce((sum, item) => sum + getCartLineTotal(item), 0);
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
    const item = findCartMenuItem(cartItem);
    if (!item) {
      errors.push(`${cartItem.name} is no longer available.`);
      continue;
    }
    errors.push(...validateCartItem(item, cartItem.modifiers).errors);
  }

  return { ok: errors.length === 0, errors };
}

export function createMockOrderId(seed = Math.random().toString(36)): string {
  return `ORD-${seed.replace(/[^a-z0-9]/gi, '').slice(0, 7).toUpperCase().padEnd(7, '0')}`;
}
