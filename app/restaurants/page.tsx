import Link from 'next/link';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import {
  discoveryCuisineFilters,
  discoveryMockStates,
  filterRestaurants,
  quickFilters,
} from '@/lib/marketplace';
import { formatMoney } from '@/lib/types';

interface RestaurantsPageProps {
  searchParams: Promise<{ query?: string; filter?: string; mode?: string; state?: string }>;
}

function formatDeliveryFee(cents: number): string {
  return cents === 0 ? 'Free delivery' : `${formatMoney(cents)} delivery`;
}

export default async function RestaurantsPage({ searchParams }: RestaurantsPageProps) {
  const params = await searchParams;
  const query = params.query ?? '';
  const activeFilter = params.filter ?? 'All pizza';
  const activeMode = params.mode === 'pickup' ? 'pickup' : 'delivery';
  const activeState = params.state ?? 'ready';
  const matchingRestaurants = activeState === 'empty' ? [] : filterRestaurants(query, activeFilter);
  const showMockError = activeState === 'error';

  return (
    <main className="marketplace-page restaurant-discovery-page">
      <div className="container">
        <MarketplaceNav active="Search" />

        <section className="discovery-hero card">
          <div>
            <span className="kicker">Restaurant discovery</span>
            <h1>Find your next order</h1>
            <p className="lead">
              Browse mock restaurants with delivery speed, fees, distance, promos, and availability signals before opening a menu.
            </p>
          </div>
          <div className="discovery-hero-metrics" aria-label="Discovery summary">
            <span><strong>{matchingRestaurants.length}</strong> matches</span>
            <span><strong>12</strong> seeded restaurants</span>
            <span><strong>3</strong> state previews</span>
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
            <button type="submit">Search</button>
          </form>

          <div className="segmented-control" aria-label="Fulfillment method">
            <Link className={activeMode === 'delivery' ? 'active' : ''} href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(activeFilter)}&mode=delivery`}>
              Delivery
            </Link>
            <Link className={activeMode === 'pickup' ? 'active' : ''} href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(activeFilter)}&mode=pickup`}>
              Pickup
            </Link>
          </div>

          <label className="mock-select-label">
            Sort
            <select defaultValue="recommended" aria-label="Sort restaurants">
              <option value="recommended">Recommended</option>
              <option value="rating">Highest rating</option>
              <option value="eta">Fastest delivery</option>
              <option value="fee">Lowest delivery fee</option>
              <option value="distance">Nearest</option>
            </select>
          </label>

          <div className="filter-row discovery-filter-row" aria-label="Cuisine and restaurant filters">
            {[...discoveryCuisineFilters, ...quickFilters.filter(filter => !discoveryCuisineFilters.includes(filter))].map(filter => (
              <Link
                className={`filter-chip ${activeFilter === filter ? 'active' : ''}`}
                href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&mode=${activeMode}`}
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
            <h2>Visible on desktop</h2>
            <div className="filter-stack">
              {quickFilters.map(filter => (
                <Link className={`filter-chip ${activeFilter === filter ? 'active' : ''}`} href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&mode=${activeMode}`} key={filter}>
                  {filter}
                </Link>
              ))}
            </div>
            <div className="discovery-note">
              <strong>Mock controls</strong>
              <p>Search and chips demonstrate the intended discovery surface. Closed and out-of-range restaurants stay visible but are visually deprioritized.</p>
            </div>
          </aside>

          <section className="results-main">
            <div className="section-heading compact-heading discovery-list-heading">
              <div>
                <span className="kicker">Restaurant list</span>
                <h2>{query ? `Search results for “${query}”` : 'Restaurants near you'}</h2>
                <p>{showMockError ? 'Mock error state' : `${matchingRestaurants.length} matching restaurants · sorted by recommended`}</p>
              </div>
              <div className="state-toggle-row" aria-label="Preview states">
                <Link className={activeState === 'ready' ? 'pill active-state' : 'pill'} href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(activeFilter)}&mode=${activeMode}`}>Results</Link>
                <Link className={activeState === 'empty' ? 'pill active-state' : 'pill'} href={`/restaurants?state=empty&query=nope&filter=${encodeURIComponent(activeFilter)}&mode=${activeMode}`}>Empty</Link>
                <Link className={activeState === 'error' ? 'pill active-state' : 'pill'} href={`/restaurants?state=error&query=${encodeURIComponent(query)}&filter=${encodeURIComponent(activeFilter)}&mode=${activeMode}`}>Error</Link>
              </div>
            </div>

            {showMockError ? (
              <article className="card discovery-state-card error-state" aria-live="polite">
                <span aria-hidden="true">⚠️</span>
                <div>
                  <h3>We could not load restaurants</h3>
                  <p>Mock API timeout. Keep the retry action visible and preserve selected filters when trying again.</p>
                  <Link className="checkout-button inline-action" href="/restaurants">Retry discovery</Link>
                </div>
              </article>
            ) : matchingRestaurants.length === 0 ? (
              <article className="card discovery-state-card no-results-state" aria-live="polite">
                <span aria-hidden="true">🧭</span>
                <div>
                  <h3>No restaurants match these filters</h3>
                  <p>Try clearing search, switching cuisine chips, or browsing all pizza restaurants in the seeded catalog.</p>
                  <Link className="checkout-button inline-action" href="/restaurants">Clear filters</Link>
                </div>
              </article>
            ) : (
              <div className="restaurant-discovery-grid">
                {matchingRestaurants.map(restaurant => {
                  const isUnavailable = restaurant.status !== 'open' || restaurant.outsideDeliveryRange;
                  return (
                    <Link
                      className={`card discovery-restaurant-card ${isUnavailable ? 'is-deprioritized' : ''}`}
                      href={`/restaurants/${restaurant.id}`}
                      key={restaurant.id}
                      aria-label={`${restaurant.name}, ${restaurant.status === 'open' ? 'open' : 'closed'}, ${restaurant.deliveryMinutes}`}
                    >
                      <div className="restaurant-image-block" aria-hidden="true">
                        {restaurant.imageAvailable === false ? <span className="missing-image">No image</span> : <span>{restaurant.imageEmoji}</span>}
                        {restaurant.promotion ? <em>{restaurant.promotion}</em> : null}
                      </div>
                      <div className="restaurant-card-copy">
                        <div className="restaurant-card-title-row">
                          <div>
                            <h3>{restaurant.name}</h3>
                            <p>{restaurant.cuisine}</p>
                          </div>
                          <span className={`status-badge ${restaurant.status === 'open' ? 'open' : 'closed'}`}>{restaurant.status === 'open' ? 'Open' : 'Closed'}</span>
                        </div>
                        <p className="restaurant-summary">⭐ {restaurant.rating} · {restaurant.deliveryMinutes} · {formatDeliveryFee(restaurant.deliveryFeeCents)}</p>
                        <p className="restaurant-summary">{restaurant.distanceMiles?.toFixed(1) ?? '1.0'} mi away{restaurant.outsideDeliveryRange ? ' · Outside delivery range' : ''}</p>
                        <div className="tag-row compact-tags">
                          {restaurant.tags.slice(0, 4).map(tag => <span className="tag" key={tag}>{tag}</span>)}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            <section className="state-preview-grid" aria-label="Static discovery states">
              <article className="card loading-preview-card">
                <span className="kicker">Loading state</span>
                {discoveryMockStates.loadingRows.map(row => <span className="skeleton-line" style={{ width: row.width }} key={row.id} />)}
              </article>
              <article className="card discovery-state-mini">
                <span className="kicker">No search matches</span>
                <h3>{discoveryMockStates.empty.title}</h3>
                <p>{discoveryMockStates.empty.description}</p>
              </article>
              <article className="card discovery-state-mini error-state-mini">
                <span className="kicker">Error + retry</span>
                <h3>{discoveryMockStates.error.title}</h3>
                <p>{discoveryMockStates.error.description}</p>
              </article>
            </section>
          </section>
        </section>
      </div>
    </main>
  );
}
