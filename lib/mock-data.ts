import type { OrderStatusStep, Restaurant } from './types';

const pizzaModifiers = [
  {
    id: 'size',
    name: 'Size',
    type: 'single' as const,
    required: true,
    options: [
      { id: 'small', name: 'Small', priceDeltaCents: 0 },
      { id: 'medium', name: 'Medium', priceDeltaCents: 300 },
      { id: 'large', name: 'Large', priceDeltaCents: 600 },
    ],
  },
  {
    id: 'toppings',
    name: 'Toppings',
    type: 'multiple' as const,
    maxSelected: 4,
    options: [
      { id: 'pepperoni', name: 'Pepperoni', priceDeltaCents: 150 },
      { id: 'mushrooms', name: 'Mushrooms', priceDeltaCents: 100 },
      { id: 'jalapenos', name: 'Jalapeños', priceDeltaCents: 100 },
      { id: 'extra-cheese', name: 'Extra cheese', priceDeltaCents: 175 },
    ],
  },
];

export const restaurants: Restaurant[] = [
  {
    id: 'marios-pizza',
    name: "Mario's Pizza Lab",
    cuisine: 'Pizza',
    rating: 4.8,
    deliveryMinutes: '20–30 min',
    deliveryFeeCents: 199,
    imageEmoji: '🍕',
    tags: ['Popular', 'Thin crust', 'Open late'],
    menu: [
      {
        id: 'margherita',
        name: 'Classic Margherita',
        description: 'Tomato, mozzarella, basil, olive oil.',
        priceCents: 1299,
        imageEmoji: '🌿',
        popular: true,
        modifierGroups: pizzaModifiers,
      },
      {
        id: 'pepperoni-feast',
        name: 'Pepperoni Feast',
        description: 'Double pepperoni, mozzarella, red sauce.',
        priceCents: 1499,
        imageEmoji: '🍕',
        popular: true,
        modifierGroups: pizzaModifiers,
      },
      {
        id: 'garden-supreme',
        name: 'Garden Supreme',
        description: 'Bell peppers, mushrooms, onions, olives.',
        priceCents: 1399,
        imageEmoji: '🫑',
        modifierGroups: pizzaModifiers,
      },
    ],
  },
  {
    id: 'slice-station',
    name: 'Slice Station',
    cuisine: 'Pizza',
    rating: 4.6,
    deliveryMinutes: '15–25 min',
    deliveryFeeCents: 249,
    imageEmoji: '🚉',
    tags: ['Fast', 'NY style'],
    menu: [
      {
        id: 'ny-cheese',
        name: 'NY Cheese Slice Box',
        description: 'Foldable cheese pizza with oregano dust.',
        priceCents: 1199,
        imageEmoji: '🧀',
        popular: true,
        modifierGroups: pizzaModifiers,
      },
      {
        id: 'spicy-vodka',
        name: 'Spicy Vodka Pizza',
        description: 'Vodka sauce, chili flakes, parmesan.',
        priceCents: 1599,
        imageEmoji: '🌶️',
        modifierGroups: pizzaModifiers,
      },
    ],
  },
  {
    id: 'dough-and-co',
    name: 'Dough & Co.',
    cuisine: 'Pizza',
    rating: 4.7,
    deliveryMinutes: '25–35 min',
    deliveryFeeCents: 99,
    imageEmoji: '🔥',
    tags: ['Wood fired', 'Best value'],
    menu: [
      {
        id: 'wood-fired-trio',
        name: 'Wood-Fired Trio',
        description: 'Three-cheese blend, charred crust, basil.',
        priceCents: 1699,
        imageEmoji: '🔥',
        popular: true,
        modifierGroups: pizzaModifiers,
      },
      {
        id: 'bbq-chicken',
        name: 'BBQ Chicken Pizza',
        description: 'Chicken, BBQ sauce, red onion, cilantro.',
        priceCents: 1599,
        imageEmoji: '🍗',
        modifierGroups: pizzaModifiers,
      },
    ],
  },
];

export const orderStatusSteps: OrderStatusStep[] = [
  {
    status: 'Placed',
    label: 'Order placed',
    description: 'Mock order received. No payment charged.',
    etaMinutesFromOrder: 0,
  },
  {
    status: 'Confirmed',
    label: 'Restaurant confirmed',
    description: 'The restaurant accepted the order.',
    etaMinutesFromOrder: 2,
  },
  {
    status: 'Preparing',
    label: 'Preparing',
    description: 'Kitchen is preparing the pizza.',
    etaMinutesFromOrder: 8,
  },
  {
    status: 'Out for delivery',
    label: 'Out for delivery',
    description: 'Driver is on the way.',
    etaMinutesFromOrder: 22,
  },
  {
    status: 'Delivered',
    label: 'Delivered',
    description: 'Mock delivery complete.',
    etaMinutesFromOrder: 35,
  },
];

export function validateFixtures(): string[] {
  const errors: string[] = [];
  for (const restaurant of restaurants) {
    if (restaurant.menu.length === 0) errors.push(`${restaurant.name} has no menu items.`);
    for (const item of restaurant.menu) {
      if (item.modifierGroups.length === 0) errors.push(`${item.name} has no modifiers.`);
      for (const group of item.modifierGroups) {
        if (group.required && group.options.length === 0) errors.push(`${item.name}/${group.name} is required but empty.`);
      }
    }
  }
  return errors;
}
