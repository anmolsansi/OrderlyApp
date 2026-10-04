export type DataMode = 'api' | 'local_demo';
export type ApiErrorKind = 'validation' | 'conflict' | 'session' | 'network' | 'server';
export type CheckoutState = 'idle' | 'submitting' | 'uncertain' | 'accepted' | 'rejected';

export interface ApiErrorDetails {
  code: string;
  message: string;
  requestId?: string;
  fields?: string[];
  currentCart?: RevisionedCart;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  kind: ApiErrorKind;
  error: ApiErrorDetails;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type CustomizationSelectionType = 'single' | 'multiple';
export type ModifierType = CustomizationSelectionType;

export interface CustomizationOption {
  id: string;
  name: string;
  priceDeltaCents: number;
  available?: boolean;
}

export type ModifierOption = CustomizationOption;

export interface CustomizationGroup {
  id: string;
  name: string;
  type: CustomizationSelectionType;
  required?: boolean;
  minSelected?: number;
  maxSelected?: number;
  defaultOptionId?: string;
  options: CustomizationOption[];
}

export type ModifierGroup = CustomizationGroup;

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageEmoji: string;
  popular?: boolean;
  available?: boolean;
  modifierGroups: CustomizationGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  items: MenuItem[];
}

export type RestaurantStatus = 'open' | 'closed';

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  deliveryMinutes: string;
  deliveryFeeCents: number;
  serviceFeeCents?: number;
  distanceMiles: number;
  imageEmoji: string;
  imageAlt: string;
  isOpen: boolean;
  tags: string[];
  menuCategories: MenuCategory[];
  menu: MenuItem[];
  promotion?: string;
  status?: RestaurantStatus;
  imageAvailable?: boolean;
  outsideDeliveryRange?: boolean;
}

export interface CartItemModifier {
  groupId: string;
  optionIds: string[];
}

export interface CartItem {
  id: string;
  restaurantId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  basePriceCents: number;
  modifiers: CartItemModifier[];
  specialInstructions?: string;
}

export interface RevisionedCart {
  schemaVersion: 1;
  revision: number;
  items: CartItem[];
}

export interface CartConflictRecovery {
  currentCart: RevisionedCart;
  attemptedItems: CartItem[];
}

export interface CartTotals {
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  tipCents?: number;
  taxCents: number;
  totalCents: number;
}

export interface CheckoutDetails {
  name: string;
  phone: string;
  email: string;
  street: string;
  apartment?: string;
  city: string;
  state: string;
  postalCode: string;
  deliveryInstructions?: string;
  paymentMethod: string;
  tipCents: number;
}

export interface CheckoutQuote {
  schemaVersion: 1;
  cartRevision: number;
  catalogFingerprint: string;
  totals: CartTotals;
}

export interface ReceiptModifierOptionSnapshot {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface ReceiptModifierSnapshot {
  groupId: string;
  name: string;
  options: ReceiptModifierOptionSnapshot[];
}

export interface ReceiptItemSnapshot {
  id: string;
  restaurantId: string;
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  modifiers: ReceiptModifierSnapshot[];
  specialInstructions?: string;
}

export interface OrderReceipt {
  schemaVersion: 1;
  id: string;
  status: 'Placed';
  createdAt: string;
  items: ReceiptItemSnapshot[];
  checkout: CheckoutDetails;
  totals: CartTotals;
  pricingVersion: 'mock-v1';
}

export interface OrderSubmission {
  expectedRevision: number;
  catalogFingerprint: string;
  checkout: CheckoutDetails;
  promotionCode?: 'DEMO5';
}

export interface CheckoutRecovery {
  schemaVersion: 1;
  idempotencyKey: string;
  submission: OrderSubmission;
}

export interface DemoProfile {
  schemaVersion: 1;
  id: string;
  name: string;
  defaultAddressId: string;
}

export interface DemoAddress {
  id: string;
  label: string;
  street: string;
  apartment?: string;
  city: string;
  state: string;
  postalCode: string;
  deliveryInstructions?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  defaultAddressId: string;
  favoriteRestaurantIds: string[];
}

export interface Address {
  id: string;
  userId: string;
  label: string;
  street: string;
  apartment?: string;
  city: string;
  state: string;
  postalCode: string;
  deliveryInstructions?: string;
}

export type OrderStatus = 'Placed' | 'Confirmed' | 'Preparing' | 'Out for delivery' | 'Delivered' | 'Cancelled';

export interface OrderStatusStep {
  status: OrderStatus;
  label: string;
  description: string;
  etaMinutesFromOrder: number;
}

export interface Order {
  id: string;
  userId: string;
  restaurantId: string;
  cartItems: CartItem[];
  totals: CartTotals;
  subtotalCents: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  deliveryAddressId: string;
  estimatedDeliveryAt: string;
  checkoutDetails?: CheckoutDetails;
}

export type VoiceIntentType = 'add_to_cart' | 'select_restaurant' | 'view_cart' | 'remove_item' | 'clear_cart' | 'unknown';

export interface VoiceIntent {
  type: VoiceIntentType;
  transcript: string;
  itemName?: string;
  restaurantName?: string;
  size?: string;
  toppings?: string[];
  confidence: 'high' | 'medium' | 'low';
  clarification?: string;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
