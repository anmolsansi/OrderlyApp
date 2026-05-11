'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { getCartSubtotal, getMenuItem, getRestaurant } from '@/lib/marketplace';
import type { CartItem } from '@/lib/types';
import { routes } from '@/lib/routes';
import { formatMoney } from '@/lib/types';

const CART_STORAGE_KEY = 'orderlyapp.marketplace.cart.v1';
const ORDER_STORAGE_KEY = 'orderlyapp.marketplace.order.v1';

function makeOrderId(): string {
  return `ORD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const subtotal = useMemo(() => getCartSubtotal(cart), [cart]);
  const deliveryFee = cart.length > 0 ? 199 : 0;
  const serviceFee = cart.length > 0 ? 235 : 0;
  const promo = cart.length > 0 ? 500 : 0;
  const total = Math.max(0, subtotal + deliveryFee + serviceFee - promo);
  const restaurant = cart[0] ? getRestaurant(cart[0].restaurantId) : undefined;

  useEffect(() => {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    setCart(stored ? JSON.parse(stored) as CartItem[] : []);
    setMounted(true);
  }, []);

  function updateQuantity(cartItemId: string, delta: number): void {
    const nextCart = cart.map(item => item.id === cartItemId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item);
    setCart(nextCart);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
  }

  function clearCart(): void {
    setCart([]);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([]));
  }

  function placeOrder(): void {
    const order = {
      id: makeOrderId(),
      total,
      restaurantName: restaurant?.name ?? 'Pizza restaurant',
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([]));
    router.push(routes.orderConfirmation());
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Cart" />

        <section className="checkout-layout">
          <article className="card checkout-cart-panel">
            <div className="cart-header">
              <div>
                <span className="kicker">Checkout</span>
                <h1>Your cart</h1>
              </div>
              {cart.length > 0 && <button className="ghost-button" type="button" onClick={clearCart}>Clear cart</button>}
            </div>

            {!mounted || cart.length === 0 ? (
              <div className="empty-state">
                <p>Your cart is empty. Pick a restaurant and customize a pizza to start checkout.</p>
                <Link className="pill" href={routes.restaurants()}>Browse restaurants</Link>
              </div>
            ) : (
              <div className="cart-lines">
                {cart.map(cartItem => {
                  const item = getMenuItem(cartItem.restaurantId, cartItem.menuItemId);
                  return (
                    <div className="cart-line detailed" key={cartItem.id}>
                      <div>
                        <strong>{cartItem.name}</strong>
                        <p>{item?.description}</p>
                      </div>
                      <div className="quantity-controls">
                        <button type="button" onClick={() => updateQuantity(cartItem.id, -1)}>-</button>
                        <span>{cartItem.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(cartItem.id, 1)}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="cart-total"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div>
            <div className="cart-total"><span>Delivery fee</span><strong>{formatMoney(deliveryFee)}</strong></div>
            <div className="cart-total"><span>Service fee</span><strong>{formatMoney(serviceFee)}</strong></div>
            <div className="cart-total discount-row"><span>Promo</span><strong>-{formatMoney(promo)}</strong></div>
            <div className="cart-total grand-total"><span>Total</span><strong>{formatMoney(total)}</strong></div>
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">Payment review</span>
            <h2>Confirm delivery and payment</h2>
            <div className="payment-breakdown">
              <div><span>Delivery address</span><strong>123 Demo Street</strong></div>
              <div><span>Drop-off</span><strong>Leave at door</strong></div>
              <div><span>Payment</span><strong>Mock Visa •••• 4242</strong></div>
              <div><span>Delivery window</span><strong>{restaurant?.deliveryMinutes ?? '28–35 min'}</strong></div>
            </div>
            <button className="checkout-button" type="button" disabled={cart.length === 0} onClick={placeOrder}>Place order</button>
          </aside>
        </section>
      </div>
    </main>
  );
}
