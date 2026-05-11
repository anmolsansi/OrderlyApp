import type {
  Address,
  CartItem,
  CartItemModifier,
  CartTotals,
  CustomizationGroup,
  MenuCategory,
  MenuItem,
  Order,
  OrderStatusStep,
  Restaurant,
  UserProfile,
} from './types';

export const TAX_RATE = 0.0875;
export const DEFAULT_SERVICE_FEE_CENTS = 249;
export const MOCK_NOW_ISO = '2026-05-11T18:30:00.000Z';

const pizzaModifiers: CustomizationGroup[] = [
  {
    id: 'size',
    name: 'Size',
    type: 'single',
    required: true,
    minSelected: 1,
    maxSelected: 1,
    options: [
      { id: 'small', name: 'Small', priceDeltaCents: 0 },
      { id: 'medium', name: 'Medium', priceDeltaCents: 300 },
      { id: 'large', name: 'Large', priceDeltaCents: 600 },
      { id: 'xl', name: 'XL', priceDeltaCents: 900 },
    ],
  },
  {
    id: 'crust',
    name: 'Crust',
    type: 'single',
    required: true,
    minSelected: 1,
    maxSelected: 1,
    options: [
      { id: 'classic', name: 'Classic hand-tossed', priceDeltaCents: 0 },
      { id: 'thin', name: 'Crispy thin', priceDeltaCents: 150 },
      { id: 'gluten-free', name: 'Gluten-free', priceDeltaCents: 300 },
      { id: 'stuffed', name: 'Cheese-stuffed', priceDeltaCents: 350 },
    ],
  },
  {
    id: 'cheese',
    name: 'Cheese',
    type: 'multiple',
    maxSelected: 3,
    options: [
      { id: 'mozzarella', name: 'Mozzarella', priceDeltaCents: 0 },
      { id: 'extra-cheese', name: 'Extra cheese', priceDeltaCents: 175 },
      { id: 'fresh-mozzarella', name: 'Fresh mozzarella', priceDeltaCents: 225 },
      { id: 'smoked-provolone', name: 'Smoked provolone', priceDeltaCents: 225 },
      { id: 'ricotta', name: 'Whipped ricotta', priceDeltaCents: 200 },
      { id: 'parmesan', name: 'Aged parmesan', priceDeltaCents: 150 },
      { id: 'goat-cheese', name: 'Goat cheese', priceDeltaCents: 250 },
      { id: 'vegan-cheese', name: 'Vegan cheese', priceDeltaCents: 275 },
    ],
  },
  {
    id: 'toppings',
    name: 'Toppings',
    type: 'multiple',
    maxSelected: 6,
    options: [
      { id: 'pepperoni', name: 'Pepperoni', priceDeltaCents: 150 },
      { id: 'italian-sausage', name: 'Italian sausage', priceDeltaCents: 200 },
      { id: 'grilled-chicken', name: 'Grilled chicken', priceDeltaCents: 250 },
      { id: 'mushrooms', name: 'Roasted mushrooms', priceDeltaCents: 125 },
      { id: 'jalapenos', name: 'Jalapeños', priceDeltaCents: 100 },
      { id: 'caramelized-onions', name: 'Caramelized onions', priceDeltaCents: 125 },
      { id: 'black-olives', name: 'Black olives', priceDeltaCents: 100 },
      { id: 'banana-peppers', name: 'Banana peppers', priceDeltaCents: 125 },
      { id: 'pineapple', name: 'Pineapple', priceDeltaCents: 125 },
      { id: 'basil', name: 'Fresh basil', priceDeltaCents: 75 },
      { id: 'arugula', name: 'Arugula', priceDeltaCents: 125 },
      { id: 'hot-honey', name: 'Hot honey drizzle', priceDeltaCents: 150 },
    ],
  },
];

const entreeModifiers: CustomizationGroup[] = [
  {
    id: 'protein',
    name: 'Protein',
    type: 'single',
    required: true,
    minSelected: 1,
    maxSelected: 1,
    options: [
      { id: 'chicken', name: 'Chicken', priceDeltaCents: 0 },
      { id: 'steak', name: 'Steak', priceDeltaCents: 300 },
      { id: 'tofu', name: 'Crispy tofu', priceDeltaCents: 0 },
    ],
  },
  {
    id: 'extras',
    name: 'Extras',
    type: 'multiple',
    maxSelected: 4,
    options: [
      { id: 'avocado', name: 'Avocado', priceDeltaCents: 225 },
      { id: 'extra-sauce', name: 'Extra sauce', priceDeltaCents: 75 },
      { id: 'pickled-veg', name: 'Pickled vegetables', priceDeltaCents: 125 },
      { id: 'noodles', name: 'Extra noodles', priceDeltaCents: 250 },
    ],
  },
];

const drinkModifiers: CustomizationGroup[] = [
  {
    id: 'ice',
    name: 'Ice level',
    type: 'single',
    required: true,
    minSelected: 1,
    maxSelected: 1,
    options: [
      { id: 'regular-ice', name: 'Regular ice', priceDeltaCents: 0 },
      { id: 'light-ice', name: 'Light ice', priceDeltaCents: 0 },
      { id: 'no-ice', name: 'No ice', priceDeltaCents: 0 },
    ],
  },
];

function item(input: Omit<MenuItem, 'modifierGroups' | 'available'> & { modifierGroups?: CustomizationGroup[]; available?: boolean }): MenuItem {
  return { available: true, modifierGroups: input.modifierGroups ?? [], ...input };
}

function pizzaItem(input: Omit<MenuItem, 'modifierGroups' | 'available'> & { available?: boolean }): MenuItem {
  return item({ ...input, modifierGroups: pizzaModifiers });
}

function entreeItem(input: Omit<MenuItem, 'modifierGroups' | 'available'> & { available?: boolean }): MenuItem {
  return item({ ...input, modifierGroups: entreeModifiers });
}

function drinkItem(input: Omit<MenuItem, 'modifierGroups' | 'available'> & { available?: boolean }): MenuItem {
  return item({ ...input, modifierGroups: drinkModifiers });
}

function restaurant(input: Omit<Restaurant, 'menu'>): Restaurant {
  return {
    ...input,
    menu: input.menuCategories.flatMap(category => category.items),
  };
}

export const restaurants: Restaurant[] = [
  restaurant({
    id: 'marios-pizza',
    name: "Mario's Pizza Lab",
    cuisine: 'Pizza',
    rating: 4.8,
    deliveryMinutes: '20–30 min',
    deliveryFeeCents: 199,
    serviceFeeCents: 249,
    distanceMiles: 1.2,
    imageEmoji: '🍕',
    imageAlt: 'Illustrated pepperoni pizza in a red delivery box',
    isOpen: true,
    tags: ['Popular', 'Thin crust', 'Open late'],
    menuCategories: [
      {
        id: 'popular-pies',
        name: 'Popular pies',
        items: [
          pizzaItem({ id: 'margherita', name: 'Classic Margherita', description: 'Tomato, mozzarella, basil, olive oil.', priceCents: 1299, imageEmoji: '🌿', popular: true }),
          pizzaItem({ id: 'pepperoni-feast', name: 'Pepperoni Feast', description: 'Double pepperoni, mozzarella, red sauce.', priceCents: 1499, imageEmoji: '🍕', popular: true }),
          pizzaItem({ id: 'truffle-burrata', name: 'Truffle Burrata Cloud', description: 'Burrata, truffle oil, roasted mushrooms, basil.', priceCents: 1899, imageEmoji: '☁️' }),
        ],
      },
      {
        id: 'sides',
        name: 'Sides',
        items: [
          item({ id: 'garlic-knots', name: 'Garlic Knots', description: 'Six knots with marinara.', priceCents: 699, imageEmoji: '🥖', popular: true }),
          item({ id: 'caesar-salad', name: 'Little Caesar Salad', description: 'Romaine, parmesan, lemony dressing.', priceCents: 899, imageEmoji: '🥗' }),
          item({ id: 'mozzarella-sticks', name: 'Mozzarella Sticks', description: 'Crispy sticks with tomato dip.', priceCents: 799, imageEmoji: '🧀', available: false }),
        ],
      },
      {
        id: 'drinks-dessert',
        name: 'Drinks & dessert',
        items: [
          drinkItem({ id: 'blood-orange-soda', name: 'Blood Orange Soda', description: 'Small-batch citrus soda.', priceCents: 399, imageEmoji: '🥤' }),
          item({ id: 'tiramisu-cup', name: 'Tiramisu Cup', description: 'Espresso-soaked layers to go.', priceCents: 649, imageEmoji: '🍮' }),
          item({ id: 'cannoli-duo', name: 'Cannoli Duo', description: 'Two mini ricotta cannoli.', priceCents: 599, imageEmoji: '🍰' }),
        ],
      },
    ],
  }),
  restaurant({
    id: 'slice-station',
    name: 'Slice Station',
    cuisine: 'Pizza',
    rating: 4.6,
    deliveryMinutes: '15–25 min',
    deliveryFeeCents: 249,
    serviceFeeCents: 199,
    distanceMiles: 0.8,
    imageEmoji: '🚉',
    imageAlt: 'Neon train platform sign with pizza slices',
    isOpen: true,
    tags: ['Fast', 'NY style'],
    menuCategories: [
      {
        id: 'ny-pizza',
        name: 'NY pizza',
        items: [
          pizzaItem({ id: 'ny-cheese', name: 'NY Cheese Slice Box', description: 'Foldable cheese pizza with oregano dust.', priceCents: 1199, imageEmoji: '🧀', popular: true }),
          pizzaItem({ id: 'spicy-vodka', name: 'Spicy Vodka Pizza', description: 'Vodka sauce, chili flakes, parmesan.', priceCents: 1599, imageEmoji: '🌶️', popular: true }),
          pizzaItem({ id: 'soho-white', name: 'SoHo White Pie', description: 'Ricotta, mozzarella, garlic confit, cracked pepper.', priceCents: 1699, imageEmoji: '🤍' }),
        ],
      },
      {
        id: 'heroes',
        name: 'Heroes',
        items: [
          entreeItem({ id: 'meatball-hero', name: 'Meatball Hero', description: 'Saucy meatballs, provolone, toasted roll.', priceCents: 1299, imageEmoji: '🥖' }),
          entreeItem({ id: 'chicken-parm-hero', name: 'Chicken Parm Hero', description: 'Crispy cutlet, marinara, mozzarella.', priceCents: 1399, imageEmoji: '🥪' }),
          entreeItem({ id: 'eggplant-stack', name: 'Eggplant Stack', description: 'Roasted eggplant, basil, tomato jam.', priceCents: 1199, imageEmoji: '🍆' }),
        ],
      },
      {
        id: 'station-sips',
        name: 'Station sips',
        items: [
          drinkItem({ id: 'cola-fountain', name: 'Cola Fountain', description: 'Classic fountain cola.', priceCents: 299, imageEmoji: '🥤' }),
          item({ id: 'black-white-cookie', name: 'Black & White Cookie', description: 'Half vanilla, half chocolate glaze.', priceCents: 449, imageEmoji: '🍪' }),
          item({ id: 'ranch-cup', name: 'Side Ranch Cup', description: 'House ranch for dipping crusts.', priceCents: 99, imageEmoji: '🥣' }),
        ],
      },
    ],
  }),
  restaurant({
    id: 'dough-and-co',
    name: 'Dough & Co.',
    cuisine: 'Pizza',
    rating: 4.7,
    deliveryMinutes: '25–35 min',
    deliveryFeeCents: 99,
    serviceFeeCents: 229,
    distanceMiles: 2.4,
    imageEmoji: '🔥',
    imageAlt: 'Wood-fired oven with pizza peel',
    isOpen: true,
    tags: ['Wood fired', 'Best value'],
    menuCategories: [
      { id: 'wood-fired', name: 'Wood fired', items: [
        pizzaItem({ id: 'wood-fired-trio', name: 'Wood-Fired Trio', description: 'Three-cheese blend, charred crust, basil.', priceCents: 1699, imageEmoji: '🔥', popular: true }),
        pizzaItem({ id: 'bbq-chicken', name: 'BBQ Chicken Pizza', description: 'Chicken, BBQ sauce, red onion, cilantro.', priceCents: 1599, imageEmoji: '🍗' }),
        pizzaItem({ id: 'ember-mushroom', name: 'Ember Mushroom', description: 'Roasted mushrooms, smoked provolone, thyme.', priceCents: 1799, imageEmoji: '🍄' }),
      ] },
      { id: 'greens', name: 'Greens', items: [
        item({ id: 'wood-oven-broccoli', name: 'Wood-Oven Broccoli', description: 'Lemon, chile flakes, parmesan.', priceCents: 799, imageEmoji: '🥦' }),
        item({ id: 'farro-salad', name: 'Farro Salad', description: 'Arugula, cucumber, toasted seeds.', priceCents: 999, imageEmoji: '🥗' }),
        item({ id: 'tomato-burrata', name: 'Tomato Burrata', description: 'Basil oil and aged balsamic.', priceCents: 1199, imageEmoji: '🍅' }),
      ] },
      { id: 'bakery', name: 'Bakery', items: [
        item({ id: 'focaccia', name: 'Rosemary Focaccia', description: 'Warm slab with olive oil.', priceCents: 599, imageEmoji: '🍞' }),
        drinkItem({ id: 'sparkling-lemon', name: 'Sparkling Lemon', description: 'Bright lemon spritz.', priceCents: 399, imageEmoji: '🍋' }),
        item({ id: 'olive-oil-cake', name: 'Olive Oil Cake', description: 'Citrus glaze, pistachio crumb.', priceCents: 699, imageEmoji: '🍰' }),
      ] },
    ],
  }),
  restaurant({
    id: 'neapolitan-nova',
    name: 'Neapolitan Nova',
    cuisine: 'Pizza',
    rating: 4.9,
    deliveryMinutes: '30–40 min',
    deliveryFeeCents: 299,
    serviceFeeCents: 299,
    distanceMiles: 3.1,
    imageEmoji: '🇮🇹',
    imageAlt: 'Neapolitan pizza with blistered crust',
    isOpen: true,
    tags: ['Neapolitan', 'Wood fired', 'Premium'],
    menuCategories: [
      { id: 'signatures', name: 'Signatures', items: [
        pizzaItem({ id: 'san-marzano-star', name: 'San Marzano Star', description: 'San Marzano tomato, fresh mozzarella, basil.', priceCents: 1799, imageEmoji: '⭐', popular: true }),
        pizzaItem({ id: 'diavola-nova', name: 'Diavola Nova', description: 'Spicy salami-style pepperoni, chili oil, mozzarella.', priceCents: 1899, imageEmoji: '🌋' }),
        pizzaItem({ id: 'pesto-verde', name: 'Pesto Verde', description: 'Basil pesto, ricotta, roasted tomatoes, pine nuts.', priceCents: 1849, imageEmoji: '💚' }),
      ] },
      { id: 'antipasti', name: 'Antipasti', items: [
        item({ id: 'arancini', name: 'Arancini', description: 'Three risotto fritters with tomato dip.', priceCents: 899, imageEmoji: '🟠' }),
        item({ id: 'prosciutto-melon', name: 'Prosciutto & Melon', description: 'Sweet melon, cured-style prosciutto.', priceCents: 1199, imageEmoji: '🍈' }),
        item({ id: 'marinated-olives', name: 'Marinated Olives', description: 'Citrus, fennel, chile.', priceCents: 599, imageEmoji: '🫒' }),
      ] },
      { id: 'dolci', name: 'Dolci', items: [
        item({ id: 'panna-cotta', name: 'Panna Cotta', description: 'Vanilla cream with berry compote.', priceCents: 699, imageEmoji: '🍓' }),
        drinkItem({ id: 'italian-soda', name: 'Italian Soda', description: 'Cherry, vanilla, or lemon.', priceCents: 449, imageEmoji: '🥤' }),
        item({ id: 'affogato', name: 'Affogato', description: 'Espresso over vanilla gelato.', priceCents: 649, imageEmoji: '☕' }),
      ] },
    ],
  }),

  restaurant({
    id: 'chicago-square-cut',
    name: 'Chicago Square Cut',
    cuisine: 'Pizza',
    rating: 4.7,
    deliveryMinutes: '32–42 min',
    deliveryFeeCents: 299,
    serviceFeeCents: 249,
    distanceMiles: 3.9,
    imageEmoji: '◼️',
    imageAlt: 'Chicago tavern-style pizza cut into squares',
    isOpen: true,
    tags: ['Tavern style', 'Square cut', 'Deep dish'],
    menuCategories: [
      { id: 'square-cut-pizza', name: 'Square cut pizza', items: [
        pizzaItem({ id: 'tavern-pepperoni', name: 'Tavern Pepperoni', description: 'Thin, crispy, edge-to-edge pepperoni.', priceCents: 1599, imageEmoji: '🍕', popular: true }),
        pizzaItem({ id: 'sausage-giardiniera', name: 'Sausage Giardiniera', description: 'Italian sausage, hot giardiniera, mozzarella.', priceCents: 1699, imageEmoji: '🌶️' }),
        pizzaItem({ id: 'deep-dish-classic', name: 'Deep Dish Classic', description: 'Layered cheese, tomato sauce, butter crust.', priceCents: 1899, imageEmoji: '🥧' }),
      ] },
      { id: 'chicago-sides', name: 'Chicago sides', items: [
        item({ id: 'italian-beef-cup', name: 'Italian Beef Cup', description: 'Beef-style jus with sweet peppers.', priceCents: 899, imageEmoji: '🥩' }),
        item({ id: 'chopped-salad', name: 'Chopped Salad', description: 'Romaine, tomato, olives, vinaigrette.', priceCents: 799, imageEmoji: '🥗' }),
        item({ id: 'cheesy-bread', name: 'Cheesy Bread', description: 'Garlic bread with mozzarella.', priceCents: 699, imageEmoji: '🧀' }),
      ] },
      { id: 'chicago-drinks', name: 'Drinks', items: [
        drinkItem({ id: 'root-beer', name: 'Root Beer', description: 'Frosty bottle of root beer.', priceCents: 349, imageEmoji: '🥤' }),
        item({ id: 'butter-cookie', name: 'Butter Cookie', description: 'Classic bakery butter cookie.', priceCents: 299, imageEmoji: '🍪' }),
        item({ id: 'brownie-pan', name: 'Mini Brownie Pan', description: 'Warm brownie for two.', priceCents: 599, imageEmoji: '🍫' }),
      ] },
    ],
  }),
  restaurant({
    id: 'umami-bowl-house',
    name: 'Umami Bowl House',
    cuisine: 'Japanese',
    rating: 4.5,
    deliveryMinutes: '35–45 min',
    deliveryFeeCents: 349,
    serviceFeeCents: 259,
    distanceMiles: 4.6,
    imageEmoji: '🍜',
    imageAlt: 'Steaming ramen bowl with chopsticks',
    isOpen: false,
    tags: ['Closed', 'Ramen', 'Bowls'],
    menuCategories: [
      { id: 'ramen', name: 'Ramen', items: [
        entreeItem({ id: 'tonkotsu-ramen', name: 'Tonkotsu Ramen', description: 'Creamy broth, noodles, marinated egg.', priceCents: 1699, imageEmoji: '🍜', popular: true }),
        entreeItem({ id: 'spicy-miso', name: 'Spicy Miso Ramen', description: 'Miso broth, chili oil, corn, scallions.', priceCents: 1599, imageEmoji: '🌶️' }),
        entreeItem({ id: 'veggie-shoyu', name: 'Veggie Shoyu', description: 'Soy broth, mushrooms, greens, tofu.', priceCents: 1499, imageEmoji: '🥬' }),
      ] },
      { id: 'rice-bowls', name: 'Rice bowls', items: [
        entreeItem({ id: 'teriyaki-chicken-bowl', name: 'Teriyaki Chicken Bowl', description: 'Rice, chicken, broccoli, sesame.', priceCents: 1399, imageEmoji: '🍚' }),
        entreeItem({ id: 'salmon-poke-bowl', name: 'Salmon Poke Bowl', description: 'Salmon, cucumber, edamame, spicy mayo.', priceCents: 1799, imageEmoji: '🍣', available: false }),
        entreeItem({ id: 'tofu-katsu-bowl', name: 'Tofu Katsu Bowl', description: 'Crispy tofu, curry sauce, rice.', priceCents: 1399, imageEmoji: '🍛' }),
      ] },
      { id: 'small-bites', name: 'Small bites', items: [
        item({ id: 'pork-gyoza', name: 'Pork Gyoza', description: 'Pan-seared dumplings.', priceCents: 799, imageEmoji: '🥟' }),
        item({ id: 'edamame', name: 'Sea Salt Edamame', description: 'Warm soybeans with flaky salt.', priceCents: 599, imageEmoji: '🫛' }),
        drinkItem({ id: 'yuzu-tea', name: 'Yuzu Iced Tea', description: 'Citrus black tea.', priceCents: 449, imageEmoji: '🧋' }),
      ] },
    ],
  }),
  restaurant({
    id: 'taco-verde',
    name: 'Taco Verde',
    cuisine: 'Mexican',
    rating: 4.4,
    deliveryMinutes: '18–28 min',
    deliveryFeeCents: 199,
    serviceFeeCents: 219,
    distanceMiles: 1.7,
    imageEmoji: '🌮',
    imageAlt: 'Three colorful tacos with salsa',
    isOpen: true,
    tags: ['Fast', 'Tacos', 'Vegetarian'],
    menuCategories: [
      { id: 'tacos', name: 'Tacos', items: [
        entreeItem({ id: 'carne-asada-tacos', name: 'Carne Asada Tacos', description: 'Three tacos, salsa roja, onions.', priceCents: 1299, imageEmoji: '🌮', popular: true }),
        entreeItem({ id: 'mushroom-tacos', name: 'Mushroom Tacos', description: 'Adobo mushrooms, crema, cabbage.', priceCents: 1199, imageEmoji: '🍄' }),
        entreeItem({ id: 'fish-tacos', name: 'Baja Fish Tacos', description: 'Crispy fish, slaw, chipotle sauce.', priceCents: 1399, imageEmoji: '🐟' }),
      ] },
      { id: 'bowls-burritos', name: 'Bowls & burritos', items: [
        entreeItem({ id: 'verde-burrito', name: 'Verde Burrito', description: 'Rice, beans, protein, tomatillo salsa.', priceCents: 1299, imageEmoji: '🌯' }),
        entreeItem({ id: 'fajita-bowl', name: 'Fajita Bowl', description: 'Peppers, onions, rice, black beans.', priceCents: 1199, imageEmoji: '🥣' }),
        entreeItem({ id: 'nacho-box', name: 'Loaded Nacho Box', description: 'Chips, queso, beans, pico.', priceCents: 1099, imageEmoji: '🧀' }),
      ] },
      { id: 'salsa-bar', name: 'Salsa bar', items: [
        item({ id: 'chips-guac', name: 'Chips & Guac', description: 'House guacamole and tortilla chips.', priceCents: 799, imageEmoji: '🥑' }),
        item({ id: 'street-corn', name: 'Street Corn', description: 'Cotija-style cheese, lime, chile.', priceCents: 599, imageEmoji: '🌽' }),
        drinkItem({ id: 'agua-fresca', name: 'Watermelon Agua Fresca', description: 'Fresh watermelon and lime.', priceCents: 399, imageEmoji: '🍉' }),
      ] },
    ],
  }),

  restaurant({
    id: 'burger-forge',
    name: 'Burger Forge',
    cuisine: 'Burgers',
    rating: 4.3,
    deliveryMinutes: '22–32 min',
    deliveryFeeCents: 249,
    serviceFeeCents: 229,
    distanceMiles: 2.0,
    imageEmoji: '🍔',
    imageAlt: 'Stacked burger with fries',
    isOpen: true,
    tags: ['Burgers', 'Fries', 'Fast'],
    menuCategories: [
      { id: 'burgers', name: 'Burgers', items: [
        entreeItem({ id: 'forge-classic', name: 'Forge Classic', description: 'Cheddar, pickles, onion, house sauce.', priceCents: 1299, imageEmoji: '🍔', popular: true }),
        entreeItem({ id: 'smokehouse-burger', name: 'Smokehouse Burger', description: 'BBQ sauce, crispy onions, bacon-style strips.', priceCents: 1499, imageEmoji: '🥓' }),
        entreeItem({ id: 'garden-burger', name: 'Garden Burger', description: 'Plant patty, lettuce, tomato, vegan aioli.', priceCents: 1399, imageEmoji: '🥬' }),
      ] },
      { id: 'fries', name: 'Fries', items: [
        item({ id: 'sea-salt-fries', name: 'Sea Salt Fries', description: 'Crispy skin-on fries.', priceCents: 499, imageEmoji: '🍟' }),
        item({ id: 'loaded-fries', name: 'Loaded Fries', description: 'Queso, scallions, crema.', priceCents: 799, imageEmoji: '🧀' }),
        item({ id: 'onion-rings', name: 'Onion Rings', description: 'Beer-battered onion rings.', priceCents: 699, imageEmoji: '🧅' }),
      ] },
      { id: 'shakes', name: 'Shakes', items: [
        drinkItem({ id: 'vanilla-shake', name: 'Vanilla Shake', description: 'Classic hand-spun shake.', priceCents: 599, imageEmoji: '🥤' }),
        drinkItem({ id: 'chocolate-shake', name: 'Chocolate Shake', description: 'Chocolate malt shake.', priceCents: 649, imageEmoji: '🍫' }),
        item({ id: 'brownie-bite', name: 'Brownie Bite', description: 'Fudgy brownie square.', priceCents: 399, imageEmoji: '🍪' }),
      ] },
    ],
  }),
  restaurant({
    id: 'green-garden',
    name: 'Green Garden',
    cuisine: 'Salads',
    rating: 4.6,
    deliveryMinutes: '16–26 min',
    deliveryFeeCents: 149,
    serviceFeeCents: 199,
    distanceMiles: 1.1,
    imageEmoji: '🥗',
    imageAlt: 'Bright salad bowl with greens',
    isOpen: true,
    tags: ['Healthy', 'Vegetarian', 'Fast'],
    menuCategories: [
      { id: 'salads', name: 'Salads', items: [
        entreeItem({ id: 'harvest-salad', name: 'Harvest Salad', description: 'Greens, apple, seeds, maple vinaigrette.', priceCents: 1199, imageEmoji: '🥗', popular: true }),
        entreeItem({ id: 'caesar-protein', name: 'Protein Caesar', description: 'Romaine, parmesan, croutons.', priceCents: 1299, imageEmoji: '🥬' }),
        entreeItem({ id: 'mediterranean-bowl', name: 'Mediterranean Bowl', description: 'Chickpeas, cucumber, tomato, tahini.', priceCents: 1249, imageEmoji: '🧆' }),
      ] },
      { id: 'soups', name: 'Soups', items: [
        item({ id: 'tomato-soup', name: 'Tomato Soup', description: 'Roasted tomato basil soup.', priceCents: 699, imageEmoji: '🍅' }),
        item({ id: 'lentil-soup', name: 'Lentil Soup', description: 'Warm lentils and herbs.', priceCents: 749, imageEmoji: '🥣' }),
        item({ id: 'sourdough-roll', name: 'Sourdough Roll', description: 'Warm roll with butter.', priceCents: 299, imageEmoji: '🥖' }),
      ] },
      { id: 'smoothies', name: 'Smoothies', items: [
        drinkItem({ id: 'green-smoothie', name: 'Green Smoothie', description: 'Spinach, mango, banana.', priceCents: 699, imageEmoji: '🥤' }),
        drinkItem({ id: 'berry-smoothie', name: 'Berry Smoothie', description: 'Mixed berries and oat milk.', priceCents: 699, imageEmoji: '🫐' }),
        item({ id: 'energy-bites', name: 'Energy Bites', description: 'Oat, date, cocoa bites.', priceCents: 499, imageEmoji: '⚡' }),
      ] },
    ],
  }),
  restaurant({
    id: 'sushi-lane',
    name: 'Sushi Lane',
    cuisine: 'Sushi',
    rating: 4.8,
    deliveryMinutes: '28–38 min',
    deliveryFeeCents: 399,
    serviceFeeCents: 299,
    distanceMiles: 3.5,
    imageEmoji: '🍣',
    imageAlt: 'Assorted sushi rolls on a tray',
    isOpen: true,
    tags: ['Top rated', 'Sushi', 'Premium'],
    menuCategories: [
      { id: 'rolls', name: 'Rolls', items: [
        entreeItem({ id: 'california-roll', name: 'California Roll', description: 'Crab-style mix, avocado, cucumber.', priceCents: 999, imageEmoji: '🍣' }),
        entreeItem({ id: 'spicy-tuna-roll', name: 'Spicy Tuna Roll', description: 'Tuna, spicy mayo, scallion.', priceCents: 1199, imageEmoji: '🌶️', popular: true }),
        entreeItem({ id: 'dragon-roll', name: 'Dragon Roll', description: 'Eel-style sauce, avocado, cucumber.', priceCents: 1499, imageEmoji: '🐉' }),
      ] },
      { id: 'nigiri', name: 'Nigiri', items: [
        item({ id: 'salmon-nigiri', name: 'Salmon Nigiri', description: 'Two pieces.', priceCents: 899, imageEmoji: '🍣' }),
        item({ id: 'tuna-nigiri', name: 'Tuna Nigiri', description: 'Two pieces.', priceCents: 999, imageEmoji: '🐟' }),
        item({ id: 'tamago-nigiri', name: 'Tamago Nigiri', description: 'Sweet omelet, two pieces.', priceCents: 699, imageEmoji: '🥚' }),
      ] },
      { id: 'sushi-sides', name: 'Sides', items: [
        item({ id: 'miso-soup', name: 'Miso Soup', description: 'Tofu, wakame, scallion.', priceCents: 399, imageEmoji: '🥣' }),
        item({ id: 'seaweed-salad', name: 'Seaweed Salad', description: 'Sesame seaweed salad.', priceCents: 599, imageEmoji: '🥗' }),
        drinkItem({ id: 'matcha-tea', name: 'Matcha Tea', description: 'Iced ceremonial-style matcha.', priceCents: 499, imageEmoji: '🍵' }),
      ] },
    ],
  }),
  restaurant({
    id: 'sweet-street',
    name: 'Sweet Street',
    cuisine: 'Dessert',
    rating: 4.2,
    deliveryMinutes: '24–34 min',
    deliveryFeeCents: 199,
    serviceFeeCents: 179,
    distanceMiles: 2.8,
    imageEmoji: '🧁',
    imageAlt: 'Cupcakes and cookies in a bakery case',
    isOpen: false,
    tags: ['Closed', 'Dessert', 'Bakery'],
    menuCategories: [
      { id: 'cupcakes', name: 'Cupcakes', items: [
        item({ id: 'red-velvet-cupcake', name: 'Red Velvet Cupcake', description: 'Cream cheese-style frosting.', priceCents: 449, imageEmoji: '🧁', popular: true }),
        item({ id: 'vanilla-cupcake', name: 'Vanilla Cupcake', description: 'Vanilla bean frosting.', priceCents: 399, imageEmoji: '🧁' }),
        item({ id: 'lemon-cupcake', name: 'Lemon Cupcake', description: 'Lemon curd center.', priceCents: 449, imageEmoji: '🍋' }),
      ] },
      { id: 'cookies', name: 'Cookies', items: [
        item({ id: 'chocolate-chip', name: 'Chocolate Chip Cookie', description: 'Brown butter cookie.', priceCents: 349, imageEmoji: '🍪' }),
        item({ id: 'snickerdoodle', name: 'Snickerdoodle', description: 'Cinnamon sugar cookie.', priceCents: 329, imageEmoji: '🍪' }),
        item({ id: 'oatmeal-cookie', name: 'Oatmeal Cookie', description: 'Oats and raisins.', priceCents: 329, imageEmoji: '🍪' }),
      ] },
      { id: 'coffee', name: 'Coffee', items: [
        drinkItem({ id: 'cold-brew', name: 'Cold Brew', description: 'Slow-steeped coffee.', priceCents: 449, imageEmoji: '☕' }),
        drinkItem({ id: 'latte', name: 'Iced Latte', description: 'Espresso and milk.', priceCents: 549, imageEmoji: '🥛' }),
        item({ id: 'birthday-candle', name: 'Birthday Candle', description: 'Single celebratory candle.', priceCents: 99, imageEmoji: '🕯️' }),
      ] },
    ],
  }),
];

export const emptyRestaurants: Restaurant[] = [];
export const restaurantWithoutMenu: Restaurant = restaurant({
  id: 'coming-soon-kitchen',
  name: 'Coming Soon Kitchen',
  cuisine: 'TBD',
  rating: 0,
  deliveryMinutes: 'Unavailable',
  deliveryFeeCents: 0,
  distanceMiles: 0,
  imageEmoji: '🏗️',
  imageAlt: 'Restaurant under construction placeholder',
  isOpen: false,
  tags: ['Coming soon'],
  menuCategories: [],
});

export function validateFixtures(): string[] {
  const errors: string[] = [];
  restaurants.forEach(restaurant => {
    if (restaurant.menuCategories.length < 3) errors.push(`${restaurant.id} needs at least 3 menu categories.`);
    if (restaurant.menu.length < 4) errors.push(`${restaurant.id} needs at least 4 menu items.`);
    restaurant.menu.forEach(menuItem => {
      menuItem.modifierGroups.forEach(group => {
        if (group.required && (group.minSelected ?? 0) < 1) errors.push(`${menuItem.id}.${group.id} required groups need minSelected.`);
        if (group.maxSelected && group.minSelected && group.maxSelected < group.minSelected) errors.push(`${menuItem.id}.${group.id} maxSelected is below minSelected.`);
      });
    });
  });
  return errors;
}

export const mockUserProfile: UserProfile = {
  id: 'user-1001',
  name: 'Jamie Demo',
  email: 'jamie.demo@example.com',
  phone: '+1-555-0100',
  defaultAddressId: 'addr-home',
  favoriteRestaurantIds: ['marios-pizza', 'neapolitan-nova'],
};

export const mockAddresses: Address[] = [
  {
    id: 'addr-home',
    userId: mockUserProfile.id,
    label: 'Home',
    street: '123 Demo Street',
    apartment: 'Apt 4B',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    deliveryInstructions: 'Leave at door.',
  },
  {
    id: 'addr-work-no-unit',
    userId: mockUserProfile.id,
    label: 'Work',
    street: '88 Market Plaza',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94103',
    deliveryInstructions: 'Meet in lobby.',
  },
];

export const orderStatusSteps: OrderStatusStep[] = [
  { status: 'Placed', label: 'Order placed', description: 'We sent the order to the restaurant.', etaMinutesFromOrder: 0 },
  { status: 'Confirmed', label: 'Confirmed', description: 'The kitchen accepted the order.', etaMinutesFromOrder: 3 },
  { status: 'Preparing', label: 'Preparing', description: 'Your meal is being prepared.', etaMinutesFromOrder: 12 },
  { status: 'Out for delivery', label: 'On the way', description: 'A courier is headed to you.', etaMinutesFromOrder: 28 },
  { status: 'Delivered', label: 'Delivered', description: 'Enjoy your meal.', etaMinutesFromOrder: 36 },
];

export function findRestaurant(restaurantId: string, source: Restaurant[] = restaurants): Restaurant | undefined {
  return source.find(restaurant => restaurant.id === restaurantId);
}

export function getMenuItems(restaurant: Restaurant): MenuItem[] {
  return restaurant.menuCategories.flatMap(category => category.items);
}

export function findMenuItem(restaurantId: string, itemId: string, source: Restaurant[] = restaurants): MenuItem | undefined {
  const restaurant = findRestaurant(restaurantId, source);
  return restaurant?.menu.find(item => item.id === itemId) ?? restaurant?.menuCategories.flatMap(category => category.items).find(item => item.id === itemId);
}

export function findMenuCategory(restaurantId: string, categoryId: string, source: Restaurant[] = restaurants): MenuCategory | undefined {
  return findRestaurant(restaurantId, source)?.menuCategories.find(category => category.id === categoryId);
}

export function getDefaultModifiers(item: MenuItem): CartItemModifier[] {
  return item.modifierGroups.map(group => ({
    groupId: group.id,
    optionIds: group.required && group.options[0] ? [group.options[0].id] : [],
  }));
}

export function calculateItemTotal(item: MenuItem, modifiers: CartItemModifier[]): number {
  const modifierTotal = modifiers.reduce((sum, modifier) => {
    const group = item.modifierGroups.find(candidate => candidate.id === modifier.groupId);
    if (!group) return sum;
    return sum + group.options
      .filter(option => modifier.optionIds.includes(option.id))
      .reduce((optionSum, option) => optionSum + option.priceDeltaCents, 0);
  }, 0);

  return item.priceCents + modifierTotal;
}

export function calculateCartSubtotal(cartItems: CartItem[], source: Restaurant[] = restaurants): number {
  return cartItems.reduce((sum, cartItem) => {
    const menuItem = findMenuItem(cartItem.restaurantId, cartItem.menuItemId, source);
    const lineBase = menuItem ? calculateItemTotal(menuItem, cartItem.modifiers) : cartItem.basePriceCents;
    return sum + lineBase * cartItem.quantity;
  }, 0);
}

export function calculateCartTotals(cartItems: CartItem[], restaurantId?: string, discountCents = 0): CartTotals {
  const subtotalCents = calculateCartSubtotal(cartItems);
  const restaurant = restaurantId ? findRestaurant(restaurantId) : findRestaurant(cartItems[0]?.restaurantId ?? '');
  const deliveryFeeCents = subtotalCents > 0 ? restaurant?.deliveryFeeCents ?? 0 : 0;
  const serviceFeeCents = subtotalCents > 0 ? restaurant?.serviceFeeCents ?? DEFAULT_SERVICE_FEE_CENTS : 0;
  const taxCents = Math.round(Math.max(subtotalCents - discountCents, 0) * TAX_RATE);
  const totalCents = Math.max(subtotalCents - discountCents, 0) + deliveryFeeCents + serviceFeeCents + taxCents;

  return { subtotalCents, discountCents, deliveryFeeCents, serviceFeeCents, taxCents, totalCents };
}

export function createMockOrderId(seed = 'demo-order'): string {
  return `ORD-${seed.replace(/[^a-z0-9]/gi, '').slice(0, 7).toUpperCase().padEnd(7, '0')}`;
}

export function createMockOrder(cartItems: CartItem[], restaurantId = cartItems[0]?.restaurantId ?? restaurants[0].id, nowIso = MOCK_NOW_ISO): Order {
  const createdAt = new Date(nowIso);
  const estimatedDeliveryAt = new Date(createdAt.getTime() + 35 * 60 * 1000);
  const totals = calculateCartTotals(cartItems, restaurantId);

  return {
    id: createMockOrderId(`${restaurantId}-${createdAt.toISOString()}`),
    userId: mockUserProfile.id,
    restaurantId,
    cartItems,
    totals,
    subtotalCents: totals.subtotalCents,
    status: 'Preparing',
    createdAt: createdAt.toISOString(),
    updatedAt: new Date(createdAt.getTime() + 10 * 60 * 1000).toISOString(),
    deliveryAddressId: mockUserProfile.defaultAddressId,
    estimatedDeliveryAt: estimatedDeliveryAt.toISOString(),
  };
}

export const mockCartItems: CartItem[] = [
  {
    id: 'cart-pepperoni-large',
    restaurantId: 'marios-pizza',
    menuItemId: 'pepperoni-feast',
    name: 'Pepperoni Feast',
    quantity: 1,
    basePriceCents: 1499,
    modifiers: [
      { groupId: 'size', optionIds: ['large'] },
      { groupId: 'crust', optionIds: ['classic'] },
      { groupId: 'cheese', optionIds: ['extra-cheese'] },
      { groupId: 'toppings', optionIds: ['pepperoni'] },
    ],
  },
];

export const mockOrders: Order[] = [createMockOrder(mockCartItems, 'marios-pizza')];
