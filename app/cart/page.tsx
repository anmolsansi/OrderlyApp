'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { clearBackendCart, fetchCart, saveCart } from '@/lib/api';
import {
  CART_STORAGE_KEY,
  getCartLineTotal,
  getOrCreateBackendSessionId,
  getSelectedModifierLabels,
  removeCartItem,
  updateCartItemQuantity,
  validateCart,
} from '@/lib/cart';
import { calculateCartTotals } from '@/lib/mock-data';
import { getMenuItem, getRestaurant } from '@/lib/marketplace';
import { routes } from '@/lib/routes';
import type { CartItem } from '@/lib/types';
import { formatMoney } from '@/lib/types';

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const restaurant = cart[0] ? getRestaurant(cart[0].restaurantId) : undefined;
  const validation = useMemo(() => validateCart(cart), [cart]);
  const totals = useMemo(() => calculateCartTotals(cart, restaurant?.id), [cart, restaurant?.id]);

  useEffect(() => {
    let active = true;
    async function loadCart(): Promise<void> {
      const sessionId = getOrCreateBackendSessionId(window.localStorage);
      const stored = window.localStorage.getItem(CART_STORAGE_KEY);
      const fallbackCart = stored ? JSON.parse(stored) as CartItem[] : [];
      const backendCart = await fetchCart(sessionId);
      const nextCart = backendCart ?? fallbackCart;
      if (!active) return;
      setCart(nextCart);
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
      setMounted(true);
    }
    void loadCart();
    return () => {
      active = false;
    };
  }, []);

  async function persist(nextCart: CartItem[]): Promise<void> {
    const sessionId = getOrCreateBackendSessionId(window.localStorage);
    setCart(nextCart);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
    await saveCart(sessionId, nextCart);
  }

  async function clearCart(): Promise<void> {
    const sessionId = getOrCreateBackendSessionId(window.localStorage);
    setCart([]);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([]));
    await clearBackendCart(sessionId);
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Cart" />

        <section className="checkout-layout">
          <article className="card checkout-cart-panel">
            <div className="cart-header">
              <div>
                <span className="kicker">Cart review</span>
                <h1>Your cart</h1>
                {restaurant && <p>{restaurant.name} · {restaurant.deliveryMinutes}</p>}
              </div>
              {cart.length > 0 && <button className="ghost-button" type="button" onClick={() => void clearCart()}>Clear cart</button>}
            </div>

            {!mounted || cart.length === 0 ? (
              <div className="empty-state">
                <p>Your cart is empty. Pick a restaurant and customize an item to start checkout.</p>
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
                        <p>{item?.description ?? 'Menu item details unavailable.'}</p>
                        {getSelectedModifierLabels(cartItem).map(label => <p key={label}>{label}</p>)}
                        {cartItem.specialInstructions && <p>Note: {cartItem.specialInstructions}</p>}
                        <p>{formatMoney(getCartLineTotal(cartItem))}</p>
                      </div>
                      <div className="quantity-controls">
                        <button type="button" onClick={() => void persist(updateCartItemQuantity(cart, cartItem.id, -1))}>-</button>
                        <span>{cartItem.quantity}</span>
                        <button type="button" onClick={() => void persist(updateCartItemQuantity(cart, cartItem.id, 1))}>+</button>
                      </div>
                      <button className="ghost-button" type="button" onClick={() => void persist(removeCartItem(cart, cartItem.id))}>Remove</button>
                    </div>
                  );
                })}
              </div>
            )}

            {!validation.ok && (
              <div className="validation-panel" role="alert">
                {validation.errors.map(error => <p key={error}>{error}</p>)}
              </div>
            )}
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">Order summary</span>
            <h2>Review totals</h2>
            <div className="payment-breakdown">
              <div><span>Subtotal</span><strong>{formatMoney(totals.subtotalCents)}</strong></div>
              <div><span>Delivery fee</span><strong>{formatMoney(totals.deliveryFeeCents)}</strong></div>
              <div><span>Service fee</span><strong>{formatMoney(totals.serviceFeeCents)}</strong></div>
              <div><span>Estimated tax</span><strong>{formatMoney(totals.taxCents)}</strong></div>
              <div><span>Total</span><strong>{formatMoney(totals.totalCents)}</strong></div>
            </div>
            <Link className={cart.length > 0 && validation.ok ? 'checkout-button inline-action' : 'checkout-button inline-action disabled-card'} href={cart.length > 0 && validation.ok ? routes.checkout : routes.restaurants()}>
              {cart.length > 0 && validation.ok ? 'Continue to checkout' : 'Browse restaurants'}
            </Link>
          </aside>
        </section>
      </div>
    </main>
  );
}
