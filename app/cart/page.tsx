'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import {
  clearRevisionedCart,
  fetchRestaurants,
  fetchRevisionedCart,
  getOrderlyDataMode,
  saveRevisionedCart,
} from '@/lib/api';
import {
  clearApiCartDraft,
  findCartMenuItem,
  getCartLineTotal,
  getCartSubtotal,
  getSelectedModifierLabels,
  mirrorAcceptedApiCart,
  readApiCartDraft,
  readLocalDemoCart,
  removeCartItem,
  updateCartItemQuantity,
  validateCart,
  writeApiCartDraft,
  writeLocalDemoCart,
} from '@/lib/cart';
import { routes } from '@/lib/routes';
import type { CartConflictRecovery, CartItem, Restaurant, RevisionedCart } from '@/lib/types';
import { formatMoney } from '@/lib/types';

const EMPTY_CART: RevisionedCart = { schemaVersion: 1, revision: 0, items: [] };

export default function CartPage() {
  const dataMode = getOrderlyDataMode();
  const [acceptedCart, setAcceptedCart] = useState<RevisionedCart>(EMPTY_CART);
  const [catalog, setCatalog] = useState<Restaurant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [catalogError, setCatalogError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [conflict, setConflict] = useState<CartConflictRecovery>();
  const [recoveryDraft, setRecoveryDraft] = useState<CartItem[]>([]);
  const [mutating, setMutating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loadSequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++loadSequence.current;
    setLoaded(false);
    setLoadError(undefined);
    setCatalogError(undefined);
    setActionError(undefined);
    setConflict(undefined);

    if (dataMode === 'local_demo') {
      const items = readLocalDemoCart();
      void fetchRestaurants({ signal: controller.signal }).then(catalogResult => {
        if (controller.signal.aborted || sequence !== loadSequence.current) return;
        setAcceptedCart({ schemaVersion: 1, revision: 0, items });
        if (catalogResult.ok) setCatalog(catalogResult.data);
        else setCatalogError(catalogResult.error.message);
        setLoaded(true);
      });
      return () => controller.abort();
    }

    setRecoveryDraft(readApiCartDraft());
    void Promise.all([
      fetchRevisionedCart({ signal: controller.signal }),
      fetchRestaurants({ signal: controller.signal }),
    ]).then(([cartResult, catalogResult]) => {
      if (controller.signal.aborted || sequence !== loadSequence.current) return;

      if (cartResult.ok) {
        setAcceptedCart(cartResult.data);
        mirrorAcceptedApiCart(cartResult.data.items);
      } else {
        setAcceptedCart(EMPTY_CART);
        setLoadError(cartResult.error.message);
      }

      if (catalogResult.ok) {
        setCatalog(catalogResult.data);
      } else {
        setCatalog([]);
        setCatalogError(catalogResult.error.message);
      }
      setLoaded(true);
    });

    return () => controller.abort();
  }, [dataMode, reloadKey]);

  const cart = acceptedCart.items;
  const restaurant = cart[0] ? catalog.find(candidate => candidate.id === cart[0].restaurantId) : undefined;
  const catalogReady = cart.length === 0 || catalog.length > 0;
  const validation = useMemo(
    () => catalogReady ? validateCart(cart, catalog) : { ok: false, errors: ['Catalog details are unavailable. Retry before checkout.'] },
    [cart, catalog, catalogReady],
  );
  const subtotalCents = useMemo(() => getCartSubtotal(cart, catalog), [cart, catalog]);
  const deliveryFeeCents = cart.length > 0 ? restaurant?.deliveryFeeCents ?? 0 : 0;
  const displayedTotalCents = subtotalCents + deliveryFeeCents;

  function acceptLocalCart(nextItems: CartItem[]): void {
    setActionError(undefined);
    if (!writeLocalDemoCart(nextItems)) {
      setActionError('Browser storage is unavailable. The local fixture basket was not changed.');
      return;
    }
    setAcceptedCart(current => ({ ...current, revision: current.revision + 1, items: nextItems }));
  }

  function acceptApiCart(nextCart: RevisionedCart): void {
    setAcceptedCart(nextCart);
    mirrorAcceptedApiCart(nextCart.items);
    clearApiCartDraft();
    setRecoveryDraft([]);
    setConflict(undefined);
    setActionError(undefined);
  }

  async function persistApi(nextItems: CartItem[], expectedRevision = acceptedCart.revision, useDelete = false): Promise<void> {
    if (mutating) return;
    setMutating(true);
    setActionError(undefined);
    writeApiCartDraft(nextItems);
    setRecoveryDraft(nextItems);

    const result = useDelete
      ? await clearRevisionedCart(expectedRevision)
      : await saveRevisionedCart(expectedRevision, nextItems);

    setMutating(false);
    if (result.ok) {
      acceptApiCart(result.data);
      return;
    }

    if (result.kind === 'conflict' && result.error.currentCart) {
      const recovery = { currentCart: result.error.currentCart, attemptedItems: nextItems };
      setAcceptedCart(result.error.currentCart);
      mirrorAcceptedApiCart(result.error.currentCart.items);
      setConflict(recovery);
      setActionError(`${result.error.message}. Review the current basket or explicitly reapply your change.`);
      return;
    }

    setActionError(result.error.message);
  }

  async function persist(nextItems: CartItem[]): Promise<void> {
    if (dataMode === 'local_demo') {
      acceptLocalCart(nextItems);
      return;
    }
    await persistApi(nextItems);
  }

  async function clearCart(): Promise<void> {
    if (dataMode === 'local_demo') {
      acceptLocalCart([]);
      return;
    }
    await persistApi([], acceptedCart.revision, true);
  }

  async function reapplyConflict(): Promise<void> {
    if (!conflict) return;
    const recovery = conflict;
    setConflict(undefined);
    await persistApi(recovery.attemptedItems, recovery.currentCart.revision);
  }

  async function reapplyDraft(): Promise<void> {
    if (recoveryDraft.length === 0) return;
    await persistApi(recoveryDraft, acceptedCart.revision);
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Cart" />

        {dataMode === 'local_demo' && (
          <div className="validation-panel" role="status">
            <strong>Local fixture preview</strong>
            <p>This basket is isolated from API mode. Checkout and backend guest requests are disabled.</p>
          </div>
        )}

        <section className="checkout-layout">
          <article className="card checkout-cart-panel">
            <div className="cart-header">
              <div>
                <span className="kicker">Cart review</span>
                <h1>Your cart</h1>
                {restaurant && <p>{restaurant.name} · {restaurant.deliveryMinutes}</p>}
                {dataMode === 'api' && loaded && !loadError && <p>Basket revision {acceptedCart.revision}</p>}
              </div>
              {cart.length > 0 && <button className="ghost-button" type="button" disabled={mutating} onClick={() => void clearCart()}>Clear cart</button>}
            </div>

            {!loaded && (
              <div className="empty-state" aria-live="polite"><p>Loading your basket…</p></div>
            )}

            {loaded && loadError && (
              <div className="validation-panel" role="alert">
                <strong>Basket unavailable</strong>
                <p>{loadError}</p>
                <button className="ghost-button" type="button" onClick={() => setReloadKey(value => value + 1)}>Retry</button>
              </div>
            )}

            {loaded && !loadError && cart.length === 0 && (
              <div className="empty-state">
                <p>Your cart is empty. Pick a restaurant and customize an item to start checkout.</p>
                <Link className="pill" href={routes.restaurants()}>Browse restaurants</Link>
              </div>
            )}

            {loaded && !loadError && cart.length > 0 && (
              <div className="cart-lines">
                {cart.map(cartItem => {
                  const item = findCartMenuItem(cartItem, catalog);
                  return (
                    <div className="cart-line detailed" key={cartItem.id}>
                      <div>
                        <strong>{cartItem.name}</strong>
                        <p>{item?.description ?? 'Canonical item details are currently unavailable.'}</p>
                        {getSelectedModifierLabels(cartItem, catalog).map(label => <p key={label}>{label}</p>)}
                        {cartItem.specialInstructions && <p>Note: {cartItem.specialInstructions}</p>}
                        <p>{formatMoney(getCartLineTotal(cartItem, catalog))}</p>
                      </div>
                      <div className="quantity-controls">
                        <button type="button" disabled={mutating} onClick={() => void persist(updateCartItemQuantity(cart, cartItem.id, -1))}>-</button>
                        <span>{cartItem.quantity}</span>
                        <button type="button" disabled={mutating} onClick={() => void persist(updateCartItemQuantity(cart, cartItem.id, 1))}>+</button>
                      </div>
                      <button className="ghost-button" type="button" disabled={mutating} onClick={() => void persist(removeCartItem(cart, cartItem.id))}>Remove</button>
                    </div>
                  );
                })}
              </div>
            )}

            {catalogError && (
              <div className="validation-panel" role="alert">
                <strong>Menu details unavailable</strong>
                <p>{catalogError} Your accepted basket was not replaced with fixture data.</p>
              </div>
            )}

            {actionError && (
              <div className="validation-panel" role="alert">
                <strong>Basket change not accepted</strong>
                <p>{actionError}</p>
              </div>
            )}

            {conflict && (
              <div className="validation-panel" role="alert">
                <strong>Basket changed in another tab</strong>
                <p>The server basket at revision {conflict.currentCart.revision} is shown above. Your attempted change is kept separately.</p>
                <div className="filter-row">
                  <button className="ghost-button" type="button" disabled={mutating} onClick={() => setConflict(undefined)}>Review current basket</button>
                  <button className="checkout-button" type="button" disabled={mutating} onClick={() => void reapplyConflict()}>Reapply my change</button>
                </div>
              </div>
            )}

            {dataMode === 'api' && !conflict && recoveryDraft.length > 0 && actionError && (
              <div className="active-filter-summary">
                <span>Your failed change is saved as an API draft. It has not changed the accepted basket.</span>
                <button className="ghost-button" type="button" disabled={mutating} onClick={() => void reapplyDraft()}>Reapply saved change</button>
              </div>
            )}

            {!validation.ok && loaded && !loadError && (
              <div className="validation-panel" role="alert">
                {validation.errors.map(error => <p key={error}>{error}</p>)}
              </div>
            )}
          </article>

          <aside className="card payment-review-panel">
            <span className="kicker">Basket summary</span>
            <h2>Canonical cart prices</h2>
            <div className="payment-breakdown">
              <div><span>Item subtotal</span><strong>{formatMoney(subtotalCents)}</strong></div>
              <div><span>Delivery fee</span><strong>{formatMoney(deliveryFeeCents)}</strong></div>
              <div><span>Current basket total</span><strong>{formatMoney(displayedTotalCents)}</strong></div>
            </div>
            <p>Service fee, promotion, tax, and tip are quoted by checkout pricing, not invented on this screen.</p>
            {dataMode === 'local_demo' ? (
              <span className="checkout-button inline-action disabled-card" aria-disabled="true">Checkout unavailable in fixture preview</span>
            ) : (
              <Link
                className={cart.length > 0 && validation.ok && !loadError && !catalogError && !mutating ? 'checkout-button inline-action' : 'checkout-button inline-action disabled-card'}
                href={cart.length > 0 && validation.ok && !loadError && !catalogError && !mutating ? routes.checkout : routes.restaurants()}
              >
                {cart.length > 0 && validation.ok && !loadError && !catalogError ? 'Continue to checkout' : 'Browse restaurants'}
              </Link>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
