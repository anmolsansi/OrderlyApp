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
}

export interface CartTotals {
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  taxCents: number;
  totalCents: number;
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
