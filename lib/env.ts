export type VoiceMode = 'browser' | 'mock';
export type CheckoutMode = 'mock' | 'disabled';
export type AuthProvider = 'none' | 'mock' | 'clerk' | 'auth0';

const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_API_BASE_URL = 'http://localhost:8000';
const DEFAULT_VOICE_MODE: VoiceMode = 'browser';
const DEFAULT_CHECKOUT_MODE: CheckoutMode = 'mock';
const DEFAULT_AUTH_PROVIDER: AuthProvider = 'none';

function assertDevelopmentConfig(condition: boolean, message: string): void {
  if (!condition && process.env.NODE_ENV !== 'production') {
    throw new Error(message);
  }
}

export function readOptionalUrl(name: string, value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;

  assertDevelopmentConfig(
    candidate.length > 0,
    `${name} is empty. Set it in .env.local or use the documented value from .env.example.`,
  );

  try {
    return new URL(candidate).toString().replace(/\/$/, '');
  } catch {
    assertDevelopmentConfig(
      false,
      `${name} must be a valid absolute URL. Received: ${candidate}`,
    );
    return fallback;
  }
}

export function readEnum<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = (value?.trim() || fallback) as T;

  assertDevelopmentConfig(
    allowed.includes(candidate),
    `${name} must be one of: ${allowed.join(', ')}. Received: ${candidate}`,
  );

  return allowed.includes(candidate) ? candidate : fallback;
}

export const env = {
  appUrl: readOptionalUrl('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL, DEFAULT_APP_URL),
  apiBaseUrl: readOptionalUrl('NEXT_PUBLIC_API_BASE_URL', process.env.NEXT_PUBLIC_API_BASE_URL, DEFAULT_API_BASE_URL),
  voiceMode: readEnum('NEXT_PUBLIC_VOICE_MODE', process.env.NEXT_PUBLIC_VOICE_MODE, ['browser', 'mock'], DEFAULT_VOICE_MODE),
  checkoutMode: readEnum('NEXT_PUBLIC_CHECKOUT_MODE', process.env.NEXT_PUBLIC_CHECKOUT_MODE, ['mock', 'disabled'], DEFAULT_CHECKOUT_MODE),
  authProvider: readEnum('NEXT_PUBLIC_AUTH_PROVIDER', process.env.NEXT_PUBLIC_AUTH_PROVIDER, ['none', 'mock', 'clerk', 'auth0'], DEFAULT_AUTH_PROVIDER),
};
