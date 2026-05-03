'use client';

import { useEffect, useMemo, useState } from 'react';
import { clearBackendCart, createBackendOrder, fetchCart, fetchOrder, fetchRestaurants, saveCart } from '@/lib/api';
import { orderStatusSteps, restaurants as fallbackRestaurants, validateFixtures } from '@/lib/mock-data';
import { findMenuItemFromText, parseVoiceIntent } from '@/lib/voice';
import { type CartItem, type CartItemModifier, type MenuItem, type Order, type OrderStatus, type Restaurant, type VoiceIntent, formatMoney } from '@/lib/types';

const CART_STORAGE_KEY = 'orderlyapp.cart.v1';
const SESSION_STORAGE_KEY = 'orderlyapp.session.v1';

type SpeechRecognitionResultLike = { readonly 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: { readonly [index: number]: SpeechRecognitionResultLike; length: number } };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function makeCartItemId(): string {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeOrderId(): string {
  return `ORD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function getDefaultModifiers(item: MenuItem): CartItemModifier[] {
  return item.modifierGroups.map(group => ({
    groupId: group.id,
    optionIds: group.type === 'single' && group.options[0] ? [group.options[0].id] : [],
  }));
}

function applyVoiceModifiers(item: MenuItem, intent: VoiceIntent): CartItemModifier[] {
  const modifiers = getDefaultModifiers(item);
  return modifiers.map(modifier => {
    const group = item.modifierGroups.find(candidate => candidate.id === modifier.groupId);
    if (!group) return modifier;

    if (group.id === 'size' && intent.size) {
      const option = group.options.find(candidate => candidate.id === intent.size);
      return option ? { ...modifier, optionIds: [option.id] } : modifier;
    }

    if (group.id === 'toppings' && intent.toppings && intent.toppings.length > 0) {
      const optionIds = group.options
        .filter(option => intent.toppings?.includes(option.id))
        .map(option => option.id)
        .slice(0, group.maxSelected ?? 99);
      return { ...modifier, optionIds };
    }

    return modifier;
  });
}

function getModifierLabel(item: MenuItem, modifier: CartItemModifier): string {
  const group = item.modifierGroups.find(candidate => candidate.id === modifier.groupId);
  if (!group) return '';

  const selectedOptions = group.options.filter(option => modifier.optionIds.includes(option.id));
  if (selectedOptions.length === 0) return '';
  return `${group.name}: ${selectedOptions.map(option => option.name).join(', ')}`;
}

function getItemTotal(item: MenuItem, modifiers: CartItemModifier[]): number {
  const modifierTotal = modifiers.reduce((sum, modifier) => {
    const group = item.modifierGroups.find(candidate => candidate.id === modifier.groupId);
    if (!group) return sum;
    return sum + group.options
      .filter(option => modifier.optionIds.includes(option.id))
      .reduce((optionSum, option) => optionSum + option.priceDeltaCents, 0);
  }, 0);

  return item.priceCents + modifierTotal;
}

function findCartMenuItem(cartItem: CartItem, restaurantCatalog: Restaurant[]): MenuItem | undefined {
  const restaurant = restaurantCatalog.find(candidate => candidate.id === cartItem.restaurantId);
  return restaurant?.menu.find(item => item.id === cartItem.menuItemId);
}

function getCartLineTotal(cartItem: CartItem, restaurantCatalog: Restaurant[]): number {
  const item = findCartMenuItem(cartItem, restaurantCatalog);
  if (!item) return cartItem.basePriceCents * cartItem.quantity;
  return getItemTotal(item, cartItem.modifiers) * cartItem.quantity;
}

interface CartValidationResult {
  ok: boolean;
  errors: string[];
}

function validateCartItem(item: MenuItem, modifiers: CartItemModifier[]): CartValidationResult {
  const errors: string[] = [];

  for (const group of item.modifierGroups) {
    const selected = modifiers.find(modifier => modifier.groupId === group.id)?.optionIds ?? [];
    if (group.required && selected.length === 0) {
      errors.push(`${item.name} needs a ${group.name.toLowerCase()} selection.`);
    }
    if (group.minSelected && selected.length < group.minSelected) {
      errors.push(`${item.name} needs at least ${group.minSelected} ${group.name.toLowerCase()} option${group.minSelected === 1 ? '' : 's'}.`);
    }
    if (group.maxSelected && selected.length > group.maxSelected) {
      errors.push(`${item.name} allows at most ${group.maxSelected} ${group.name.toLowerCase()} option${group.maxSelected === 1 ? '' : 's'}.`);
    }
    const invalidOption = selected.find(optionId => !group.options.some(option => option.id === optionId));
    if (invalidOption) {
      errors.push(`${item.name} has an invalid ${group.name.toLowerCase()} option: ${invalidOption}.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateCart(cartItems: CartItem[], restaurantCatalog: Restaurant[]): CartValidationResult {
  const errors: string[] = [];
  const restaurantIds = new Set(cartItems.map(item => item.restaurantId));

  if (restaurantIds.size > 1) {
    errors.push('Cart can only contain items from one restaurant for this MVP.');
  }

  for (const cartItem of cartItems) {
    if (cartItem.quantity < 1) {
      errors.push(`${cartItem.name} quantity must be at least 1.`);
    }
    const item = findCartMenuItem(cartItem, restaurantCatalog);
    if (!item) {
      errors.push(`${cartItem.name} is no longer available.`);
      continue;
    }
    errors.push(...validateCartItem(item, cartItem.modifiers).errors);
  }

  return { ok: errors.length === 0, errors };
}

export default function HomePage() {
  const [restaurantCatalog, setRestaurantCatalog] = useState<Restaurant[]>(fallbackRestaurants);
  const [apiSource, setApiSource] = useState<'api' | 'fallback'>('fallback');
  const [apiError, setApiError] = useState<string | undefined>();
  const [apiLoading, setApiLoading] = useState(true);
  const [sessionId, setSessionId] = useState('demo-session');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(fallbackRestaurants[0].id);
  const selectedRestaurant = restaurantCatalog.find(restaurant => restaurant.id === selectedRestaurantId) ?? restaurantCatalog[0] ?? fallbackRestaurants[0];
  const [selectedItem, setSelectedItem] = useState<MenuItem>(fallbackRestaurants[0].menu[0]);
  const [selectedModifiers, setSelectedModifiers] = useState<CartItemModifier[]>(getDefaultModifiers(fallbackRestaurants[0].menu[0]));
  const [cart, setCart] = useState<CartItem[]>([]);
  const [assistantMessage, setAssistantMessage] = useState('Pick an item, choose modifiers, then add it to cart.');
  const [toast, setToast] = useState('Ready. Try typing or saying “add a large pepperoni pizza”.');
  const [voiceText, setVoiceText] = useState('add a large pepperoni pizza with jalapeños and extra cheese');
  const [lastIntent, setLastIntent] = useState<VoiceIntent | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>('Placed');
  const [cartSyncStatus, setCartSyncStatus] = useState<'local' | 'synced' | 'fallback'>('local');

  useEffect(() => {
    let active = true;
    fetchRestaurants().then(result => {
      if (!active) return;
      setRestaurantCatalog(result.restaurants);
      setApiSource(result.source);
      setApiError(result.error);
      setApiLoading(false);
      const current = result.restaurants.find(restaurant => restaurant.id === selectedRestaurantId) ?? result.restaurants[0];
      if (current) {
        setSelectedRestaurantId(current.id);
        setSelectedItem(current.menu[0]);
        setSelectedModifiers(getDefaultModifiers(current.menu[0]));
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const storedSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSessionId) {
      setSessionId(storedSessionId);
      return;
    }
    const generatedSessionId = `session-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, generatedSessionId);
    setSessionId(generatedSessionId);
  }, []);

  useEffect(() => {
    let active = true;
    fetchCart(sessionId).then(items => {
      if (!active) return;
      if (items) {
        setCart(items);
        setCartSyncStatus('synced');
        return;
      }

      const stored = window.localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        try {
          setCart(JSON.parse(stored) as CartItem[]);
        } catch {
          window.localStorage.removeItem(CART_STORAGE_KEY);
        }
      }
      setCartSyncStatus('fallback');
    });
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (!currentOrder) return;
    setCurrentStatus('Placed');
    const timers = orderStatusSteps.slice(1).map((step, index) => window.setTimeout(() => {
      setCurrentStatus(step.status);
    }, (index + 1) * 2500));

    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [currentOrder]);

  const fixtureErrors = validateFixtures();

  const selectedItemTotal = useMemo(
    () => getItemTotal(selectedItem, selectedModifiers),
    [selectedItem, selectedModifiers],
  );

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + getCartLineTotal(item, restaurantCatalog), 0),
    [cart, restaurantCatalog],
  );

  const selectedItemValidation = useMemo(
    () => validateCartItem(selectedItem, selectedModifiers),
    [selectedItem, selectedModifiers],
  );

  const cartValidation = useMemo(
    () => validateCart(cart, restaurantCatalog),
    [cart, restaurantCatalog],
  );

  function showToast(message: string): void {
    setToast(message);
  }

  function setCartAndSync(nextCart: CartItem[], message = 'Cart synced.'): void {
    setCart(nextCart);
    saveCart(sessionId, nextCart).then(ok => {
      setCartSyncStatus(ok ? 'synced' : 'fallback');
      if (!ok) showToast(`${message} Backend unavailable, saved locally.`);
    });
  }

  function selectRestaurant(restaurant: Restaurant): void {
    setSelectedRestaurantId(restaurant.id);
    setSelectedItem(restaurant.menu[0]);
    setSelectedModifiers(getDefaultModifiers(restaurant.menu[0]));
    setAssistantMessage(`Showing menu for ${restaurant.name}.`);
    showToast(`Restaurant selected: ${restaurant.name}`);
  }

  function selectItem(item: MenuItem): void {
    setSelectedItem(item);
    setSelectedModifiers(getDefaultModifiers(item));
    setAssistantMessage(`Selected ${item.name}. Choose a size and toppings.`);
    showToast(`Item selected: ${item.name}`);
  }

  function updateSingleModifier(groupId: string, optionId: string): void {
    setSelectedModifiers(previous => previous.map(modifier => (
      modifier.groupId === groupId ? { ...modifier, optionIds: [optionId] } : modifier
    )));
  }

  function toggleMultipleModifier(groupId: string, optionId: string, maxSelected?: number): void {
    setSelectedModifiers(previous => previous.map(modifier => {
      if (modifier.groupId !== groupId) return modifier;
      const exists = modifier.optionIds.includes(optionId);
      const nextOptionIds = exists
        ? modifier.optionIds.filter(id => id !== optionId)
        : [...modifier.optionIds, optionId].slice(0, maxSelected ?? 99);
      return { ...modifier, optionIds: nextOptionIds };
    }));
  }

  function addItemToCart(restaurant: Restaurant, item: MenuItem, modifiers: CartItemModifier[]): void {
    const itemValidation = validateCartItem(item, modifiers);
    if (!itemValidation.ok) {
      setAssistantMessage(itemValidation.errors[0]);
      showToast('Please fix item options before adding to cart.');
      return;
    }

    if (cart.length > 0 && cart.some(cartItem => cartItem.restaurantId !== restaurant.id)) {
      setAssistantMessage('This MVP supports one restaurant per cart. Clear the cart to order from another restaurant.');
      showToast('Restaurant conflict: clear cart first.');
      return;
    }

    const newItem: CartItem = {
      id: makeCartItemId(),
      restaurantId: restaurant.id,
      menuItemId: item.id,
      name: item.name,
      quantity: 1,
      basePriceCents: item.priceCents,
      modifiers,
    };

    setCartAndSync([...cart, newItem], `Added ${item.name}.`);
    setAssistantMessage(`Added ${item.name} to your cart.`);
    showToast(`Added ${item.name}`);
  }

  function addSelectedItemToCart(): void {
    addItemToCart(selectedRestaurant, selectedItem, selectedModifiers);
  }

  function updateQuantity(cartItemId: string, delta: number): void {
    const nextCart = cart.map(item => item.id === cartItemId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item);
    setCartAndSync(nextCart, 'Cart quantity updated.');
    showToast('Cart quantity updated.');
  }

  function removeCartItem(cartItemId: string): void {
    setCartAndSync(cart.filter(item => item.id !== cartItemId), 'Item removed.');
    setAssistantMessage('Removed the item from your cart.');
    showToast('Item removed from cart.');
  }

  function removeLastCartItem(): void {
    setCartAndSync(cart.slice(0, -1), 'Removed the most recent item.');
    setAssistantMessage('Removed the most recent item from your cart.');
    showToast('Removed the most recent item.');
  }

  function clearCart(): void {
    setCart([]);
    clearBackendCart(sessionId).then(ok => setCartSyncStatus(ok ? 'synced' : 'fallback'));
    setAssistantMessage('Cart cleared.');
    showToast('Cart cleared.');
  }

  function openCheckout(): void {
    if (cart.length === 0) {
      showToast('Add an item before checkout.');
      return;
    }
    if (!cartValidation.ok) {
      setAssistantMessage(cartValidation.errors[0]);
      showToast('Fix cart issues before checkout.');
      return;
    }
    setCheckoutOpen(true);
    setAssistantMessage('Review your mock checkout. No real payment will be charged.');
    showToast('Mock checkout ready for confirmation.');
  }

  async function placeMockOrder(): Promise<void> {
    if (cart.length === 0 || !cartValidation.ok) return;
    const backendOrder = await createBackendOrder(sessionId, cart, subtotal);
    const order: Order = backendOrder ?? {
      id: makeOrderId(),
      cartItems: cart,
      subtotalCents: subtotal,
      status: 'Placed',
      createdAt: new Date().toISOString(),
    };
    setCurrentOrder(order);
    setCurrentStatus(order.status);
    const refreshedOrder = await fetchOrder(order.id);
    if (refreshedOrder) setCurrentOrder(refreshedOrder);
    setCart([]);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([]));
    setCartSyncStatus(backendOrder ? 'synced' : 'fallback');
    setCheckoutOpen(false);
    setAssistantMessage(`Mock order ${order.id} placed. No payment was charged.`);
    showToast(backendOrder ? `Mock order ${order.id} placed via API.` : `Mock order ${order.id} placed locally.`);
  }

  function executeVoiceCommand(transcript = voiceText): void {
    const intent = parseVoiceIntent(transcript);
    setLastIntent(intent);
    setVoiceText(transcript);

    if (intent.type === 'add_to_cart') {
      const match = findMenuItemFromText(transcript);
      if (!match) {
        setAssistantMessage(intent.clarification ?? 'I could not find that item.');
        showToast('Voice command needs clarification.');
        return;
      }
      selectRestaurant(match.restaurant);
      setSelectedItem(match.item);
      const modifiers = applyVoiceModifiers(match.item, intent);
      setSelectedModifiers(modifiers);
      addItemToCart(match.restaurant, match.item, modifiers);
      return;
    }

    if (intent.type === 'view_cart') {
      setAssistantMessage(cart.length === 0 ? 'Your cart is empty.' : `Your cart has ${cart.length} item${cart.length === 1 ? '' : 's'}.`);
      showToast('Cart shown below.');
      return;
    }

    if (intent.type === 'remove_item') {
      if (cart.length === 0) {
        setAssistantMessage('Your cart is already empty.');
        showToast('Nothing to remove.');
        return;
      }
      removeLastCartItem();
      return;
    }

    if (intent.type === 'clear_cart') {
      clearCart();
      return;
    }

    setAssistantMessage(intent.clarification ?? 'I need a clearer command.');
    showToast('Voice command not understood.');
  }

  function startListening(): void {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAssistantMessage('Browser voice capture is not supported here. Type a command instead.');
      showToast('Voice fallback: typed command mode.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = event => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      executeVoiceCommand(transcript);
    };
    recognition.onerror = () => {
      setIsListening(false);
      setAssistantMessage('Voice capture failed. Type a command or try again.');
      showToast('Voice capture failed gracefully.');
    };
    recognition.onend = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  }

  return (
    <main>
      <div className="toast" role="status" aria-live="polite">{toast}</div>
      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="checkout-modal card" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <span className="kicker">Mock checkout</span>
            <h2 id="checkout-title">Confirm your order</h2>
            <p>This is a portfolio demo checkout. No real payment will be charged.</p>
            <div className="cart-lines">
              {cart.map(cartItem => (
                <div className="cart-line" key={cartItem.id}>
                  <span>{cartItem.quantity}× {cartItem.name}</span>
                  <strong>{formatMoney(getCartLineTotal(cartItem, restaurantCatalog))}</strong>
                </div>
              ))}
            </div>
            <div className="cart-total">
              <span>Mock total</span>
              <strong>{formatMoney(subtotal)}</strong>
            </div>
            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setCheckoutOpen(false)}>Cancel</button>
              <button className="checkout-button" type="button" onClick={placeMockOrder}>Place mock order</button>
            </div>
          </section>
        </div>
      )}
      <div className="container">
        <section className="hero two-column">
          <div>
            <span className="kicker">OrderlyApp · v0.2.0 API integration</span>
            <h1>Order pizza with your voice.</h1>
            <p className="lead">
              Browse restaurants from FastAPI when available, customize pizza, use voice or typed commands, validate your cart, place a mock order, and watch status updates.
            </p>
            <div className="command-box">
              <span className="dot" />
              <p>“Add a large pepperoni pizza with jalapeños and extra cheese.”</p>
            </div>
          </div>
          <aside className="voice-panel card">
            <span className="kicker">Assistant transcript</span>
            <p className="transcript">{assistantMessage}</p>
            <p className="assistant-reply">
              Current selection: {selectedItem.name} · {formatMoney(selectedItemTotal)}.
            </p>
            <label className="voice-input-label" htmlFor="voice-command">Try a command</label>
            <div className="voice-input-row">
              <input
                id="voice-command"
                value={voiceText}
                onChange={event => setVoiceText(event.target.value)}
                placeholder="add a large pepperoni pizza"
              />
              <button type="button" onClick={() => executeVoiceCommand()}>Run</button>
              <button type="button" onClick={startListening}>{isListening ? 'Listening…' : 'Speak'}</button>
            </div>
            {lastIntent && (
              <div className="intent-box">
                <strong>Intent: {lastIntent.type}</strong>
                <span>Confidence: {lastIntent.confidence}</span>
                {lastIntent.clarification && <span>{lastIntent.clarification}</span>}
              </div>
            )}
          </aside>
        </section>

        <section className="api-status card full-width">
          <span className="kicker">Data source</span>
          <p>{apiLoading ? 'Loading restaurants from API…' : apiSource === 'api' ? `Connected to FastAPI · session ${sessionId} · cart ${cartSyncStatus}` : `Using local fallback data${apiError ? ` · ${apiError}` : ''} · cart ${cartSyncStatus}`}</p>
        </section>

        <section className="section-heading">
          <div>
            <span className="kicker">Restaurants</span>
            <h2>Pizza places ready for the MVP</h2>
          </div>
          <span className="pill">{restaurantCatalog.length} restaurants seeded</span>
        </section>

        <section className="grid restaurant-grid">
          {restaurantCatalog.map(restaurant => (
            <button
              type="button"
              className={`card restaurant-card selectable ${restaurant.id === selectedRestaurant.id ? 'selected' : ''}`}
              key={restaurant.id}
              onClick={() => selectRestaurant(restaurant)}
            >
              <div className="restaurant-emoji">{restaurant.imageEmoji}</div>
              <div>
                <h3>{restaurant.name}</h3>
                <p>{restaurant.cuisine} · ⭐ {restaurant.rating} · {restaurant.deliveryMinutes}</p>
                <p>Delivery {formatMoney(restaurant.deliveryFeeCents)}</p>
                <div className="tag-row">
                  {restaurant.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
                </div>
              </div>
            </button>
          ))}
        </section>

        <section className="card full-width restaurant-detail-card">
          <span className="kicker">Restaurant detail</span>
          <h2>{selectedRestaurant.name}</h2>
          <p>{selectedRestaurant.cuisine} · {selectedRestaurant.deliveryMinutes} · Delivery {formatMoney(selectedRestaurant.deliveryFeeCents)}</p>
          <p>{selectedRestaurant.menu.length} menu items available. Fixture validation: {fixtureErrors.length === 0 ? 'passing' : fixtureErrors.join(', ')}</p>
        </section>

        <section className="split">
          <article className="card menu-card">
            <span className="kicker">Menu · {selectedRestaurant.name}</span>
            <h2>Choose an item</h2>
            <div className="menu-list">
              {selectedRestaurant.menu.map(item => (
                <button
                  type="button"
                  className={`menu-item selectable ${item.id === selectedItem.id ? 'selected' : ''}`}
                  key={item.id}
                  onClick={() => selectItem(item)}
                >
                  <span className="menu-emoji">{item.imageEmoji}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <strong>{formatMoney(item.priceCents)}</strong>
                  </div>
                  {item.popular && <span className="tag">Popular</span>}
                </button>
              ))}
            </div>
          </article>

          <aside className="card customizer-card">
            <span className="kicker">Item detail</span>
            <h2>{selectedItem.name}</h2>
            <p>{selectedItem.description}</p>
            <div className="modifier-list">
              {selectedItem.modifierGroups.map(group => (
                <div className="modifier-group" key={group.id}>
                  <div className="modifier-heading">
                    <strong>{group.name}</strong>
                    {group.required && <span>Required</span>}
                  </div>
                  <div className="option-grid">
                    {group.options.map(option => {
                      const modifier = selectedModifiers.find(candidate => candidate.groupId === group.id);
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
            </div>
            {!selectedItemValidation.ok && (
              <div className="validation-box" role="alert">
                {selectedItemValidation.errors.map(error => <p key={error}>{error}</p>)}
              </div>
            )}
            <button
              className="checkout-button"
              type="button"
              onClick={addSelectedItemToCart}
              disabled={!selectedItemValidation.ok}
            >
              Add to cart · {formatMoney(selectedItemTotal)}
            </button>
          </aside>
        </section>

        <section className="card cart-card full-width">
          <div className="cart-header">
            <div>
              <span className="kicker">Cart</span>
              <h2>Current order</h2>
            </div>
            {cart.length > 0 && <button className="ghost-button" type="button" onClick={clearCart}>Clear cart</button>}
          </div>
          {cart.length === 0 ? (
            <p className="empty-state">Your cart is empty. Add a pizza above to start the checkout flow.</p>
          ) : (
            <div className="cart-lines">
              {cart.map(cartItem => {
                const item = findCartMenuItem(cartItem, restaurantCatalog);
                return (
                  <div className="cart-line detailed" key={cartItem.id}>
                    <div>
                      <strong>{cartItem.name}</strong>
                      {item && <p>{cartItem.modifiers.map(modifier => getModifierLabel(item, modifier)).filter(Boolean).join(' · ')}</p>}
                    </div>
                    <div className="quantity-controls">
                      <button type="button" onClick={() => updateQuantity(cartItem.id, -1)}>-</button>
                      <span>{cartItem.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(cartItem.id, 1)}>+</button>
                    </div>
                    <strong>{formatMoney(getCartLineTotal(cartItem, restaurantCatalog))}</strong>
                    <button className="ghost-button" type="button" onClick={() => removeCartItem(cartItem.id)}>Remove</button>
                  </div>
                );
              })}
            </div>
          )}
          {cart.length > 0 && !cartValidation.ok && (
            <div className="validation-box" role="alert">
              {cartValidation.errors.map(error => <p key={error}>{error}</p>)}
            </div>
          )}
          <div className="cart-total">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          <button className="checkout-button" type="button" disabled={cart.length === 0 || !cartValidation.ok} onClick={openCheckout}>
            Continue to mock checkout
          </button>
        </section>

        <section className="card full-width status-card">
          <span className="kicker">Order status</span>
          <h2>{currentOrder ? `Mock order ${currentOrder.id}` : 'Place a mock order to activate tracking'}</h2>
          {currentOrder && (
            <div className="order-summary">
              <p>Placed {new Date(currentOrder.createdAt).toLocaleString()} · Total {formatMoney(currentOrder.subtotalCents)}</p>
              <p>{currentOrder.cartItems.length} item{currentOrder.cartItems.length === 1 ? '' : 's'} in this mock order.</p>
            </div>
          )}
          <div className="status-grid">
            {orderStatusSteps.map(step => {
              const currentIndex = orderStatusSteps.findIndex(candidate => candidate.status === currentStatus);
              const stepIndex = orderStatusSteps.findIndex(candidate => candidate.status === step.status);
              const active = Boolean(currentOrder) && stepIndex <= currentIndex;
              return (
                <div className={`status-step ${active ? 'active' : ''}`} key={step.status}>
                  <strong>{step.label}</strong>
                  <p>{step.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <p className="footer">
          MVP demo complete: browse, customize, voice-command, validate, mock checkout, and track status.
        </p>
      </div>
    </main>
  );
}
