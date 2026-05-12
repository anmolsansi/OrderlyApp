'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import {
  CART_STORAGE_KEY,
  ORDER_HISTORY_STORAGE_KEY,
  ORDER_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  getSelectedModifierLabels,
  updateCartItemQuantity,
  validateCart,
  validateCheckoutDetails,
} from '@/lib/cart';
import { env } from '@/lib/env';
import { calculateCartTotals, createMockOrder, mockAddresses, mockUserProfile } from '@/lib/mock-data';
import { getMenuItem, getRestaurant } from '@/lib/marketplace';
import type { CartItem, CheckoutDetails, Order } from '@/lib/types';
import { routes } from '@/lib/routes';
import { formatMoney } from '@/lib/types';

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const defaultAddress = mockAddresses.find(address => address.id === mockUserProfile.defaultAddressId) ?? mockAddresses[0];
  const [details, setDetails] = useState<CheckoutDetails>({
    name: mockUserProfile.name,
    phone: mockUserProfile.phone,
    email: mockUserProfile.email,
    street: defaultAddress.street,
    apartment: defaultAddress.apartment,
    city: defaultAddress.city,
    state: defaultAddress.state,
    postalCode: defaultAddress.postalCode,
    deliveryInstructions: defaultAddress.deliveryInstructions,
    paymentMethod: 'Mock Visa 4242',
    tipCents: 500,
  });
  const restaurant = cart[0] ? getRestaurant(cart[0].restaurantId) : undefined;
  const cartValidation = useMemo(() => validateCart(cart), [cart]);
  const totals = useMemo(() => {
    const baseTotals = calculateCartTotals(cart, restaurant?.id, cart.length > 0 ? 500 : 0);
    const tipCents = cart.length > 0 ? details.tipCents : 0;
    return { ...baseTotals, tipCents, totalCents: baseTotals.totalCents + tipCents };
  }, [cart, restaurant?.id, details.tipCents]);
  const { subtotalCents: subtotal, deliveryFeeCents: deliveryFee, serviceFeeCents: serviceFee, discountCents: promo, taxCents: tax, totalCents: total } = totals;

  useEffect(() => {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    setCart(stored ? JSON.parse(stored) as CartItem[] : []);
    setSignedIn(window.localStorage.getItem(SESSION_STORAGE_KEY) === 'signed-in');
    setMounted(true);
  }, []);

  function updateQuantity(cartItemId: string, delta: number): void {
    const nextCart = updateCartItemQuantity(cart, cartItemId, delta);
    setCart(nextCart);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
  }

  function clearCart(): void {
    setCart([]);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([]));
  }

  function updateDetails(field: keyof CheckoutDetails, value: string): void {
    setErrors([]);
    setDetails(previous => ({
      ...previous,
      [field]: field === 'tipCents' ? Number.parseInt(value, 10) || 0 : value,
    }));
  }

  function placeOrder(): void {
    if (env.checkoutMode !== 'mock' || submitting) return;
    if (!signedIn) {
      setErrors(['Sign in before placing this order.']);
      return;
    }
    const checkoutValidation = validateCheckoutDetails(details);
    const combinedErrors = [...cartValidation.errors, ...checkoutValidation.errors];
    if (cart.length === 0) combinedErrors.unshift('Your cart is empty.');
    if (combinedErrors.length > 0) {
      setErrors(combinedErrors);
      return;
    }

    setSubmitting(true);
    const order: Order = {
      ...createMockOrder(cart, restaurant?.id, new Date().toISOString()),
      totals,
      subtotalCents: subtotal,
      status: 'Confirmed',
      checkoutDetails: details,
    };
    const storedHistory = window.localStorage.getItem(ORDER_HISTORY_STORAGE_KEY);
    const history = storedHistory ? JSON.parse(storedHistory) as Order[] : [];
    window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
    window.localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify([order, ...history.filter(candidate => candidate.id !== order.id)]));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([]));
    router.push(routes.orderConfirmation(order.id));
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Checkout" />

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
                        {getSelectedModifierLabels(cartItem).map(label => <p key={label}>{label}</p>)}
                        {cartItem.specialInstructions && <p>Note: {cartItem.specialInstructions}</p>}
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
            <div className="cart-total"><span>Estimated tax</span><strong>{formatMoney(tax)}</strong></div>
            <div className="cart-total discount-row"><span>Promo</span><strong>-{formatMoney(promo)}</strong></div>
            <div className="cart-total"><span>Tip</span><strong>{formatMoney(totals.tipCents ?? 0)}</strong></div>
            <div className="cart-total grand-total"><span>Total</span><strong>{formatMoney(total)}</strong></div>
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">Payment review</span>
            <h2>Confirm delivery and payment</h2>
            {!signedIn && (
              <div className="validation-panel" role="alert">
                <p>Sign in to protect checkout and save this order to your mock account.</p>
                <Link className="ghost-button" href={routes.signIn(routes.checkout)}>Sign in</Link>
              </div>
            )}
            {errors.length > 0 && (
              <div className="validation-panel" role="alert">
                {errors.map(error => <p key={error}>{error}</p>)}
              </div>
            )}
            <div className="checkout-form-grid" aria-label="Mock checkout details">
              <label>
                <span>Name</span>
                <input type="text" value={details.name} onChange={event => updateDetails('name', event.target.value)} />
              </label>
              <label>
                <span>Phone</span>
                <input type="tel" value={details.phone} onChange={event => updateDetails('phone', event.target.value)} />
              </label>
              <label className="full-field">
                <span>Email</span>
                <input type="email" value={details.email} onChange={event => updateDetails('email', event.target.value)} />
              </label>
              <label className="full-field">
                <span>Delivery address</span>
                <input type="text" value={details.street} onChange={event => updateDetails('street', event.target.value)} />
              </label>
              <label>
                <span>Unit</span>
                <input type="text" value={details.apartment ?? ''} onChange={event => updateDetails('apartment', event.target.value)} />
              </label>
              <label>
                <span>ZIP code</span>
                <input type="text" value={details.postalCode} onChange={event => updateDetails('postalCode', event.target.value)} />
              </label>
              <label>
                <span>Tip</span>
                <select value={details.tipCents} onChange={event => updateDetails('tipCents', event.target.value)}>
                  <option value="0">No tip</option>
                  <option value="300">$3.00</option>
                  <option value="500">$5.00</option>
                  <option value="800">$8.00</option>
                </select>
              </label>
              <label className="full-field">
                <span>Delivery instructions</span>
                <textarea value={details.deliveryInstructions ?? ''} onChange={event => updateDetails('deliveryInstructions', event.target.value)} />
              </label>
            </div>
            <div className="payment-breakdown">
              <div><span>Delivery address</span><strong>{details.street}</strong></div>
              <div><span>Drop-off</span><strong>{details.deliveryInstructions || 'Hand to me'}</strong></div>
              <div><span>Payment</span><strong>{env.checkoutMode === 'mock' ? 'Mock Visa •••• 4242' : 'Checkout disabled'}</strong></div>
              <div><span>Delivery window</span><strong>{restaurant?.deliveryMinutes ?? '28–35 min'}</strong></div>
            </div>
            <button className="checkout-button" type="button" disabled={cart.length === 0 || env.checkoutMode !== 'mock' || submitting || !cartValidation.ok} onClick={placeOrder}>
              {submitting ? 'Placing order...' : env.checkoutMode === 'mock' ? 'Place order' : 'Checkout disabled'}
            </button>
          </aside>
        </section>
      </div>
    </main>
  );
}
