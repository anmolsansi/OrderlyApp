'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { fetchOrderReceipts, getOrderlyDataMode } from '@/lib/api';
import { routes } from '@/lib/routes';
import type { OrderReceipt } from '@/lib/types';
import { formatMoney } from '@/lib/types';

type HistoryViewState = 'loading' | 'success' | 'error' | 'unavailable';

export default function OrdersPage() {
  const mode = getOrderlyDataMode();
  const [orders, setOrders] = useState<OrderReceipt[]>([]);
  const [viewState, setViewState] = useState<HistoryViewState>(mode === 'local_demo' ? 'unavailable' : 'loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (mode === 'local_demo') {
      setOrders([]);
      setViewState('unavailable');
      return;
    }

    let active = true;
    setViewState('loading');
    setErrorMessage(null);
    void fetchOrderReceipts().then(result => {
      if (!active) return;
      if (result.ok) {
        setOrders(result.data);
        setViewState('success');
        return;
      }
      setOrders([]);
      setErrorMessage(result.error.message);
      setViewState('error');
    });

    return () => {
      active = false;
    };
  }, [mode, retryVersion]);

  if (viewState === 'unavailable') {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Orders" />
          <section className="card full-width" role="status">
            <span className="kicker">Local fixture preview</span>
            <h1>Order history unavailable in fixture preview</h1>
            <p>This preview has no server guest session and never displays cached accepted receipts.</p>
            <Link className="checkout-button inline-action" href={routes.restaurants()}>Browse preview restaurants</Link>
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
          <h1>Saved mock orders</h1>
          <p>Only receipts owned by this browser guest session are shown.</p>

          {viewState === 'loading' && <div className="empty-state" role="status"><p>Loading saved receipts…</p></div>}

          {viewState === 'error' && (
            <div className="validation-panel" role="alert">
              <p>{errorMessage ?? 'Order history is temporarily unavailable.'}</p>
              <button className="ghost-button" type="button" onClick={() => setRetryVersion(value => value + 1)}>Retry</button>
            </div>
          )}

          {viewState === 'success' && orders.length === 0 && (
            <div className="empty-state">
              <p>No saved orders yet.</p>
              <Link className="pill" href={routes.restaurants()}>Browse restaurants</Link>
            </div>
          )}

          {viewState === 'success' && orders.length > 0 && (
            <div className="cart-lines">
              {orders.map(order => (
                <Link className="cart-line detailed" href={routes.orderConfirmation(order.id)} key={order.id}>
                  <div>
                    <strong>{order.items[0]?.name ?? 'Saved order'}</strong>
                    <p>{order.status} · {new Date(order.createdAt).toLocaleString()}</p>
                    <p>{order.items.reduce((sum, item) => sum + item.quantity, 0)} item{order.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? '' : 's'}</p>
                  </div>
                  <strong>{formatMoney(order.totals.totalCents)}</strong>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
