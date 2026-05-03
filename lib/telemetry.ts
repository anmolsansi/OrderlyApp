export type TelemetryEventName =
  | 'voice_command_received'
  | 'voice_command_failed'
  | 'cart_item_added'
  | 'cart_validation_failed'
  | 'mock_order_placed';

export interface TelemetryEvent {
  name: TelemetryEventName;
  timestamp: string;
  properties?: Record<string, string | number | boolean>;
}

const eventBuffer: TelemetryEvent[] = [];

export function trackEvent(name: TelemetryEventName, properties?: TelemetryEvent['properties']): TelemetryEvent {
  const event: TelemetryEvent = {
    name,
    timestamp: new Date().toISOString(),
    properties,
  };
  eventBuffer.push(event);

  if (process.env.NODE_ENV !== 'production') {
    console.info('[telemetry]', event);
  }

  return event;
}

export function getTelemetryBuffer(): TelemetryEvent[] {
  return [...eventBuffer];
}

export function clearTelemetryBuffer(): void {
  eventBuffer.length = 0;
}

export function reportError(error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[orderlyapp:error]', { context, message });
}
