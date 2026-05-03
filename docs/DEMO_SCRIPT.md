# OrderlyApp — Demo Script

## Goal
Record a 60–90 second portfolio demo showing the complete MVP flow.

## Setup
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Demo flow
1. Start on the hero section.
   - Say: “OrderlyApp is a voice-first food ordering demo.”
2. Show restaurant browsing.
   - Click through the seeded pizza restaurants.
3. Show restaurant detail + menu.
   - Select Mario’s Pizza Lab.
   - Select Pepperoni Feast.
4. Customize item.
   - Choose Large.
   - Add Jalapeños and Extra cheese.
5. Add to cart.
   - Show subtotal and item modifiers.
6. Demonstrate voice/typed command.
   - Type or say: `add a large pepperoni pizza with jalapeños and extra cheese`.
   - Show parsed intent/confidence and cart update.
7. Demonstrate cart controls.
   - Increment quantity.
   - Remove one item.
8. Demonstrate mock checkout.
   - Click checkout.
   - Point out no real payment is charged.
   - Place mock order.
9. Show order status.
   - Show order summary.
   - Wait for status timeline to progress.
10. End with technical summary.
   - Next.js frontend, FastAPI backend scaffold, Postgres/Redis infra, tests passing.

## Recording checklist
- Browser zoom around 90–100%.
- Clear cart before recording.
- Use typed voice command if browser speech capture is unavailable.
- Do not show private files or terminal secrets.
- Keep terminal output only for final verification if needed.
