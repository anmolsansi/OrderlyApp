import { afterEach, expect, it, vi } from 'vitest';
import c3 from './fixtures/contracts/c3.json';
import c4 from './fixtures/contracts/c4.json';
import c5 from './fixtures/contracts/c5.json';
import c7 from './fixtures/contracts/c7.json';
import { fetchRestaurants, fetchRevisionedCart, fetchCheckoutQuote, fetchOrderReceipt, loadCheckoutRecovery } from '../lib/api';

const jsonShape = (value: unknown) => JSON.parse(JSON.stringify(value));
afterEach(() => vi.restoreAllMocks());

it('executes shared provider examples through the actual C7 adapters', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    const payload = url.endsWith('/session') ? { schema_version: 1 }
      : url.endsWith('/restaurants') ? c3.positive.restaurants
        : url.endsWith('/cart') ? c4.positive
          : url.endsWith('/quote') ? c5.positive.quote : c5.positive.receipt;
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  expect(jsonShape(await fetchRestaurants())).toEqual(c7.positive.catalog_result);
  expect(jsonShape(await fetchRevisionedCart())).toEqual(c7.positive.cart_result);
  expect(jsonShape(await fetchCheckoutQuote(1, 200, 'DEMO5'))).toEqual(c7.positive.quote_result);
  expect(jsonShape(await fetchOrderReceipt(c5.positive.receipt.id))).toEqual(c7.positive.receipt_result);
  const storage = { getItem: () => JSON.stringify(c7.positive.checkout_recovery) } as unknown as Storage;
  expect(loadCheckoutRecovery(storage)).toEqual(c7.positive.checkout_recovery);
});
