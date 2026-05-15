'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isSignedIn } from '@/lib/auth';
import { routes } from '@/lib/routes';

interface MarketplaceNavProps {
  active?: 'Home' | 'Search' | 'Menu' | 'Cart' | 'Checkout' | 'Orders' | 'Account';
}

export function MarketplaceNav({ active = 'Home' }: MarketplaceNavProps) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(isSignedIn(window.localStorage));
  }, []);

  const navItems = [
    { label: 'Home', href: routes.home },
    { label: 'Search', href: routes.restaurants() },
    { label: 'Menu', href: routes.restaurant('marios-pizza') },
    { label: 'Cart', href: routes.cart },
    { label: 'Orders', href: routes.orderHistory },
  ];

  return (
    <>
      <nav className="top-nav marketplace-nav" aria-label="Primary navigation">
        <Link className="brand-lockup" href={routes.home}>
          <span>O</span>
          <strong>OrderlyApp</strong>
        </Link>
        <div className="location-chip" aria-label="Delivery location">
          <span aria-hidden="true">⌖</span>
          <strong>123 Demo Street</strong>
        </div>
        <div className="nav-links">
          {navItems.map(item => (
            <Link className={active === item.label ? 'active' : ''} href={item.href} key={item.label}>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="nav-actions">
          <Link className={active === 'Account' ? 'account-link active' : 'account-link'} href={signedIn ? routes.account : routes.signIn(routes.account)}>
            {signedIn ? 'Account' : 'Sign in'}
          </Link>
          <Link className="nav-cart" href={routes.cart}>Cart</Link>
        </div>
      </nav>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navItems.filter(item => item.label !== 'Menu').map(item => (
          <Link className={active === item.label ? 'active' : ''} href={item.href} key={item.label}>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
