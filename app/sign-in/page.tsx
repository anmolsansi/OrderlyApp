'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import {
  createDefaultDemoProfile,
  forgetDemoProfile,
  getDemoAddresses,
  getDemoProfile,
  saveDemoProfile,
  type DemoProfileErrorCode,
} from '@/lib/auth';
import { getBrowserStorage } from '@/lib/browser-storage';
import { routes, sanitizeAppReturnPath } from '@/lib/routes';
import type { DemoAddress, DemoProfile } from '@/lib/types';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeAppReturnPath(searchParams.get('next'), routes.account);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [profile, setProfile] = useState<DemoProfile | undefined>();
  const [addresses, setAddresses] = useState<DemoAddress[]>([]);
  const [name, setName] = useState('Demo visitor');
  const [defaultAddressId, setDefaultAddressId] = useState('demo-address-1');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<DemoProfileErrorCode | null>(null);

  function loadProfile(): void {
    setStatus('loading');
    setError('');
    setErrorCode(null);

    const profileResult = getDemoProfile(getBrowserStorage('localStorage'));
    if (!profileResult.ok) {
      setError(profileResult.message);
      setErrorCode(profileResult.code);
      setStatus('error');
      return;
    }

    const addressResult = getDemoAddresses(getBrowserStorage('localStorage'));
    if (!addressResult.ok) {
      setError(addressResult.message);
      setErrorCode(addressResult.code);
      setStatus('error');
      return;
    }

    setAddresses(addressResult.value);
    setProfile(profileResult.value);
    setName(profileResult.value?.name ?? 'Demo visitor');
    setDefaultAddressId(profileResult.value?.defaultAddressId ?? addressResult.value[0]?.id ?? 'demo-address-1');
    setStatus('ready');
  }

  useEffect(() => {
    loadProfile();
  }, []);

  function submitProfile(): void {
    const candidate = profile
      ? { ...profile, name, defaultAddressId }
      : createDefaultDemoProfile(name, defaultAddressId);
    const result = saveDemoProfile(getBrowserStorage('localStorage'), candidate);

    if (!result.ok) {
      setError(result.message);
      setErrorCode(result.code);
      return;
    }

    setError('');
    setErrorCode(null);
    setProfile(result.value);
    router.push(next);
  }

  function forgetLocalProfile(): void {
    const result = forgetDemoProfile(getBrowserStorage('localStorage'));
    if (!result.ok) {
      setError(result.message);
      setErrorCode(result.code);
      return;
    }

    setError('');
    setErrorCode(null);
    setProfile(undefined);
    setName('Demo visitor');
    setDefaultAddressId(addresses[0]?.id ?? 'demo-address-1');
  }

  function clearInvalidLocalProfile(): void {
    const result = forgetDemoProfile(getBrowserStorage('localStorage'));
    if (!result.ok) {
      setError(result.message);
      setErrorCode(result.code);
      setStatus('error');
      return;
    }
    loadProfile();
  }

  if (status === 'loading') {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Account" />
          <section className="card">
            <span className="kicker">Public mock demo</span>
            <h1>Loading demo profile</h1>
            <p>Checking this browser for a local presentation profile.</p>
          </section>
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Account" />
          <section className="card" role="alert">
            <span className="kicker">Demo profile unavailable</span>
            <h1>Browser storage needs attention</h1>
            <p>{error}</p>
            {errorCode === 'storage_unavailable' && (
              <p>You can continue without saving a profile. Checkout will offer a temporary synthetic profile for this page only.</p>
            )}
            <div className="confirmation-actions">
              <button className="checkout-button inline-action" type="button" onClick={loadProfile}>Retry</button>
              {errorCode === 'invalid_profile' && (
                <button className="ghost-button" type="button" onClick={clearInvalidLocalProfile}>Clear local demo data</button>
              )}
              {errorCode === 'storage_unavailable' && (
                <button className="ghost-button" type="button" onClick={() => router.push(next)}>Continue without saving</button>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Account" />

        <section className="checkout-layout">
          <article className="card checkout-cart-panel">
            <span className="kicker">Public mock demo</span>
            <h1>{profile ? 'Demo profile ready' : 'Choose a demo profile'}</h1>
            <p>This is a local display profile, not a login. It never controls access to server orders.</p>

            {error && (
              <div className="validation-panel" role="alert">
                <p>{error}</p>
                {errorCode === 'storage_unavailable' && (
                  <button className="ghost-button" type="button" onClick={() => router.push(next)}>Continue without saving</button>
                )}
              </div>
            )}

            <form className="checkout-form-grid" onSubmit={event => { event.preventDefault(); submitProfile(); }}>
              <label className="full-field">
                <span>Demo name</span>
                <input
                  autoComplete="off"
                  maxLength={60}
                  value={name}
                  onChange={event => setName(event.target.value)}
                />
              </label>

              <fieldset className="full-field">
                <legend>Default synthetic address</legend>
                <div className="cart-lines">
                  {addresses.map(address => (
                    <label className="cart-line detailed" key={address.id}>
                      <input
                        checked={defaultAddressId === address.id}
                        name="demo-address"
                        type="radio"
                        value={address.id}
                        onChange={() => setDefaultAddressId(address.id)}
                      />
                      <span>
                        <strong>{address.label}</strong>
                        <span>{address.street}, {address.city}, {address.state} {address.postalCode}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button className="checkout-button full-field" type="submit">
                {profile ? 'Save profile and continue' : 'Use demo profile'}
              </button>
            </form>

            {profile && (
              <button className="ghost-button" type="button" onClick={forgetLocalProfile}>
                Forget local profile
              </button>
            )}
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">What this means</span>
            <h2>Profile is not authentication</h2>
            <div className="payment-breakdown">
              <div><span>Server ownership</span><strong>Private browser guest</strong></div>
              <div><span>Profile</span><strong>Local label only</strong></div>
              <div><span>Password</span><strong>Never collected</strong></div>
              <div><span>Addresses</span><strong>Synthetic demo data</strong></div>
            </div>
            <p>Changing or forgetting this profile does not switch the private server guest that owns cart and order data.</p>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="marketplace-page"><div className="container"><MarketplaceNav active="Account" /><section className="card"><h1>Loading demo profile</h1></section></div></main>}>
      <SignInContent />
    </Suspense>
  );
}
