'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { fetchRestaurant, getOrderlyDataMode } from '@/lib/api';
import { routes } from '@/lib/routes';
import type { Restaurant } from '@/lib/types';
import { formatMoney } from '@/lib/types';

export default function RestaurantMenuPage() {
  const params = useParams<{ restaurantId: string }>();
  const dataMode = getOrderlyDataMode();
  const [restaurant, setRestaurant] = useState<Restaurant>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string }>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    setRestaurant(undefined);

    void fetchRestaurant(params.restaurantId, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setRestaurant(result.data);
      } else {
        setError({ code: result.error.code, message: result.error.message });
      }
      setLoading(false);
    });

    return () => controller.abort();
  }, [params.restaurantId, reloadKey]);

  if (loading) {
    return (
      <main className="marketplace-page"><div className="container"><MarketplaceNav active="Menu" /><section className="card discovery-state-card" aria-live="polite"><div><h1>Loading menu</h1><p>Checking the selected catalog source.</p></div></section></div></main>
    );
  }

  if (!restaurant) {
    const notFound = error?.code === 'restaurant_not_found';
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Menu" />
          <section className={`card discovery-state-card ${notFound ? 'no-results-state' : 'error-state'}`} role={notFound ? undefined : 'alert'}>
            <div>
              <h1>{notFound ? 'Restaurant not found' : 'Menu temporarily unavailable'}</h1>
              <p>{error?.message ?? 'The restaurant could not be loaded.'}</p>
              {!notFound && <button className="ghost-button" type="button" onClick={() => setReloadKey(value => value + 1)}>Retry</button>}
              <Link className="pill" href={routes.restaurants()}>Back to restaurants</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const renderedItemIds = new Set<string>();

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Menu" />

        {dataMode === 'local_demo' && (
          <div className="validation-panel" role="status">
            <strong>Local fixture preview</strong>
            <p>This menu and its basket are isolated fixture data. Checkout is unavailable.</p>
          </div>
        )}

        <section className="restaurant-hero card">
          <span className="restaurant-hero-emoji">{restaurant.imageEmoji}</span>
          <div>
            <span className="kicker">Restaurant menu</span>
            <h1>{restaurant.name}</h1>
            <p>{restaurant.cuisine} · ⭐ {restaurant.rating || 'New'} · {restaurant.deliveryMinutes}{restaurant.distanceMiles > 0 ? ` · ${restaurant.distanceMiles} mi` : ''} · Delivery {formatMoney(restaurant.deliveryFeeCents)} · {restaurant.isOpen ? 'Open now' : 'Closed'}</p>
            <div className="tag-row">
              {restaurant.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
            </div>
          </div>
          <Link className="checkout-button inline-action" href={routes.cart}>View cart</Link>
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

        {restaurant.menuCategories.length === 0 && (
          <section className="card discovery-state-card no-results-state">
            <span aria-hidden="true">0</span>
            <div>
              <h2>Menu coming soon</h2>
              <p>This restaurant is not accepting menu orders yet.</p>
              <Link className="ghost-button" href={routes.restaurants()}>Back to restaurants</Link>
            </div>
          </section>
        )}

        {!restaurant.isOpen && (
          <section className="card menu-availability-alert" role="alert">
            <strong>{restaurant.name} is closed right now.</strong>
            <p>You can review the menu, but new cart additions are disabled until the restaurant opens.</p>
          </section>
        )}

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
              const itemUnavailable = item.available === false || !restaurant.isOpen;

              const cardContent = (
                <>
                  <span className="menu-emoji" aria-hidden="true">{item.imageEmoji}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <strong>{formatMoney(item.priceCents)}</strong>
                  </div>
                  {item.popular && <span className="tag">Popular</span>}
                  {itemUnavailable && <span className="tag">Unavailable</span>}
                </>
              );

              return itemUnavailable ? (
                <article className="card menu-page-card disabled-card" aria-disabled="true" key={item.id}>
                  {cardContent}
                </article>
              ) : (
                <Link className="card menu-page-card" href={routes.item(restaurant.id, item.id)} key={item.id}>
                  {cardContent}
                </Link>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
