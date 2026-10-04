'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { fetchOrderReceipt, getOrderlyDataMode } from '@/lib/api';
import { routes } from '@/lib/routes';
import type { OrderReceipt } from '@/lib/types';
import { formatMoney } from '@/lib/types';

type ReceiptViewState = 'loading' | 'success' | 'not_found' | 'error' | 'unavailable';

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const mode = getOrderlyDataMode();
  const [order, setOrder] = useState<OrderReceipt | null>(null);
  const [viewState, setViewState] = useState<ReceiptViewState>(mode === 'local_demo' ? 'unavailable' : 'loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (mode === 'local_demo') {
      setViewState('unavailable');
      return;
    }
    if (!orderId) {
      setOrder(null);
      setViewState('not_found');
      return;
    }

    let active = true;
    setViewState('loading');
    setErrorMessage(null);
    void fetchOrderReceipt(orderId).then(result => {
      if (!active) return;
      if (result.ok) {
        setOrder(result.data);
        setViewState('success');
        return;
      }
      setOrder(null);
      if (result.error.code === 'order_not_found') {
        setViewState('not_found');
        return;
      }
      setErrorMessage(result.error.message);
      setViewState('error');
    });

    return () => {
      active = false;
    };
  }, [mode, orderId, retryVersion]);

  if (viewState === 'unavailable') {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Orders" />
          <section className="card full-width" role="status">
            <span className="kicker">Local fixture preview</span>
            <h1>Order receipts unavailable in fixture preview</h1>
            <p>The local preview never creates or displays cached accepted orders.</p>
            <Link className="checkout-button inline-action" href={routes.restaurants()}>Browse preview restaurants</Link>
          </section>
        </div>
      </main>
    );
  }

  if (viewState === 'loading') {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Orders" />
          <section className="card full-width" role="status">
            <span className="kicker">Saved receipt</span>
            <h1>Loading exact order…</h1>
            <p>Checking the current guest&apos;s durable receipt.</p>
          </section>
        </div>
      </main>
    );
  }

  if (viewState === 'not_found') {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Orders" />
          <section className="card full-width">
            <span className="kicker">Saved receipt</span>
            <h1>Order not found</h1>
            <p>{orderId ? `No order ${orderId} belongs to this guest session.` : 'This receipt link is missing an order ID.'}</p>
            <div className="confirmation-actions">
              <Link className="ghost-button" href={routes.orderHistory}>View my orders</Link>
              <Link className="checkout-button inline-action" href={routes.restaurants()}>Browse restaurants</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (viewState === 'error' || !order) {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Orders" />
          <section className="card full-width validation-panel" role="alert">
            <span className="kicker">Saved receipt</span>
            <h1>Receipt could not be loaded</h1>
            <p>{errorMessage ?? 'The server receipt is temporarily unavailable.'}</p>
            <button className="ghost-button" type="button" onClick={() => setRetryVersion(value => value + 1)}>Retry</button>
          </section>
        </div>
      </main>
    );
  }

  const address = [
    order.checkout.street,
    order.checkout.apartment,
    `${order.checkout.city}, ${order.checkout.state} ${order.checkout.postalCode}`,
  ].filter(Boolean).join(', ');

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Orders" />

        <section className="card confirmation-hero">
          <span className="confirmation-check">✓</span>
          <span className="kicker">Saved mock order</span>
          <h1>Order placed</h1>
          <p>Order {order.id} is durably saved for this guest session.</p>
          <p>{order.items.reduce((sum, item) => sum + item.quantity, 0)} item{order.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? '' : 's'} · Total {formatMoney(order.totals.totalCents)}</p>
        </section>

        <section className="card full-width status-card">
          <span className="kicker">Order status</span>
          <h2>{order.status}</h2>
          <p>This mock demo records the saved order only. It does not claim restaurant acceptance, dispatch, or a delivery ETA.</p>
          <p>Saved {new Date(order.createdAt).toLocaleString()}</p>
        </section>

        <section className="card full-width receipt-card">
          <span className="kicker">Immutable receipt</span>
          <h2>Receipt details</h2>
          <div className="payment-breakdown">
            <div><span>Order number</span><strong>{order.id}</strong></div>
            <div><span>Delivery address</span><strong>{address}</strong></div>
            <div><span>Delivery instructions</span><strong>{order.checkout.deliveryInstructions || 'None'}</strong></div>
            <div><span>Subtotal</span><strong>{formatMoney(order.totals.subtotalCents)}</strong></div>
            <div><span>Delivery</span><strong>{formatMoney(order.totals.deliveryFeeCents)}</strong></div>
            <div><span>Service</span><strong>{formatMoney(order.totals.serviceFeeCents)}</strong></div>
            <div><span>Tax</span><strong>{formatMoney(order.totals.taxCents)}</strong></div>
            <div><span>Discount</span><strong>-{formatMoney(order.totals.discountCents)}</strong></div>
            <div><span>Tip</span><strong>{formatMoney(order.totals.tipCents ?? 0)}</strong></div>
            <div><span>Total</span><strong>{formatMoney(order.totals.totalCents)}</strong></div>
            <div><span>Payment</span><strong>Mock payment, no card details stored</strong></div>
          </div>

          <div className="cart-lines">
            {order.items.map(item => (
              <div className="cart-line detailed" key={item.id}>
                <div>
                  <strong>{item.quantity} × {item.name}</strong>
                  {item.modifiers.map(modifier => (
                    <p key={modifier.groupId}>{modifier.name}: {modifier.options.map(option => option.name).join(', ')}</p>
                  ))}
                  {item.specialInstructions && <p>Note: {item.specialInstructions}</p>}
                </div>
                <strong>{formatMoney(item.lineTotalCents)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="confirmation-actions">
          <Link className="ghost-button" href={routes.orderHistory}>View my orders</Link>
          <Link className="checkout-button inline-action" href={routes.restaurants()}>Browse more restaurants</Link>
        </section>
      </div>
    </main>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<main className="marketplace-page"><div className="container"><MarketplaceNav active="Orders" /><section className="card"><h1>Loading exact order…</h1></section></div></main>}>
      <OrderConfirmationContent />
    </Suspense>
  );
}
