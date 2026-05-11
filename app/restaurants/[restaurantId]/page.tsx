import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { getRestaurant } from '@/lib/marketplace';
import { routes } from '@/lib/routes';
import { formatMoney } from '@/lib/types';

interface RestaurantMenuPageProps {
  params: Promise<{ restaurantId: string }>;
}

export default async function RestaurantMenuPage({ params }: RestaurantMenuPageProps) {
  const { restaurantId } = await params;
  const restaurant = getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const categories = ['Popular', 'Pizza', 'Sides', 'Drinks', 'Dessert'];

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Menu" />

        <section className="restaurant-hero card">
          <span className="restaurant-hero-emoji">{restaurant.imageEmoji}</span>
          <div>
            <span className="kicker">Restaurant menu</span>
            <h1>{restaurant.name}</h1>
            <p>{restaurant.cuisine} · ⭐ {restaurant.rating} · {restaurant.deliveryMinutes} · Delivery {formatMoney(restaurant.deliveryFeeCents)}</p>
            <div className="tag-row">
              {restaurant.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
            </div>
          </div>
          <Link className="checkout-button inline-action" href={routes.checkout}>View cart</Link>
        </section>

        <nav className="category-tabs" aria-label="Menu categories">
          {categories.map((category, index) => <a className={index === 0 ? 'active' : ''} href="#menu-items" key={category}>{category}</a>)}
        </nav>

        <section className="section-heading" id="menu-items">
          <div>
            <span className="kicker">Menu</span>
            <h2>Popular items</h2>
          </div>
          <span className="pill">{restaurant.menu.length} items</span>
        </section>

        <section className="menu-page-grid">
          {restaurant.menu.map(item => (
            <Link className="card menu-page-card" href={routes.item(restaurant.id, item.id)} key={item.id}>
              <span className="menu-emoji">{item.imageEmoji}</span>
              <div>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <strong>{formatMoney(item.priceCents)}</strong>
              </div>
              {item.popular && <span className="tag">Popular</span>}
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
