'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import { validateCartItem } from '@/lib/cart';
import { getDefaultModifiers, getItemTotal, getMenuItem, getRestaurant } from '@/lib/marketplace';
import type { CartItem, CartItemModifier } from '@/lib/types';
import { routes } from '@/lib/routes';
import { formatMoney } from '@/lib/types';

const CART_STORAGE_KEY = 'orderlyapp.marketplace.cart.v1';

function makeCartItemId(): string {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ItemCustomizationPage() {
  const params = useParams<{ restaurantId: string; itemId: string }>();
  const router = useRouter();
  const restaurant = getRestaurant(params.restaurantId);
  const item = getMenuItem(params.restaurantId, params.itemId);
  const [quantity, setQuantity] = useState(1);
  const [modifiers, setModifiers] = useState<CartItemModifier[]>(item ? getDefaultModifiers(item) : []);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const itemTotal = useMemo(() => item ? getItemTotal(item, modifiers) * quantity : 0, [item, modifiers, quantity]);

  if (!restaurant || !item) {
    return (
      <main className="marketplace-page"><div className="container"><MarketplaceNav active="Menu" /><section className="card"><h1>Item not found</h1><Link className="pill" href={routes.restaurants()}>Back to restaurants</Link></section></div></main>
    );
  }

  const currentRestaurant = restaurant;
  const currentItem = item;

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

  function addToCart(): void {
    const validation = validateCartItem(currentItem, modifiers);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    const cartItem: CartItem = {
      id: makeCartItemId(),
      restaurantId: currentRestaurant.id,
      menuItemId: currentItem.id,
      name: currentItem.name,
      quantity,
      basePriceCents: currentItem.priceCents,
      modifiers,
      specialInstructions: note.trim() || undefined,
    };
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    const currentCart = stored ? JSON.parse(stored) as CartItem[] : [];
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([...currentCart, cartItem]));
    window.localStorage.setItem('orderlyapp.marketplace.note.v1', note);
    router.push(routes.checkout);
  }

  return (
    <main className="marketplace-page">
      <div className="container">
        <MarketplaceNav active="Menu" />

        <section className="customization-layout">
          <article className="card item-preview-card">
            <span className="item-preview-emoji">{item.imageEmoji}</span>
            <span className="kicker">Customize item</span>
            <h1>{item.name}</h1>
            {(item.available === false || !restaurant.isOpen) && <span className="tag">Currently unavailable</span>}
            <p>{item.description}</p>
            <p>{restaurant.name} · {restaurant.deliveryMinutes}</p>
            <div className="quantity-controls item-quantity" aria-label="Quantity">
              <button type="button" onClick={() => setQuantity(previous => Math.max(1, previous - 1))}>-</button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity(previous => Math.min(10, previous + 1))}>+</button>
            </div>
            {errors.length > 0 && (
              <div className="validation-panel" role="alert">
                {errors.map(error => <p key={error}>{error}</p>)}
              </div>
            )}
            <button className="checkout-button" type="button" disabled={item.available === false || !restaurant.isOpen} onClick={addToCart}>Add to cart · {formatMoney(itemTotal)}</button>
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
                      return (
                        <label className={`option ${checked ? 'selected' : ''}`} key={option.id}>
                          <input
                            type={group.type === 'single' ? 'radio' : 'checkbox'}
                            name={group.id}
                            checked={checked}
                            onChange={() => group.type === 'single'
                              ? updateSingleModifier(group.id, option.id)
                              : toggleMultipleModifier(group.id, option.id, group.maxSelected)}
                          />
                          <span>{option.name}</span>
                          {option.priceDeltaCents > 0 && <em>+{formatMoney(option.priceDeltaCents)}</em>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <label className="notes-field">
                <span>Special instructions</span>
                <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Cut into squares, extra napkins..." />
              </label>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
