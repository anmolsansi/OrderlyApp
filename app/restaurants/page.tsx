import Link from 'next/link';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { filterRestaurants, quickFilters } from '@/lib/marketplace';
import { formatMoney } from '@/lib/types';

interface RestaurantsPageProps {
  searchParams: Promise<{ query?: string; filter?: string }>;
}

export default async function RestaurantsPage({ searchParams }: RestaurantsPageProps) {
  const params = await searchParams;
  const query = params.query ?? '';
  const activeFilter = params.filter ?? 'All pizza';
  const matchingRestaurants = filterRestaurants(query, activeFilter);

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Search" />

        <section className="results-layout">
          <aside className="card filters-panel">
            <span className="kicker">Filters</span>
            <h2>Refine pizza</h2>
            <div className="filter-stack">
              {quickFilters.map(filter => (
                <Link className={`filter-chip ${activeFilter === filter ? 'active' : ''}`} href={`/restaurants?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}`} key={filter}>
                  {filter}
                </Link>
              ))}
            </div>
          </aside>

          <section className="results-main">
            <div className="section-heading compact-heading">
              <div>
                <span className="kicker">Restaurant list</span>
                <h1>{query ? `Search results for “${query}”` : 'Pizza restaurants near you'}</h1>
                <p>{matchingRestaurants.length} matching restaurants · sorted by recommended</p>
              </div>
              <form className="search-panel compact-search" action="/restaurants" role="search">
                <input aria-label="Search pizza restaurants and menu items" type="search" name="query" placeholder="Search again" defaultValue={query} />
                <button type="submit">Search</button>
              </form>
            </div>

            <div className="restaurant-results-list">
              {matchingRestaurants.map(restaurant => (
                <Link className="card restaurant-result-card" href={`/restaurants/${restaurant.id}`} key={restaurant.id}>
                  <span className="restaurant-emoji">{restaurant.imageEmoji}</span>
                  <div>
                    <h2>{restaurant.name}</h2>
                    <p>{restaurant.cuisine} · ⭐ {restaurant.rating} · {restaurant.deliveryMinutes}</p>
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
