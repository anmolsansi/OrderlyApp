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
  const renderedItemIds = new Set<string>();

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Menu" />

        <section className="restaurant-hero card">
          <span className="restaurant-hero-emoji">{restaurant.imageEmoji}</span>
          <div>
            <span className="kicker">Restaurant menu</span>
            <h1>{restaurant.name}</h1>
            <p>{restaurant.cuisine} · ⭐ {restaurant.rating || 'New'} · {restaurant.deliveryMinutes} · {restaurant.distanceMiles} mi · Delivery {formatMoney(restaurant.deliveryFeeCents)} · {restaurant.isOpen ? 'Open now' : 'Closed'}</p>
            <div className="tag-row">
              {restaurant.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
            </div>
          </div>
          <Link className="checkout-button inline-action" href={routes.checkout}>View cart</Link>
        </section>

        <nav className="category-tabs" aria-label="Menu categories">
          {restaurant.menuCategories.map((category, index) => <a className={index === 0 ? 'active' : ''} href={`#${category.id}`} key={category.id}>{category.name}</a>)}
        </nav>

        <section className="section-heading" id="menu-items">
          <div>
            <span className="kicker">Menu</span>
            <h2>{restaurant.menuCategories.length > 0 ? 'Menu sections' : 'Menu coming soon'}</h2>
          </div>
          <span className="pill">{restaurant.menu.length} items</span>
        </section>

        {restaurant.menuCategories.map(category => (
          <section className="menu-page-grid" id={category.id} key={category.id}>
            <div className="menu-category-heading">
              <span className="kicker">{category.items.length} items</span>
              <h2>{category.name}</h2>
              {category.description && <p>{category.description}</p>}
            </div>
            {category.items.map(item => {
              if (renderedItemIds.has(item.id)) return null;
              renderedItemIds.add(item.id);

              return (
                <Link
                  className={`card menu-page-card ${item.available === false || !restaurant.isOpen ? 'disabled-card' : ''}`}
                  href={routes.item(restaurant.id, item.id)}
                  key={item.id}
                >
                  <span className="menu-emoji">{item.imageEmoji}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <strong>{formatMoney(item.priceCents)}</strong>
                  </div>
                  {item.popular && <span className="tag">Popular</span>}
                  {item.available === false && <span className="tag">Unavailable</span>}
                </Link>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
