import Link from 'next/link';
import type { CSSProperties } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { restaurants } from '@/lib/mock-data';
import { cuisineRoadmap, favoriteRestaurantIds, featureSteps, quickFilters, themeOptions } from '@/lib/marketplace';
import { formatMoney } from '@/lib/types';

export default function HomePage() {
  const famousRestaurants = [...restaurants].sort((left, right) => right.rating - left.rating).slice(0, 3);
  const favoriteRestaurants = restaurants.filter(restaurant => favoriteRestaurantIds.includes(restaurant.id));

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Home" />

        <section className="hero marketplace-hero">
          <div className="hero-copy">
            <span className="kicker">Midnight Market theme · pizza-first v1</span>
            <h1>Pizza delivery now. Every cuisine next.</h1>
            <p className="lead">
              A DoorDash-style marketplace homepage that starts with pizza and expands into searchable restaurant rails, favorites, menus, item customization, checkout, and order tracking.
            </p>
            <form className="search-panel" action="/restaurants" role="search">
              <span aria-hidden="true">🔎</span>
              <input
                aria-label="Search pizza restaurants and menu items"
                type="search"
                name="query"
                placeholder="Search pizza, pepperoni, wood fired, late night..."
              />
              <button type="submit">Search</button>
            </form>
            <div className="filter-row" aria-label="Pizza filters">
              {quickFilters.map(filter => (
                <Link className={`filter-chip ${filter === 'All pizza' ? 'active' : ''}`} href={`/restaurants?filter=${encodeURIComponent(filter)}`} key={filter}>
                  {filter}
                </Link>
              ))}
            </div>
          </div>
          <aside className="delivery-preview card" aria-label="Delivery tracking preview">
            <div className="phone-frame">
              <div className="phone-topline"><span>Now</span><strong>28 min</strong></div>
              <div className="phone-map"><span>🏠</span><span>🛵</span><span>🍕</span></div>
              <div className="phone-card">
                <strong>Mario&apos;s Pizza Lab</strong>
                <p>Pepperoni Feast · on the way</p>
                <div className="progress-line"><span /></div>
              </div>
            </div>
          </aside>
        </section>

        <section className="roadmap-grid" aria-label="Product version roadmap">
          {cuisineRoadmap.map(item => (
            <article className="card roadmap-card" key={item.label}>
              <span className="roadmap-icon">{item.icon}</span>
              <div>
                <h3>{item.label}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="section-heading" id="restaurants">
          <div>
            <span className="kicker">Homepage</span>
            <h2>Famous near you</h2>
          </div>
          <Link className="pill" href="/restaurants">View all restaurants</Link>
        </section>

        <section className="horizontal-rail" aria-label="Famous pizza restaurants">
          {famousRestaurants.map(restaurant => (
            <Link className="card feature-restaurant restaurant-tile-button" href={`/restaurants/${restaurant.id}`} key={restaurant.id}>
              <span className="favorite-button" aria-hidden="true">♥</span>
              <span className="hero-emoji">{restaurant.imageEmoji}</span>
              <h3>{restaurant.name}</h3>
              <p>{restaurant.cuisine} · ⭐ {restaurant.rating} · {restaurant.deliveryMinutes}</p>
              <p>Delivery {formatMoney(restaurant.deliveryFeeCents)}</p>
            </Link>
          ))}
        </section>

        <section className="section-heading">
          <div>
            <span className="kicker">Personalized</span>
            <h2>Your favorites</h2>
          </div>
          <span className="pill">Fast reorders</span>
        </section>

        <section className="favorite-strip" aria-label="Favorite restaurants">
          {favoriteRestaurants.map(restaurant => (
            <Link className="favorite-card" href={`/restaurants/${restaurant.id}`} key={restaurant.id}>
              <span>{restaurant.imageEmoji}</span>
              <strong>{restaurant.name}</strong>
              <em>{restaurant.deliveryMinutes}</em>
            </Link>
          ))}
        </section>

        <section className="section-heading">
          <div>
            <span className="kicker">Flow</span>
            <h2>Screen path implemented from the mocks</h2>
          </div>
          <span className="pill">Home → confirmation</span>
        </section>

        <section className="flow-grid">
          {featureSteps.map((step, index) => (
            <article className="flow-card" key={step.title}>
              <span>{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </section>

        <section className="section-heading">
          <div>
            <span className="kicker">Theme direction</span>
            <h2>Midnight Market visual system</h2>
          </div>
          <span className="pill">Mockups in docs/UI_MOCKUPS.md</span>
        </section>

        <section className="theme-grid">
          {themeOptions.map(theme => (
            <article className="card theme-card" key={theme.name}>
              <div className="theme-swatch" style={{ '--swatch': theme.swatch, '--theme-accent': theme.accent } as CSSProperties} />
              <h3>{theme.name}</h3>
              <p>{theme.mood}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
