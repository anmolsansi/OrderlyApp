import { describe, expect, it } from 'vitest';
import { orderStatusSteps, validateFixtures } from '../lib/mock-data';
import { createMockOrderId } from '../lib/cart';

describe('fixtures and checkout primitives', () => {
  it('has valid restaurant fixtures', () => {
    expect(validateFixtures()).toEqual([]);
  });

  it('has complete order status timeline', () => {
    expect(orderStatusSteps.map(step => step.status)).toEqual([
      'Placed',
      'Confirmed',
      'Preparing',
      'Out for delivery',
      'Delivered',
    ]);
  });

  it('creates stable mock order ids', () => {
    expect(createMockOrderId('abc123')).toBe('ORD-ABC1230');
  });
});
