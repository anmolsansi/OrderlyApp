import { restaurants as fallbackRestaurants } from './mock-data';
import type { CartItem, MenuItem, ModifierGroup, Order, Restaurant } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

interface ApiModifierOption {
  id: string;
  name: string;
  price_delta_cents?: number;
  priceDeltaCents?: number;
}

interface ApiModifierGroup {
  id: string;
  name: string;
  type: 'single' | 'multiple';
  required?: boolean;
  min_selected?: number;
  minSelected?: number;
  max_selected?: number;
  maxSelected?: number;
  options: ApiModifierOption[];
}

interface ApiMenuItem {
  id: string;
  name: string;
  description: string;
  price_cents?: number;
  priceCents?: number;
  image_emoji?: string;
  imageEmoji?: string;
  popular?: boolean;
  modifier_groups?: ApiModifierGroup[];
  modifierGroups?: ApiModifierGroup[];
}

interface ApiRestaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  delivery_minutes?: string;
  deliveryMinutes?: string;
  delivery_fee_cents?: number;
  deliveryFeeCents?: number;
  image_emoji?: string;
  imageEmoji?: string;
  tags: string[];
  menu: ApiMenuItem[];
}

interface ApiCartItemModifier {
  group_id: string;
  option_ids: string[];
}

interface ApiCartItem {
  id: string;
  restaurant_id: string;
  menu_item_id: string;
  name: string;
  quantity: number;
  base_price_cents: number;
  modifiers: ApiCartItemModifier[];
}

interface ApiCart {
  session_id: string;
  items: ApiCartItem[];
  updated_at: string;
}

interface ApiOrder {
  id: string;
  session_id: string;
  cart_items: ApiCartItem[];
  subtotal_cents: number;
  status: Order['status'];
  created_at: string;
}

export interface RestaurantLoadResult {
  restaurants: Restaurant[];
  source: 'api' | 'fallback';
  error?: string;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL.replace(/\/$/, '');
}

export async function fetchRestaurants(): Promise<RestaurantLoadResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/restaurants`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    const payload = await response.json() as ApiRestaurant[];
    return { restaurants: payload.map(normalizeRestaurant), source: 'api' };
  } catch (error) {
    return {
      restaurants: fallbackRestaurants,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown API error',
    };
  }
}

export async function fetchRestaurant(restaurantId: string): Promise<Restaurant | undefined> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/restaurants/${restaurantId}`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return normalizeRestaurant(await response.json() as ApiRestaurant);
  } catch {
    return fallbackRestaurants.find(restaurant => restaurant.id === restaurantId);
  }
}

export async function fetchCart(sessionId: string): Promise<CartItem[] | undefined> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/sessions/${sessionId}/cart`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    const cart = await response.json() as ApiCart;
    return cart.items.map(normalizeCartItem);
  } catch {
    return undefined;
  }
}

export async function saveCart(sessionId: string, items: CartItem[]): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/sessions/${sessionId}/cart`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map(toApiCartItem) }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function clearBackendCart(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/sessions/${sessionId}/cart`, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function createBackendOrder(sessionId: string, cartItems: CartItem[], subtotalCents: number): Promise<Order | undefined> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        cart_items: cartItems.map(toApiCartItem),
        subtotal_cents: subtotalCents,
      }),
    });
    if (!response.ok) return undefined;
    return normalizeOrder(await response.json() as ApiOrder);
  } catch {
    return undefined;
  }
}

export async function fetchOrder(orderId: string): Promise<Order | undefined> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/orders/${orderId}`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return normalizeOrder(await response.json() as ApiOrder);
  } catch {
    return undefined;
  }
}

function normalizeRestaurant(input: ApiRestaurant): Restaurant {
  return {
    id: input.id,
    name: input.name,
    cuisine: input.cuisine,
    rating: input.rating,
    deliveryMinutes: input.deliveryMinutes ?? input.delivery_minutes ?? '20–30 min',
    deliveryFeeCents: input.deliveryFeeCents ?? input.delivery_fee_cents ?? 0,
    imageEmoji: input.imageEmoji ?? input.image_emoji ?? '🍽️',
    tags: input.tags ?? [],
    menu: (input.menu ?? []).map(normalizeMenuItem),
  };
}

function normalizeMenuItem(input: ApiMenuItem): MenuItem {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    priceCents: input.priceCents ?? input.price_cents ?? 0,
    imageEmoji: input.imageEmoji ?? input.image_emoji ?? '🍽️',
    popular: input.popular ?? false,
    modifierGroups: (input.modifierGroups ?? input.modifier_groups ?? []).map(normalizeModifierGroup),
  };
}

function normalizeModifierGroup(input: ApiModifierGroup): ModifierGroup {
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    required: input.required,
    minSelected: input.minSelected ?? input.min_selected,
    maxSelected: input.maxSelected ?? input.max_selected,
    options: input.options.map(option => ({
      id: option.id,
      name: option.name,
      priceDeltaCents: option.priceDeltaCents ?? option.price_delta_cents ?? 0,
    })),
  };
}

function normalizeCartItem(input: ApiCartItem): CartItem {
  return {
    id: input.id,
    restaurantId: input.restaurant_id,
    menuItemId: input.menu_item_id,
    name: input.name,
    quantity: input.quantity,
    basePriceCents: input.base_price_cents,
    modifiers: input.modifiers.map(modifier => ({
      groupId: modifier.group_id,
      optionIds: modifier.option_ids,
    })),
  };
}

function toApiCartItem(input: CartItem): ApiCartItem {
  return {
    id: input.id,
    restaurant_id: input.restaurantId,
    menu_item_id: input.menuItemId,
    name: input.name,
    quantity: input.quantity,
    base_price_cents: input.basePriceCents,
    modifiers: input.modifiers.map(modifier => ({
      group_id: modifier.groupId,
      option_ids: modifier.optionIds,
    })),
  };
}

function normalizeOrder(input: ApiOrder): Order {
  return {
    id: input.id,
    cartItems: input.cart_items.map(normalizeCartItem),
    subtotalCents: input.subtotal_cents,
    status: input.status,
    createdAt: input.created_at,
  };
}
