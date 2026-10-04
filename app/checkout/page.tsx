'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MarketplaceNav } from '@/app/components/MarketplaceNav';
import {
  clearCheckoutRecovery,
  clearRevisionedCart,
  fetchCheckoutQuote,
  fetchRevisionedCart,
  getOrderlyDataMode,
  loadCheckoutRecovery,
  saveCheckoutRecovery,
  saveRevisionedCart,
  submitCheckoutOrder,
} from '@/lib/api';
import {
  SYNTHETIC_DEMO_ADDRESSES,
  forgetDemoProfile,
  getDemoAddresses,
  getDemoProfile,
  getPreferredDemoAddress,
  type DemoProfileErrorCode,
} from '@/lib/auth';
import { updateCartItemQuantity, validateCheckoutDetails } from '@/lib/cart';
import { routes } from '@/lib/routes';
import type {
  ApiResult,
  CheckoutDetails,
  CheckoutQuote,
  CheckoutRecovery,
  CheckoutState,
  DemoAddress,
  OrderReceipt,
  RevisionedCart,
} from '@/lib/types';
import { formatMoney } from '@/lib/types';

const SYNTHETIC_PHONE = '+1-555-0100';
const SYNTHETIC_EMAIL = 'demo@example.test';
const PROMOTION_CODE = 'DEMO5' as const;
const CUSTOM_ADDRESS_ID = 'custom';
const CHECKOUT_VALIDATION_SUMMARY_ID = 'checkout-validation-summary';

type ProfileStorageError = {
  code: DemoProfileErrorCode;
  message: string;
};

type CheckoutValidationField = 'name' | 'phone' | 'email' | 'street' | 'city' | 'state' | 'postalCode' | 'tipCents';

const CHECKOUT_ERROR_FIELDS: Record<string, CheckoutValidationField> = {
  'Name is required.': 'name',
  'Enter a valid phone number.': 'phone',
  'Enter a valid email address.': 'email',
  'Delivery address is required.': 'street',
  'City is required.': 'city',
  'State is required.': 'state',
  'Enter a valid ZIP code.': 'postalCode',
  'Tip cannot be negative.': 'tipCents',
};

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

function matchingAddressId(addresses: DemoAddress[], details: CheckoutDetails): string {
  return addresses.find(address => (
    address.street === details.street
    && (address.apartment ?? '') === (details.apartment ?? '')
    && address.city === details.city
    && address.state === details.state
    && address.postalCode === details.postalCode
    && (address.deliveryInstructions ?? '') === (details.deliveryInstructions ?? '')
  ))?.id ?? CUSTOM_ADDRESS_ID;
}

function validationFields(errors: string[]): CheckoutValidationField[] {
  return errors.flatMap(error => CHECKOUT_ERROR_FIELDS[error] ? [CHECKOUT_ERROR_FIELDS[error]] : []);
}

export default function CheckoutPage() {
  const router = useRouter();
  const mode = getOrderlyDataMode();
  const defaultAddress = SYNTHETIC_DEMO_ADDRESSES[0];
  const [cart, setCart] = useState<RevisionedCart | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [addresses, setAddresses] = useState<DemoAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress.id);
  const [profileAvailable, setProfileAvailable] = useState(false);
  const [profileError, setProfileError] = useState<ProfileStorageError | null>(null);
  const [ephemeralProfile, setEphemeralProfile] = useState(false);
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  const [loading, setLoading] = useState(mode === 'api');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [checkoutErrors, setCheckoutErrors] = useState<string[]>([]);
  const [invalidFields, setInvalidFields] = useState<CheckoutValidationField[]>([]);
  const [recovery, setRecovery] = useState<CheckoutRecovery | undefined>();
  const [details, setDetails] = useState<CheckoutDetails>(() => detailsFromAddress('Demo visitor', defaultAddress, 500));
  const deliberateInput = useRef(false);
  const quoteSequence = useRef(0);
  const validationSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== 'api') return;
    let active = true;
    async function load(): Promise<void> {
      setProfileAvailable(false);
      setProfileError(null);
      setEphemeralProfile(false);
      setAddresses([]);

      const storedRecovery = loadCheckoutRecovery(window.sessionStorage);
      if (storedRecovery) {
        deliberateInput.current = true;
        setRecovery(storedRecovery);
        setCheckoutState('uncertain');
        setDetails(storedRecovery.submission.checkout);
      }

      const profileResult = getDemoProfile(window.localStorage);
      const addressesResult = getDemoAddresses(window.localStorage);
      if (!active) return;

      if (!addressesResult.ok) {
        setProfileError({ code: addressesResult.code, message: addressesResult.message });
      } else {
        setAddresses(addressesResult.value);
      }

      if (!profileResult.ok) {
        setProfileError({ code: profileResult.code, message: profileResult.message });
      }

      if (profileResult.ok && addressesResult.ok) {
        setProfileAvailable(Boolean(profileResult.value));
        const availableAddresses = addressesResult.value;

        if (storedRecovery && availableAddresses.length > 0) {
          setSelectedAddressId(matchingAddressId(availableAddresses, storedRecovery.submission.checkout));
        } else if (profileResult.value && !deliberateInput.current) {
          const address = getPreferredDemoAddress(profileResult.value, availableAddresses);
          if (address) {
            setSelectedAddressId(address.id);
            setDetails(previous => detailsFromAddress(profileResult.value?.name ?? previous.name, address, previous.tipCents));
          }
        }
      }

      const cartResult = await fetchRevisionedCart();
      if (!active) return;
      if (!cartResult.ok) {
        setLoadError(cartResult.error.message);
        setCart(null);
      } else {
        setLoadError(null);
        setCart(cartResult.data);
      }
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [mode, profileReloadKey]);

  useEffect(() => {
    if (
      mode !== 'api'
      || loading
      || !cart
      || cart.items.length === 0
      || checkoutState === 'submitting'
      || checkoutState === 'uncertain'
    ) {
      if (checkoutState !== 'uncertain') {
        setQuote(null);
        setQuoteError(null);
      }
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
  }, [cart, checkoutState, details.tipCents, loading, mode, quoteRefresh]);

  function resetResolvedCheckoutState(): void {
    if (checkoutState === 'rejected') {
      setCheckoutState('idle');
      setCheckoutErrors([]);
      setInvalidFields([]);
    }
  }

  function retryProfileStorage(): void {
    setProfileReloadKey(value => value + 1);
  }

  function clearInvalidProfileStorage(): void {
    const result = forgetDemoProfile(window.localStorage);
    if (!result.ok) {
      setProfileError({ code: result.code, message: result.message });
      return;
    }
    retryProfileStorage();
  }

  function useTemporaryProfile(): void {
    const temporaryAddresses = SYNTHETIC_DEMO_ADDRESSES.map(address => ({ ...address }));
    setAddresses(temporaryAddresses);
    setProfileAvailable(true);
    setProfileError(null);
    setEphemeralProfile(true);

    if (!deliberateInput.current) {
      const address = getPreferredDemoAddress(undefined, temporaryAddresses);
      if (address) {
        setSelectedAddressId(address.id);
        setDetails(previous => detailsFromAddress(previous.name || 'Demo visitor', address, previous.tipCents));
      }
      return;
    }

    setSelectedAddressId(matchingAddressId(temporaryAddresses, details));
  }

  async function mutateCart(nextItems: RevisionedCart['items']): Promise<void> {
    if (!cart || mutationPending || checkoutState === 'submitting' || checkoutState === 'uncertain') return;
    setMutationPending(true);
    setMutationError(null);
    resetResolvedCheckoutState();
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
    if (!cart || mutationPending || checkoutState === 'submitting' || checkoutState === 'uncertain') return;
    setMutationPending(true);
    setMutationError(null);
    resetResolvedCheckoutState();
    const result = await clearRevisionedCart(cart.revision);
    if (result.ok) {
      setCart(result.data);
    } else {
      setMutationError(result.error.message);
      if (result.error.currentCart) setCart(result.error.currentCart);
    }
    setMutationPending(false);
  }

  function refreshClientValidation(nextDetails: CheckoutDetails): void {
    if (invalidFields.length === 0) return;
    const validation = validateCheckoutDetails(nextDetails);
    setCheckoutErrors(validation.errors);
    setInvalidFields(validationFields(validation.errors));
    if (validation.ok) setCheckoutState('idle');
  }

  function updateDetails(field: keyof CheckoutDetails, value: string): void {
    if (checkoutState === 'submitting' || checkoutState === 'uncertain') return;
    deliberateInput.current = true;
    setMutationError(null);
    if (invalidFields.length === 0) resetResolvedCheckoutState();
    if (['street', 'apartment', 'city', 'state', 'postalCode', 'deliveryInstructions'].includes(field)) {
      setSelectedAddressId(CUSTOM_ADDRESS_ID);
    }
    const nextDetails = {
      ...details,
      [field]: field === 'tipCents' ? Number.parseInt(value, 10) || 0 : value,
    };
    setDetails(nextDetails);
    refreshClientValidation(nextDetails);
  }

  function selectAddress(addressId: string): void {
    if (checkoutState === 'submitting' || checkoutState === 'uncertain') return;
    const address = addresses.find(candidate => candidate.id === addressId);
    if (!address) return;
    deliberateInput.current = true;
    setMutationError(null);
    if (invalidFields.length === 0) resetResolvedCheckoutState();
    setSelectedAddressId(address.id);
    const nextDetails = {
      ...detailsFromAddress(details.name, address, details.tipCents),
      phone: details.phone,
      email: details.email,
    };
    setDetails(nextDetails);
    refreshClientValidation(nextDetails);
  }

  function fieldError(field: CheckoutValidationField): string | undefined {
    return checkoutErrors.find(error => CHECKOUT_ERROR_FIELDS[error] === field);
  }

  async function reconcileDefinitiveFailure(result: Extract<ApiResult<OrderReceipt>, { ok: false }>): Promise<void> {
    clearCheckoutRecovery(window.sessionStorage);
    setRecovery(undefined);
    setInvalidFields([]);
    setCheckoutState('rejected');
    setCheckoutErrors([result.error.message]);

    if (result.error.currentCart) {
      setCart(result.error.currentCart);
      setQuoteRefresh(value => value + 1);
      return;
    }

    if (result.error.code === 'cart_conflict' || result.error.code === 'catalog_changed') {
      const currentCart = await fetchRevisionedCart();
      if (currentCart.ok) setCart(currentCart.data);
      setQuoteRefresh(value => value + 1);
    }
  }

  async function resolveSubmission(result: ApiResult<OrderReceipt>): Promise<void> {
    if (result.ok) {
      clearCheckoutRecovery(window.sessionStorage);
      setRecovery(undefined);
      setInvalidFields([]);
      setCheckoutState('accepted');
      setCheckoutErrors([]);
      const durableCart = await fetchRevisionedCart();
      if (durableCart.ok) setCart(durableCart.data);
      router.push(routes.orderConfirmation(result.data.id));
      return;
    }

    setInvalidFields([]);
    if (result.kind === 'network') {
      setCheckoutState('uncertain');
      setCheckoutErrors([
        'We could not confirm whether the server saved this order. Retry the same order to safely recover the result.',
      ]);
      return;
    }

    await reconcileDefinitiveFailure(result);
  }

  async function placeOrder(): Promise<void> {
    if (!cart || cart.items.length === 0 || !quote || !profileAvailable || profileError || loadError || mutationPending) return;
    if (checkoutState === 'submitting' || checkoutState === 'uncertain') return;

    const validation = validateCheckoutDetails(details);
    if (!validation.ok) {
      setCheckoutState('rejected');
      setCheckoutErrors(validation.errors);
      setInvalidFields(validationFields(validation.errors));
      window.requestAnimationFrame(() => validationSummaryRef.current?.focus());
      return;
    }
    setInvalidFields([]);
    if (quote.cartRevision !== cart.revision) {
      setCheckoutState('rejected');
      setCheckoutErrors(['Your basket changed after the quote. Review the latest quote before submitting.']);
      setQuoteRefresh(value => value + 1);
      return;
    }

    const nextRecovery: CheckoutRecovery = {
      schemaVersion: 1,
      idempotencyKey: window.crypto.randomUUID(),
      submission: {
        expectedRevision: quote.cartRevision,
        catalogFingerprint: quote.catalogFingerprint,
        checkout: { ...details, paymentMethod: 'mock' },
        promotionCode: PROMOTION_CODE,
      },
    };

    if (!saveCheckoutRecovery(window.sessionStorage, nextRecovery)) {
      setCheckoutState('rejected');
      setCheckoutErrors(['Checkout recovery storage is unavailable. No order was submitted.']);
      return;
    }

    setRecovery(nextRecovery);
    setCheckoutState('submitting');
    setCheckoutErrors([]);
    const result = await submitCheckoutOrder(nextRecovery.idempotencyKey, nextRecovery.submission);
    await resolveSubmission(result);
  }

  async function retryUncertainOrder(): Promise<void> {
    if (!recovery || checkoutState !== 'uncertain') return;
    setCheckoutState('submitting');
    setCheckoutErrors([]);
    const result = await submitCheckoutOrder(recovery.idempotencyKey, recovery.submission);
    await resolveSubmission(result);
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
  const formLocked = checkoutState === 'submitting' || checkoutState === 'uncertain';
  const canSubmit = Boolean(
    !loading
    && !loadError
    && !profileError
    && profileAvailable
    && cart
    && cart.items.length > 0
    && quote
    && quote.cartRevision === cart.revision
    && !mutationPending
    && checkoutState !== 'submitting'
    && checkoutState !== 'uncertain'
  );

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
                  <button className="ghost-button" type="button" disabled={mutationPending || formLocked} onClick={() => void clearCart()}>
                    Clear cart
                  </button>
                )}
              </div>

              {loading ? (
                <div className="empty-state"><p>Loading your server basket…</p></div>
              ) : cartItems.length === 0 ? (
                <div className="empty-state">
                  <p>{recovery ? 'The server basket is empty while this earlier checkout is unresolved.' : 'Your cart is empty. Pick a restaurant and customize an item to start checkout.'}</p>
                  {!recovery && <Link className="pill" href={routes.restaurants()}>Browse restaurants</Link>}
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
                        <button type="button" disabled={mutationPending || formLocked} onClick={() => void updateQuantity(cartItem.id, -1)}>-</button>
                        <span>{cartItem.quantity}</span>
                        <button type="button" disabled={mutationPending || formLocked} onClick={() => void updateQuantity(cartItem.id, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {mutationError && <div className="validation-panel" role="alert"><p>{mutationError}</p><Link href={routes.cart}>Review current basket</Link></div>}

              {cartItems.length > 0 && !totals && !quoteError && checkoutState !== 'uncertain' && <div className="empty-state"><p>Getting the latest server quote…</p></div>}
              {quoteError && checkoutState !== 'uncertain' && (
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

              {checkoutState === 'uncertain' && recovery && (
                <div className="validation-panel" role="alert">
                  <strong>Order result is uncertain</strong>
                  {checkoutErrors.map(error => <p key={error}>{error}</p>)}
                  <p>Your original submission is locked until its result is reconciled.</p>
                  <button className="checkout-button inline-action" type="button" onClick={() => void retryUncertainOrder()}>
                    Retry same order safely
                  </button>
                </div>
              )}

              {checkoutState !== 'uncertain' && checkoutErrors.length > 0 && (
                <div
                  id={CHECKOUT_VALIDATION_SUMMARY_ID}
                  className="validation-panel"
                  ref={validationSummaryRef}
                  role="alert"
                  tabIndex={-1}
                >
                  <strong>{invalidFields.length > 0 ? 'Check the highlighted checkout fields' : 'Checkout needs attention'}</strong>
                  {checkoutErrors.map(error => <p key={error}>{error}</p>)}
                </div>
              )}

              {profileError && checkoutState !== 'uncertain' && (
                <div className="validation-panel" role="alert">
                  <p>{profileError.message}</p>
                  <div className="filter-row">
                    <button className="ghost-button" type="button" onClick={retryProfileStorage}>Retry profile</button>
                    {profileError.code === 'invalid_profile' && (
                      <button className="ghost-button" type="button" onClick={clearInvalidProfileStorage}>Clear local demo data</button>
                    )}
                    {profileError.code === 'storage_unavailable' && (
                      <button className="checkout-button" type="button" onClick={useTemporaryProfile}>Use temporary demo profile</button>
                    )}
                  </div>
                </div>
              )}

              {ephemeralProfile && checkoutState !== 'uncertain' && (
                <div className="validation-panel" role="status">
                  <p>Browser profile storage is unavailable. This temporary synthetic profile is used only for this checkout and does not change server guest ownership.</p>
                </div>
              )}

              {!profileAvailable && !profileError && !loading && checkoutState !== 'uncertain' && (
                <div className="validation-panel" role="alert">
                  <p>Create a password-free demo profile before placing an order.</p>
                  <Link className="ghost-button" href={routes.signIn(routes.checkout)}>Create demo profile</Link>
                </div>
              )}

              {addresses.length > 0 && (
                <label className="full-field" htmlFor="checkout-saved-address">
                  <span>Saved synthetic address</span>
                  <select id="checkout-saved-address" value={selectedAddressId} disabled={formLocked} onChange={event => selectAddress(event.target.value)}>
                    {selectedAddressId === CUSTOM_ADDRESS_ID && <option value={CUSTOM_ADDRESS_ID}>Edited address</option>}
                    {addresses.map(address => <option key={address.id} value={address.id}>{address.label}</option>)}
                  </select>
                </label>
              )}

              <form
                id="checkout-form"
                className="checkout-form-grid"
                aria-label="Mock checkout details"
                onSubmit={event => {
                  event.preventDefault();
                  void placeOrder();
                }}
              >
                <label htmlFor="checkout-name">
                  <span>Name</span>
                  <input
                    id="checkout-name"
                    aria-describedby={fieldError('name') ? 'checkout-name-error' : undefined}
                    aria-invalid={fieldError('name') ? true : undefined}
                    disabled={formLocked}
                    type="text"
                    value={details.name}
                    onChange={event => updateDetails('name', event.target.value)}
                  />
                  {fieldError('name') && <span id="checkout-name-error">{fieldError('name')}</span>}
                </label>
                <label htmlFor="checkout-phone">
                  <span>Phone</span>
                  <input
                    id="checkout-phone"
                    aria-describedby={fieldError('phone') ? 'checkout-phone-error' : undefined}
                    aria-invalid={fieldError('phone') ? true : undefined}
                    disabled={formLocked}
                    type="tel"
                    value={details.phone}
                    onChange={event => updateDetails('phone', event.target.value)}
                  />
                  {fieldError('phone') && <span id="checkout-phone-error">{fieldError('phone')}</span>}
                </label>
                <label className="full-field" htmlFor="checkout-email">
                  <span>Email</span>
                  <input
                    id="checkout-email"
                    aria-describedby={fieldError('email') ? 'checkout-email-error' : undefined}
                    aria-invalid={fieldError('email') ? true : undefined}
                    disabled={formLocked}
                    type="email"
                    value={details.email}
                    onChange={event => updateDetails('email', event.target.value)}
                  />
                  {fieldError('email') && <span id="checkout-email-error">{fieldError('email')}</span>}
                </label>
                <label className="full-field" htmlFor="checkout-street">
                  <span>Delivery address</span>
                  <input
                    id="checkout-street"
                    aria-describedby={fieldError('street') ? 'checkout-street-error' : undefined}
                    aria-invalid={fieldError('street') ? true : undefined}
                    disabled={formLocked}
                    type="text"
                    value={details.street}
                    onChange={event => updateDetails('street', event.target.value)}
                  />
                  {fieldError('street') && <span id="checkout-street-error">{fieldError('street')}</span>}
                </label>
                <label htmlFor="checkout-apartment">
                  <span>Unit</span>
                  <input id="checkout-apartment" disabled={formLocked} type="text" value={details.apartment ?? ''} onChange={event => updateDetails('apartment', event.target.value)} />
                </label>
                <label htmlFor="checkout-city">
                  <span>City</span>
                  <input
                    id="checkout-city"
                    aria-describedby={fieldError('city') ? 'checkout-city-error' : undefined}
                    aria-invalid={fieldError('city') ? true : undefined}
                    disabled={formLocked}
                    type="text"
                    value={details.city}
                    onChange={event => updateDetails('city', event.target.value)}
                  />
                  {fieldError('city') && <span id="checkout-city-error">{fieldError('city')}</span>}
                </label>
                <label htmlFor="checkout-state">
                  <span>State</span>
                  <input
                    id="checkout-state"
                    aria-describedby={fieldError('state') ? 'checkout-state-error' : undefined}
                    aria-invalid={fieldError('state') ? true : undefined}
                    disabled={formLocked}
                    type="text"
                    maxLength={2}
                    value={details.state}
                    onChange={event => updateDetails('state', event.target.value.toUpperCase())}
                  />
                  {fieldError('state') && <span id="checkout-state-error">{fieldError('state')}</span>}
                </label>
                <label htmlFor="checkout-postal-code">
                  <span>ZIP code</span>
                  <input
                    id="checkout-postal-code"
                    aria-describedby={fieldError('postalCode') ? 'checkout-postal-code-error' : undefined}
                    aria-invalid={fieldError('postalCode') ? true : undefined}
                    disabled={formLocked}
                    type="text"
                    value={details.postalCode}
                    onChange={event => updateDetails('postalCode', event.target.value)}
                  />
                  {fieldError('postalCode') && <span id="checkout-postal-code-error">{fieldError('postalCode')}</span>}
                </label>
                <label htmlFor="checkout-tip">
                  <span>Tip</span>
                  <select
                    id="checkout-tip"
                    aria-describedby={fieldError('tipCents') ? 'checkout-tip-error' : undefined}
                    aria-invalid={fieldError('tipCents') ? true : undefined}
                    disabled={formLocked}
                    value={details.tipCents}
                    onChange={event => updateDetails('tipCents', event.target.value)}
                  >
                    <option value="0">No tip</option>
                    <option value="300">$3.00</option>
                    <option value="500">$5.00</option>
                    <option value="800">$8.00</option>
                  </select>
                  {fieldError('tipCents') && <span id="checkout-tip-error">{fieldError('tipCents')}</span>}
                </label>
                <label className="full-field" htmlFor="checkout-instructions">
                  <span>Delivery instructions</span>
                  <textarea id="checkout-instructions" disabled={formLocked} value={details.deliveryInstructions ?? ''} onChange={event => updateDetails('deliveryInstructions', event.target.value)} />
                </label>
              </form>

              <div className="payment-breakdown">
                <div><span>Delivery address</span><strong>{details.street}</strong></div>
                <div><span>Drop-off</span><strong>{details.deliveryInstructions || 'Hand to me'}</strong></div>
                <div><span>Payment</span><strong>Mock payment, no card details collected</strong></div>
                <div><span>Quote</span><strong>{quote ? `Revision ${quote.cartRevision}` : recovery ? `Recovery revision ${recovery.submission.expectedRevision}` : 'Waiting for server quote'}</strong></div>
              </div>

              {checkoutState !== 'uncertain' && (
                <button className="checkout-button" type="submit" form="checkout-form" disabled={!canSubmit}>
                  {checkoutState === 'submitting' ? 'Placing order…' : checkoutState === 'accepted' ? 'Order saved' : 'Place mock order'}
                </button>
              )}
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}