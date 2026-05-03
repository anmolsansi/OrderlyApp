export type ModifierType = 'single' | 'multiple';

export interface ModifierOption {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  type: ModifierType;
  required?: boolean;
  minSelected?: number;
  maxSelected?: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageEmoji: string;
  popular?: boolean;
  modifierGroups: ModifierGroup[];
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  deliveryMinutes: string;
  deliveryFeeCents: number;
  imageEmoji: string;
  tags: string[];
  menu: MenuItem[];
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

export type OrderStatus = 'Placed' | 'Confirmed' | 'Preparing' | 'Out for delivery' | 'Delivered';

export interface OrderStatusStep {
  status: OrderStatus;
  label: string;
  description: string;
  etaMinutesFromOrder: number;
}

export interface Order {
  id: string;
  cartItems: CartItem[];
  subtotalCents: number;
  status: OrderStatus;
  createdAt: string;
}

export type VoiceIntentType = 'add_to_cart' | 'view_cart' | 'remove_item' | 'clear_cart' | 'unknown';

export interface VoiceIntent {
  type: VoiceIntentType;
  transcript: string;
  itemName?: string;
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
