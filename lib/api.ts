import { env } from './env';
import { calculateCartTotals, mockUserProfile, restaurants as fallbackRestaurants } from './mock-data';
import type { CartItem, CheckoutDetails, MenuCategory, MenuItem, ModifierGroup, Order, Restaurant } from './types';

const API_BASE_URL = env.apiBaseUrl;
const API_TIMEOUT_MS = 1_500;

async function fetchApi(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  available?: boolean;
  modifier_groups?: ApiModifierGroup[];
  modifierGroups?: ApiModifierGroup[];
}

interface ApiMenuCategory {
  id: string;
  name: string;
  description?: string;
  items: ApiMenuItem[];
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
  service_fee_cents?: number;
  serviceFeeCents?: number;
  distance_miles?: number;
  distanceMiles?: number;
  image_emoji?: string;
  imageEmoji?: string;
  image_alt?: string;
  imageAlt?: string;
  is_open?: boolean;
  isOpen?: boolean;
  tags: string[];
  menu: ApiMenuItem[];
  menu_categories?: ApiMenuCategory[];
  menuCategories?: ApiMenuCategory[];
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
  special_instructions?: string;
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
    const response = await fetchApi(`${getApiBaseUrl()}/restaurants`, { cache: 'no-store' });
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
    const response = await fetchApi(`${getApiBaseUrl()}/restaurants/${restaurantId}`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return normalizeRestaurant(await response.json() as ApiRestaurant);
  } catch {
    return fallbackRestaurants.find(restaurant => restaurant.id === restaurantId);
  }
}

export async function fetchCart(sessionId: string): Promise<CartItem[] | undefined> {
  try {
    const response = await fetchApi(`${getApiBaseUrl()}/sessions/${sessionId}/cart`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    const cart = await response.json() as ApiCart;
    return cart.items.map(normalizeCartItem);
  } catch {
    return undefined;
  }
}

export async function saveCart(sessionId: string, items: CartItem[]): Promise<boolean> {
  try {
    const response = await fetchApi(`${getApiBaseUrl()}/sessions/${sessionId}/cart`, {
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
    const response = await fetchApi(`${getApiBaseUrl()}/sessions/${sessionId}/cart`, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function createBackendOrder(sessionId: string, cartItems: CartItem[], subtotalCents: number, checkoutDetails?: CheckoutDetails): Promise<Order | undefined> {
  try {
    const response = await fetchApi(`${getApiBaseUrl()}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        cart_items: cartItems.map(toApiCartItem),
        subtotal_cents: subtotalCents,
        delivery_address: checkoutDetails?.street,
        customer_name: checkoutDetails?.name,
        customer_phone: checkoutDetails?.phone,
        customer_email: checkoutDetails?.email,
        tip_cents: checkoutDetails?.tipCents ?? 0,
      }),
    });
    if (!response.ok) return undefined;
    return normalizeOrder(await response.json() as ApiOrder, checkoutDetails);
  } catch {
    return undefined;
  }
}

export async function fetchOrder(orderId: string): Promise<Order | undefined> {
  try {
    const response = await fetchApi(`${getApiBaseUrl()}/orders/${orderId}`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return normalizeOrder(await response.json() as ApiOrder);
  } catch {
    return undefined;
  }
}

export async function fetchOrders(): Promise<Order[] | undefined> {
  try {
    const response = await fetchApi(`${getApiBaseUrl()}/orders`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    const payload = await response.json() as ApiOrder[];
    return payload.map(order => normalizeOrder(order));
  } catch {
    return undefined;
  }
}

function normalizeRestaurant(input: ApiRestaurant): Restaurant {
  const menuCategories = (input.menuCategories ?? input.menu_categories)?.map(normalizeMenuCategory)
    ?? [{ id: 'menu', name: 'Menu', items: (input.menu ?? []).map(normalizeMenuItem) }];
  return {
    id: input.id,
    name: input.name,
    cuisine: input.cuisine,
    rating: input.rating,
    deliveryMinutes: input.deliveryMinutes ?? input.delivery_minutes ?? '20–30 min',
    deliveryFeeCents: input.deliveryFeeCents ?? input.delivery_fee_cents ?? 0,
    serviceFeeCents: input.serviceFeeCents ?? input.service_fee_cents,
    distanceMiles: input.distanceMiles ?? input.distance_miles ?? 0,
    imageEmoji: input.imageEmoji ?? input.image_emoji ?? '🍽️',
    imageAlt: input.imageAlt ?? input.image_alt ?? `${input.name} restaurant image`,
    isOpen: input.isOpen ?? input.is_open ?? true,
    tags: input.tags ?? [],
    menuCategories,
    menu: menuCategories.flatMap(category => category.items),
  };
}

function normalizeMenuCategory(input: ApiMenuCategory): MenuCategory {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    items: input.items.map(normalizeMenuItem),
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
    available: input.available ?? true,
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
    specialInstructions: input.special_instructions,
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
    special_instructions: input.specialInstructions,
  };
}

function normalizeOrder(input: ApiOrder, checkoutDetails?: CheckoutDetails): Order {
  const cartItems = input.cart_items.map(normalizeCartItem);
  const restaurantId = cartItems[0]?.restaurantId ?? fallbackRestaurants[0].id;
  const totals = calculateCartTotals(cartItems, restaurantId);
  const tipCents = checkoutDetails?.tipCents ?? 0;
  const totalsWithTip = {
    ...totals,
    tipCents,
    subtotalCents: input.subtotal_cents,
    totalCents: totals.totalCents + tipCents,
  };
  const createdAt = new Date(input.created_at);
  return {
    id: input.id,
    userId: mockUserProfile.id,
    restaurantId,
    cartItems,
    totals: totalsWithTip,
    subtotalCents: input.subtotal_cents,
    status: input.status,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    deliveryAddressId: mockUserProfile.defaultAddressId,
    estimatedDeliveryAt: new Date(createdAt.getTime() + 35 * 60 * 1000).toISOString(),
    checkoutDetails,
  };
}
