'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { ADDRESSES_STORAGE_KEY, PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from '@/lib/cart';
import { mockAddresses, mockUserProfile } from '@/lib/mock-data';
import { routes } from '@/lib/routes';
import type { Address, UserProfile } from '@/lib/types';

export default function AccountPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(mockUserProfile);
  const [addresses, setAddresses] = useState<Address[]>(mockAddresses);
  const [newLabel, setNewLabel] = useState('Gym');
  const [newStreet, setNewStreet] = useState('500 Mission Street');

  useEffect(() => {
    const hasSession = window.localStorage.getItem(SESSION_STORAGE_KEY) === 'signed-in';
    setSignedIn(hasSession);
    const storedProfile = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const storedAddresses = window.localStorage.getItem(ADDRESSES_STORAGE_KEY);
    if (storedProfile) setProfile(JSON.parse(storedProfile) as UserProfile);
    if (storedAddresses) setAddresses(JSON.parse(storedAddresses) as Address[]);
  }, []);

  function persistProfile(nextProfile: UserProfile): void {
    setProfile(nextProfile);
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
  }

  function persistAddresses(nextAddresses: Address[]): void {
    setAddresses(nextAddresses);
    window.localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(nextAddresses));
  }

  function addAddress(): void {
    const nextAddress: Address = {
      id: `addr-${Date.now()}`,
      userId: profile.id,
      label: newLabel.trim() || 'Saved address',
      street: newStreet.trim() || '500 Mission Street',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      deliveryInstructions: 'Ring doorbell.',
    };
    persistAddresses([...addresses, nextAddress]);
  }

  function signOut(): void {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSignedIn(false);
  }

  if (!signedIn) {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Account" />
          <section className="card">
            <span className="kicker">Account</span>
            <h1>Sign in required</h1>
            <p>Sign in to manage profile details, saved addresses, and order history.</p>
            <Link className="checkout-button inline-action" href={routes.signIn(routes.account)}>Sign in</Link>
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
                <span className="kicker">Profile</span>
                <h1>Account details</h1>
              </div>
              <button className="ghost-button" type="button" onClick={signOut}>Sign out</button>
            </div>
            <div className="checkout-form-grid">
              <label>
                <span>Name</span>
                <input value={profile.name} onChange={event => persistProfile({ ...profile, name: event.target.value })} />
              </label>
              <label>
                <span>Phone</span>
                <input value={profile.phone} onChange={event => persistProfile({ ...profile, phone: event.target.value })} />
              </label>
              <label className="full-field">
                <span>Email</span>
                <input value={profile.email} onChange={event => persistProfile({ ...profile, email: event.target.value })} />
              </label>
            </div>
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">Saved addresses</span>
            <h2>Delivery locations</h2>
            <div className="cart-lines">
              {addresses.map(address => (
                <div className="cart-line detailed" key={address.id}>
                  <div>
                    <strong>{address.label}</strong>
                    <p>{address.street}{address.apartment ? `, ${address.apartment}` : ''}</p>
                    <p>{address.city}, {address.state} {address.postalCode}</p>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => persistProfile({ ...profile, defaultAddressId: address.id })}>
                    {profile.defaultAddressId === address.id ? 'Default' : 'Make default'}
                  </button>
                  {profile.defaultAddressId !== address.id && <button className="ghost-button" type="button" onClick={() => persistAddresses(addresses.filter(candidate => candidate.id !== address.id))}>Remove</button>}
                </div>
              ))}
            </div>
            <div className="checkout-form-grid">
              <label>
                <span>Label</span>
                <input value={newLabel} onChange={event => setNewLabel(event.target.value)} />
              </label>
              <label>
                <span>Street</span>
                <input value={newStreet} onChange={event => setNewStreet(event.target.value)} />
              </label>
            </div>
            <button className="checkout-button" type="button" onClick={addAddress}>Add address</button>
          </aside>
        </section>
      </div>
    </main>
  );
}
