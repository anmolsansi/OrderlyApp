# OrderlyApp — Product Scope, Routes, and User Flows

This document defines the stable product target for the restaurant ordering app. It reflects the current Next.js App Router implementation with FastAPI-backed restaurant, cart, checkout, and order lookup paths plus local fallback behavior for demo resilience.

## 1. Product Scope

### In scope for the ordering MVP
- Restaurant discovery with search and quick filters.
- Restaurant menu browsing with menu categories and item cards.
- Item customization with required single-select modifiers, optional multi-select modifiers, quantity, and special instructions.
- Backend-backed cart persistence while moving between restaurant, menu, item, cart, checkout, and confirmation screens, with local fallback if the API is unavailable.
- Cart review with quantity edits, clear-cart behavior, subtotal/fee/discount/total summary, and an empty-cart recovery path.
- Mock checkout with saved address/payment placeholders and explicit no-real-payment behavior.
- Backend-created mock order confirmation with a status timeline and browse/reorder next actions.
- Voice and typed command assistance as a visual-control complement, not as the only ordering path.

### Out of scope for this issue
- Payment processing.
- Account creation, full authentication, and saved profile persistence.
- Driver dispatch, real ETA updates, refunds, support chat, or live order cancellation.
- Production-grade account-scoped order history; `/orders` is a demo history entry point that uses backend orders when available.

## 2. Existing App Audit

### Routes currently implemented
- `/` is implemented by `app/page.tsx` and acts as the marketplace home page.
- `/restaurants` is implemented by `app/restaurants/page.tsx` and reads `query` and `filter` search params.
- `/restaurants/[restaurantId]` is implemented by `app/restaurants/[restaurantId]/page.tsx` and uses `restaurantId` as the restaurant slug/ID.
- `/restaurants/[restaurantId]/items/[itemId]` is implemented by `app/restaurants/[restaurantId]/items/[itemId]/page.tsx` and uses `restaurantId` plus `itemId` to customize a menu item.
- `/checkout` is implemented by `app/checkout/page.tsx` and reads/writes backend cart state with local fallback.
- `/order-confirmation` is implemented by `app/order-confirmation/page.tsx` and loads backend order details by `orderId` with local fallback.

### Shared structure and components
- `app/layout.tsx` provides the root HTML shell and metadata.
- `app/components/MarketplaceNav.tsx` provides the shared top navigation with Home, Search, Menu, Cart, and Orders entries.
- `app/globals.css` owns the responsive marketplace visual system, page layouts, cards, buttons, form controls, and flow-specific panels.

### State management
- Anonymous backend cart sessions use browser `localStorage` key `orderlyapp.marketplace.backendSession.v1`.
- Cart state is loaded and saved through `/sessions/{session_id}/cart` first, then mirrored in browser `localStorage` under `orderlyapp.marketplace.cart.v1` as fallback.
- The latest order is loaded from `/orders/{order_id}` first, then mirrored in browser `localStorage` under `orderlyapp.marketplace.order.v1` as fallback.
- Special instructions persist in browser `localStorage` under `orderlyapp.marketplace.note.v1`.
- Checkout and item customization are client components because they read/write browser storage and use client-side navigation.

### Data loading patterns
- Restaurants and menu data load from FastAPI first with `lib/mock-data.ts` fallback.
- Marketplace selectors and pricing helpers live in `lib/marketplace.ts`.
- Cart validation and mock order ID helpers live in `lib/cart.ts`.
- Domain TypeScript interfaces and money formatting live in `lib/types.ts`.
- Route metadata and href builders live in `lib/routes.ts` so follow-up route work has one canonical map.

## 3. Route Map

| Route | Params | Responsibility | Required layout elements | Navigation behavior |
| --- | --- | --- | --- | --- |
| `/` | none | Introduce the marketplace, collect search intent, show featured restaurants/favorites, and explain the screen path. | Global nav, hero search, quick filters, restaurant rails, flow overview. | Search submits to `/restaurants`; restaurant cards open restaurant menu pages; cart state remains in the backend session with local fallback. |
| `/restaurants` | `query`, `filter` | Show searchable/filterable restaurant results with delivery details and tags. | Global nav, desktop filter panel, search form, result cards, empty-results state in future work. | Filter chips/search update query params; result cards navigate to `/restaurants/:restaurantId`. |
| `/restaurants/:restaurantId` | `restaurantId` | Show restaurant identity, delivery metadata, menu categories, and menu item cards. | Global nav, restaurant hero, category tabs, menu grid, cart CTA. | Item cards navigate to `/restaurants/:restaurantId/items/:itemId`; cart CTA opens `/checkout`. |
| `/restaurants/:restaurantId/items/:itemId` | `restaurantId`, `itemId` | Customize a menu item before adding it to cart. | Global nav, item preview, modifier groups, quantity controls, notes field, add-to-cart CTA. | Add-to-cart writes through the backend cart API, mirrors local fallback state, and routes to `/cart`; invalid params show recovery UI. |
| `/checkout` | none | Review cart, edit quantities, clear cart, review mock address/payment, and submit a mock order. | Global nav, cart lines, empty-cart state, totals, address/payment panel, place-order CTA. | Place order posts to the backend order API, clears backend/local cart, and routes to `/order-confirmation?orderId=...`; empty cart links to discovery. |
| `/order-confirmation` | `orderId` query | Confirm submitted order, show progress timeline, and offer browse/reorder next actions. | Global nav, confirmation hero, status timeline, next-action buttons. | Hydrates by backend `orderId` first and falls back to local mirrored order data. |
| `/orders` | none | Secondary entry point for saved mock order history. | Global nav, order list, reorder controls, empty-history state. | Uses backend order list when available and local mirrored history as fallback. |

## 4. Primary User Flow

1. **Browse restaurants**: Customer lands on `/`, reviews featured restaurants or enters a search term.
2. **Search/filter restaurants**: Customer moves to `/restaurants` with optional `query` and `filter` params, then selects a restaurant card.
3. **View menu**: Customer lands on `/restaurants/:restaurantId`, reviews restaurant metadata and menu items.
4. **Customize item**: Customer opens `/restaurants/:restaurantId/items/:itemId`, chooses required modifiers, optional toppings, quantity, and notes.
5. **Add to cart**: Customer taps the primary add-to-cart action; the cart item is written to the backend cart session, mirrored locally, and the cart page opens.
6. **Review cart**: Customer reviews line items, adjusts quantities, clears the cart if needed, and confirms totals.
7. **Checkout**: Customer verifies saved mock address, drop-off instructions, mock payment method, and delivery window.
8. **Submit order**: Customer taps Place order; the app creates a backend mock order, empties the backend/local cart, and navigates to confirmation.
9. **View confirmation**: Customer sees the backend order ID, total/item count, progress timeline, and browse/reorder next actions.

## 5. Secondary User Flows

### Search and filter restaurants
1. Customer submits a search from `/` or `/restaurants`.
2. App routes to `/restaurants?query=:query` and filters by restaurant name, tag, or menu item.
3. Customer can combine a quick filter with the search term via `/restaurants?query=:query&filter=:filter`.
4. Empty results explain no matches and provide a clear reset action.

### Edit cart item quantity
1. Customer opens `/checkout` with at least one cart line.
2. Customer taps `+` or `-` on a line item.
3. Quantity updates immediately, never drops below 1, and totals recalculate.
4. Updated cart state is saved to the backend session and mirrored locally.

### Remove item / clear cart
1. Current UI supports clearing the cart from cart review and checkout.
2. Item-level removal is available on the cart review page.
3. If the final item is removed, checkout should switch to the empty-cart recovery state with a Browse restaurants CTA.

### Auth prompt
1. Browsing remains anonymous, but placing an order requires the mock sign-in session.
2. Account-only features should show a lightweight prompt only when the user asks for saved addresses, saved payments, loyalty, or order history.
3. Prompt should preserve the current route and cart state so the customer can continue after sign-in or dismiss the prompt.

### Saved address selection
1. Checkout shows default mock profile/address details today.
2. The account page supports local mock profile/address management.
3. Checkout validates the entered delivery details before submission.
4. Place order remains disabled for empty or invalid carts.

### Order history entry point
1. Primary nav exposes an Orders entry.
2. `/orders` lists backend orders when available and local mirrored history as fallback.
3. A reorder action should rebuild a cart from an existing order, then route to `/checkout` for review before submission.

## 6. Required Domain Entities

| Entity | Purpose | Current source / future notes |
| --- | --- | --- |
| Restaurant | Represents a storefront with name, cuisine, rating, delivery fee/window, tags, image cue, and menu. | `Restaurant` in `lib/types.ts`; seeded in `lib/mock-data.ts`. |
| Menu category | Groups menu items into scannable sections such as Popular, Pizza, Sides, Drinks, and Dessert. | Currently static category labels on the menu page; future data should own categories. |
| Menu item | Represents an orderable item with price, description, popularity, image cue, and modifier groups. | `MenuItem` in `lib/types.ts`; seeded in `lib/mock-data.ts`. |
| Customization group | Defines required/optional modifier groups such as size, crust, and toppings. | `ModifierGroup` and `ModifierOption` in `lib/types.ts`. |
| Cart item | Stores selected restaurant, menu item, quantity, base price, and selected modifiers. | `CartItem` in `lib/types.ts`; persisted through backend cart sessions with local fallback. |
| Customer profile | Stores identity, contact, saved addresses, saved payment references, and preferences. | Mock/local account data supports the portfolio demo; real auth is out of scope. |
| Address | Stores delivery location, instructions, validation status, and delivery-zone metadata. | Mock/local address data pre-fills checkout and account views. |
| Order | Stores submitted cart snapshot, totals, status, timestamps, restaurant, and customer/address references. | `Order` in `lib/types.ts`; backend order response is normalized for the frontend receipt/status UI. |
| Payment summary | Stores subtotal, fees, discount, tax, tip, total, and payment display label. | Calculated in checkout from cart data; real payments are out of scope. |

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
- Refreshing checkout should restore cart state from the backend session, with local fallback if the API is unavailable.
- Backend cart/order APIs are primary; local storage mirrors state for demo fallback.

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
- **Malformed local storage**: Backend data is preferred; future hardening should safely reset corrupt fallback data without crashing the page.

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
