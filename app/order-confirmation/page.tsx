'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { ORDER_HISTORY_STORAGE_KEY, ORDER_STORAGE_KEY } from '@/lib/cart';
import { getSelectedModifierLabels } from '@/lib/cart';
import { getRestaurant } from '@/lib/marketplace';
import { orderStatusSteps } from '@/lib/mock-data';
import { routes } from '@/lib/routes';
import type { Order } from '@/lib/types';
import { formatMoney } from '@/lib/types';

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<Order | null>(null);
  const restaurant = useMemo(() => order ? getRestaurant(order.restaurantId) : undefined, [order]);

  useEffect(() => {
    const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
    const storedHistory = window.localStorage.getItem(ORDER_HISTORY_STORAGE_KEY);
    const latestOrder = stored ? JSON.parse(stored) as Order : null;
    const history = storedHistory ? JSON.parse(storedHistory) as Order[] : [];
    setOrder(orderId ? history.find(candidate => candidate.id === orderId) ?? latestOrder : latestOrder);
  }, [orderId]);

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Orders" />

        <section className="card confirmation-hero">
          <span className="confirmation-check">✓</span>
          <span className="kicker">Finalized order</span>
          <h1>{order ? 'Order placed!' : 'No active mock order yet'}</h1>
          <p>{order ? `Mock order ${order.id} is confirmed with ${restaurant?.name ?? 'the restaurant'}.` : 'Place an order from checkout to activate this confirmation page.'}</p>
          {order && <p>{order.cartItems.reduce((sum, item) => sum + item.quantity, 0)} item{order.cartItems.length === 1 ? '' : 's'} · Total {formatMoney(order.totals.totalCents)}</p>}
        </section>

        <section className="card full-width status-card">
          <span className="kicker">Order progress</span>
          <h2>{order ? `Estimated arrival: ${new Date(order.estimatedDeliveryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Progress timeline preview'}</h2>
          <div className="status-grid">
            {orderStatusSteps.map((step, index) => (
              <div className={`status-step ${order && orderStatusSteps.findIndex(candidate => candidate.status === order.status) >= index ? 'active' : ''}`} key={step.status}>
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
              <div><span>Restaurant</span><strong>{restaurant?.name ?? 'Restaurant'}</strong></div>
              <div><span>Subtotal</span><strong>{formatMoney(order.totals.subtotalCents)}</strong></div>
              <div><span>Delivery</span><strong>{formatMoney(order.totals.deliveryFeeCents)}</strong></div>
              <div><span>Service</span><strong>{formatMoney(order.totals.serviceFeeCents)}</strong></div>
              <div><span>Tax</span><strong>{formatMoney(order.totals.taxCents)}</strong></div>
              <div><span>Tip</span><strong>{formatMoney(order.totals.tipCents ?? 0)}</strong></div>
              <div><span>Total</span><strong>{formatMoney(order.totals.totalCents)}</strong></div>
              <div><span>Payment</span><strong>Mock Visa •••• 4242</strong></div>
            </div>
            <div className="cart-lines">
              {order.cartItems.map(cartItem => (
                <div className="cart-line detailed" key={cartItem.id}>
                  <div>
                    <strong>{cartItem.quantity} x {cartItem.name}</strong>
                    {getSelectedModifierLabels(cartItem).map(label => <p key={label}>{label}</p>)}
                    {cartItem.specialInstructions && <p>Note: {cartItem.specialInstructions}</p>}
                  </div>
                </div>
              ))}
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

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<main className="marketplace-page"><div className="container"><MarketplaceNav active="Orders" /><section className="card"><h1>Loading order</h1></section></div></main>}>
      <OrderConfirmationContent />
    </Suspense>
  );
}
