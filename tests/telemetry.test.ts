import { describe, expect, it } from 'vitest';
import { clearTelemetryBuffer, getTelemetryBuffer, trackEvent } from '../lib/telemetry';

describe('telemetry hooks', () => {
  it('buffers events for later integration', () => {
    clearTelemetryBuffer();
    trackEvent('cart_item_added', { item: 'Pepperoni Feast' });
    expect(getTelemetryBuffer()).toHaveLength(1);
    expect(getTelemetryBuffer()[0].name).toBe('cart_item_added');
  });
});
