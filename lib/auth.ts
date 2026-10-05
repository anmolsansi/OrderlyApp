import { ADDRESSES_STORAGE_KEY, PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from './cart';
import { mockUserProfile } from './mock-data';
import type { DemoAddress, DemoProfile, UserProfile } from './types';

export const LEGACY_AUTH_ACCOUNTS_STORAGE_KEY = 'orderlyapp.marketplace.authAccounts.v1';
export const DEMO_PROFILE_STORAGE_KEY = 'orderlyapp.marketplace.demoProfile.v1';
export const DEMO_ADDRESSES_STORAGE_KEY = 'orderlyapp.marketplace.demoAddresses.v1';
export const DEMO_PROFILE_ID = 'demo-profile-1';
export const MAX_DEMO_PROFILE_NAME_LENGTH = 60;

export const SYNTHETIC_DEMO_ADDRESSES: readonly DemoAddress[] = [
  {
    id: 'demo-address-1',
    label: 'Demo home',
    street: '100 Demo Street',
    city: 'Demo City',
    state: 'CA',
    postalCode: '94105',
    deliveryInstructions: 'Synthetic demo address only.',
  },
  {
    id: 'demo-address-2',
    label: 'Demo office',
    street: '200 Sample Avenue',
    city: 'Demo City',
    state: 'CA',
    postalCode: '94107',
    deliveryInstructions: 'Synthetic demo address only.',
  },
];

const LEGACY_PROFILE_STORAGE_KEYS = [
  LEGACY_AUTH_ACCOUNTS_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  ADDRESSES_STORAGE_KEY,
] as const;

export type DemoProfileErrorCode = 'invalid_profile' | 'storage_unavailable';

export type DemoProfileResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: DemoProfileErrorCode; message: string };

const INVALID_PROFILE_MESSAGE = 'Demo profile is invalid';
const STORAGE_UNAVAILABLE_MESSAGE = 'Demo profile storage is unavailable';

export function createDefaultDemoProfile(
  name = 'Demo visitor',
  defaultAddressId = SYNTHETIC_DEMO_ADDRESSES[0].id,
): DemoProfile {
  return {
    schemaVersion: 1,
    id: DEMO_PROFILE_ID,
    name: name.trim(),
    defaultAddressId,
  };
}

export function getPreferredDemoAddress(
  profile: Pick<DemoProfile, 'defaultAddressId'> | undefined,
  addresses: readonly DemoAddress[],
): DemoAddress | undefined {
  if (addresses.length === 0) return undefined;
  return addresses.find(address => address.id === profile?.defaultAddressId) ?? addresses[0];
}

export function getDemoProfile(storage: Storage | undefined): DemoProfileResult<DemoProfile | undefined> {
  const migrated = removeLegacyProfileStorage(storage);
  if (!migrated.ok) return migrated;

  const stored = readStorage(storage, DEMO_PROFILE_STORAGE_KEY);
  if (!stored.ok) return stored;
  if (stored.value === null) return success(undefined);

  try {
    const parsed = JSON.parse(stored.value) as unknown;
    return isDemoProfile(parsed) ? success(parsed) : discardInvalidStoredValue(storage, DEMO_PROFILE_STORAGE_KEY);
  } catch {
    return invalidProfile();
  }
}

export function getDemoAddresses(storage: Storage | undefined): DemoProfileResult<DemoAddress[]> {
  const migrated = removeLegacyProfileStorage(storage);
  if (!migrated.ok) return migrated;

  const stored = readStorage(storage, DEMO_ADDRESSES_STORAGE_KEY);
  if (!stored.ok) return stored;

  if (stored.value === null) {
    const addresses = cloneSyntheticAddresses();
    const saved = writeStorage(storage, DEMO_ADDRESSES_STORAGE_KEY, JSON.stringify(addresses));
    return saved.ok ? success(addresses) : saved;
  }

  try {
    const parsed = JSON.parse(stored.value) as unknown;
    return isSyntheticAddressList(parsed)
      ? success(parsed.map(address => ({ ...address })))
      : discardInvalidStoredValue(storage, DEMO_ADDRESSES_STORAGE_KEY);
  } catch {
    return invalidProfile();
  }
}

export function saveDemoProfile(storage: Storage | undefined, profile: DemoProfile): DemoProfileResult<DemoProfile> {
  const migrated = removeLegacyProfileStorage(storage);
  if (!migrated.ok) return migrated;

  const addresses = getDemoAddresses(storage);
  if (!addresses.ok) return addresses;

  const normalized = normalizeDemoProfile(profile);
  if (!normalized) return invalidProfile();
  if (!addresses.value.some(address => address.id === normalized.defaultAddressId)) return invalidProfile();

  const saved = writeStorage(storage, DEMO_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  return saved.ok ? success(normalized) : saved;
}

export function forgetDemoProfile(storage: Storage | undefined): DemoProfileResult<undefined> {
  const migrated = removeLegacyProfileStorage(storage);
  if (!migrated.ok) return migrated;

  for (const key of [DEMO_PROFILE_STORAGE_KEY, DEMO_ADDRESSES_STORAGE_KEY]) {
    const removed = removeStorage(storage, key);
    if (!removed.ok) return removed;
  }
  return success(undefined);
}

export function isSignedIn(storage: Storage | undefined): boolean {
  const result = getDemoProfile(storage);
  return result.ok && Boolean(result.value);
}

export function getSessionProfile(storage: Storage | undefined): UserProfile {
  const result = getDemoProfile(storage);
  if (!result.ok || !result.value) {
    return { ...mockUserProfile, favoriteRestaurantIds: [] };
  }

  return {
    id: result.value.id,
    name: result.value.name,
    email: mockUserProfile.email,
    phone: mockUserProfile.phone,
    defaultAddressId: result.value.defaultAddressId,
    favoriteRestaurantIds: [],
  };
}

export function removeLegacyProfileStorage(storage: Storage | undefined): DemoProfileResult<undefined> {
  for (const key of LEGACY_PROFILE_STORAGE_KEYS) {
    const removed = removeStorage(storage, key);
    if (!removed.ok) return removed;
  }
  return success(undefined);
}

function discardInvalidStoredValue(storage: Storage | undefined, key: string): DemoProfileResult<never> {
  // Rejected decoded records may contain credentials in unknown fields.
  // Remove only the offending C2 key, and report any failed cleanup honestly.
  const removed = removeStorage(storage, key);
  return removed.ok ? invalidProfile() : removed;
}

function normalizeDemoProfile(value: DemoProfile): DemoProfile | undefined {
  if (!isDemoProfileShape(value)) return undefined;
  const name = value.name.trim();
  const id = value.id.trim();
  if (!name || name.length > MAX_DEMO_PROFILE_NAME_LENGTH || !id) return undefined;
  return { ...value, id, name };
}

function isDemoProfile(value: unknown): value is DemoProfile {
  if (!isDemoProfileShape(value)) return false;
  const normalized = normalizeDemoProfile(value);
  if (!normalized) return false;
  return SYNTHETIC_DEMO_ADDRESSES.some(address => address.id === normalized.defaultAddressId);
}

function isDemoProfileShape(value: unknown): value is DemoProfile {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = ['defaultAddressId', 'id', 'name', 'schemaVersion'];
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && value.schemaVersion === 1
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.defaultAddressId === 'string';
}

function isSyntheticAddressList(value: unknown): value is DemoAddress[] {
  if (!Array.isArray(value) || value.length !== SYNTHETIC_DEMO_ADDRESSES.length) return false;
  return value.every((address, index) => matchesSyntheticAddress(address, SYNTHETIC_DEMO_ADDRESSES[index]));
}

function matchesSyntheticAddress(value: unknown, expected: DemoAddress): value is DemoAddress {
  if (!isRecord(value)) return false;
  const allowedKeys = ['apartment', 'city', 'deliveryInstructions', 'id', 'label', 'postalCode', 'state', 'street'];
  if (Object.keys(value).some(key => !allowedKeys.includes(key))) return false;

  return value.id === expected.id
    && value.label === expected.label
    && value.street === expected.street
    && value.apartment === expected.apartment
    && value.city === expected.city
    && value.state === expected.state
    && value.postalCode === expected.postalCode
    && value.deliveryInstructions === expected.deliveryInstructions;
}

function cloneSyntheticAddresses(): DemoAddress[] {
  return SYNTHETIC_DEMO_ADDRESSES.map(address => ({ ...address }));
}

function readStorage(storage: Storage | undefined, key: string): DemoProfileResult<string | null> {
  if (!storage) return storageUnavailable();
  try {
    return success(storage.getItem(key));
  } catch {
    return storageUnavailable();
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string): DemoProfileResult<undefined> {
  if (!storage) return storageUnavailable();
  try {
    storage.setItem(key, value);
    return success(undefined);
  } catch {
    return storageUnavailable();
  }
}

function removeStorage(storage: Storage | undefined, key: string): DemoProfileResult<undefined> {
  if (!storage) return storageUnavailable();
  try {
    storage.removeItem(key);
    return success(undefined);
  } catch {
    return storageUnavailable();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function success<T>(value: T): DemoProfileResult<T> {
  return { ok: true, value };
}

function invalidProfile<T>(): DemoProfileResult<T> {
  return { ok: false, code: 'invalid_profile', message: INVALID_PROFILE_MESSAGE };
}

function storageUnavailable<T>(): DemoProfileResult<T> {
  return { ok: false, code: 'storage_unavailable', message: STORAGE_UNAVAILABLE_MESSAGE };
}
