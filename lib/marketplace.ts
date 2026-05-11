import { restaurants } from './mock-data';
import type { CartItem, CartItemModifier, MenuItem, Restaurant } from './types';

export const quickFilters = ['All pizza', 'Fast delivery', 'Top rated', 'Wood fired', 'Open late', 'Open now'];

export const discoveryCuisineFilters = ['All pizza', 'Vegan Pizza', 'NY style', 'Detroit style', 'Neapolitan', 'Fusion'];

export const discoveryMockStates = {
  loadingRows: [
    { id: 'image', width: '46%' },
    { id: 'title', width: '74%' },
    { id: 'metadata', width: '62%' },
    { id: 'tags', width: '88%' },
  ],
  empty: {
    title: 'No restaurants found',
    description: 'Show helpful reset actions when search and filters remove every seeded restaurant.',
  },
  error: {
    title: 'Discovery temporarily unavailable',
    description: 'Show a retry action and keep the selected search/filter context in view.',
  },
};

export const cuisineRoadmap = [
  { label: 'V1 Pizza', icon: '🍕', description: 'Pizza-only discovery, menus, crust/topping modifiers, cart, checkout, and live order status.' },
  { label: 'V2 All food', icon: '🍜', description: 'Reusable cuisine rails for burgers, sushi, tacos, dessert, groceries, and local favorites.' },
  { label: 'Marketplace', icon: '🛵', description: 'Personalized feeds, loyalty, bundles, group orders, scheduled delivery, and driver tracking.' },
];

export const featureSteps = [
  { title: 'Home', detail: 'Hero search, cuisine chips, famous restaurants, favorites, offers, and reorder prompts.' },
  { title: 'Restaurant list', detail: 'Filter by rating, speed, style, tags, delivery fee, and availability.' },
  { title: 'Menu', detail: 'Category sections, popular items, item cards, and upsell bundles.' },
  { title: 'Customize', detail: 'Reusable modifier groups for pizza toppings now and any cuisine later.' },
  { title: 'Checkout', detail: 'Cart review, address, fees, payment method, promo codes, and order notes.' },
  { title: 'Order placed', detail: 'Confirmation, progress timeline, ETA, receipt, and reorder CTA.' },
];

export const themeOptions = [
  { name: 'Midnight Market · Selected', swatch: '#111827', accent: '#22c55e', mood: 'Premium dark marketplace that can expand beyond pizza without changing layout.' },
  { name: 'Crimson Slice', swatch: '#ef4444', accent: '#f97316', mood: 'High-energy pizza brand with tomato, flame, and late-night delivery cues.' },
  { name: 'Fresh Mozzarella', swatch: '#fff7ed', accent: '#16a34a', mood: 'Light, family-friendly grocery-and-food style with clean cards and green trust signals.' },
];

export const favoriteRestaurantIds = ['marios-pizza', 'neapolitan-nova'];

export function getRestaurant(restaurantId: string): Restaurant | undefined {
  return restaurants.find(restaurant => restaurant.id === restaurantId);
}

export function getMenuItem(restaurantId: string, itemId: string): MenuItem | undefined {
  return getRestaurant(restaurantId)?.menu.find(item => item.id === itemId);
}

export function filterRestaurants(query = '', filter = 'All pizza'): Restaurant[] {
  const normalizedQuery = query.trim().toLowerCase();
  return restaurants.filter(restaurant => {
    const matchesSearch = normalizedQuery.length === 0
      || restaurant.name.toLowerCase().includes(normalizedQuery)
      || restaurant.cuisine.toLowerCase().includes(normalizedQuery)
      || restaurant.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))
      || restaurant.menu.some(item => item.name.toLowerCase().includes(normalizedQuery));
    const matchesFilter = filter === 'All pizza'
      || (filter === 'Fast delivery' && Number.parseInt(restaurant.deliveryMinutes, 10) <= 20)
      || (filter === 'Top rated' && restaurant.rating >= 4.8)
      || (filter === 'Open now' && restaurant.status !== 'closed')
      || restaurant.cuisine.toLowerCase() === filter.toLowerCase()
      || restaurant.tags.some(tag => tag.toLowerCase() === filter.toLowerCase());
    return matchesSearch && matchesFilter;
  });
}

export function getDefaultModifiers(item: MenuItem): CartItemModifier[] {
  return item.modifierGroups.map(group => ({
    groupId: group.id,
    optionIds: group.type === 'single' && group.options[0] ? [group.options[0].id] : [],
  }));
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

export function getCartSubtotal(cartItems: CartItem[]): number {
  return cartItems.reduce((sum, cartItem) => {
    const item = getMenuItem(cartItem.restaurantId, cartItem.menuItemId);
    if (!item) return sum + cartItem.basePriceCents * cartItem.quantity;
    return sum + getItemTotal(item, cartItem.modifiers) * cartItem.quantity;
  }, 0);
}
