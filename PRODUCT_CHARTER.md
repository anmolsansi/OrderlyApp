# OrderlyApp — Product Charter

## Mission
Build a portfolio-ready voice-first food ordering web app that proves a user can browse, customize, and place a mock food order primarily through natural language, with visual confirmation and correction at every important step.

## MVP User
A hungry user on desktop or mobile who wants to order pizza quickly and safely using voice commands, with the option to inspect and correct the cart visually.

## MVP Promise
The app should demonstrate this end-to-end flow:
1. Browse pizza restaurants
2. Pick a restaurant/menu item
3. Customize size/toppings/sides
4. Add/edit/remove items in cart
5. Use voice commands for cart actions
6. Review order
7. Place mock checkout
8. See mock order status

## Non-goals for MVP
- Real payments
- Real restaurant integrations
- Real delivery tracking
- User accounts/auth
- Restaurant admin dashboard
- Multi-vendor orders

## Success Criteria
- Demo can be run locally with a clear README
- Build and typecheck pass
- User can complete the full order flow without voice
- User can complete key cart actions with voice where browser support exists
- Voice interpretation is always visible before/after action
- Checkout is explicitly marked as mock/non-payment
