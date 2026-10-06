import { restaurants as localDemoRestaurants } from './mock-data';
import type {
  ApiErrorKind,
  ApiFailure,
  ApiResult,
  CartItem,
  CheckoutDetails,
  CheckoutQuote,
  CheckoutRecovery,
  DataMode,
  MenuItem,
  ModifierGroup,
  OrderReceipt,
  OrderSubmission,
  ReceiptItemSnapshot,
  ReceiptModifierSnapshot,
  Restaurant,
  RevisionedCart,
} from './types';

const API_BASE_URL = '/api/orderly';
const API_TIMEOUT_MS = 5_000;
export const CHECKOUT_RECOVERY_STORAGE_KEY = 'orderlyapp.marketplace.checkoutRecovery.v1';
let sessionBootstrap: Promise<ApiResult<true>> | undefined;
let cartMutationTail: Promise<void> = Promise.resolve();
let guestScope = new AbortController();
let resettingGuest = false;

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

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
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
    status: response.status,
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
  if (resettingGuest) return failure('session', 'session_resetting', 'Guest session reset is in progress');
  const scope = guestScope;
  const signal = init.signal ? AbortSignal.any([scope.signal, init.signal]) : scope.signal;
  const bootstrap = await bootstrapGuestSession();
  if (!bootstrap.ok) return bootstrap;

  try {
    let response = await fetchApi(input, { ...init, signal });
    if (response.status !== 401) return success(response);

    const refreshed = await bootstrapGuestSession(true);
    if (!refreshed.ok) return refreshed;
    response = await fetchApi(input, { ...init, signal });
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
  const scope = guestScope;
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
  if (protectedRequest && scope.signal.aborted) {
    return failure('network', 'request_aborted', 'Request was superseded by a guest session reset');
  }
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

function normalizeTotals(input: unknown): CheckoutQuote['totals'] | undefined {
  if (!isRecord(input)) return undefined;
  const fields = [
    'subtotal_cents',
    'discount_cents',
    'delivery_fee_cents',
    'service_fee_cents',
    'tax_cents',
    'tip_cents',
    'total_cents',
  ] as const;
  if (fields.some(field => !isNonNegativeInteger(input[field]))) return undefined;
  if (Number(input.tip_cents) > 10_000) return undefined;
  return {
    subtotalCents: Number(input.subtotal_cents),
    discountCents: Number(input.discount_cents),
    deliveryFeeCents: Number(input.delivery_fee_cents),
    serviceFeeCents: Number(input.service_fee_cents),
    taxCents: Number(input.tax_cents),
    tipCents: Number(input.tip_cents),
    totalCents: Number(input.total_cents),
  };
}

function normalizeCheckoutQuote(payload: unknown): CheckoutQuote | undefined {
  if (!isRecord(payload) || payload.schema_version !== 1 || !isNonNegativeInteger(payload.cart_revision)) return undefined;
  if (typeof payload.catalog_fingerprint !== 'string' || payload.catalog_fingerprint.length < 1 || payload.catalog_fingerprint.length > 128) return undefined;
  const totals = normalizeTotals(payload.totals);
  if (!totals) return undefined;
  return {
    schemaVersion: 1,
    cartRevision: Number(payload.cart_revision),
    catalogFingerprint: payload.catalog_fingerprint,
    totals,
  };
}

function normalizeReceiptModifier(input: unknown): ReceiptModifierSnapshot | undefined {
  if (!isRecord(input) || typeof input.group_id !== 'string' || typeof input.name !== 'string' || !Array.isArray(input.options)) return undefined;
  const options = input.options.map(option => {
    if (!isRecord(option) || typeof option.id !== 'string' || typeof option.name !== 'string' || !isNonNegativeInteger(option.price_delta_cents)) return undefined;
    return { id: option.id, name: option.name, priceDeltaCents: Number(option.price_delta_cents) };
  });
  if (options.some(option => option === undefined)) return undefined;
  return { groupId: input.group_id, name: input.name, options: options as ReceiptModifierSnapshot['options'] };
}

function normalizeReceiptItem(input: unknown): ReceiptItemSnapshot | undefined {
  if (!isRecord(input)) return undefined;
  if (
    typeof input.id !== 'string'
    || typeof input.restaurant_id !== 'string'
    || typeof input.menu_item_id !== 'string'
    || typeof input.name !== 'string'
    || !isPositiveInteger(input.unit_price_cents)
    || !Number.isInteger(input.quantity)
    || Number(input.quantity) < 1
    || Number(input.quantity) > 10
    || !isPositiveInteger(input.line_total_cents)
    || !Array.isArray(input.modifiers)
  ) return undefined;
  const modifiers = input.modifiers.map(normalizeReceiptModifier);
  if (modifiers.some(modifier => modifier === undefined)) return undefined;
  if (input.special_instructions !== undefined && input.special_instructions !== null && typeof input.special_instructions !== 'string') return undefined;
  return {
    id: input.id,
    restaurantId: input.restaurant_id,
    menuItemId: input.menu_item_id,
    name: input.name,
    unitPriceCents: Number(input.unit_price_cents),
    quantity: Number(input.quantity),
    lineTotalCents: Number(input.line_total_cents),
    modifiers: modifiers as ReceiptModifierSnapshot[],
    specialInstructions: typeof input.special_instructions === 'string' ? input.special_instructions : undefined,
  };
}

function normalizeCheckoutDetails(input: unknown): CheckoutDetails | undefined {
  if (!isRecord(input)) return undefined;
  const required = ['name', 'phone', 'email', 'street', 'city', 'state', 'postal_code'] as const;
  if (required.some(field => typeof input[field] !== 'string')) return undefined;
  if (input.apartment !== undefined && input.apartment !== null && typeof input.apartment !== 'string') return undefined;
  if (input.delivery_instructions !== undefined && input.delivery_instructions !== null && typeof input.delivery_instructions !== 'string') return undefined;
  if (input.payment_method !== 'mock' || !isNonNegativeInteger(input.tip_cents) || Number(input.tip_cents) > 10_000) return undefined;
  return {
    name: input.name as string,
    phone: input.phone as string,
    email: input.email as string,
    street: input.street as string,
    apartment: typeof input.apartment === 'string' ? input.apartment : undefined,
    city: input.city as string,
    state: input.state as string,
    postalCode: input.postal_code as string,
    deliveryInstructions: typeof input.delivery_instructions === 'string' ? input.delivery_instructions : undefined,
    paymentMethod: 'mock',
    tipCents: Number(input.tip_cents),
  };
}

function normalizeOrderReceipt(payload: unknown): OrderReceipt | undefined {
  if (!isRecord(payload) || payload.schema_version !== 1 || typeof payload.id !== 'string' || payload.status !== 'Placed') return undefined;
  if (typeof payload.created_at !== 'string' || Number.isNaN(Date.parse(payload.created_at)) || payload.pricing_version !== 'mock-v1') return undefined;
  if (!Array.isArray(payload.items)) return undefined;
  const items = payload.items.map(normalizeReceiptItem);
  if (items.some(item => item === undefined)) return undefined;
  const checkout = normalizeCheckoutDetails(payload.checkout);
  const totals = normalizeTotals(payload.totals);
  if (!checkout || !totals) return undefined;
  return {
    schemaVersion: 1,
    id: payload.id,
    status: 'Placed',
    createdAt: new Date(payload.created_at).toISOString(),
    items: items as ReceiptItemSnapshot[],
    checkout,
    totals,
    pricingVersion: 'mock-v1',
  };
}

function normalizeOrderReceiptList(payload: unknown): OrderReceipt[] | undefined {
  if (!Array.isArray(payload)) return undefined;
  const receipts = payload.map(normalizeOrderReceipt);
  return receipts.some(receipt => receipt === undefined) ? undefined : receipts as OrderReceipt[];
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

function toApiOrderSubmission(input: OrderSubmission): Record<string, unknown> {
  return {
    expected_revision: input.expectedRevision,
    catalog_fingerprint: input.catalogFingerprint,
    checkout: {
      name: input.checkout.name,
      phone: input.checkout.phone,
      email: input.checkout.email,
      street: input.checkout.street,
      ...(input.checkout.apartment ? { apartment: input.checkout.apartment } : {}),
      city: input.checkout.city,
      state: input.checkout.state,
      postal_code: input.checkout.postalCode,
      ...(input.checkout.deliveryInstructions ? { delivery_instructions: input.checkout.deliveryInstructions } : {}),
      payment_method: 'mock',
      tip_cents: input.checkout.tipCents,
    },
    ...(input.promotionCode ? { promotion_code: input.promotionCode } : {}),
  };
}

function enqueueCartMutation<T>(operation: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const scope = guestScope;
  const guarded = () => scope.signal.aborted
    ? Promise.resolve(failure('network', 'request_aborted', 'Request was superseded by a guest session reset'))
    : operation();
  const run = cartMutationTail.then(guarded, guarded);
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

export async function fetchCheckoutQuote(
  expectedRevision: number,
  tipCents: number,
  promotionCode?: 'DEMO5',
): Promise<ApiResult<CheckoutQuote>> {
  if (getOrderlyDataMode() === 'local_demo') {
    return failure('validation', 'local_demo_checkout_unavailable', 'Checkout is unavailable in fixture preview');
  }
  return requestJson(
    `${getApiBaseUrl()}/checkout/quote`,
    normalizeCheckoutQuote,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        expected_revision: expectedRevision,
        tip_cents: tipCents,
        ...(promotionCode ? { promotion_code: promotionCode } : {}),
      }),
    },
    true,
  );
}

export async function submitCheckoutOrder(
  idempotencyKey: string,
  submission: OrderSubmission,
): Promise<ApiResult<OrderReceipt>> {
  if (getOrderlyDataMode() === 'local_demo') {
    return failure('validation', 'local_demo_checkout_unavailable', 'Checkout is unavailable in fixture preview');
  }

  const result = await requestJson(
    `${getApiBaseUrl()}/orders`,
    normalizeOrderReceipt,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(toApiOrderSubmission(submission)),
    },
    true,
  );

  // A server/receipt-shape error cannot prove that the checkout did not commit.
  if (!result.ok && ((result.error.status ?? 0) >= 500 || result.error.code === 'invalid_response')) {
    return { ...result, kind: 'network' };
  }
  return result;
}

export async function fetchOrderReceipt(orderId: string): Promise<ApiResult<OrderReceipt>> {
  if (getOrderlyDataMode() === 'local_demo') {
    return failure('validation', 'local_demo_orders_unavailable', 'Order receipts are unavailable in fixture preview');
  }
  return requestJson(
    `${getApiBaseUrl()}/orders/${encodeURIComponent(orderId)}`,
    payload => {
      const receipt = normalizeOrderReceipt(payload);
      return receipt?.id.toLowerCase() === orderId.toLowerCase() ? receipt : undefined;
    },
    { cache: 'no-store' },
    true,
  );
}

export async function fetchOrderReceipts(
  options: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<ApiResult<OrderReceipt[]>> {
  if (getOrderlyDataMode() === 'local_demo') {
    return failure('validation', 'local_demo_orders_unavailable', 'Order history is unavailable in fixture preview');
  }
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  if (options.cursor !== undefined) query.set('cursor', options.cursor);
  const search = query.size ? `?${query}` : '';
  return requestJson(
    `${getApiBaseUrl()}/orders${search}`,
    normalizeOrderReceiptList,
    { cache: 'no-store', signal: options.signal },
    true,
  );
}

function isStoredCheckoutDetails(value: unknown): value is CheckoutDetails {
  if (!isRecord(value)) return false;
  const required = ['name', 'phone', 'email', 'street', 'city', 'state', 'postalCode', 'paymentMethod'] as const;
  if (required.some(field => typeof value[field] !== 'string')) return false;
  if (value.apartment !== undefined && typeof value.apartment !== 'string') return false;
  if (value.deliveryInstructions !== undefined && typeof value.deliveryInstructions !== 'string') return false;
  return value.paymentMethod === 'mock' && isNonNegativeInteger(value.tipCents) && Number(value.tipCents) <= 10_000;
}

function isStoredOrderSubmission(value: unknown): value is OrderSubmission {
  if (!isRecord(value) || !isNonNegativeInteger(value.expectedRevision)) return false;
  if (typeof value.catalogFingerprint !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value.catalogFingerprint)) return false;
  if (!isStoredCheckoutDetails(value.checkout)) return false;
  return value.promotionCode === undefined || value.promotionCode === 'DEMO5';
}

function isStoredCheckoutRecovery(value: unknown): value is CheckoutRecovery {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.idempotencyKey === 'string'
    && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.idempotencyKey)
    && isStoredOrderSubmission(value.submission);
}

export function loadCheckoutRecovery(storage: Storage | undefined): CheckoutRecovery | null | undefined {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CHECKOUT_RECOVERY_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    return isStoredCheckoutRecovery(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCheckoutRecovery(storage: Storage | undefined, recovery: CheckoutRecovery): boolean {
  if (!storage) return false;
  if (!isStoredCheckoutRecovery(recovery)) return false;
  try {
    storage.setItem(CHECKOUT_RECOVERY_STORAGE_KEY, JSON.stringify(recovery));
    return true;
  } catch {
    return false;
  }
}

export function clearCheckoutRecovery(storage: Storage | undefined): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(CHECKOUT_RECOVERY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function resetGuestSession(): Promise<boolean> {
  if (getOrderlyDataMode() === 'local_demo' || resettingGuest) return false;
  resettingGuest = true;
  guestScope.abort();
  try {
    const bootstrap = await bootstrapGuestSession();
    if (!bootstrap.ok) return false;
    const response = await fetchApi(`${getApiBaseUrl()}/session/reset`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    sessionBootstrap = response.ok ? Promise.resolve(success(true)) : undefined;
    return response.ok;
  } catch {
    sessionBootstrap = undefined;
    return false;
  } finally {
    guestScope = new AbortController();
    resettingGuest = false;
  }
}
