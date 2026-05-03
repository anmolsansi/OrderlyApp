# OrderlyApp — Product Flows

## 1. Restaurant Browsing Flow
1. User lands on the home page.
2. App shows seeded pizza restaurants with rating, tags, delivery time, and delivery fee.
3. User selects a restaurant.
4. Menu section updates to the selected restaurant.
5. Assistant panel confirms the active restaurant.

## 2. Menu / Item Detail Flow
1. User selects a menu item.
2. App shows customization controls for that item.
3. Required modifier groups default to safe selections.
4. User chooses size and optional toppings.
5. App recalculates item price instantly.
6. User adds item to cart.

## 3. Cart Flow
1. Added item appears in cart with selected modifiers.
2. User can increase/decrease quantity.
3. Quantity cannot drop below 1.
4. User can remove individual cart items.
5. User can clear the full cart.
6. Subtotal recalculates after every change.
7. Cart persists locally across reloads for the MVP.

## 4. Voice Capture + Transcript Flow
1. User taps microphone / voice action.
2. Browser Web Speech API listens if supported.
3. App displays live transcript.
4. Parser turns transcript into a visible intent.
5. App confirms interpreted action in assistant panel.
6. Action executes only when confidence/action is clear enough.
7. Unsupported browsers fall back to mock/text command mode.

## 5. Error Correction Flow
1. If command is ambiguous, app does not mutate cart.
2. Assistant asks a specific clarification.
3. User can retry voice or use visual controls.
4. If parser picks the wrong item/modifier, user can correct through UI.
5. Every failed or corrected attempt remains visible in the assistant panel.

## 6. Mock Checkout Flow
1. User reviews cart.
2. Checkout button opens an explicit mock checkout confirmation.
3. App states no real payment will be charged.
4. User confirms placement.
5. App creates a mock order record.
6. Cart clears after successful mock order.

## 7. Order Status Flow
1. App shows order confirmation.
2. Status timeline starts at `Placed`.
3. Mock timeline advances through `Confirmed`, `Preparing`, `Out for delivery`, and `Delivered`.
4. User can return to browse/order again.

## 8. Accessibility Requirements
- All interactive controls must be keyboard reachable.
- Buttons need visible labels and focus states.
- Voice actions must have visual equivalents.
- Color cannot be the only state indicator.
- Assistant responses should be readable as text.
- Checkout must clearly say mock/non-payment.
- Cart mutations should provide visible confirmation.
