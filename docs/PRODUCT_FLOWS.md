# OrderlyApp — Product Scope, Routes, and User Flows

This document defines the stable product target for the restaurant ordering app. It reflects the current Next.js App Router implementation and the near-term scope required before production API work.

## 1. Product Scope

### In scope for the ordering MVP
- Restaurant discovery with search and quick filters.
- Restaurant menu browsing with menu categories and item cards.
- Item customization with required single-select modifiers, optional multi-select modifiers, quantity, and special instructions.
- Local cart persistence while moving between restaurant, menu, item, cart, checkout, and confirmation screens.
- Cart review with quantity edits, clear-cart behavior, subtotal/fee/discount/total summary, and an empty-cart recovery path.
- Mock checkout with saved address/payment placeholders and explicit no-real-payment behavior.
- Mock order confirmation with a status timeline and browse/reorder next actions.
- Voice and typed command assistance as a visual-control complement, not as the only ordering path.

### Out of scope for this issue
- Production API implementation or payment processing.
- Account creation, full authentication, and saved profile persistence.
- Driver dispatch, real ETA updates, refunds, support chat, or live order cancellation.
- A complete `/orders` implementation; the route is reserved as the order-history entry point.

## 2. Existing App Audit

### Routes currently implemented
- `/` is implemented by `app/page.tsx` and acts as the marketplace home page.
- `/restaurants` is implemented by `app/restaurants/page.tsx` and reads `query` and `filter` search params.
- `/restaurants/[restaurantId]` is implemented by `app/restaurants/[restaurantId]/page.tsx` and uses `restaurantId` as the restaurant slug/ID.
- `/restaurants/[restaurantId]/items/[itemId]` is implemented by `app/restaurants/[restaurantId]/items/[itemId]/page.tsx` and uses `restaurantId` plus `itemId` to customize a menu item.
- `/checkout` is implemented by `app/checkout/page.tsx` and reads/writes local cart state.
- `/order-confirmation` is implemented by `app/order-confirmation/page.tsx` and reads the most recent local mock order.

### Shared structure and components
- `app/layout.tsx` provides the root HTML shell and metadata.
- `app/components/MarketplaceNav.tsx` provides the shared top navigation with Home, Search, Menu, Cart, and Orders entries.
- `app/globals.css` owns the responsive marketplace visual system, page layouts, cards, buttons, form controls, and flow-specific panels.

### State management
- Cart state currently persists in browser `localStorage` under `orderlyapp.marketplace.cart.v1`.
- The latest mock order persists in browser `localStorage` under `orderlyapp.marketplace.order.v1`.
- Special instructions persist in browser `localStorage` under `orderlyapp.marketplace.note.v1`.
- Checkout and item customization are client components because they read/write browser storage and use client-side navigation.

### Data loading patterns
- Mock restaurants, menus, modifier groups, and order status steps are loaded from `lib/mock-data.ts`.
- Marketplace selectors and pricing helpers live in `lib/marketplace.ts`.
- Cart validation and mock order ID helpers live in `lib/cart.ts`.
- Domain TypeScript interfaces and money formatting live in `lib/types.ts`.
- Route metadata and href builders live in `lib/routes.ts` so follow-up route work has one canonical map.

## 3. Route Map

| Route | Params | Responsibility | Required layout elements | Navigation behavior |
| --- | --- | --- | --- | --- |
| `/` | none | Introduce the marketplace, collect search intent, show featured restaurants/favorites, and explain the screen path. | Global nav, hero search, quick filters, restaurant rails, flow overview. | Search submits to `/restaurants`; restaurant cards open restaurant menu pages; cart state remains in local storage. |
| `/restaurants` | `query`, `filter` | Show searchable/filterable restaurant results with delivery details and tags. | Global nav, desktop filter panel, search form, result cards, empty-results state in future work. | Filter chips/search update query params; result cards navigate to `/restaurants/:restaurantId`. |
| `/restaurants/:restaurantId` | `restaurantId` | Show restaurant identity, delivery metadata, menu categories, and menu item cards. | Global nav, restaurant hero, category tabs, menu grid, cart CTA. | Item cards navigate to `/restaurants/:restaurantId/items/:itemId`; cart CTA opens `/checkout`. |
| `/restaurants/:restaurantId/items/:itemId` | `restaurantId`, `itemId` | Customize a menu item before adding it to cart. | Global nav, item preview, modifier groups, quantity controls, notes field, add-to-cart CTA. | Add-to-cart writes local cart item and routes to `/checkout`; invalid params show recovery UI. |
| `/checkout` | none | Review cart, edit quantities, clear cart, review mock address/payment, and submit a mock order. | Global nav, cart lines, empty-cart state, totals, address/payment panel, place-order CTA. | Place order writes the mock order, clears cart, and routes to `/order-confirmation`; empty cart links to discovery. |
| `/order-confirmation` | future `orderId` | Confirm submitted order, show progress timeline, and offer browse/reorder next actions. | Global nav, confirmation hero, status timeline, next-action buttons. | Reads latest local mock order today; future API flow should hydrate by `orderId`. |
| `/orders` | none | Reserved secondary entry point for saved-account order history. | Global nav, order list, reorder controls, empty-history state. | Not implemented in the current UI; nav keeps Orders pointed at confirmation until history exists. |

## 4. Primary User Flow

1. **Browse restaurants**: Customer lands on `/`, reviews featured restaurants or enters a search term.
2. **Search/filter restaurants**: Customer moves to `/restaurants` with optional `query` and `filter` params, then selects a restaurant card.
3. **View menu**: Customer lands on `/restaurants/:restaurantId`, reviews restaurant metadata and menu items.
4. **Customize item**: Customer opens `/restaurants/:restaurantId/items/:itemId`, chooses required modifiers, optional toppings, quantity, and notes.
5. **Add to cart**: Customer taps the primary add-to-cart action; the cart item is written to local storage and checkout opens.
6. **Review cart**: Customer reviews line items, adjusts quantities, clears the cart if needed, and confirms totals.
7. **Checkout**: Customer verifies saved mock address, drop-off instructions, mock payment method, and delivery window.
8. **Submit order**: Customer taps Place order; the app stores a mock order, empties the cart, and navigates to confirmation.
9. **View confirmation**: Customer sees the mock order ID, total/item count, progress timeline, and browse/reorder next actions.

## 5. Secondary User Flows

### Search and filter restaurants
1. Customer submits a search from `/` or `/restaurants`.
2. App routes to `/restaurants?query=:query` and filters by restaurant name, tag, or menu item.
3. Customer can combine a quick filter with the search term via `/restaurants?query=:query&filter=:filter`.
4. Future empty results should explain no matches and provide a clear reset action.

### Edit cart item quantity
1. Customer opens `/checkout` with at least one cart line.
2. Customer taps `+` or `-` on a line item.
3. Quantity updates immediately, never drops below 1, and totals recalculate.
4. Updated cart state is saved back to local storage.

### Remove item / clear cart
1. Current UI supports clearing the whole cart from `/checkout`.
2. Follow-up item-level removal should add a remove control to each cart line.
3. If the final item is removed, checkout should switch to the empty-cart recovery state with a Browse restaurants CTA.

### Auth prompt
1. Guest checkout remains allowed for the MVP.
2. Account-only features should show a lightweight prompt only when the user asks for saved addresses, saved payments, loyalty, or order history.
3. Prompt should preserve the current route and cart state so the customer can continue after sign-in or dismiss the prompt.

### Saved address selection
1. Checkout shows a default mock saved address today.
2. Future saved-address selector should open from the checkout address block.
3. Selecting an address updates delivery fee/window estimates without mutating cart items.
4. If no saved address exists, show an add-address prompt and keep Place order disabled until a valid delivery address exists.

### Order history entry point
1. Primary nav exposes an Orders entry today, currently mapped to the confirmation screen.
2. Future `/orders` should list previous orders for authenticated customers.
3. A reorder action should rebuild a cart from an existing order, then route to `/checkout` for review before submission.

## 6. Required Domain Entities

| Entity | Purpose | Current source / future notes |
| --- | --- | --- |
| Restaurant | Represents a storefront with name, cuisine, rating, delivery fee/window, tags, image cue, and menu. | `Restaurant` in `lib/types.ts`; seeded in `lib/mock-data.ts`. |
| Menu category | Groups menu items into scannable sections such as Popular, Pizza, Sides, Drinks, and Dessert. | Currently static category labels on the menu page; future data should own categories. |
| Menu item | Represents an orderable item with price, description, popularity, image cue, and modifier groups. | `MenuItem` in `lib/types.ts`; seeded in `lib/mock-data.ts`. |
| Customization group | Defines required/optional modifier groups such as size, crust, and toppings. | `ModifierGroup` and `ModifierOption` in `lib/types.ts`. |
| Cart item | Stores selected restaurant, menu item, quantity, base price, and selected modifiers. | `CartItem` in `lib/types.ts`; persisted locally for MVP. |
| Customer profile | Stores identity, contact, saved addresses, saved payment references, and preferences. | Future mock entity needed before auth/saved account work. |
| Address | Stores delivery location, instructions, validation status, and delivery-zone metadata. | Future mock entity needed; checkout has a static address placeholder today. |
| Order | Stores submitted cart snapshot, totals, status, timestamps, restaurant, and customer/address references. | `Order` in `lib/types.ts` is minimal; confirmation stores a simplified local order today. |
| Payment summary | Stores subtotal, fees, discount, tax, tip, total, and payment display label. | Calculated inline in checkout today; should become a mock entity/helper before API work. |

## 7. UI Behavior Requirements

### Flow clarity
- Every screen keeps the global marketplace nav visible.
- Page headings should identify the current step: discovery, results, menu, customize, checkout, or order placed.
- Primary CTAs should advance the customer one step at a time.
- Recovery CTAs should always point back to the safest previous step, usually restaurant discovery or checkout.

### Desktop assumptions
- Discovery/results screens can show navigation, filters, and content together.
- Menu pages can use grid layouts for item scanning.
- Checkout should keep cart review and payment/address review visible side-by-side when space allows.

### Mobile assumptions
- Each screen should emphasize one primary action.
- Item customization and checkout should keep the final Add/Place action easy to reach, ideally as a sticky or bottom action.
- Filter controls should collapse or stack above results rather than crowding result cards.

### Cart-state preservation
- Moving between restaurant, item, checkout, and confirmation must not clear cart state except successful order submission or explicit clear-cart action.
- Refreshing checkout should restore cart state from local storage.
- Future API/session cart work should keep the same route behavior while replacing local storage with server/session persistence.

## 8. Edge Cases to Preserve for Follow-up Implementation

- **Empty restaurant catalog**: Show an empty discovery/results state with a retry/reset action and avoid blank rails.
- **No restaurant search results**: Show no matches, retain the search term/filter, and offer clear filters.
- **Restaurant unavailable or closed**: Keep the menu readable, disable add-to-cart, and explain availability/next open time.
- **Unknown restaurant route**: Return the framework not-found route or a friendly recovery screen.
- **Menu item unavailable**: Disable add-to-cart from menu cards and item customization, and explain that the item is unavailable.
- **Unknown item route**: Show the current item-not-found recovery state and link back to discovery/menu.
- **Cart emptied while navigating**: Checkout should switch to the empty-cart state and disable Place order.
- **One-restaurant cart conflict**: Prevent accidental cross-restaurant ordering or prompt the user to replace the current cart.
- **Mobile browser refresh during checkout**: Restore cart/order draft from storage and keep the customer on checkout when possible.
- **Malformed local storage**: Future hardening should safely reset corrupt cart/order data without crashing the page.

## 9. Voice Capture + Transcript Flow

1. User taps microphone / voice action.
2. Browser Web Speech API listens if supported.
3. App displays live transcript.
4. Parser turns transcript into a visible intent.
5. App confirms interpreted action in assistant panel.
6. Action executes only when confidence/action is clear enough.
7. Unsupported browsers fall back to mock/text command mode.

## 10. Error Correction Flow

1. If a command is ambiguous, app does not mutate cart.
2. Assistant asks a specific clarification.
3. User can retry voice or use visual controls.
4. If parser picks the wrong item/modifier, user can correct through UI.
5. Every failed or corrected attempt remains visible in the assistant panel.

## 11. Accessibility Requirements

- All interactive controls must be keyboard reachable.
- Buttons need visible labels and focus states.
- Voice actions must have visual equivalents.
- Color cannot be the only state indicator.
- Assistant responses should be readable as text.
- Checkout must clearly say mock/non-payment.
- Cart mutations should provide visible confirmation.
