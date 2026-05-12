'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { orderStatusSteps } from '@/lib/mock-data';
import { routes } from '@/lib/routes';
import { formatMoney } from '@/lib/types';

const ORDER_STORAGE_KEY = 'orderlyapp.marketplace.order.v1';

type StoredOrder = {
  id: string;
  total: number;
  restaurantName: string;
  itemCount: number;
  createdAt: string;
};

export default function OrderConfirmationPage() {
  const [order, setOrder] = useState<StoredOrder | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
    setOrder(stored ? JSON.parse(stored) as StoredOrder : null);
  }, []);

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Orders" />

        <section className="card confirmation-hero">
          <span className="confirmation-check">✓</span>
          <span className="kicker">Finalized order</span>
          <h1>{order ? 'Order placed!' : 'No active mock order yet'}</h1>
          <p>{order ? `Mock order ${order.id} is confirmed with ${order.restaurantName}.` : 'Place an order from checkout to activate this confirmation page.'}</p>
          {order && <p>{order.itemCount} item{order.itemCount === 1 ? '' : 's'} · Total {formatMoney(order.total)}</p>}
        </section>

        <section className="card full-width status-card">
          <span className="kicker">Order progress</span>
          <h2>{order ? 'Estimated arrival: 28 minutes' : 'Progress timeline preview'}</h2>
          <div className="status-grid">
            {orderStatusSteps.map((step, index) => (
              <div className={`status-step ${order && index <= 2 ? 'active' : ''}`} key={step.status}>
                <strong>{step.label}</strong>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {order && (
          <section className="card full-width receipt-card">
            <span className="kicker">Receipt</span>
            <h2>Mock receipt details</h2>
            <div className="payment-breakdown">
              <div><span>Order number</span><strong>{order.id}</strong></div>
              <div><span>Restaurant</span><strong>{order.restaurantName}</strong></div>
              <div><span>Items</span><strong>{order.itemCount}</strong></div>
              <div><span>Total</span><strong>{formatMoney(order.total)}</strong></div>
              <div><span>Payment</span><strong>Mock Visa •••• 4242</strong></div>
            </div>
          </section>
        )}

        <section className="confirmation-actions">
          <Link className="ghost-button" href={routes.restaurants()}>Browse more restaurants</Link>
          <Link className="checkout-button inline-action" href={routes.restaurant('marios-pizza')}>Reorder pizza</Link>
        </section>
      </div>
    </main>
  );
}
