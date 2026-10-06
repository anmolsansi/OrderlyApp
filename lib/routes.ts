export type AppRouteKey =
  | 'home'
  | 'restaurants'
  | 'restaurantMenu'
  | 'itemCustomization'
  | 'cart'
  | 'checkout'
  | 'orderConfirmation'
  | 'orderHistory'
  | 'signIn'
  | 'account';

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
    navigation: 'Search submits to /restaurants; restaurant cards link to the selected restaurant menu while preserving the accepted guest basket.',
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
    navigation: 'Menu item cards link to /restaurants/:restaurantId/items/:itemId; cart CTA links to checkout without clearing backend cart state.',
  },
  {
    key: 'itemCustomization',
    path: '/restaurants/:restaurantId/items/:itemId',
    params: ['restaurantId', 'itemId'],
    responsibility: 'Let the customer choose required/optional modifiers, quantity, and instructions before adding a menu item to cart.',
    layout: ['Global marketplace nav', 'Item preview', 'Modifier groups', 'Quantity controls', 'Sticky add-to-cart action on small screens'],
    navigation: 'API add advances to /cart only after server acceptance; failed intent remains a separate draft. Fixture preview uses its own basket; invalid params show item-not-found.',
  },
  {
    key: 'cart',
    path: '/cart',
    responsibility: 'Review cart contents, edit quantities, remove items, clear cart, and continue to checkout.',
    layout: ['Global marketplace nav', 'Cart item list', 'Totals summary', 'Checkout call to action'],
    navigation: 'API cart actions display server-accepted revisions and explicit conflicts. Checkout is available only in API mode with a valid basket.',
  },
  {
    key: 'checkout',
    path: '/checkout',
    responsibility: 'Review cart contents, update quantities, clear cart, choose mock address/payment details, and submit a mock order.',
    layout: ['Global marketplace nav', 'Cart review panel', 'Order totals', 'Payment/address review panel', 'Primary place-order action'],
    navigation: 'A saved recovery key/body precedes the order POST; acceptance opens the exact receipt and refetches the cleared basket. Uncertain results require same-key retry. Fixture preview cannot checkout.',
  },
  {
    key: 'orderConfirmation',
    path: '/order-confirmation?orderId=:orderId',
    params: ['orderId'],
    responsibility: 'Display the exact saved mock receipt and provide history and browsing links.',
    layout: ['Global marketplace nav', 'Confirmation hero', 'Immutable receipt', 'History and browse actions'],
    navigation: 'Fetches only the requested guest-owned orderId; unknown IDs show not found and API errors remain errors. Fixture preview receipts are unavailable.',
  },
  {
    key: 'orderHistory',
    path: '/orders',
    responsibility: 'List saved receipts owned by the current private browser guest.',
    layout: ['Global marketplace nav', 'Order list', 'Exact receipt links', 'Empty history state'],
    navigation: 'Bootstraps the guest session before reading its scoped history. Fixture preview history is unavailable.',
  },
  {
    key: 'signIn',
    path: '/sign-in?next=:next',
    params: ['next'],
    responsibility: 'Choose a password-free synthetic display profile without changing server guest ownership.',
    layout: ['Global marketplace nav', 'Demo profile form', 'Profile and storage status'],
    navigation: 'Stores validated local presentation data and returns only to an allowed internal route; blocked storage has an explicit temporary recovery path.',
  },
  {
    key: 'account',
    path: '/account',
    responsibility: 'View/reset the demo display profile and choose synthetic addresses.',
    layout: ['Global marketplace nav', 'Profile card', 'Saved addresses', 'Address form'],
    navigation: 'Missing presentation profiles link to demo profile selection; resetting presentation does not change the private guest.',
  },
];

const RETURN_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/restaurants$/,
  /^\/restaurants\/[A-Za-z0-9._~-]+$/,
  /^\/restaurants\/[A-Za-z0-9._~-]+\/items\/[A-Za-z0-9._~-]+$/,
  /^\/cart$/,
  /^\/checkout$/,
  /^\/order-confirmation$/,
  /^\/orders$/,
  /^\/account$/,
] as const;

const ENCODED_PATH_SEPARATOR_OR_TRAVERSAL = /%(?:2f|5c|2e|00|09|0a|0d)/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const RETURN_ROUTE_BASE = 'https://orderly.invalid';

export function sanitizeAppReturnPath(value: string | null | undefined, fallback = '/account'): string {
  if (!value || value !== value.trim()) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\') || CONTROL_CHARACTER.test(value) || ENCODED_PATH_SEPARATOR_OR_TRAVERSAL.test(value)) {
    return fallback;
  }

  try {
    const parsed = new URL(value, RETURN_ROUTE_BASE);
    if (parsed.origin !== RETURN_ROUTE_BASE || parsed.hash) return fallback;
    if (!RETURN_ROUTE_PATTERNS.some(pattern => pattern.test(parsed.pathname))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

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
  cart: '/cart',
  checkout: '/checkout',
  orderConfirmation: (orderId?: string) => orderId ? `/order-confirmation?orderId=${encodeURIComponent(orderId)}` : '/order-confirmation',
  orderHistory: '/orders',
  signIn: (next?: string) => next ? `/sign-in?next=${encodeURIComponent(sanitizeAppReturnPath(next))}` : '/sign-in',
  account: '/account',
} as const;