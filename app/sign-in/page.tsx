'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { SESSION_STORAGE_KEY } from '@/lib/cart';
import { mockUserProfile } from '@/lib/mock-data';
import { routes } from '@/lib/routes';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? routes.account;
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(window.localStorage.getItem(SESSION_STORAGE_KEY) === 'signed-in');
  }, []);

  function signIn(): void {
    window.localStorage.setItem(SESSION_STORAGE_KEY, 'signed-in');
    router.push(next);
  }

  function signOut(): void {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSignedIn(false);
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Account" />

        <section className="checkout-layout">
          <article className="card checkout-cart-panel">
            <span className="kicker">Mock account</span>
            <h1>{signedIn ? 'Signed in' : 'Sign in to OrderlyApp'}</h1>
            <p>{signedIn ? `Current mock session: ${mockUserProfile.email}` : 'Use the local demo account to protect checkout and save profile details.'}</p>
            <div className="confirmation-actions">
              {signedIn ? (
                <>
                  <Link className="checkout-button inline-action" href={routes.account}>Open account</Link>
                  <button className="ghost-button" type="button" onClick={signOut}>Sign out</button>
                </>
              ) : (
                <button className="checkout-button" type="button" onClick={signIn}>Continue as Jamie Demo</button>
              )}
            </div>
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">Session behavior</span>
            <h2>What this enables</h2>
            <div className="payment-breakdown">
              <div><span>Checkout</span><strong>Requires sign-in</strong></div>
              <div><span>Profile</span><strong>Saved locally</strong></div>
              <div><span>Orders</span><strong>Stored in browser</strong></div>
            </div>
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
