import { ADDRESSES_STORAGE_KEY, PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from './cart';
import { mockAddresses, mockUserProfile } from './mock-data';
import type { Address, UserProfile } from './types';

export const AUTH_ACCOUNTS_STORAGE_KEY = 'orderlyapp.marketplace.authAccounts.v1';

export interface AuthAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  signedInAt: string;
}

export interface AuthResult {
  ok: boolean;
  errors: string[];
  account?: AuthAccount;
}

export function createAuthUserId(seed = Math.random().toString(36)): string {
  return `user-${Date.now()}-${seed.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'local'}`;
}

export function getStoredAccounts(storage: Storage): AuthAccount[] {
  const stored = storage.getItem(AUTH_ACCOUNTS_STORAGE_KEY);
  if (!stored) return [getDemoAccount()];
  try {
    const accounts = JSON.parse(stored) as AuthAccount[];
    const hasDemo = accounts.some(account => normalizeEmail(account.email) === normalizeEmail(mockUserProfile.email));
    return hasDemo ? accounts : [getDemoAccount(), ...accounts];
  } catch {
    return [getDemoAccount()];
  }
}

export function saveStoredAccounts(storage: Storage, accounts: AuthAccount[]): void {
  storage.setItem(AUTH_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

export function getDemoAccount(): AuthAccount {
  return {
    id: mockUserProfile.id,
    name: mockUserProfile.name,
    email: mockUserProfile.email,
    phone: mockUserProfile.phone,
    password: 'demo-password',
  };
}

export function getCurrentAuthSession(storage: Storage): AuthSession | undefined {
  const stored = storage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return undefined;
  if (stored === 'signed-in') {
    return { userId: mockUserProfile.id, email: mockUserProfile.email, signedInAt: new Date().toISOString() };
  }
  try {
    return JSON.parse(stored) as AuthSession;
  } catch {
    return undefined;
  }
}

export function getCurrentAuthAccount(storage: Storage): AuthAccount | undefined {
  const session = getCurrentAuthSession(storage);
  if (!session) return undefined;
  return getStoredAccounts(storage).find(account => account.id === session.userId || normalizeEmail(account.email) === normalizeEmail(session.email));
}

export function isSignedIn(storage: Storage): boolean {
  return Boolean(getCurrentAuthSession(storage));
}

export function signOut(storage: Storage): void {
  storage.removeItem(SESSION_STORAGE_KEY);
}

export function signInWithCredentials(storage: Storage, email: string, password: string): AuthResult {
  const errors = validateSignIn(email, password);
  if (errors.length > 0) return { ok: false, errors };

  const account = getStoredAccounts(storage).find(candidate => normalizeEmail(candidate.email) === normalizeEmail(email));
  if (!account || account.password !== password) {
    return { ok: false, errors: ['Email or password does not match a local account.'] };
  }

  writeSession(storage, account);
  mirrorProfile(storage, account);
  return { ok: true, errors: [], account };
}

export function signUpWithCredentials(storage: Storage, input: Omit<AuthAccount, 'id'>): AuthResult {
  const errors = validateSignUp(input);
  if (errors.length > 0) return { ok: false, errors };

  const accounts = getStoredAccounts(storage);
  if (accounts.some(account => normalizeEmail(account.email) === normalizeEmail(input.email))) {
    return { ok: false, errors: ['An account already exists for this email. Sign in instead.'] };
  }

  const account: AuthAccount = {
    ...input,
    id: createAuthUserId(input.email),
    email: normalizeEmail(input.email),
  };
  saveStoredAccounts(storage, [account, ...accounts]);
  writeSession(storage, account);
  mirrorProfile(storage, account);
  ensureAddressProfile(storage, account.id);
  return { ok: true, errors: [], account };
}

export function getSessionProfile(storage: Storage): UserProfile {
  const account = getCurrentAuthAccount(storage);
  const storedProfile = storage.getItem(PROFILE_STORAGE_KEY);
  if (storedProfile) {
    try {
      const profile = JSON.parse(storedProfile) as UserProfile;
      if (!account || profile.id === account.id || normalizeEmail(profile.email) === normalizeEmail(account.email)) {
        return profile;
      }
    } catch {
      return mockUserProfile;
    }
  }
  return account ? accountToProfile(account) : mockUserProfile;
}

function validateSignIn(email: string, password: string): string[] {
  const errors: string[] = [];
  if (!isValidEmail(email)) errors.push('Enter a valid email address.');
  if (!password) errors.push('Password is required.');
  return errors;
}

function validateSignUp(input: Omit<AuthAccount, 'id'>): string[] {
  const errors = validateSignIn(input.email, input.password);
  if (!input.name.trim()) errors.push('Name is required.');
  if (!/^\+?[0-9 ()-]{7,}$/.test(input.phone.trim())) errors.push('Enter a valid phone number.');
  if (input.password.length < 8) errors.push('Password must be at least 8 characters.');
  return errors;
}

function writeSession(storage: Storage, account: AuthAccount): void {
  const session: AuthSession = {
    userId: account.id,
    email: normalizeEmail(account.email),
    signedInAt: new Date().toISOString(),
  };
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function mirrorProfile(storage: Storage, account: AuthAccount): void {
  const storedProfile = storage.getItem(PROFILE_STORAGE_KEY);
  if (storedProfile) {
    try {
      const profile = JSON.parse(storedProfile) as UserProfile;
      if (profile.id === account.id || normalizeEmail(profile.email) === normalizeEmail(account.email)) return;
    } catch {
      // Replace malformed profile data with the authenticated local account.
    }
  }
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(accountToProfile(account)));
}

function ensureAddressProfile(storage: Storage, userId: string): void {
  const storedAddresses = storage.getItem(ADDRESSES_STORAGE_KEY);
  if (storedAddresses) return;
  const addresses: Address[] = mockAddresses.map(address => ({ ...address, userId }));
  storage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(addresses));
}

function accountToProfile(account: AuthAccount): UserProfile {
  return {
    id: account.id,
    name: account.name,
    email: normalizeEmail(account.email),
    phone: account.phone,
    defaultAddressId: mockUserProfile.defaultAddressId,
    favoriteRestaurantIds: [],
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(email));
}
