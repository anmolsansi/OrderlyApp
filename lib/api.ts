import { calculateCartTotals, mockUserProfile, restaurants as localDemoRestaurants } from './mock-data';
import type {
  ApiErrorKind,
  ApiFailure,
  ApiResult,
  CartItem,
  CheckoutDetails,
  DataMode,
  MenuItem,
  ModifierGroup,
  Order,
  Restaurant,
  RevisionedCart,
} from './types';

const API_BASE_URL = '/api/orderly';
const API_TIMEOUT_MS = 5_000;
let sessionBootstrap: Promise<ApiResult<true>> | undefined;
let cartMutationTail: Promise<void> = Promise.resolve();

class ApiTransportError extends Error {
  constructor(public readonly code: 'request_aborted' | 'network_timeout' | 'network_error', message: string) {
    super(message);
    this.name = 'ApiTransportError';
  }
}

function success<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

function failure(kind: ApiErrorKind, code: string, message: string, extras: Partial<ApiFailure['error']> = {}): ApiFailure {
  return { ok: false, kind, error: { code, message, ...extras } };
}

export function getOrderlyDataMode(raw = process.env.NEXT_PUBLIC_ORDERLY_DATA_MODE): DataMode {
  const value = raw?.trim();
  if (!value) return 'api';
  if (value === 'api' || value === 'local_demo') return value;
  throw new Error('NEXT_PUBLIC_ORDERLY_DATA_MODE must be api or local_demo');
}

function transportFailure(error: unknown): ApiFailure {
  if (error instanceof ApiTransportError) {
    if (error.code === 'request_aborted') {
      return failure('network', error.code, 'Request was superseded by a newer action');
    }
    if (error.code === 'network_timeout') {
      return failure('network', error.code, 'The API request timed out');
    }
    return failure('network', error.code, 'The API could not be reached');
  }
  return failure('network', 'network_error', 'The API could not be reached');
}

async function fetchApi(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal ?? undefined;
  let timedOut = false;
  const abortFromCaller = () => controller.abort();

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      if (externalSignal?.aborted) throw new ApiTransportError('request_aborted', 'Request aborted');
      if (timedOut) throw new ApiTransportError('network_timeout', 'Request timed out');
    }
    throw new ApiTransportError('network_error', error instanceof Error ? error.message : 'Network request failed');
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined;
}

async function readJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function errorKind(status: number): ApiErrorKind {
  if (status === 409) return 'conflict';
  if (status === 401) return 'session';
  if (status === 400 || status === 404 || status === 422) return 'validation';
  return 'server';
}

async function parseErrorResponse(response: Response): Promise<ApiFailure> {
  const payload = await readJson(response);
  const envelope = isRecord(payload) ? payload : undefined;
  const rawError = envelope && isRecord(envelope.error) ? envelope.error : undefined;
  const code = typeof rawError?.code === 'string' ? rawError.code : 'api_error';
  const message = typeof rawError?.message === 'string' ? rawError.message : `API request failed with status ${response.status}`;
  const requestId = typeof rawError?.request_id === 'string'
    ? rawError.request_id
    : response.headers?.get?.('x-request-id') ?? undefined;
  const fields = stringArray(rawError?.fields);
  const currentCart = normalizeRevisionedCart(envelope?.current_cart);

  return failure(errorKind(response.status), code, message, {
    ...(requestId ? { requestId } : {}),
    ...(fields ? { fields } : {}),
    ...(currentCart ? { currentCart } : {}),
  });
}

async function bootstrapGuestSession(force = false): Promise<ApiResult<true>> {
  if (getOrderlyDataMode() === 'local_demo') {
    return failure('session', 'local_demo_no_session', 'Local fixture preview does not create a guest session');
  }

  if (force) sessionBootstrap = undefined;
  if (!sessionBootstrap) {
    sessionBootstrap = (async () => {
      try {
        const response = await fetchApi(`${getApiBaseUrl()}/session`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return parseErrorResponse(response);
        return success(true);
      } catch (error) {
        return transportFailure(error);
      }
    })();
  }

  const result = await sessionBootstrap;
  if (!result.ok) sessionBootstrap = undefined;
  return result;
}

async function fetchProtectedResponse(input: string, init: RequestInit = {}): Promise<ApiResult<Response>> {
  const bootstrap = await bootstrapGuestSession();
  if (!bootstrap.ok) return bootstrap;

  try {
    let response = await fetchApi(input, init);
    if (response.status !== 401) return success(response);

    const refreshed = await bootstrapGuestSession(true);
    if (!refreshed.ok) return refreshed;
    response = await fetchApi(input, init);
    return success(response);
  } catch (error) {
    return transportFailure(error);
  }
}

async function requestJson<T>(
  input: string,
  parser: (payload: unknown) => T | undefined,
  init: RequestInit = {},
  protectedRequest = false,
): Promise<ApiResult<T>> {
  let responseResult: ApiResult<Response>;
  if (protectedRequest) {
    responseResult = await fetchProtectedResponse(input, init);
  } else {
    try {
      responseResult = success(await fetchApi(input, init));
    } catch (error) {
      responseResult = transportFailure(error);
    }
  }

  if (!responseResult.ok) return responseResult;
  const response = responseResult.data;
  if (!response.ok) return parseErrorResponse(response);

  const payload = await readJson(response);
  const parsed = parser(payload);
  if (parsed === undefined) {
    return failure('server', 'invalid_response', 'The API returned an unexpected response shape', {
      requestId: response.headers?.get?.('x-request-id') ?? undefined,
    });
  }
  return success(parsed);
}

function normalizeModifierGroup(input: unknown): ModifierGroup | undefined {
  if (!isRecord(input) || typeof input.id !== 'string' || typeof input.name !== 'string') return undefined;
  if (input.type !== 'single' && input.type !== 'multiple') return undefined;
  if (!Array.isArray(input.options)) return undefined;

  const options = input.options.map(option => {
    if (!isRecord(option) || typeof option.id !== 'string' || typeof option.name !== 'string') return undefined;
    if (!isNonNegativeInteger(option.price_delta_cents)) return undefined;
    if (option.available !== undefined && typeof option.available !== 'boolean') return undefined;
    return {
      id: option.id,
      name: option.name,
      priceDeltaCents: option.price_delta_cents,
      available: option.available ?? true,
    };
  });
  if (options.some(option => option === undefined)) return undefined;

  if (input.required !== undefined && typeof input.required !== 'boolean') return undefined;
  if (input.min_selected !== undefined && input.min_selected !== null && !isNonNegativeInteger(input.min_selected)) return undefined;
  if (input.max_selected !== undefined && input.max_selected !== null && (!Number.isInteger(input.max_selected) || Number(input.max_selected) < 1)) return undefined;
  if (input.default_option_id !== undefined && input.default_option_id !== null && typeof input.default_option_id !== 'string') return undefined;

  return {
    id: input.id,
    name: input.name,
    type: input.type,
    required: input.required ?? false,
    minSelected: typeof input.min_selected === 'number' ? input.min_selected : undefined,
    maxSelected: typeof input.max_selected === 'number' ? input.max_selected : undefined,
    defaultOptionId: typeof input.default_option_id === 'string' ? input.default_option_id : undefined,
    options: options as ModifierGroup['options'],
  };
}

function normalizeMenuItem(input: unknown): MenuItem | undefined {
  if (!isRecord(input)) return undefined;
  if (typeof input.id !== 'string' || typeof input.name !== 'string' || typeof input.description !== 'string') return undefined;
  if (!Number.isInteger(input.price_cents) || Number(input.price_cents) <= 0) return undefined;
  if (typeof input.image_emoji !== 'string') return undefined;
  if (input.popular !== undefined && typeof input.popular !== 'boolean') return undefined;
  if (input.available !== undefined && typeof input.available !== 'boolean') return undefined;
  if (!Array.isArray(input.modifier_groups)) return undefined;

  const modifierGroups = input.modifier_groups.map(normalizeModifierGroup);
  if (modifierGroups.some(group => group === undefined)) return undefined;

  return {
    id: input.id,
    name: input.name,
    description: input.description,
    priceCents: Number(input.price_cents),
    imageEmoji: input.image_emoji,
    popular: input.popular ?? false,
    available: input.available ?? true,
    modifierGroups: modifierGroups as ModifierGroup[],
  };
}

function normalizeRestaurant(input: unknown): Restaurant | undefined {
  if (!isRecord(input)) return undefined;
  if (typeof input.id !== 'string' || typeof input.name !== 'string' || typeof input.cuisine !== 'string') return undefined;
  if (typeof input.rating !== 'number' || !Number.isFinite(input.rating)) return undefined;
  if (typeof input.delivery_minutes !== 'string') return undefined;
  if (!isNonNegativeInteger(input.delivery_fee_cents)) return undefined;
  if (typeof input.image_emoji !== 'string' || typeof input.is_open !== 'boolean') return undefined;
  const tags = stringArray(input.tags);
  if (!tags || !Array.isArray(input.menu)) return undefined;

  const menu = input.menu.map(normalizeMenuItem);
  if (menu.some(item => item === undefined)) return undefined;
  const normalizedMenu = menu as MenuItem[];

  return {
    id: input.id,
    name: input.name,
    cuisine: input.cuisine,
    rating: input.rating,
    deliveryMinutes: input.delivery_minutes,
    deliveryFeeCents: Number(input.delivery_fee_cents),
    distanceMiles: 0,
    imageEmoji: input.image_emoji,
    imageAlt: `${input.name} restaurant image`,
    isOpen: input.is_open,
    status: input.is_open ? 'open' : 'closed',
    tags,
    menuCategories: [{ id: 'menu', name: 'Menu', items: normalizedMenu }],
    menu: normalizedMenu,
  };
}

function normalizeRestaurantList(payload: unknown): Restaurant[] | undefined {
  if (!Array.isArray(payload)) return undefined;
  const restaurants = payload.map(normalizeRestaurant);
  return restaurants.some(restaurant => restaurant === undefined) ? undefined : restaurants as Restaurant[];
}

function normalizeCartItem(input: unknown): CartItem | undefined {
  if (!isRecord(input)) return undefined;
  if (
    typeof input.id !== 'string'
    || typeof input.restaurant_id !== 'string'
    || typeof input.menu_item_id !== 'string'
    || typeof input.name !== 'string'
    || !Number.isInteger(input.quantity)
    || Number(input.quantity) < 1
    || Number(input.quantity) > 10
    || !Number.isInteger(input.base_price_cents)
    || Number(input.base_price_cents) <= 0
    || !Array.isArray(input.modifiers)
  ) return undefined;

  const modifiers = input.modifiers.map(modifier => {
    if (!isRecord(modifier) || typeof modifier.group_id !== 'string' || !Array.isArray(modifier.option_ids)) return undefined;
    if (!modifier.option_ids.every(optionId => typeof optionId === 'string')) return undefined;
    return { groupId: modifier.group_id, optionIds: modifier.option_ids as string[] };
  });
  if (modifiers.some(modifier => modifier === undefined)) return undefined;
  if (input.special_instructions !== undefined && input.special_instructions !== null && typeof input.special_instructions !== 'string') return undefined;

  return {
    id: input.id,
    restaurantId: input.restaurant_id,
    menuItemId: input.menu_item_id,
    name: input.name,
    quantity: Number(input.quantity),
    basePriceCents: Number(input.base_price_cents),
    modifiers: modifiers as CartItem['modifiers'],
    specialInstructions: typeof input.special_instructions === 'string' ? input.special_instructions : undefined,
  };
}

function normalizeRevisionedCart(payload: unknown): RevisionedCart | undefined {
  if (!isRecord(payload) || payload.schema_version !== 1 || !isNonNegativeInteger(payload.revision) || !Array.isArray(payload.items)) return undefined;
  const items = payload.items.map(normalizeCartItem);
  if (items.some(item => item === undefined)) return undefined;
  return { schemaVersion: 1, revision: Number(payload.revision), items: items as CartItem[] };
}

function toApiCartItem(input: CartItem): Record<string, unknown> {
  return {
    id: input.id,
    restaurant_id: input.restaurantId,
    menu_item_id: input.menuItemId,
    quantity: input.quantity,
    modifiers: input.modifiers.map(modifier => ({
      group_id: modifier.groupId,
      option_ids: modifier.optionIds,
    })),
    ...(input.specialInstructions ? { special_instructions: input.specialInstructions } : {}),
  };
}

function enqueueCartMutation<T>(operation: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const run = cartMutationTail.then(operation, operation);
  cartMutationTail = run.then(() => undefined, () => undefined);
  return run;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function fetchRestaurants(options: { signal?: AbortSignal } = {}): Promise<ApiResult<Restaurant[]>> {
  if (getOrderlyDataMode() === 'local_demo') return success(localDemoRestaurants);
  return requestJson(
    `${getApiBaseUrl()}/restaurants`,
    normalizeRestaurantList,
    { cache: 'no-store', signal: options.signal },
  );
}

export async function fetchRestaurant(restaurantId: string, options: { signal?: AbortSignal } = {}): Promise<ApiResult<Restaurant>> {
  if (getOrderlyDataMode() === 'local_demo') {
    const restaurant = localDemoRestaurants.find(candidate => candidate.id === restaurantId);
    return restaurant
      ? success(restaurant)
      : failure('validation', 'restaurant_not_found', 'Restaurant was not found');
  }
  return requestJson(
    `${getApiBaseUrl()}/restaurants/${encodeURIComponent(restaurantId)}`,
    normalizeRestaurant,
    { cache: 'no-store', signal: options.signal },
  );
}

export async function fetchRevisionedCart(options: { signal?: AbortSignal } = {}): Promise<ApiResult<RevisionedCart>> {
  if (getOrderlyDataMode() === 'local_demo') {
    return failure('validation', 'local_demo_no_api_cart', 'Local fixture preview uses an isolated browser basket');
  }
  return requestJson(
    `${getApiBaseUrl()}/cart`,
    normalizeRevisionedCart,
    { cache: 'no-store', signal: options.signal },
    true,
  );
}

export function saveRevisionedCart(
  expectedRevision: number,
  items: CartItem[],
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<RevisionedCart>> {
  if (getOrderlyDataMode() === 'local_demo') {
    return Promise.resolve(failure('validation', 'local_demo_no_api_cart', 'Local fixture preview uses an isolated browser basket'));
  }
  return enqueueCartMutation(() => requestJson(
    `${getApiBaseUrl()}/cart`,
    normalizeRevisionedCart,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ expected_revision: expectedRevision, items: items.map(toApiCartItem) }),
      signal: options.signal,
    },
    true,
  ));
}

export function clearRevisionedCart(
  expectedRevision: number,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<RevisionedCart>> {
  if (getOrderlyDataMode() === 'local_demo') {
    return Promise.resolve(failure('validation', 'local_demo_no_api_cart', 'Local fixture preview uses an isolated browser basket'));
  }
  return enqueueCartMutation(() => requestJson(
    `${getApiBaseUrl()}/cart`,
    normalizeRevisionedCart,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ expected_revision: expectedRevision }),
      signal: options.signal,
    },
    true,
  ));
}

// Temporary compatibility adapters for ST-09-owned checkout code. ST-08 pages use
// the typed revisioned functions above and never use local data as API fallback.
export async function fetchCart(): Promise<CartItem[] | undefined> {
  const result = await fetchRevisionedCart();
  return result.ok ? result.data.items : undefined;
}

export async function saveCart(items: CartItem[]): Promise<boolean> {
  const current = await fetchRevisionedCart();
  if (!current.ok) return false;
  const saved = await saveRevisionedCart(current.data.revision, items);
  return saved.ok;
}

export async function clearBackendCart(): Promise<boolean> {
  const current = await fetchRevisionedCart();
  if (!current.ok) return false;
  const cleared = await clearRevisionedCart(current.data.revision);
  return cleared.ok;
}

export async function resetGuestSession(): Promise<boolean> {
  if (getOrderlyDataMode() === 'local_demo') return false;
  const bootstrap = await bootstrapGuestSession();
  if (!bootstrap.ok) return false;
  try {
    const response = await fetchApi(`${getApiBaseUrl()}/session/reset`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    sessionBootstrap = response.ok ? Promise.resolve(success(true)) : undefined;
    return response.ok;
  } catch {
    sessionBootstrap = undefined;
    return false;
  }
}

interface ApiOrder {
  id: string;
  cart_items: Array<{
    id: string;
    restaurant_id: string;
    menu_item_id: string;
    name: string;
    quantity: number;
    base_price_cents: number;
    modifiers: Array<{ group_id: string; option_ids: string[] }>;
    special_instructions?: string;
  }>;
  subtotal_cents: number;
  status: Order['status'];
  created_at: string;
}

function normalizeLegacyOrderCartItem(input: ApiOrder['cart_items'][number]): CartItem {
  return {
    id: input.id,
    restaurantId: input.restaurant_id,
    menuItemId: input.menu_item_id,
    name: input.name,
    quantity: input.quantity,
    basePriceCents: input.base_price_cents,
    modifiers: input.modifiers.map(modifier => ({ groupId: modifier.group_id, optionIds: modifier.option_ids })),
    specialInstructions: input.special_instructions,
  };
}

export async function createBackendOrder(cartItems: CartItem[], subtotalCents: number, checkoutDetails?: CheckoutDetails): Promise<Order | undefined> {
  if (getOrderlyDataMode() === 'local_demo') return undefined;
  const responseResult = await fetchProtectedResponse(`${getApiBaseUrl()}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cart_items: cartItems.map(item => ({
        id: item.id,
        restaurant_id: item.restaurantId,
        menu_item_id: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        base_price_cents: item.basePriceCents,
        modifiers: item.modifiers.map(modifier => ({ group_id: modifier.groupId, option_ids: modifier.optionIds })),
        special_instructions: item.specialInstructions,
      })),
      subtotal_cents: subtotalCents,
      delivery_address: checkoutDetails?.street,
      customer_name: checkoutDetails?.name,
      customer_phone: checkoutDetails?.phone,
      customer_email: checkoutDetails?.email,
      tip_cents: checkoutDetails?.tipCents ?? 0,
    }),
  });
  if (!responseResult.ok || !responseResult.data.ok) return undefined;
  const payload = await readJson(responseResult.data);
  if (!isRecord(payload) || typeof payload.id !== 'string' || !Array.isArray(payload.cart_items)) return undefined;
  return normalizeOrder(payload as unknown as ApiOrder, checkoutDetails);
}

export async function fetchOrder(orderId: string): Promise<Order | undefined> {
  if (getOrderlyDataMode() === 'local_demo') return undefined;
  const responseResult = await fetchProtectedResponse(`${getApiBaseUrl()}/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
  if (!responseResult.ok || !responseResult.data.ok) return undefined;
  const payload = await readJson(responseResult.data);
  if (!isRecord(payload)) return undefined;
  return normalizeOrder(payload as unknown as ApiOrder);
}

export async function fetchOrders(): Promise<Order[] | undefined> {
  if (getOrderlyDataMode() === 'local_demo') return undefined;
  const responseResult = await fetchProtectedResponse(`${getApiBaseUrl()}/orders`, { cache: 'no-store' });
  if (!responseResult.ok || !responseResult.data.ok) return undefined;
  const payload = await readJson(responseResult.data);
  if (!Array.isArray(payload)) return undefined;
  return payload.map(order => normalizeOrder(order as ApiOrder));
}

function normalizeOrder(input: ApiOrder, checkoutDetails?: CheckoutDetails): Order {
  const cartItems = input.cart_items.map(normalizeLegacyOrderCartItem);
  const restaurantId = cartItems[0]?.restaurantId ?? localDemoRestaurants[0].id;
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
