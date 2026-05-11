export type AppRouteKey =
  | 'home'
  | 'restaurants'
  | 'restaurantMenu'
  | 'itemCustomization'
  | 'checkout'
  | 'orderConfirmation'
  | 'orderHistory';

export interface AppRouteDefinition {
  key: AppRouteKey;
  path: string;
  params?: string[];
  responsibility: string;
  layout: string[];
  navigation: string;
}

export const appRoutes: AppRouteDefinition[] = [
  {
    key: 'home',
    path: '/',
    responsibility: 'Introduce the marketplace, collect restaurant/menu search intent, surface featured restaurants, favorites, and the screen-path overview.',
    layout: ['Global marketplace nav', 'Hero search', 'Restaurant/favorites rails', 'Flow and theme overview'],
    navigation: 'Search submits to /restaurants; restaurant cards link to the selected restaurant menu while preserving cart state in local storage.',
  },
  {
    key: 'restaurants',
    path: '/restaurants?query=:query&filter=:filter',
    params: ['query', 'filter'],
    responsibility: 'Display searchable and filterable restaurant results with delivery, rating, tags, and menu entry points.',
    layout: ['Global marketplace nav', 'Desktop filter sidebar', 'Mobile-first results list', 'Search form'],
    navigation: 'Filter chips and search reload this route with query params; result cards link to /restaurants/:restaurantId.',
  },
  {
    key: 'restaurantMenu',
    path: '/restaurants/:restaurantId',
    params: ['restaurantId'],
    responsibility: 'Show restaurant context, menu categories, menu items, and cart entry point for the active restaurant.',
    layout: ['Global marketplace nav', 'Restaurant hero', 'Category tabs', 'Menu item grid', 'Cart CTA'],
    navigation: 'Menu item cards link to /restaurants/:restaurantId/items/:itemId; cart CTA links to checkout without clearing local cart state.',
  },
  {
    key: 'itemCustomization',
    path: '/restaurants/:restaurantId/items/:itemId',
    params: ['restaurantId', 'itemId'],
    responsibility: 'Let the customer choose required/optional modifiers, quantity, and instructions before adding a menu item to cart.',
    layout: ['Global marketplace nav', 'Item preview', 'Modifier groups', 'Quantity controls', 'Sticky add-to-cart action on small screens'],
    navigation: 'Successful add writes a cart item to local storage and advances to /checkout; invalid params show an item-not-found recovery state.',
  },
  {
    key: 'checkout',
    path: '/checkout',
    responsibility: 'Review cart contents, update quantities, clear cart, choose mock address/payment details, and submit a mock order.',
    layout: ['Global marketplace nav', 'Cart review panel', 'Order totals', 'Payment/address review panel', 'Primary place-order action'],
    navigation: 'Place order writes the mock order, clears the cart, and navigates to /order-confirmation; empty carts link back to restaurant discovery.',
  },
  {
    key: 'orderConfirmation',
    path: '/order-confirmation?orderId=:orderId',
    params: ['orderId'],
    responsibility: 'Confirm submitted order details, show the delivery progress timeline, and provide browse/reorder next actions.',
    layout: ['Global marketplace nav', 'Confirmation hero', 'Status timeline', 'Browse and reorder actions'],
    navigation: 'Reads the most recent mock order from local storage today; future API-backed work should hydrate by orderId when present.',
  },
  {
    key: 'orderHistory',
    path: '/orders',
    responsibility: 'Future saved-account entry point for past orders and reorders.',
    layout: ['Global marketplace nav', 'Order list', 'Reorder actions', 'Empty history state'],
    navigation: 'Primary nav Orders links to confirmation for the current MVP; /orders is reserved for the authenticated history flow.',
  },
];

export const routes = {
  home: '/',
  restaurants: (params?: { query?: string; filter?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.set('query', params.query);
    if (params?.filter) searchParams.set('filter', params.filter);
    const queryString = searchParams.toString();
    return queryString ? `/restaurants?${queryString}` : '/restaurants';
  },
  restaurant: (restaurantId: string) => `/restaurants/${restaurantId}`,
  item: (restaurantId: string, itemId: string) => `/restaurants/${restaurantId}/items/${itemId}`,
  checkout: '/checkout',
  orderConfirmation: (orderId?: string) => orderId ? `/order-confirmation?orderId=${encodeURIComponent(orderId)}` : '/order-confirmation',
  orderHistory: '/orders',
} as const;
