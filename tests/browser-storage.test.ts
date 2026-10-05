import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBrowserStorage } from '../lib/browser-storage';
import { createDefaultDemoProfile, forgetDemoProfile, getDemoAddresses, getDemoProfile, isSignedIn, saveDemoProfile } from '../lib/auth';
import { clearCheckoutRecovery, loadCheckoutRecovery, saveCheckoutRecovery } from '../lib/api';
import type { CheckoutRecovery } from '../lib/types';

afterEach(() => vi.unstubAllGlobals());

describe('browser Storage property access', () => {
  it.each(['localStorage', 'sessionStorage'] as const)('catches a denied %s getter', kind => {
    const browser = Object.defineProperty({}, kind, {
      get() { throw new DOMException('Storage denied', 'SecurityError'); },
    });
    vi.stubGlobal('window', browser);
    expect(getBrowserStorage(kind)).toBeUndefined();
  });

  it('returns the actual browser store without a memory fallback', () => {
    const storage = {} as Storage;
    vi.stubGlobal('window', { localStorage: storage });
    expect(getBrowserStorage('localStorage')).toBe(storage);
  });

  it('reports denied profile access without pretending persistence succeeded', () => {
    expect(getDemoProfile(undefined)).toMatchObject({ ok: false, code: 'storage_unavailable' });
    expect(getDemoAddresses(undefined)).toMatchObject({ ok: false, code: 'storage_unavailable' });
    expect(saveDemoProfile(undefined, createDefaultDemoProfile())).toMatchObject({ ok: false, code: 'storage_unavailable' });
    expect(forgetDemoProfile(undefined)).toMatchObject({ ok: false, code: 'storage_unavailable' });
    expect(isSignedIn(undefined)).toBe(false);
  });

  it('never claims to save or clear checkout recovery without storage', () => {
    expect(loadCheckoutRecovery(undefined)).toBeUndefined();
    expect(saveCheckoutRecovery(undefined, {} as CheckoutRecovery)).toBe(false);
    expect(clearCheckoutRecovery(undefined)).toBe(false);
  });
});
