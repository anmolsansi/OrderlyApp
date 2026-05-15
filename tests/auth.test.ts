import { describe, expect, it } from 'vitest';
import {
  AUTH_ACCOUNTS_STORAGE_KEY,
  getCurrentAuthAccount,
  getCurrentAuthSession,
  getDemoAccount,
  getStoredAccounts,
  isSignedIn,
  signInWithCredentials,
  signOut,
  signUpWithCredentials,
} from '../lib/auth';
import { PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from '../lib/cart';

function createStorage(): Storage {
  const storage = new Map<string, string>();
  return {
    get length() { return storage.size; },
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key: string) => { storage.delete(key); },
    setItem: (key: string, value: string) => { storage.set(key, value); },
  } as Storage;
}

describe('local auth', () => {
  it('seeds demo credentials when no local accounts exist', () => {
    const storage = createStorage();
    expect(getStoredAccounts(storage)).toEqual([getDemoAccount()]);
  });

  it('signs in with demo credentials and clears only the session on sign out', () => {
    const storage = createStorage();
    storage.setItem('orderlyapp.marketplace.cart.v1', '[]');

    const result = signInWithCredentials(storage, getDemoAccount().email, getDemoAccount().password);

    expect(result.ok).toBe(true);
    expect(isSignedIn(storage)).toBe(true);
    expect(getCurrentAuthAccount(storage)?.email).toBe(getDemoAccount().email);
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toContain(getDemoAccount().email);

    signOut(storage);

    expect(isSignedIn(storage)).toBe(false);
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('orderlyapp.marketplace.cart.v1')).toBe('[]');
  });

  it('creates a local account and prevents duplicate signup', () => {
    const storage = createStorage();
    const result = signUpWithCredentials(storage, {
      name: 'Riley Local',
      email: 'RILEY@example.com',
      phone: '+1-555-0199',
      password: 'password-1',
    });

    expect(result.ok).toBe(true);
    expect(getCurrentAuthSession(storage)?.email).toBe('riley@example.com');
    expect(storage.getItem(AUTH_ACCOUNTS_STORAGE_KEY)).toContain('riley@example.com');

    const duplicate = signUpWithCredentials(storage, {
      name: 'Riley Again',
      email: 'riley@example.com',
      phone: '+1-555-0199',
      password: 'password-1',
    });

    expect(duplicate.ok).toBe(false);
    expect(duplicate.errors[0]).toContain('already exists');
  });

  it('rejects invalid or wrong credentials', () => {
    const storage = createStorage();

    expect(signUpWithCredentials(storage, {
      name: '',
      email: 'bad',
      phone: '1',
      password: 'short',
    }).errors).toEqual([
      'Enter a valid email address.',
      'Name is required.',
      'Enter a valid phone number.',
      'Password must be at least 8 characters.',
    ]);

    expect(signInWithCredentials(storage, getDemoAccount().email, 'wrong-password').ok).toBe(false);
  });
});
