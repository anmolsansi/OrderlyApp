import { describe, expect, it } from 'vitest';
import {
  DEMO_ADDRESSES_STORAGE_KEY,
  DEMO_PROFILE_STORAGE_KEY,
  LEGACY_AUTH_ACCOUNTS_STORAGE_KEY,
  MAX_DEMO_PROFILE_NAME_LENGTH,
  SYNTHETIC_DEMO_ADDRESSES,
  createDefaultDemoProfile,
  forgetDemoProfile,
  getDemoAddresses,
  getDemoProfile,
  getSessionProfile,
  isSignedIn,
  saveDemoProfile,
} from '../lib/auth';
import {
  ADDRESSES_STORAGE_KEY,
  CART_STORAGE_KEY,
  ORDER_HISTORY_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from '../lib/cart';
import { routes, sanitizeAppReturnPath } from '../lib/routes';

type StorageFailure = 'get' | 'set' | 'remove';

function createStorage(
  initial: Record<string, string> = {},
  failures: StorageFailure[] = [],
): { storage: Storage; snapshot: () => Record<string, string>; clearCalls: () => number } {
  const values = new Map<string, string>(Object.entries(initial));
  let clearCount = 0;

  const storage = {
    get length() { return values.size; },
    clear: () => { clearCount += 1; values.clear(); },
    getItem: (key: string) => {
      if (failures.includes('get')) throw new Error('storage read disabled');
      return values.get(key) ?? null;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      if (failures.includes('remove')) throw new Error('storage remove disabled');
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      if (failures.includes('set')) throw new Error('storage write disabled');
      values.set(key, value);
    },
  } as Storage;

  return {
    storage,
    snapshot: () => Object.fromEntries(values.entries()),
    clearCalls: () => clearCount,
  };
}

describe('C2 demo profile storage', () => {
  it('round-trips a valid versioned profile and seeds only synthetic addresses', () => {
    const { storage } = createStorage();
    const profile = createDefaultDemoProfile('Riley Demo', 'demo-address-2');

    const saved = saveDemoProfile(storage, profile);
    const loaded = getDemoProfile(storage);
    const addresses = getDemoAddresses(storage);

    expect(saved).toEqual({ ok: true, value: profile });
    expect(loaded).toEqual({ ok: true, value: profile });
    expect(addresses).toEqual({ ok: true, value: SYNTHETIC_DEMO_ADDRESSES });
    expect(storage.getItem(DEMO_PROFILE_STORAGE_KEY)).not.toContain('password');
    expect(storage.getItem(DEMO_ADDRESSES_STORAGE_KEY)).not.toContain('password');
  });

  it('rejects malformed JSON, unknown fields, invalid versions, and invalid names', () => {
    const malformed = createStorage({ [DEMO_PROFILE_STORAGE_KEY]: '{bad-json' }).storage;
    expect(getDemoProfile(malformed)).toMatchObject({ ok: false, code: 'invalid_profile' });

    const extraField = createStorage({
      [DEMO_PROFILE_STORAGE_KEY]: JSON.stringify({
        ...createDefaultDemoProfile(),
        password: 'should-never-exist',
      }),
    }).storage;
    expect(getDemoProfile(extraField)).toMatchObject({ ok: false, code: 'invalid_profile' });

    const badVersion = createStorage({
      [DEMO_PROFILE_STORAGE_KEY]: JSON.stringify({
        ...createDefaultDemoProfile(),
        schemaVersion: 2,
      }),
    }).storage;
    expect(getDemoProfile(badVersion)).toMatchObject({ ok: false, code: 'invalid_profile' });

    const emptyName = saveDemoProfile(createStorage().storage, createDefaultDemoProfile('   '));
    expect(emptyName).toMatchObject({ ok: false, code: 'invalid_profile' });

    const longName = saveDemoProfile(
      createStorage().storage,
      createDefaultDemoProfile('x'.repeat(MAX_DEMO_PROFILE_NAME_LENGTH + 1)),
    );
    expect(longName).toMatchObject({ ok: false, code: 'invalid_profile' });
  });

  it('surfaces storage read and write failures without throwing', () => {
    expect(getDemoProfile(createStorage({}, ['get']).storage)).toEqual({
      ok: false,
      code: 'storage_unavailable',
      message: 'Demo profile storage is unavailable',
    });

    expect(saveDemoProfile(createStorage({}, ['set']).storage, createDefaultDemoProfile())).toEqual({
      ok: false,
      code: 'storage_unavailable',
      message: 'Demo profile storage is unavailable',
    });
  });

  it('removes exact legacy account/session/profile/address keys without clearing unrelated data', () => {
    const { storage, snapshot, clearCalls } = createStorage({
      [LEGACY_AUTH_ACCOUNTS_STORAGE_KEY]: JSON.stringify([{ email: 'demo@example.com', password: 'legacy-secret' }]),
      [SESSION_STORAGE_KEY]: JSON.stringify({ userId: 'legacy-user', email: 'demo@example.com' }),
      [PROFILE_STORAGE_KEY]: JSON.stringify({ name: 'Legacy profile' }),
      [ADDRESSES_STORAGE_KEY]: JSON.stringify([{ street: 'Real-looking legacy address' }]),
      [CART_STORAGE_KEY]: '[{"menuItemId":"pizza"}]',
      [ORDER_HISTORY_STORAGE_KEY]: '[{"id":"ORD-KEEP"}]',
    });

    expect(getDemoProfile(storage)).toEqual({ ok: true, value: undefined });

    const remaining = snapshot();
    expect(remaining[LEGACY_AUTH_ACCOUNTS_STORAGE_KEY]).toBeUndefined();
    expect(remaining[SESSION_STORAGE_KEY]).toBeUndefined();
    expect(remaining[PROFILE_STORAGE_KEY]).toBeUndefined();
    expect(remaining[ADDRESSES_STORAGE_KEY]).toBeUndefined();
    expect(remaining[CART_STORAGE_KEY]).toBe('[{"menuItemId":"pizza"}]');
    expect(remaining[ORDER_HISTORY_STORAGE_KEY]).toBe('[{"id":"ORD-KEEP"}]');
    expect(JSON.stringify(remaining)).not.toContain('legacy-secret');
    expect(clearCalls()).toBe(0);
  });

  it('rejects tampered synthetic address storage', () => {
    const { storage } = createStorage({
      [DEMO_ADDRESSES_STORAGE_KEY]: JSON.stringify([
        { ...SYNTHETIC_DEMO_ADDRESSES[0], street: 'User supplied street' },
        SYNTHETIC_DEMO_ADDRESSES[1],
      ]),
    });

    expect(getDemoAddresses(storage)).toMatchObject({ ok: false, code: 'invalid_profile' });
  });

  it('allows local profile id/name/default changes without creating a browser ownership session', () => {
    const { storage } = createStorage();
    const first = saveDemoProfile(storage, createDefaultDemoProfile('First name'));
    expect(first.ok).toBe(true);

    const changed = saveDemoProfile(storage, {
      schemaVersion: 1,
      id: 'different-local-label',
      name: 'Second name',
      defaultAddressId: 'demo-address-2',
    });

    expect(changed).toMatchObject({
      ok: true,
      value: {
        id: 'different-local-label',
        name: 'Second name',
        defaultAddressId: 'demo-address-2',
      },
    });
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('keeps checkout compatibility synthetic and presentation-only', () => {
    const { storage } = createStorage();
    const profile = {
      schemaVersion: 1 as const,
      id: 'local-profile-id',
      name: 'Demo Checkout Name',
      defaultAddressId: 'demo-address-2',
    };
    expect(saveDemoProfile(storage, profile).ok).toBe(true);

    expect(isSignedIn(storage)).toBe(true);
    expect(getSessionProfile(storage)).toMatchObject({
      id: 'local-profile-id',
      name: 'Demo Checkout Name',
      defaultAddressId: 'demo-address-2',
    });
    expect(getSessionProfile(storage).email).toMatch(/example\.com$/);
  });

  it('does not persist the legacy checkout fallback as a C2 profile', () => {
    const { storage } = createStorage();

    expect(isSignedIn(storage)).toBe(false);
    expect(getSessionProfile(storage)).toMatchObject({
      id: 'user-1001',
      name: 'Jamie Demo',
      defaultAddressId: 'addr-home',
    });
    expect(storage.getItem(DEMO_PROFILE_STORAGE_KEY)).toBeNull();
  });

  it('forgets only the local demo profile namespace', () => {
    const { storage } = createStorage({
      [CART_STORAGE_KEY]: '[{"menuItemId":"pizza"}]',
      [ORDER_HISTORY_STORAGE_KEY]: '[{"id":"ORD-KEEP"}]',
    });
    expect(saveDemoProfile(storage, createDefaultDemoProfile()).ok).toBe(true);

    expect(forgetDemoProfile(storage)).toEqual({ ok: true, value: undefined });
    expect(storage.getItem(DEMO_PROFILE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(DEMO_ADDRESSES_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(CART_STORAGE_KEY)).toContain('pizza');
    expect(storage.getItem(ORDER_HISTORY_STORAGE_KEY)).toContain('ORD-KEEP');
  });
});

describe('safe app return paths', () => {
  it('keeps only known internal destinations and their local query strings', () => {
    expect(sanitizeAppReturnPath('/')).toBe('/');
    expect(sanitizeAppReturnPath('/account')).toBe('/account');
    expect(sanitizeAppReturnPath('/checkout')).toBe('/checkout');
    expect(sanitizeAppReturnPath('/cart')).toBe('/cart');
    expect(sanitizeAppReturnPath('/orders')).toBe('/orders');
    expect(sanitizeAppReturnPath('/restaurants/marios-pizza')).toBe('/restaurants/marios-pizza');
    expect(sanitizeAppReturnPath('/restaurants/marios-pizza/items/pepperoni-feast')).toBe('/restaurants/marios-pizza/items/pepperoni-feast');
    expect(sanitizeAppReturnPath('/restaurants?query=pepperoni&filter=Top+Rated')).toBe('/restaurants?query=pepperoni&filter=Top+Rated');
    expect(sanitizeAppReturnPath('/order-confirmation?orderId=demo-order')).toBe('/order-confirmation?orderId=demo-order');
    expect(routes.signIn('/checkout')).toBe('/sign-in?next=%2Fcheckout');
  });

  it('falls back for external, protocol-relative, encoded, malformed, or unknown destinations', () => {
    const unsafe = [
      'https://evil.example/steal',
      '//evil.example/steal',
      '/\\evil.example/steal',
      '/%2F%2Fevil.example/steal',
      '/restaurants/%2e%2e/account',
      '/checkout#outside-contract',
      '/unknown-route',
      ' /checkout',
      '',
    ];

    for (const candidate of unsafe) {
      expect(sanitizeAppReturnPath(candidate)).toBe('/account');
    }

    expect(sanitizeAppReturnPath(null, '/checkout')).toBe('/checkout');
    expect(routes.signIn('https://evil.example')).toBe('/sign-in?next=%2Faccount');
  });
});