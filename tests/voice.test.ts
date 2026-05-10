import { describe, expect, it } from 'vitest';
import { findMenuItemFromText, findRestaurantFromText, parseVoiceIntent } from '../lib/voice';

describe('voice intent parsing', () => {
  it('parses add-to-cart with size and toppings', () => {
    const intent = parseVoiceIntent('add a large pepperoni pizza with jalapeños and extra cheese');
    expect(intent.type).toBe('add_to_cart');
    expect(intent.size).toBe('large');
    expect(intent.toppings).toContain('jalapenos');
    expect(intent.toppings).toContain('extra-cheese');
  });

  it('parses cart management commands', () => {
    expect(parseVoiceIntent('show cart').type).toBe('view_cart');
    expect(parseVoiceIntent('remove item').type).toBe('remove_item');
    expect(parseVoiceIntent('clear cart').type).toBe('clear_cart');
  });

  it('matches menu items from natural language', () => {
    const match = findMenuItemFromText('I want bbq chicken pizza');
    expect(match?.item.name).toContain('BBQ Chicken');
  });

  it('selects a restaurant instead of adding a default pizza when only restaurant is named', () => {
    const intent = parseVoiceIntent('I want to order pizza from Chicago square cut');
    expect(intent.type).toBe('select_restaurant');
    expect(intent.restaurantName).toBe('Chicago Square Cut');
    expect(findRestaurantFromText('Chicago square cut')?.name).toBe('Chicago Square Cut');
  });
});
