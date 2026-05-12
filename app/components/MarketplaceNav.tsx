import Link from 'next/link';
import { routes } from '@/lib/routes';

interface MarketplaceNavProps {
  active?: 'Home' | 'Search' | 'Menu' | 'Cart' | 'Orders';
}

export function MarketplaceNav({ active = 'Home' }: MarketplaceNavProps) {
  const navItems = [
    { label: 'Home', href: routes.home },
    { label: 'Search', href: routes.restaurants() },
    { label: 'Menu', href: routes.restaurant('marios-pizza') },
    { label: 'Cart', href: routes.checkout },
    { label: 'Orders', href: routes.orderConfirmation() },
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
          <Link className="account-link" href={routes.home}>Account</Link>
          <Link className="nav-cart" href={routes.checkout}>Cart</Link>
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
