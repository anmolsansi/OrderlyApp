import { describe, expect, it } from 'vitest';
import { readEnum, readOptionalUrl } from '../lib/env';

describe('environment helpers', () => {
  it('normalizes valid URLs without trailing slashes', () => {
    expect(readOptionalUrl('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:8000/', 'http://fallback.test')).toBe('http://localhost:8000');
  });

  it('uses defaults for empty optional URL values', () => {
    expect(readOptionalUrl('NEXT_PUBLIC_APP_URL', '', 'http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('accepts documented enum values and defaults empty optional values', () => {
    expect(readEnum('NEXT_PUBLIC_CHECKOUT_MODE', 'disabled', ['mock', 'disabled'], 'mock')).toBe('disabled');
    expect(readEnum('NEXT_PUBLIC_CHECKOUT_MODE', '', ['mock', 'disabled'], 'mock')).toBe('mock');
  });

  it('fails clearly in development for invalid enum values', () => {
    expect(() => readEnum('NEXT_PUBLIC_CHECKOUT_MODE', 'live', ['mock', 'disabled'], 'mock')).toThrow(
      'NEXT_PUBLIC_CHECKOUT_MODE must be one of: mock, disabled. Received: live',
    );
  });
});
