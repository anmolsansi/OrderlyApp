import {
  calculateCartSubtotal,
  calculateItemTotal,
  findMenuItem,
  findRestaurant,
  getDefaultModifiers as getSeedDefaultModifiers,
  mockUserProfile,
  restaurants,
} from './mock-data';
import type { CartItem, CartItemModifier, MenuItem, Restaurant } from './types';

export const quickFilters = ['All pizza', 'Fast delivery', 'Top rated', 'Wood fired', 'Open late', 'Open now'];

export const discoveryCuisineFilters = ['All pizza', 'Vegan Pizza', 'NY style', 'Detroit style', 'Neapolitan', 'Fusion'];

export type RestaurantSort = 'recommended' | 'rating' | 'eta' | 'fee' | 'distance';

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

export const favoriteRestaurantIds = mockUserProfile.favoriteRestaurantIds;

export function getRestaurant(restaurantId: string): Restaurant | undefined {
  return findRestaurant(restaurantId);
}

export function getMenuItem(restaurantId: string, itemId: string): MenuItem | undefined {
  return findMenuItem(restaurantId, itemId);
}

function parseDeliveryMinutes(deliveryMinutes: string): number {
  const firstNumber = deliveryMinutes.match(/\d+/)?.[0];
  return firstNumber ? Number.parseInt(firstNumber, 10) : Number.MAX_SAFE_INTEGER;
}

export function sortRestaurants(restaurantsToSort: Restaurant[], sort: RestaurantSort = 'recommended'): Restaurant[] {
  const sorted = [...restaurantsToSort];

  if (sort === 'rating') return sorted.sort((left, right) => right.rating - left.rating);
  if (sort === 'eta') return sorted.sort((left, right) => parseDeliveryMinutes(left.deliveryMinutes) - parseDeliveryMinutes(right.deliveryMinutes));
  if (sort === 'fee') return sorted.sort((left, right) => left.deliveryFeeCents - right.deliveryFeeCents);
  if (sort === 'distance') return sorted.sort((left, right) => left.distanceMiles - right.distanceMiles);

  return sorted.sort((left, right) => {
    if (left.isOpen !== right.isOpen) return left.isOpen ? -1 : 1;
    return right.rating - left.rating;
  });
}

export function filterRestaurants(query = '', filter = 'All restaurants', sort: RestaurantSort = 'recommended'): Restaurant[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = restaurants.filter(restaurant => {
    const matchesSearch = normalizedQuery.length === 0
      || restaurant.name.toLowerCase().includes(normalizedQuery)
      || restaurant.cuisine.toLowerCase().includes(normalizedQuery)
      || restaurant.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))
      || restaurant.menuCategories.some(category => category.name.toLowerCase().includes(normalizedQuery))
      || restaurant.menu.some(item => item.name.toLowerCase().includes(normalizedQuery));
    const matchesFilter = filter === 'All restaurants'
      || filter === 'All pizza'
      || (filter === 'Fast delivery' && Number.parseInt(restaurant.deliveryMinutes, 10) <= 20)
      || (filter === 'Top rated' && restaurant.rating >= 4.8)
      || (filter === 'Open now' && restaurant.status !== 'closed')
      || restaurant.cuisine.toLowerCase() === filter.toLowerCase()
      || restaurant.tags.some(tag => tag.toLowerCase() === filter.toLowerCase());
    return matchesSearch && matchesFilter;
  });

  return sortRestaurants(filtered, sort);
}

export function getDefaultModifiers(item: MenuItem): CartItemModifier[] {
  return getSeedDefaultModifiers(item);
}

export function getItemTotal(item: MenuItem, modifiers: CartItemModifier[]): number {
  return calculateItemTotal(item, modifiers);
}

export function getCartSubtotal(cartItems: CartItem[]): number {
  return calculateCartSubtotal(cartItems);
}
