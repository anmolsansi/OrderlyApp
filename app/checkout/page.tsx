'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import {
  clearRevisionedCart,
  fetchCheckoutQuote,
  fetchRevisionedCart,
  getOrderlyDataMode,
  saveRevisionedCart,
} from '@/lib/api';
import { getDemoAddresses, getDemoProfile, SYNTHETIC_DEMO_ADDRESSES } from '@/lib/auth';
import { updateCartItemQuantity } from '@/lib/cart';
import { routes } from '@/lib/routes';
import type { CheckoutDetails, CheckoutQuote, DemoAddress, RevisionedCart } from '@/lib/types';
import { formatMoney } from '@/lib/types';

const SYNTHETIC_PHONE = '+1-555-0100';
const SYNTHETIC_EMAIL = 'demo@example.test';
const PROMOTION_CODE = 'DEMO5' as const;

function detailsFromAddress(name: string, address: DemoAddress, tipCents: number): CheckoutDetails {
  return {
    name,
    phone: SYNTHETIC_PHONE,
    email: SYNTHETIC_EMAIL,
    street: address.street,
    apartment: address.apartment,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    deliveryInstructions: address.deliveryInstructions,
    paymentMethod: 'mock',
    tipCents,
  };
}

export default function CheckoutPage() {
  const mode = getOrderlyDataMode();
  const defaultAddress = SYNTHETIC_DEMO_ADDRESSES[0];
  const [cart, setCart] = useState<RevisionedCart | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [addresses, setAddresses] = useState<DemoAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress.id);
  const [profileAvailable, setProfileAvailable] = useState(false);
  const [loading, setLoading] = useState(mode === 'api');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [details, setDetails] = useState<CheckoutDetails>(() => detailsFromAddress('Demo visitor', defaultAddress, 500));
  const deliberateInput = useRef(false);
  const quoteSequence = useRef(0);

  useEffect(() => {
    if (mode !== 'api') return;
    let active = true;
    async function load(): Promise<void> {
      const profileResult = getDemoProfile(window.localStorage);
      const addressesResult = getDemoAddresses(window.localStorage);
      if (!active) return;

      if (!profileResult.ok || !addressesResult.ok) {
        setLoadError(!profileResult.ok ? profileResult.message : addressesResult.ok ? null : addressesResult.message);
        setLoading(false);
        return;
      }

      const availableAddresses = addressesResult.value;
      setAddresses(availableAddresses);
      setProfileAvailable(Boolean(profileResult.value));
      if (profileResult.value && !deliberateInput.current) {
        const address = availableAddresses.find(candidate => candidate.id === profileResult.value?.defaultAddressId) ?? availableAddresses[0];
        if (address) {
          setSelectedAddressId(address.id);
          setDetails(previous => detailsFromAddress(profileResult.value?.name ?? previous.name, address, previous.tipCents));
        }
      }

      const cartResult = await fetchRevisionedCart();
      if (!active) return;
      if (!cartResult.ok) {
        setLoadError(cartResult.error.message);
        setCart(null);
      } else {
        setCart(cartResult.data);
      }
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'api' || loading || !cart || cart.items.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const sequence = ++quoteSequence.current;
    setQuote(null);
    setQuoteError(null);
    void fetchCheckoutQuote(cart.revision, details.tipCents, PROMOTION_CODE).then(result => {
      if (sequence !== quoteSequence.current) return;
      if (!result.ok) {
        setQuoteError(result.error.message);
        return;
      }
      setQuote(result.data);
    });
  }, [cart, details.tipCents, loading, mode, quoteRefresh]);

  async function mutateCart(nextItems: RevisionedCart['items']): Promise<void> {
    if (!cart || mutationPending) return;
    setMutationPending(true);
    setMutationError(null);
    const result = await saveRevisionedCart(cart.revision, nextItems);
    if (result.ok) {
      setCart(result.data);
    } else {
      setMutationError(result.error.message);
      if (result.error.currentCart) setCart(result.error.currentCart);
    }
    setMutationPending(false);
  }

  async function updateQuantity(cartItemId: string, delta: number): Promise<void> {
    if (!cart) return;
    await mutateCart(updateCartItemQuantity(cart.items, cartItemId, delta));
  }

  async function clearCart(): Promise<void> {
    if (!cart || mutationPending) return;
    setMutationPending(true);
    setMutationError(null);
    const result = await clearRevisionedCart(cart.revision);
    if (result.ok) {
      setCart(result.data);
    } else {
      setMutationError(result.error.message);
      if (result.error.currentCart) setCart(result.error.currentCart);
    }
    setMutationPending(false);
  }

  function updateDetails(field: keyof CheckoutDetails, value: string): void {
    deliberateInput.current = true;
    setMutationError(null);
    setDetails(previous => ({
      ...previous,
      [field]: field === 'tipCents' ? Number.parseInt(value, 10) || 0 : value,
    }));
  }

  function selectAddress(addressId: string): void {
    const address = addresses.find(candidate => candidate.id === addressId);
    if (!address) return;
    deliberateInput.current = true;
    setSelectedAddressId(address.id);
    setDetails(previous => ({
      ...detailsFromAddress(previous.name, address, previous.tipCents),
      phone: previous.phone,
      email: previous.email,
    }));
  }

  if (mode === 'local_demo') {
    return (
      <main className="marketplace-page">
        <div className="container">
          <MarketplaceNav active="Checkout" />
          <section className="card full-width" role="status">
            <span className="kicker">Local fixture preview</span>
            <h1>Checkout unavailable in fixture preview</h1>
            <p>This preview can browse, customize, and keep a local basket. It never creates or claims a saved order.</p>
            <Link className="checkout-button inline-action" href={routes.cart}>Back to basket</Link>
          </section>
        </div>
      </main>
    );
  }

  const cartItems = cart?.items ?? [];
  const totals = quote?.totals;

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Checkout" />

        {loadError && (
          <section className="card full-width validation-panel" role="alert">
            <h1>Checkout is unavailable</h1>
            <p>{loadError}</p>
            <button className="ghost-button" type="button" onClick={() => window.location.reload()}>Retry</button>
          </section>
        )}

        {!loadError && (
          <section className="checkout-layout">
            <article className="card checkout-cart-panel">
              <div className="cart-header">
                <div>
                  <span className="kicker">Checkout</span>
                  <h1>Your cart</h1>
                </div>
                {cartItems.length > 0 && (
                  <button className="ghost-button" type="button" disabled={mutationPending} onClick={() => void clearCart()}>
                    Clear cart
                  </button>
                )}
              </div>

              {loading ? (
                <div className="empty-state"><p>Loading your server basket…</p></div>
              ) : cartItems.length === 0 ? (
                <div className="empty-state">
                  <p>Your cart is empty. Pick a restaurant and customize an item to start checkout.</p>
                  <Link className="pill" href={routes.restaurants()}>Browse restaurants</Link>
                </div>
              ) : (
                <div className="cart-lines">
                  {cartItems.map(cartItem => (
                    <div className="cart-line detailed" key={cartItem.id}>
                      <div>
                        <strong>{cartItem.name}</strong>
                        {cartItem.specialInstructions && <p>Note: {cartItem.specialInstructions}</p>}
                      </div>
                      <div className="quantity-controls">
                        <button type="button" disabled={mutationPending} onClick={() => void updateQuantity(cartItem.id, -1)}>-</button>
                        <span>{cartItem.quantity}</span>
                        <button type="button" disabled={mutationPending} onClick={() => void updateQuantity(cartItem.id, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {mutationError && <div className="validation-panel" role="alert"><p>{mutationError}</p><Link href={routes.cart}>Review current basket</Link></div>}

              {cartItems.length > 0 && !totals && !quoteError && <div className="empty-state"><p>Getting the latest server quote…</p></div>}
              {quoteError && (
                <div className="validation-panel" role="alert">
                  <p>{quoteError}</p>
                  <button className="ghost-button" type="button" onClick={() => setQuoteRefresh(value => value + 1)}>Retry quote</button>
                </div>
              )}
              {totals && (
                <>
                  <div className="cart-total"><span>Subtotal</span><strong>{formatMoney(totals.subtotalCents)}</strong></div>
                  <div className="cart-total"><span>Delivery fee</span><strong>{formatMoney(totals.deliveryFeeCents)}</strong></div>
                  <div className="cart-total"><span>Service fee</span><strong>{formatMoney(totals.serviceFeeCents)}</strong></div>
                  <div className="cart-total"><span>Tax</span><strong>{formatMoney(totals.taxCents)}</strong></div>
                  <div className="cart-total discount-row"><span>DEMO5</span><strong>-{formatMoney(totals.discountCents)}</strong></div>
                  <div className="cart-total"><span>Tip</span><strong>{formatMoney(totals.tipCents ?? 0)}</strong></div>
                  <div className="cart-total grand-total"><span>Total</span><strong>{formatMoney(totals.totalCents)}</strong></div>
                </>
              )}
            </article>

            <aside className="card payment-review-panel">
              <span className="kicker">Mock checkout</span>
              <h2>Confirm delivery details</h2>
              {!profileAvailable && !loading && (
                <div className="validation-panel" role="alert">
                  <p>Create a password-free demo profile before placing an order.</p>
                  <Link className="ghost-button" href={routes.signIn(routes.checkout)}>Create demo profile</Link>
                </div>
              )}

              {addresses.length > 0 && (
                <label className="full-field">
                  <span>Saved synthetic address</span>
                  <select value={selectedAddressId} onChange={event => selectAddress(event.target.value)}>
                    {addresses.map(address => <option key={address.id} value={address.id}>{address.label}</option>)}
                  </select>
                </label>
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
                  <span>City</span>
                  <input type="text" value={details.city} onChange={event => updateDetails('city', event.target.value)} />
                </label>
                <label>
                  <span>State</span>
                  <input type="text" maxLength={2} value={details.state} onChange={event => updateDetails('state', event.target.value.toUpperCase())} />
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
                <div><span>Payment</span><strong>Mock payment, no card details collected</strong></div>
                <div><span>Quote</span><strong>{quote ? `Revision ${quote.cartRevision}` : 'Waiting for server quote'}</strong></div>
              </div>

              <button className="checkout-button" type="button" disabled>
                Checkout recovery wiring in progress
              </button>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}
