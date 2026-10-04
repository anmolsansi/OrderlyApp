'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import {
  forgetDemoProfile,
  getDemoAddresses,
  getDemoProfile,
  saveDemoProfile,
} from '@/lib/auth';
import { resetGuestSession } from '@/lib/api';
import { routes } from '@/lib/routes';
import type { DemoAddress, DemoProfile } from '@/lib/types';

export default function AccountPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [profile, setProfile] = useState<DemoProfile | undefined>();
  const [addresses, setAddresses] = useState<DemoAddress[]>([]);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resettingGuest, setResettingGuest] = useState(false);

  function loadProfile(): void {
    setStatus('loading');
    setError('');

    const profileResult = getDemoProfile(window.localStorage);
    if (!profileResult.ok) {
      setError(profileResult.message);
      setStatus('error');
      return;
    }

    const addressResult = getDemoAddresses(window.localStorage);
    if (!addressResult.ok) {
      setError(addressResult.message);
      setStatus('error');
      return;
    }

    setProfile(profileResult.value);
    setAddresses(addressResult.value);
    setDraftName(profileResult.value?.name ?? '');
    setStatus('ready');
  }

  useEffect(() => {
    loadProfile();
  }, []);

  function persistProfile(nextProfile: DemoProfile, successMessage: string): void {
    setError('');
    setMessage('');
    const result = saveDemoProfile(window.localStorage, nextProfile);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setProfile(result.value);
    setDraftName(result.value.name);
    setMessage(successMessage);
  }

  function saveDisplayName(): void {
    if (!profile) return;
    persistProfile({ ...profile, name: draftName }, 'Demo name saved on this browser.');
  }

  function makeDefaultAddress(addressId: string): void {
    if (!profile) return;
    persistProfile({ ...profile, defaultAddressId: addressId }, 'Default synthetic address updated.');
  }

  function forgetLocalProfile(): void {
    setError('');
    setMessage('');
    const result = forgetDemoProfile(window.localStorage);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setProfile(undefined);
    setDraftName('');
    setMessage('Local demo profile forgotten. Your private server guest was not changed.');
  }

  async function startFreshGuest(): Promise<void> {
    setResettingGuest(true);
    setError('');
    setMessage('');

    const reset = await resetGuestSession();
    if (!reset) {
      setError('Could not start a fresh guest session. Your existing guest scope remains active.');
      setResettingGuest(false);
      return;
    }

    const forgotten = forgetDemoProfile(window.localStorage);
    if (!forgotten.ok) {
      setError('Fresh guest session started, but the local demo profile could not be cleared. Retry after enabling browser storage.');
      setResettingGuest(false);
      return;
    }

    setProfile(undefined);
    setDraftName('');
    setMessage('Fresh guest session started. Choose a demo profile before continuing.');
    setResettingGuest(false);
  }

  if (status === 'loading') {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Account" />
          <section className="card">
            <span className="kicker">Demo profile</span>
            <h1>Loading profile</h1>
            <p>Checking this browser for local presentation data.</p>
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
            <button className="checkout-button inline-action" type="button" onClick={loadProfile}>Retry</button>
          </section>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Account" />
          <section className="card">
            <span className="kicker">Demo profile</span>
            <h1>Choose a demo profile</h1>
            <p>A demo profile is only a local display label. Server cart and order ownership comes from the private guest session.</p>
            {message && <p role="status">{message}</p>}
            {error && <p role="alert">{error}</p>}
            <div className="confirmation-actions">
              <Link className="checkout-button inline-action" href={routes.signIn(routes.account)}>Choose demo profile</Link>
              <button className="ghost-button" type="button" disabled={resettingGuest} onClick={startFreshGuest}>
                {resettingGuest ? 'Starting fresh guest…' : 'Start fresh guest session'}
              </button>
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
            <div className="cart-header">
              <div>
                <span className="kicker">Demo profile</span>
                <h1>Local profile details</h1>
              </div>
            </div>
            <p>This profile changes presentation only. It is not authentication and cannot grant access to another guest&apos;s orders.</p>

            {error && <div className="validation-panel" role="alert"><p>{error}</p></div>}
            {message && <p role="status">{message}</p>}

            <div className="checkout-form-grid">
              <label className="full-field">
                <span>Display name</span>
                <input
                  autoComplete="off"
                  maxLength={60}
                  value={draftName}
                  onChange={event => setDraftName(event.target.value)}
                />
              </label>
              <button className="checkout-button full-field" type="button" onClick={saveDisplayName}>Save display name</button>
            </div>

            <div className="confirmation-actions">
              <button className="ghost-button" type="button" onClick={forgetLocalProfile}>Forget local profile</button>
              <button className="ghost-button" type="button" disabled={resettingGuest} onClick={startFreshGuest}>
                {resettingGuest ? 'Starting fresh guest…' : 'Start fresh guest session'}
              </button>
            </div>
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">Synthetic addresses</span>
            <h2>Default demo location</h2>
            <p>These are fixed demo records. OrderlyApp does not collect a real delivery address in this profile screen.</p>
            <div className="cart-lines">
              {addresses.map(address => (
                <div className="cart-line detailed" key={address.id}>
                  <div>
                    <strong>{address.label}</strong>
                    <p>{address.street}</p>
                    <p>{address.city}, {address.state} {address.postalCode}</p>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => makeDefaultAddress(address.id)}>
                    {profile.defaultAddressId === address.id ? 'Default' : 'Make default'}
                  </button>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
