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
    imageEmoji: "🍕",
    distanceMiles: 0.8,
    promotion: "$5 off $25",
    status: "open",
    tags: ["Popular", "Thin crust", "Open late"],
    menu: [
      pizzaItem({
        id: "margherita",
        name: "Classic Margherita",
        description: "Tomato, mozzarella, basil, olive oil.",
        priceCents: 1299,
        imageEmoji: "🌿",
        popular: true,
      }),
      pizzaItem({
        id: "pepperoni-feast",
        name: "Pepperoni Feast",
        description: "Double pepperoni, mozzarella, red sauce.",
        priceCents: 1499,
        imageEmoji: "🍕",
        popular: true,
      }),
      pizzaItem({
        id: "garden-supreme",
        name: "Garden Supreme",
        description: "Bell peppers, mushrooms, onions, olives.",
        priceCents: 1399,
        imageEmoji: "🫑",
      }),
      pizzaItem({
        id: "truffle-burrata",
        name: "Truffle Burrata Cloud",
        description: "Burrata, truffle oil, roasted mushrooms, basil.",
        priceCents: 1899,
        imageEmoji: "☁️",
      }),
    ],
  }),
  restaurant({
    id: 'slice-station',
    name: 'Slice Station',
    cuisine: 'Pizza',
    rating: 4.6,
    deliveryMinutes: '15–25 min',
    deliveryFeeCents: 249,
    imageEmoji: "🚉",
    distanceMiles: 1.2,
    promotion: "Free garlic knots",
    status: "open",
    tags: ["Fast", "NY style"],
    menu: [
      pizzaItem({
        id: "ny-cheese",
        name: "NY Cheese Slice Box",
        description: "Foldable cheese pizza with oregano dust.",
        priceCents: 1199,
        imageEmoji: "🧀",
        popular: true,
      }),
      pizzaItem({
        id: "spicy-vodka",
        name: "Spicy Vodka Pizza",
        description: "Vodka sauce, chili flakes, parmesan.",
        priceCents: 1599,
        imageEmoji: "🌶️",
        popular: true,
      }),
      pizzaItem({
        id: "soho-white",
        name: "SoHo White Pie",
        description: "Ricotta, mozzarella, garlic confit, cracked pepper.",
        priceCents: 1699,
        imageEmoji: "🤍",
      }),
      pizzaItem({
        id: "subway-supreme",
        name: "Subway Supreme",
        description: "Sausage, peppers, olives, onions, mozzarella.",
        priceCents: 1599,
        imageEmoji: "🚇",
      }),
    ],
  }),
  restaurant({
    id: 'dough-and-co',
    name: 'Dough & Co.',
    cuisine: 'Pizza',
    rating: 4.7,
    deliveryMinutes: '25–35 min',
    deliveryFeeCents: 99,
    imageEmoji: "🔥",
    distanceMiles: 2.4,
    promotion: "0% delivery fee",
    status: "open",
    tags: ["Wood fired", "Best value"],
    menu: [
      pizzaItem({
        id: "wood-fired-trio",
        name: "Wood-Fired Trio",
        description: "Three-cheese blend, charred crust, basil.",
        priceCents: 1699,
        imageEmoji: "🔥",
        popular: true,
      }),
      pizzaItem({
        id: "bbq-chicken",
        name: "BBQ Chicken Pizza",
        description: "Chicken, BBQ sauce, red onion, cilantro.",
        priceCents: 1599,
        imageEmoji: "🍗",
      }),
      pizzaItem({
        id: "ember-mushroom",
        name: "Ember Mushroom",
        description: "Roasted mushrooms, smoked provolone, thyme.",
        priceCents: 1799,
        imageEmoji: "🍄",
      }),
      pizzaItem({
        id: "hot-honey-soppressata",
        name: "Hot Honey Soppressata",
        description: "Soppressata-style pepperoni, hot honey, mozzarella.",
        priceCents: 1899,
        imageEmoji: "🍯",
        popular: true,
      }),
    ],
  }),
  restaurant({
    id: 'neapolitan-nova',
    name: 'Neapolitan Nova',
    cuisine: 'Pizza',
    rating: 4.9,
    deliveryMinutes: '30–40 min',
    deliveryFeeCents: 299,
    imageEmoji: "🇮🇹",
    distanceMiles: 3.1,
    promotion: "Chef pick",
    status: "open",
    tags: ["Neapolitan", "Wood fired", "Premium"],
    menu: [
      pizzaItem({
        id: "san-marzano-star",
        name: "San Marzano Star",
        description: "San Marzano tomato, fresh mozzarella, basil.",
        priceCents: 1799,
        imageEmoji: "⭐",
        popular: true,
      }),
      pizzaItem({
        id: "diavola-nova",
        name: "Diavola Nova",
        description: "Spicy salami-style pepperoni, chili oil, mozzarella.",
        priceCents: 1899,
        imageEmoji: "🌋",
      }),
      pizzaItem({
        id: "prosciutto-arugula",
        name: "Prosciutto & Arugula",
        description: "Cured-style prosciutto, arugula, parmesan, lemon oil.",
        priceCents: 1999,
        imageEmoji: "🥬",
      }),
      pizzaItem({
        id: "pesto-verde",
        name: "Pesto Verde",
        description: "Basil pesto, ricotta, roasted tomatoes, pine nuts.",
        priceCents: 1849,
        imageEmoji: "💚",
      }),
    ],
  }),

  restaurant({
    id: 'chicago-square-cut',
    name: 'Chicago Square Cut',
    cuisine: 'Pizza',
    rating: 4.7,
    deliveryMinutes: "25–35 min",
    deliveryFeeCents: 199,
    imageEmoji: "🧱",
    distanceMiles: 1.8,
    promotion: "Buy 1, get 1",
    status: "open",
    tags: ["Detroit style", "Crispy edges"],
    menu: [
      pizzaItem({
        id: "motor-city-red-top",
        name: "Motor City Red Top",
        description: "Brick cheese-style blend, sauce stripes, crispy corners.",
        priceCents: 1799,
        imageEmoji: "🟥",
        popular: true,
      }),
      pizzaItem({
        id: "pepperoni-corners",
        name: "Pepperoni Corners",
        description: "Cup-and-char pepperoni, caramelized cheese edge.",
        priceCents: 1899,
        imageEmoji: "🔶",
        popular: true,
      }),
      pizzaItem({
        id: "blue-line-bbq",
        name: "Blue Line BBQ Chicken",
        description: "BBQ chicken, smoked provolone, red onion.",
        priceCents: 1849,
        imageEmoji: "🏒",
      }),
      pizzaItem({
        id: "garlic-ranch-depth",
        name: "Garlic Ranch Depth",
        description: "Garlic sauce, mozzarella, bacon, ranch drizzle.",
        priceCents: 1749,
        imageEmoji: "🧄",
      }),
    ],
  },
  {
    id: "vegan-vinyl",
    name: "Vegan Vinyl Pizza",
    cuisine: "Vegan Pizza",
    rating: 4.5,
    deliveryMinutes: "20–30 min",
    deliveryFeeCents: 149,
    imageEmoji: "🎵",
    distanceMiles: 2.9,
    promotion: "Plant deal",
    status: "open",
    tags: ["Vegan", "Plant-based"],
    menu: [
      pizzaItem({
        id: "plant-pepperoni",
        name: "Plant Pepperoni Spin",
        description: "Plant pepperoni, vegan cheese, tomato sauce.",
        priceCents: 1699,
        imageEmoji: "🌱",
        popular: true,
      }),
      pizzaItem({
        id: "cashew-cream-fungi",
        name: "Cashew Cream Fungi",
        description: "Cashew cream, mushrooms, garlic confit, arugula.",
        priceCents: 1799,
        imageEmoji: "🍄",
      }),
      pizzaItem({
        id: "garden-groove",
        name: "Garden Groove",
        description: "Peppers, olives, onions, basil, vegan mozzarella.",
        priceCents: 1599,
        imageEmoji: "🎶",
      }),
      pizzaItem({
        id: "bbq-jackfruit",
        name: "BBQ Jackfruit Jam",
        description: "BBQ jackfruit, red onion, vegan cheese.",
        priceCents: 1749,
        imageEmoji: "🎸",
      }),
    ],
  },
  {
    id: "chicago-square",
    name: "Chicago Square Cut",
    cuisine: "Pizza",
    rating: 4.6,
    deliveryMinutes: "35–45 min",
    deliveryFeeCents: 299,
    imageEmoji: "🏙️",
    distanceMiles: 5.6,
    status: "closed",
    outsideDeliveryRange: true,
    tags: ["Tavern style", "Square cut"],
    menu: [
      pizzaItem({
        id: "tavern-classic",
        name: "Tavern Classic",
        description: "Thin crust, sausage, green pepper, square cut.",
        priceCents: 1599,
        imageEmoji: "⬜",
        popular: true,
      }),
      pizzaItem({
        id: "deep-dish-lite",
        name: "Deep Dish Lite",
        description: "Pan crust, chunky tomato, mozzarella, parmesan.",
        priceCents: 1899,
        imageEmoji: "🥘",
      }),
      pizzaItem({
        id: "giardiniera-heat",
        name: "Giardiniera Heat",
        description: "Hot giardiniera, sausage, mozzarella.",
        priceCents: 1799,
        imageEmoji: "🌶️",
      }),
      pizzaItem({
        id: "lakefront-veggie",
        name: "Lakefront Veggie",
        description: "Spinach, mushrooms, onions, olives, ricotta.",
        priceCents: 1699,
        imageEmoji: "🌊",
      }),
    ],
  },
  {
    id: "california-crust",
    name: "California Crust Co.",
    cuisine: "Pizza",
    rating: 4.7,
    deliveryMinutes: "20–30 min",
    deliveryFeeCents: 199,
    imageEmoji: "🌴",
    distanceMiles: 1.6,
    promotion: "Fresh lunch combo",
    status: "open",
    tags: ["Fresh", "California", "Seasonal", "Gluten-free friendly", "Avocado", "Salads", "Family meals", "Catering"],
    menu: [
      pizzaItem({
        id: "avocado-ranch",
        name: "Avocado Ranch Chicken",
        description: "Chicken, avocado crema, ranch, tomatoes.",
        priceCents: 1899,
        imageEmoji: "🥑",
        popular: true,
      }),
      pizzaItem({
        id: "farmers-market",
        name: "Farmers Market Pie",
        description: "Seasonal vegetables, goat cheese, basil.",
        priceCents: 1799,
        imageEmoji: "🥕",
      }),
      pizzaItem({
        id: "surfside-pesto",
        name: "Surfside Pesto",
        description: "Pesto, mozzarella, artichokes, roasted tomatoes.",
        priceCents: 1849,
        imageEmoji: "🏄",
      }),
      pizzaItem({
        id: "golden-state-bbq",
        name: "Golden State BBQ",
        description: "BBQ sauce, chicken, pineapple, jalapeños.",
        priceCents: 1799,
        imageEmoji: "☀️",
      }),
    ],
  }),
  restaurant({
    id: 'taco-verde',
    name: 'Taco Verde',
    cuisine: 'Mexican',
    rating: 4.4,
    deliveryMinutes: "25–40 min",
    deliveryFeeCents: 349,
    imageEmoji: "🌙",
    distanceMiles: 3.8,
    promotion: "Open until 2 AM",
    status: "open",
    tags: ["Late night", "Spicy"],
    menu: [
      pizzaItem({
        id: "after-hours-pepperoni",
        name: "After Hours Pepperoni",
        description: "Pepperoni, hot honey, chili flakes.",
        priceCents: 1699,
        imageEmoji: "🕛",
        popular: true,
      }),
      pizzaItem({
        id: "black-olive-moon",
        name: "Black Olive Moon",
        description: "Black olives, mushrooms, mozzarella, oregano.",
        priceCents: 1549,
        imageEmoji: "🌑",
      }),
      pizzaItem({
        id: "midnight-meatball",
        name: "Midnight Meatball",
        description: "Meatballs, marinara, ricotta, parmesan.",
        priceCents: 1899,
        imageEmoji: "🍝",
      }),
      pizzaItem({
        id: "garlic-knight",
        name: "Garlic Knight White Pie",
        description: "Garlic confit, ricotta, mozzarella, parmesan.",
        priceCents: 1749,
        imageEmoji: "🛡️",
      }),
    ],
  }),

  restaurant({
    id: 'burger-forge',
    name: 'Burger Forge',
    cuisine: 'Burgers',
    rating: 4.3,
    deliveryMinutes: '22–32 min',
    deliveryFeeCents: 249,
    imageEmoji: "🌉",
    distanceMiles: 2.1,
    status: "closed",
    tags: ["Artisan", "Brooklyn style"],
    menu: [
      pizzaItem({
        id: "basil-works-classic",
        name: "Basil Works Classic",
        description: "Fresh mozzarella, basil, tomato, parmesan.",
        priceCents: 1599,
        imageEmoji: "🌿",
        popular: true,
      }),
      pizzaItem({
        id: "brooklyn-bee-sting",
        name: "Brooklyn Bee Sting",
        description: "Pepperoni, hot honey, mozzarella, chili.",
        priceCents: 1899,
        imageEmoji: "🐝",
        popular: true,
      }),
      pizzaItem({
        id: "ricotta-rooftop",
        name: "Ricotta Rooftop",
        description: "Whipped ricotta, lemon zest, garlic, basil.",
        priceCents: 1799,
        imageEmoji: "🏢",
      }),
      pizzaItem({
        id: "sausage-and-fennel",
        name: "Sausage & Fennel",
        description: "Italian sausage, fennel, onions, smoked provolone.",
        priceCents: 1849,
        imageEmoji: "🌭",
      }),
    ],
  }),
  restaurant({
    id: 'green-garden',
    name: 'Green Garden',
    cuisine: 'Salads',
    rating: 4.6,
    deliveryMinutes: "30–45 min",
    deliveryFeeCents: 199,
    imageEmoji: "🏔️",
    distanceMiles: 6.3,
    imageAvailable: false,
    outsideDeliveryRange: true,
    status: "open",
    tags: ["Hearty", "Lodge style"],
    menu: [
      pizzaItem({
        id: "alpine-four-cheese",
        name: "Alpine Four Cheese",
        description: "Mozzarella, provolone, parmesan, goat cheese.",
        priceCents: 1849,
        imageEmoji: "🧀",
        popular: true,
      }),
      pizzaItem({
        id: "campfire-bacon",
        name: "Campfire Bacon",
        description: "Bacon, mushrooms, smoked provolone, BBQ drizzle.",
        priceCents: 1899,
        imageEmoji: "🏕️",
      }),
      pizzaItem({
        id: "forager-pie",
        name: "Forager Pie",
        description: "Mushrooms, garlic confit, truffle oil, arugula.",
        priceCents: 1999,
        imageEmoji: "🍄",
      }),
      pizzaItem({
        id: "pineapple-peak",
        name: "Pineapple Peak",
        description: "Pineapple, bacon, jalapeños, mozzarella.",
        priceCents: 1749,
        imageEmoji: "🍍",
      }),
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
    imageEmoji: "🛺",
    distanceMiles: 2.7,
    promotion: "New on Orderly",
    status: "open",
    tags: ["Bold flavors", "Fusion"],
    menu: [
      pizzaItem({
        id: "tikka-masala-pie",
        name: "Tikka Masala Pie",
        description: "Tikka-style sauce, chicken, onions, mozzarella.",
        priceCents: 1899,
        imageEmoji: "🍛",
        popular: true,
      }),
      pizzaItem({
        id: "paneer-pepper",
        name: "Paneer Pepper Pizza",
        description: "Paneer, bell peppers, onions, cilantro chutney drizzle.",
        priceCents: 1799,
        imageEmoji: "🧈",
      }),
      pizzaItem({
        id: "chili-corn-chaat",
        name: "Chili Corn Chaat",
        description: "Corn, jalapeños, onions, chaat spice, cheese.",
        priceCents: 1699,
        imageEmoji: "🌽",
      }),
      pizzaItem({
        id: "bombay-bbq",
        name: "Bombay BBQ Chicken",
        description: "BBQ chicken, masala onions, smoked provolone.",
        priceCents: 1849,
        imageEmoji: "🔥",
      }),
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
