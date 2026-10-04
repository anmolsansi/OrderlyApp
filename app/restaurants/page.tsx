'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { fetchRestaurants, getOrderlyDataMode } from '@/lib/api';
import { discoveryCuisineFilters, discoveryMockStates, filterRestaurants, quickFilters } from '@/lib/marketplace';
import type { RestaurantSort } from '@/lib/marketplace';
import { routes } from '@/lib/routes';
import type { Restaurant } from '@/lib/types';
import { formatMoney } from '@/lib/types';

interface RestaurantsPageProps {
  searchParams: Promise<{ query?: string; filter?: string; mode?: string; sort?: string }>;
}

function formatDeliveryFee(cents: number): string {
  return cents === 0 ? 'Free delivery' : `${formatMoney(cents)} delivery`;
}

export default function RestaurantsPage({ searchParams }: RestaurantsPageProps) {
  const params = use(searchParams);
  const query = params.query ?? '';
  const activeFilter = params.filter ?? 'All pizza';
  const activeMode = params.mode === 'pickup' ? 'pickup' : 'delivery';
  const activeSort = isRestaurantSort(params.sort) ? params.sort : 'recommended';
  const dataMode = getOrderlyDataMode();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);

    void fetchRestaurants({ signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setRestaurants(result.data);
      } else {
        setRestaurants([]);
        setError(result.error.message);
      }
      setLoading(false);
    });

    return () => controller.abort();
  }, [reloadKey]);

  const matchingRestaurants = useMemo(
    () => filterRestaurants(restaurants, query, activeFilter, activeSort),
    [restaurants, query, activeFilter, activeSort],
  );
  const showNoResults = !loading && !error && matchingRestaurants.length === 0;
  const hasActiveFilters = query.length > 0 || activeFilter !== 'All pizza' || activeMode !== 'delivery' || activeSort !== 'recommended';

  return (
    <main className="marketplace-page restaurant-discovery-page">
      <div className="container">
        <MarketplaceNav active="Search" />

        {dataMode === 'local_demo' && (
          <div className="validation-panel" role="status">
            <strong>Local fixture preview</strong>
            <p>These restaurants come from isolated fixture data. Checkout and backend guest requests are disabled.</p>
          </div>
        )}

        <section className="discovery-hero card">
          <div>
            <span className="kicker">Restaurant discovery</span>
            <h1>Find your next order</h1>
            <p className="lead">
              Browse the selected catalog source with delivery speed, fees, tags, and availability before opening a menu.
            </p>
          </div>
          <div className="discovery-hero-metrics" aria-label="Discovery summary">
            <span><strong>{loading ? '—' : matchingRestaurants.length}</strong> matches</span>
            <span><strong>{loading ? '—' : restaurants.length}</strong> restaurants</span>
            <span><strong>{dataMode === 'api' ? 'API' : 'Preview'}</strong> source</span>
          </div>
        </section>

        <section className="discovery-controls card" aria-label="Restaurant discovery controls">
          <form className="search-panel discovery-search" action="/restaurants" role="search">
            <span aria-hidden="true">🔎</span>
            <input
              aria-label="Search restaurants, cuisines, dishes, and tags"
              type="search"
              name="query"
              placeholder="Search pizza, vegan, wood fired, late night..."
              defaultValue={query}
            />
            <input type="hidden" name="filter" value={activeFilter} />
            <input type="hidden" name="mode" value={activeMode} />
            <input type="hidden" name="sort" value={activeSort} />
            <button type="submit">Search</button>
          </form>

          <div className="segmented-control" aria-label="Fulfillment method">
            <Link className={activeMode === 'delivery' ? 'active' : ''} href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(activeFilter)}&mode=delivery&sort=${activeSort}`}>
              Delivery
            </Link>
            <Link className={activeMode === 'pickup' ? 'active' : ''} href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(activeFilter)}&mode=pickup&sort=${activeSort}`}>
              Pickup
            </Link>
          </div>

          <form className="sort-form" action="/restaurants">
            <input type="hidden" name="query" value={query} />
            <input type="hidden" name="filter" value={activeFilter} />
            <input type="hidden" name="mode" value={activeMode} />
            <label className="mock-select-label">
              Sort
              <select name="sort" defaultValue={activeSort} aria-label="Sort restaurants">
                <option value="recommended">Recommended</option>
                <option value="rating">Highest rating</option>
                <option value="eta">Fastest delivery</option>
                <option value="fee">Lowest delivery fee</option>
                <option value="distance">Nearest</option>
              </select>
            </label>
            <button className="ghost-button" type="submit">Apply</button>
          </form>

          <div className="filter-row discovery-filter-row" aria-label="Cuisine and restaurant filters">
            {[...discoveryCuisineFilters, ...quickFilters.filter(filter => !discoveryCuisineFilters.includes(filter))].map(filter => (
              <Link
                className={`filter-chip ${activeFilter === filter ? 'active' : ''}`}
                href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&mode=${activeMode}&sort=${activeSort}`}
                key={filter}
              >
                {filter}
              </Link>
            ))}
          </div>
        </section>

        <section className="results-layout discovery-results-layout">
          <aside className="card filters-panel discovery-sidebar">
            <span className="kicker">Filter stack</span>
            <h2>Refine results</h2>
            <div className="filter-stack">
              {quickFilters.map(filter => (
                <Link className={`filter-chip ${activeFilter === filter ? 'active' : ''}`} href={routes.restaurants({ query, filter })} key={filter}>
                  {filter}
                </Link>
              ))}
            </div>
            <div className="discovery-note">
              <strong>Canonical browsing</strong>
              <p>Search and filters apply only to the catalog returned by the selected data mode. API errors do not load fixture restaurants.</p>
            </div>
          </aside>

          <section className="results-main">
            <div className="section-heading compact-heading discovery-list-heading">
              <div>
                <span className="kicker">Restaurant list</span>
                <h2>{query ? `Search results for “${query}”` : 'Pizza restaurants near you'}</h2>
                <p>{error ? 'Catalog unavailable' : `${matchingRestaurants.length} matching restaurants · sorted by ${sortLabels[activeSort]}`}</p>
              </div>
              <form className="search-panel compact-search" action={routes.restaurants()} role="search">
                <input aria-label="Search pizza restaurants and menu items" type="search" name="query" placeholder="Search again" defaultValue={query} />
                <button type="submit">Search</button>
              </form>
            </div>

            {hasActiveFilters && (
              <div className="active-filter-summary">
                <span>Active: {[query && `“${query}”`, activeFilter !== 'All pizza' && activeFilter, activeMode !== 'delivery' && activeMode, activeSort !== 'recommended' && sortLabels[activeSort]].filter(Boolean).join(' · ')}</span>
                <Link className="ghost-button" href={routes.restaurants()}>Clear all</Link>
              </div>
            )}

            {loading && (
              <div className="restaurant-results-list" aria-label="Loading restaurants">
                {[0, 1, 2].map(index => (
                  <div className="card loading-preview-card" key={index}>
                    {discoveryMockStates.loadingRows.map(row => <span className="skeleton-line" style={{ width: row.width }} key={row.id} />)}
                  </div>
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="card discovery-state-card error-state" role="alert">
                <span aria-hidden="true">!</span>
                <div>
                  <h3>{discoveryMockStates.error.title}</h3>
                  <p>{error}</p>
                  <button className="ghost-button" type="button" onClick={() => setReloadKey(value => value + 1)}>Retry</button>
                </div>
              </div>
            )}

            {showNoResults && (
              <div className="card discovery-state-card no-results-state">
                <span aria-hidden="true">0</span>
                <div>
                  <h3>{discoveryMockStates.empty.title}</h3>
                  <p>{hasActiveFilters ? 'No restaurants match the current search and filters.' : discoveryMockStates.empty.description}</p>
                  <Link className="ghost-button" href={routes.restaurants()}>Clear filters</Link>
                </div>
              </div>
            )}

            {!loading && !error && !showNoResults && (
              <div className="restaurant-results-list">
                {matchingRestaurants.map(restaurant => {
                  const isAvailable = restaurant.isOpen && !restaurant.outsideDeliveryRange;
                  const cardContent = (
                    <>
                      <span className="restaurant-emoji" aria-hidden="true">{restaurant.imageAvailable === false ? '?' : restaurant.imageEmoji}</span>
                      <div>
                        <h2>{restaurant.name}</h2>
                        <p>{restaurant.cuisine} · ⭐ {restaurant.rating || 'New'} · {restaurant.deliveryMinutes}{restaurant.distanceMiles > 0 ? ` · ${restaurant.distanceMiles} mi` : ''}</p>
                        <p>{restaurant.isOpen ? 'Open now' : 'Closed'} · {restaurant.outsideDeliveryRange ? 'Outside range' : `${restaurant.menuCategories.length} menu sections`}</p>
                        <p>{formatDeliveryFee(restaurant.deliveryFeeCents)}</p>
                        <div className="tag-row">
                          {restaurant.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
                        </div>
                      </div>
                      <strong>{isAvailable ? 'View menu ->' : 'Unavailable'}</strong>
                    </>
                  );

                  return isAvailable ? (
                    <Link className="card restaurant-result-card" href={routes.restaurant(restaurant.id)} key={restaurant.id}>
                      {cardContent}
                    </Link>
                  ) : (
                    <article className="card restaurant-result-card disabled-card" aria-disabled="true" key={restaurant.id}>
                      {cardContent}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

const sortLabels: Record<RestaurantSort, string> = {
  recommended: 'recommended',
  rating: 'highest rating',
  eta: 'fastest delivery',
  fee: 'lowest delivery fee',
  distance: 'nearest',
};

function isRestaurantSort(value: string | undefined): value is RestaurantSort {
  return value === 'recommended' || value === 'rating' || value === 'eta' || value === 'fee' || value === 'distance';
}
