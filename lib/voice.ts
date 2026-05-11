import { restaurants } from './mock-data';
import type { MenuItem, Restaurant, VoiceIntent } from './types';

const sizeWords = ['small', 'medium', 'large'];
const toppingWords = ['pepperoni', 'mushrooms', 'jalapenos', 'jalapeños', 'extra cheese'];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[.,!?]/g, '').trim();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some(word => text.includes(word));
}

export function parseVoiceIntent(transcript: string): VoiceIntent {
  const text = normalize(transcript);

  if (!text) {
    return {
      type: 'unknown',
      transcript,
      confidence: 'low',
      clarification: 'I did not hear anything. Try again or type a command.',
    };
  }

  if (includesAny(text, ['view cart', 'show cart', 'open cart', 'what is in my cart'])) {
    return { type: 'view_cart', transcript, confidence: 'high' };
  }

  if (includesAny(text, ['clear cart', 'empty cart'])) {
    return { type: 'clear_cart', transcript, confidence: 'high' };
  }

  if (includesAny(text, ['remove', 'delete', 'take out'])) {
    return { type: 'remove_item', transcript, confidence: 'medium' };
  }

  if (includesAny(text, ['add', 'order', 'get me', 'i want'])) {
    const size = sizeWords.find(word => text.includes(word));
    const toppings = toppingWords
      .filter(word => text.includes(word))
      .map(word => word === 'jalapeños' ? 'jalapenos' : word.replace(' ', '-'));

    const restaurant = findRestaurantFromText(text);
    const matched = findMenuItemFromText(text);

    if (restaurant && !matched) {
      return {
        type: 'select_restaurant',
        transcript,
        restaurantName: restaurant.name,
        confidence: 'high',
        clarification: `Showing ${restaurant.name}. Pick a menu item to add to your cart.`,
      };
    }

    if (!matched) {
      return {
        type: 'unknown',
        transcript,
        confidence: 'low',
        clarification: 'I could not match that to a menu item. Try saying “add a large pepperoni pizza”.',
      };
    }

    return {
      type: 'add_to_cart',
      transcript,
      itemName: matched.item.name,
      restaurantName: matched.restaurant.name,
      size,
      toppings,
      confidence: size ? 'high' : 'medium',
      clarification: size ? undefined : 'I can add this with the default size, or you can specify small, medium, or large.',
    };
  }

  return {
    type: 'unknown',
    transcript,
    confidence: 'low',
    clarification: 'Try commands like “add a large pepperoni pizza”, “view cart”, or “remove item”.',
  };
}

export function findRestaurantFromText(text: string): Restaurant | undefined {
  const normalized = normalize(text);

  return restaurants.find(restaurant => {
    const restaurantWords = restaurant.name
      .toLowerCase()
      .replace(/[.'&]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && word !== 'pizza');
    return restaurantWords.length > 0 && restaurantWords.every(word => normalized.includes(word));
  });
}

export function findMenuItemFromText(text: string): { restaurant: Restaurant; item: MenuItem } | undefined {
  const normalized = normalize(text);

  if (normalized.includes('bbq')) {
    return getFirstItemContaining('bbq');
  }
  if (normalized.includes('chicken')) {
    return getFirstItemContaining('chicken');
  }
  if (normalized.includes('pepperoni')) {
    return getFirstItemContaining('pepperoni');
  }
  if (normalized.includes('cheese')) {
    return getFirstItemContaining('cheese');
  }

  for (const restaurant of restaurants) {
    for (const item of restaurant.menu) {
      const words = item.name.toLowerCase().split(/\s+/).filter(word => word.length > 3 && word !== 'pizza');
      if (words.some(word => normalized.includes(word))) {
        return { restaurant, item };
      }
    }
  }

  return undefined;
}

function getFirstItemContaining(term: string): { restaurant: Restaurant; item: MenuItem } | undefined {
  for (const restaurant of restaurants) {
    const item = restaurant.menu.find(candidate => candidate.name.toLowerCase().includes(term));
    if (item) return { restaurant, item };
  }
  return undefined;
}
