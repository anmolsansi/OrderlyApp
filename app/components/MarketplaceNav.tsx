import Link from 'next/link';

interface MarketplaceNavProps {
  active?: 'Home' | 'Search' | 'Menu' | 'Cart' | 'Orders';
}

export function MarketplaceNav({ active = 'Home' }: MarketplaceNavProps) {
  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Search', href: '/restaurants' },
    { label: 'Menu', href: '/restaurants/marios-pizza' },
    { label: 'Cart', href: '/checkout' },
    { label: 'Orders', href: '/order-confirmation' },
  ];

  return (
    <nav className="top-nav marketplace-nav" aria-label="Primary navigation">
      <Link className="brand-lockup" href="/">
        <span>O</span>
        <strong>OrderlyApp</strong>
      </Link>
      <div className="nav-links">
        {navItems.map(item => (
          <Link className={active === item.label ? 'active' : ''} href={item.href} key={item.label}>
            {item.label}
          </Link>
        ))}
      </div>
      <Link className="nav-cart" href="/checkout">Cart</Link>
    </nav>
  );
}
