'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { fetchOrders } from '@/lib/api';
import { isSignedIn } from '@/lib/auth';
import { ORDER_HISTORY_STORAGE_KEY } from '@/lib/cart';
import { getRestaurant } from '@/lib/marketplace';
import { routes } from '@/lib/routes';
import type { Order } from '@/lib/types';
import { formatMoney } from '@/lib/types';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadOrders(): Promise<void> {
      setSignedIn(isSignedIn(window.localStorage));
      const stored = window.localStorage.getItem(ORDER_HISTORY_STORAGE_KEY);
      const fallbackOrders = stored ? JSON.parse(stored) as Order[] : [];
      const backendOrders = await fetchOrders();
      const nextOrders = backendOrders ?? fallbackOrders;
      if (!active) return;
      setOrders(nextOrders);
      window.localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(nextOrders));
    }
    void loadOrders();
    return () => {
      active = false;
    };
  }, []);

  if (!signedIn) {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Orders" />
          <section className="card">
            <span className="kicker">Order history</span>
            <h1>Sign in required</h1>
            <p>Sign in to view saved mock orders.</p>
            <Link className="checkout-button inline-action" href={routes.signIn(routes.orderHistory)}>Sign in</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Orders" />
        <section className="card full-width">
          <span className="kicker">Order history</span>
          <h1>Past orders</h1>
          {orders.length === 0 ? (
            <div className="empty-state">
              <p>No saved orders yet.</p>
              <Link className="pill" href={routes.restaurants()}>Browse restaurants</Link>
            </div>
          ) : (
            <div className="cart-lines">
              {orders.map(order => {
                const restaurant = getRestaurant(order.restaurantId);
                return (
                  <Link className="cart-line detailed" href={routes.orderConfirmation(order.id)} key={order.id}>
                    <div>
                      <strong>{order.id}</strong>
                      <p>{restaurant?.name ?? 'Restaurant'} · {order.status}</p>
                    </div>
                    <strong>{formatMoney(order.totals.totalCents)}</strong>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
