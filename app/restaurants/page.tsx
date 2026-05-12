import Link from 'next/link';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { discoveryCuisineFilters, filterRestaurants, quickFilters } from '@/lib/marketplace';
import { routes } from '@/lib/routes';
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
                <Link className={`filter-chip ${activeFilter === filter ? 'active' : ''}`} href={routes.restaurants({ query, filter })} key={filter}>
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
                <h2>{query ? `Search results for “${query}”` : 'Pizza restaurants near you'}</h2>
                <p>{showMockError ? 'Mock error state' : `${matchingRestaurants.length} matching restaurants · sorted by recommended`}</p>
              </div>
              <div className="state-toggle-row" aria-label="Preview states">
                <Link className={activeState === 'ready' ? 'pill active-state' : 'pill'} href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(activeFilter)}&mode=${activeMode}`}>Results</Link>
                <Link className={activeState === 'empty' ? 'pill active-state' : 'pill'} href={`/restaurants?state=empty&query=nope&filter=${encodeURIComponent(activeFilter)}&mode=${activeMode}`}>Empty</Link>
                <Link className={activeState === 'error' ? 'pill active-state' : 'pill'} href={`/restaurants?state=error&query=${encodeURIComponent(query)}&filter=${encodeURIComponent(activeFilter)}&mode=${activeMode}`}>Error</Link>
              </div>
              <form className="search-panel compact-search" action={routes.restaurants()} role="search">
                <input aria-label="Search pizza restaurants and menu items" type="search" name="query" placeholder="Search again" defaultValue={query} />
                <button type="submit">Search</button>
              </form>
            </div>

            <div className="restaurant-results-list">
              {matchingRestaurants.map(restaurant => (
                <Link className="card restaurant-result-card" href={routes.restaurant(restaurant.id)} key={restaurant.id}>
                  <span className="restaurant-emoji">{restaurant.imageEmoji}</span>
                  <div>
                    <h2>{restaurant.name}</h2>
                    <p>{restaurant.cuisine} · ⭐ {restaurant.rating || 'New'} · {restaurant.deliveryMinutes} · {restaurant.distanceMiles} mi</p>
                    <p>{restaurant.isOpen ? 'Open now' : 'Closed'} · {restaurant.menuCategories.length} menu sections</p>
                    <p>Delivery {formatMoney(restaurant.deliveryFeeCents)}</p>
                    <div className="tag-row">
                      {restaurant.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
                    </div>
                  </div>
                  <strong>View menu →</strong>
                </Link>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
