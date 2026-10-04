'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { fetchRestaurant, fetchRevisionedCart, getOrderlyDataMode, saveRevisionedCart } from '@/lib/api';
import {
  canAddItemToCart,
  clearApiCartDraft,
  mirrorAcceptedApiCart,
  readLocalDemoCart,
  validateCartItem,
  writeApiCartDraft,
  writeLocalDemoCart,
} from '@/lib/cart';
import { getDefaultModifiers, getItemTotal } from '@/lib/marketplace';
import { routes } from '@/lib/routes';
import type { CartItem, CartItemModifier, MenuItem, Restaurant, RevisionedCart } from '@/lib/types';
import { formatMoney } from '@/lib/types';

function makeCartItemId(): string {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ReplacementIntent {
  item: CartItem;
  currentCart?: RevisionedCart;
}

export default function ItemCustomizationPage() {
  const params = useParams<{ restaurantId: string; itemId: string }>();
  const router = useRouter();
  const dataMode = getOrderlyDataMode();
  const [restaurant, setRestaurant] = useState<Restaurant>();
  const [item, setItem] = useState<MenuItem>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [quantity, setQuantity] = useState(1);
  const [modifiers, setModifiers] = useState<CartItemModifier[]>([]);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [replacementIntent, setReplacementIntent] = useState<ReplacementIntent>();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(undefined);
    setRestaurant(undefined);
    setItem(undefined);

    void fetchRestaurant(params.restaurantId, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setLoadError(result.error.message);
        setLoading(false);
        return;
      }
      const found = result.data.menu.find(candidate => candidate.id === params.itemId);
      if (!found) {
        setLoadError('Item not found in the canonical restaurant menu.');
        setLoading(false);
        return;
      }
      setRestaurant(result.data);
      setItem(found);
      setModifiers(getDefaultModifiers(found));
      setLoading(false);
    });

    return () => controller.abort();
  }, [params.restaurantId, params.itemId]);

  const itemTotal = useMemo(() => item ? getItemTotal(item, modifiers) * quantity : 0, [item, modifiers, quantity]);

  function updateSingleModifier(groupId: string, optionId: string): void {
    setErrors([]);
    setModifiers(previous => previous.map(modifier => modifier.groupId === groupId ? { ...modifier, optionIds: [optionId] } : modifier));
  }

  function toggleMultipleModifier(groupId: string, optionId: string, maxSelected?: number): void {
    setErrors([]);
    setModifiers(previous => previous.map(modifier => {
      if (modifier.groupId !== groupId) return modifier;
      const exists = modifier.optionIds.includes(optionId);
      if (!exists && maxSelected && modifier.optionIds.length >= maxSelected) {
        setErrors([`Choose at most ${maxSelected} options for this group.`]);
        return modifier;
      }
      const nextOptionIds = exists
        ? modifier.optionIds.filter(id => id !== optionId)
        : [...modifier.optionIds, optionId];
      return { ...modifier, optionIds: nextOptionIds };
    }));
  }

  function buildCartItem(currentRestaurant: Restaurant, currentItem: MenuItem): CartItem {
    return {
      id: makeCartItemId(),
      restaurantId: currentRestaurant.id,
      menuItemId: currentItem.id,
      name: currentItem.name,
      quantity,
      basePriceCents: currentItem.priceCents,
      modifiers,
      specialInstructions: note.trim() || undefined,
    };
  }

  function acceptLocalDemoCart(nextCart: CartItem[]): void {
    if (!writeLocalDemoCart(nextCart)) {
      setErrors(['Browser storage is unavailable. The local fixture basket was not changed.']);
      return;
    }
    router.push(routes.cart);
  }

  async function persistApiCart(currentCart: RevisionedCart, nextCart: CartItem[]): Promise<void> {
    setSaving(true);
    setErrors([]);
    const result = await saveRevisionedCart(currentCart.revision, nextCart);
    setSaving(false);

    if (!result.ok) {
      writeApiCartDraft(nextCart);
      if (result.kind === 'conflict' && result.error.currentCart) {
        setErrors([`${result.error.message}. Review the current basket before reapplying your change.`]);
      } else {
        setErrors([result.error.message]);
      }
      return;
    }

    clearApiCartDraft();
    mirrorAcceptedApiCart(result.data.items);
    router.push(routes.cart);
  }

  async function addToCart(): Promise<void> {
    if (!restaurant || !item || saving) return;
    const validation = validateCartItem(item, modifiers);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    const cartItem = buildCartItem(restaurant, item);

    if (dataMode === 'local_demo') {
      const currentCart = readLocalDemoCart();
      const compatibility = canAddItemToCart(currentCart, restaurant.id);
      if (!compatibility.ok) {
        setReplacementIntent({ item: cartItem });
        setErrors([]);
        return;
      }
      acceptLocalDemoCart([...currentCart, cartItem]);
      return;
    }

    setSaving(true);
    setErrors([]);
    const currentResult = await fetchRevisionedCart();
    setSaving(false);
    if (!currentResult.ok) {
      setErrors([currentResult.error.message]);
      return;
    }

    const compatibility = canAddItemToCart(currentResult.data.items, restaurant.id);
    if (!compatibility.ok) {
      setReplacementIntent({ item: cartItem, currentCart: currentResult.data });
      return;
    }

    await persistApiCart(currentResult.data, [...currentResult.data.items, cartItem]);
  }

  async function replaceBasket(): Promise<void> {
    if (!replacementIntent || saving) return;
    if (dataMode === 'local_demo') {
      acceptLocalDemoCart([replacementIntent.item]);
      setReplacementIntent(undefined);
      return;
    }
    if (!replacementIntent.currentCart) {
      setErrors(['The current API basket could not be reconciled. Reload and review it before replacing.']);
      return;
    }
    const intent = replacementIntent;
    setReplacementIntent(undefined);
    await persistApiCart(intent.currentCart, [intent.item]);
  }

  if (loading) {
    return <main className="marketplace-page"><div className="container"><MarketplaceNav active="Menu" /><section className="card discovery-state-card"><div><h1>Loading item</h1><p>Checking the selected catalog source.</p></div></section></div></main>;
  }

  if (!restaurant || !item) {
    return (
      <main className="marketplace-page"><div className="container"><MarketplaceNav active="Menu" /><section className="card discovery-state-card error-state" role="alert"><div><h1>Item unavailable</h1><p>{loadError ?? 'The item could not be loaded.'}</p><Link className="pill" href={routes.restaurants()}>Back to restaurants</Link></div></section></div></main>
    );
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Menu" />

        {dataMode === 'local_demo' && (
          <div className="validation-panel" role="status">
            <strong>Local fixture preview</strong>
            <p>Customization and basket changes stay in an isolated browser namespace. Checkout is unavailable.</p>
          </div>
        )}

        <section className="customization-layout">
          <article className="card item-preview-card">
            <span className="item-preview-emoji">{item.imageEmoji}</span>
            <span className="kicker">Customize item</span>
            <h1>{item.name}</h1>
            {(item.available === false || !restaurant.isOpen) && <span className="tag">Currently unavailable</span>}
            <p>{item.description}</p>
            <p>{restaurant.name} · {restaurant.deliveryMinutes}</p>
            <div className="quantity-controls item-quantity" aria-label="Quantity">
              <button type="button" disabled={saving} onClick={() => setQuantity(previous => Math.max(1, previous - 1))}>-</button>
              <span>{quantity}</span>
              <button type="button" disabled={saving} onClick={() => setQuantity(previous => Math.min(10, previous + 1))}>+</button>
            </div>
            {errors.length > 0 && (
              <div className="validation-panel" role="alert">
                {errors.map(error => <p key={error}>{error}</p>)}
                {dataMode === 'api' && <Link className="ghost-button" href={routes.cart}>Review current cart</Link>}
              </div>
            )}
            {replacementIntent && (
              <div className="validation-panel" role="alert">
                <strong>Replace your current basket?</strong>
                <p>Your basket contains items from another restaurant. Replacing it is a deliberate action and uses the revision you just reviewed.</p>
                <div className="filter-row">
                  <button className="ghost-button" type="button" disabled={saving} onClick={() => setReplacementIntent(undefined)}>Keep current basket</button>
                  <button className="checkout-button" type="button" disabled={saving} onClick={() => void replaceBasket()}>Replace basket</button>
                </div>
              </div>
            )}
            <button className="checkout-button" type="button" disabled={saving || item.available === false || !restaurant.isOpen} onClick={() => void addToCart()}>
              {saving ? 'Saving basket…' : `Add to cart · ${formatMoney(itemTotal)}`}
            </button>
          </article>

          <aside className="card modifier-panel">
            <span className="kicker">Options</span>
            <h2>Choose size and toppings</h2>
            <div className="modifier-list">
              {item.modifierGroups.map(group => (
                <div className="modifier-group" key={group.id}>
                  <div className="modifier-heading">
                    <strong>{group.name}</strong>
                    <span>{group.required ? 'Required' : group.maxSelected ? `Up to ${group.maxSelected}` : 'Optional'}</span>
                  </div>
                  <div className="option-grid">
                    {group.options.map(option => {
                      const modifier = modifiers.find(candidate => candidate.groupId === group.id);
                      const checked = modifier?.optionIds.includes(option.id) ?? false;
                      const unavailable = option.available === false;
                      return (
                        <label className={`option ${checked ? 'selected' : ''} ${unavailable ? 'disabled-card' : ''}`} key={option.id}>
                          <input
                            type={group.type === 'single' ? 'radio' : 'checkbox'}
                            name={group.id}
                            checked={checked}
                            disabled={unavailable || saving}
                            onChange={() => group.type === 'single'
                              ? updateSingleModifier(group.id, option.id)
                              : toggleMultipleModifier(group.id, option.id, group.maxSelected)}
                          />
                          <span>{option.name}{unavailable ? ' · Unavailable' : ''}</span>
                          {option.priceDeltaCents > 0 && <em>+{formatMoney(option.priceDeltaCents)}</em>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <label className="notes-field">
                <span>Special instructions</span>
                <textarea maxLength={500} value={note} disabled={saving} onChange={event => setNote(event.target.value)} placeholder="Cut into squares, extra napkins..." />
              </label>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
