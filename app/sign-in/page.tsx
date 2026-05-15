'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { getCurrentAuthAccount, getDemoAccount, signInWithCredentials, signOut, signUpWithCredentials } from '@/lib/auth';
import { routes } from '@/lib/routes';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? routes.account;
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [sessionEmail, setSessionEmail] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const demoAccount = getDemoAccount();
  const [form, setForm] = useState({
    name: '',
    email: demoAccount.email,
    phone: '+1-555-0100',
    password: demoAccount.password,
  });

  useEffect(() => {
    const account = getCurrentAuthAccount(window.localStorage);
    setSignedIn(Boolean(account));
    setSessionEmail(account?.email ?? '');
  }, []);

  function submitAuth(): void {
    setErrors([]);
    const result = mode === 'sign-in'
      ? signInWithCredentials(window.localStorage, form.email, form.password)
      : signUpWithCredentials(window.localStorage, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    router.push(next);
  }

  function handleSignOut(): void {
    signOut(window.localStorage);
    setSignedIn(false);
    setSessionEmail('');
  }

  function useDemoAccount(): void {
    setMode('sign-in');
    setForm(previous => ({ ...previous, email: demoAccount.email, password: demoAccount.password }));
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Account" />

        <section className="checkout-layout">
          <article className="card checkout-cart-panel">
            <span className="kicker">Mock account</span>
            <h1>{signedIn ? 'Signed in' : mode === 'sign-in' ? 'Sign in to OrderlyApp' : 'Create your account'}</h1>
            <p>{signedIn ? `Current local session: ${sessionEmail}` : 'Use a local demo account to protect checkout and save profile details on this device.'}</p>

            {signedIn ? (
              <div className="confirmation-actions">
                <Link className="checkout-button inline-action" href={routes.account}>Open account</Link>
                <button className="ghost-button" type="button" onClick={handleSignOut}>Sign out</button>
              </div>
            ) : (
              <>
                <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
                  <button className={mode === 'sign-in' ? 'active' : ''} type="button" onClick={() => setMode('sign-in')}>Sign in</button>
                  <button className={mode === 'sign-up' ? 'active' : ''} type="button" onClick={() => setMode('sign-up')}>Sign up</button>
                </div>
                {errors.length > 0 && (
                  <div className="validation-panel" role="alert">
                    {errors.map(error => <p key={error}>{error}</p>)}
                  </div>
                )}
                <form className="checkout-form-grid" onSubmit={event => { event.preventDefault(); submitAuth(); }}>
                  {mode === 'sign-up' && (
                    <label className="full-field">
                      <span>Name</span>
                      <input autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
                    </label>
                  )}
                  <label className="full-field">
                    <span>Email</span>
                    <input autoComplete="email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
                  </label>
                  {mode === 'sign-up' && (
                    <label className="full-field">
                      <span>Phone</span>
                      <input autoComplete="tel" type="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
                    </label>
                  )}
                  <label className="full-field">
                    <span>Password</span>
                    <input autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} />
                  </label>
                  <button className="checkout-button full-field" type="submit">{mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
                </form>
                <button className="ghost-button" type="button" onClick={useDemoAccount}>Use demo credentials</button>
              </>
            )}
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">Session behavior</span>
            <h2>What this enables</h2>
            <div className="payment-breakdown">
              <div><span>Checkout</span><strong>Requires sign-in</strong></div>
              <div><span>Sign up</span><strong>Local account</strong></div>
              <div><span>Sign out</span><strong>Clears session only</strong></div>
              <div><span>Storage</span><strong>This browser</strong></div>
            </div>
            {signedIn ? (
              <p>Signing out clears the account session but leaves cart and order fallback data available for the demo.</p>
            ) : (
              <p>Demo credentials are prefilled. Create another local account to test signup and returning sign-in.</p>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="marketplace-page"><div className="container"><MarketplaceNav active="Account" /><section className="card"><h1>Loading sign in</h1></section></div></main>}>
      <SignInContent />
    </Suspense>
  );
}
