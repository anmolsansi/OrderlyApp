import { expect, test, type Browser, type Page } from '@playwright/test';

const RECOVERY_STORAGE_KEY = 'orderlyapp.marketplace.checkoutRecovery.v1';

async function prepareApiCheckout(page: Page): Promise<void> {
  await page.goto('/sign-in?next=%2Frestaurants%2Fmarios-pizza');
  await page.getByLabel('Demo name').fill('Recovery Demo');
  await page.locator('input[name="demo-address"][value="demo-address-2"]').check();
  await page.getByRole('button', { name: /use demo profile/i }).click();
  await expect(page).toHaveURL(/\/restaurants\/marios-pizza/);

  await page.getByRole('link', { name: /pepperoni feast/i }).click();
  await page.getByLabel(/large/i).check();
  await page.getByLabel(/jalapeños/i).check();
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page).toHaveURL(/\/cart/);
  await page.getByRole('link', { name: /continue to checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByRole('button', { name: /place mock order/i })).toBeEnabled();
}

async function assertFreshGuestHasNoOrders(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('/orders');
    await expect(page.getByText(/no saved orders yet/i)).toBeVisible();
  } finally {
    await context.close();
  }
}

for (const lostResponse of ['connection', '500', '503', 'malformed'] as const) {
test(`lost ${lostResponse} accepted response survives reload and replays the exact receipt`, async ({ page, browser }) => {
  await prepareApiCheckout(page);

  await expect(page.getByLabel('Delivery address')).toHaveValue('200 Sample Avenue');
  await page.getByLabel('Saved synthetic address').selectOption({ label: 'Demo home' });
  await expect(page.getByLabel('Delivery address')).toHaveValue('100 Demo Street');

  const attempts: Array<{ key: string | undefined; body: string | null; status: number; receipt: any }> = [];
  await page.route('**/api/orderly/orders', async route => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const body = await response.body();
    const receipt = JSON.parse(body.toString('utf8'));
    attempts.push({
      key: request.headers()['idempotency-key'],
      body: request.postData(),
      status: response.status(),
      receipt,
    });

    if (attempts.length === 1) {
      if (lostResponse === 'connection') await route.abort('failed');
      else await route.fulfill({ status: lostResponse === 'malformed' ? 201 : Number(lostResponse), contentType: 'application/json', body: JSON.stringify(lostResponse === 'malformed' ? { schema_version: 1 } : { error: { code: 'storage_unavailable', message: 'Order outcome unavailable', fields: [] } }) });
      return;
    }

    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body,
    });
  });

  await page.getByRole('button', { name: /place mock order/i }).click();
  await expect(page.getByText(/order result is uncertain/i)).toBeVisible();
  await expect(page.getByText(/original submission is locked/i)).toBeVisible();
  await expect(page.getByLabel('Delivery address')).toBeDisabled();
  expect(await page.evaluate(key => sessionStorage.getItem(key), RECOVERY_STORAGE_KEY)).not.toBeNull();

  await page.reload();
  await expect(page.getByText(/order result is uncertain/i)).toBeVisible();
  await expect(page.getByLabel('Delivery address')).toHaveValue('100 Demo Street');
  await page.getByRole('button', { name: /retry same order safely/i }).click();
  await expect(page).toHaveURL(/\/order-confirmation\?orderId=/);
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();

  expect(attempts).toHaveLength(2);
  expect(attempts[0].status).toBe(201);
  expect(attempts[1].status).toBe(200);
  expect(attempts[0].key).toBeTruthy();
  expect(attempts[1].key).toBe(attempts[0].key);
  expect(attempts[1].body).toBe(attempts[0].body);
  expect(attempts[1].receipt.id).toBe(attempts[0].receipt.id);
  expect(attempts[1].receipt.totals).toEqual(attempts[0].receipt.totals);
  expect(attempts[1].receipt.checkout).toEqual(attempts[0].receipt.checkout);
  expect(attempts[1].receipt.checkout.street).toBe('100 Demo Street');
  expect(await page.evaluate(key => sessionStorage.getItem(key), RECOVERY_STORAGE_KEY)).toBeNull();

  const acceptedOrderId = attempts[0].receipt.id as string;
  await page.reload();
  await expect(page.getByText('100 Demo Street', { exact: false })).toBeVisible();
  await expect(page.getByText(acceptedOrderId, { exact: true }).first()).toBeVisible();

  await page.goto('/orders');
  await expect(page.locator(`a[href="/order-confirmation?orderId=${acceptedOrderId}"]`)).toBeVisible();

  await page.goto('/order-confirmation?orderId=00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: /order not found/i })).toBeVisible();
  await expect(page.getByText(acceptedOrderId, { exact: true })).toHaveCount(0);

  await assertFreshGuestHasNoOrders(browser);
});

}

test('definitive order API failure keeps the durable basket and never invents confirmation', async ({ page }) => {
  await prepareApiCheckout(page);

  await page.route('**/api/orderly/orders', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'invalid_checkout',
          message: 'Checkout details were rejected',
          request_id: 'synthetic-e2e-order-422',
          fields: [],
        },
      }),
    });
  });

  await page.getByRole('button', { name: /place mock order/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByText(/checkout details were rejected/i)).toBeVisible();
  await expect(page.getByText(/pepperoni feast/i)).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), RECOVERY_STORAGE_KEY)).toBeNull();

  await page.reload();
  await expect(page.getByText(/pepperoni feast/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /your cart/i })).toBeVisible();
});

test('direct local_demo checkout, receipt, and history routes stay unavailable', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ORDERLY_DATA_MODE !== 'local_demo', 'Run with NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo to exercise the explicit preview build.');

  const apiRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/orderly')) apiRequests.push(request.url());
  });

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /checkout unavailable in fixture preview/i })).toBeVisible();

  await page.goto('/order-confirmation?orderId=fixture-order');
  await expect(page.getByRole('heading', { name: /order receipts unavailable in fixture preview/i })).toBeVisible();

  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: /order history unavailable in fixture preview/i })).toBeVisible();
  expect(apiRequests).toEqual([]);
});


test('damaged recovery storage blocks a new order while preserving the durable basket', async ({ page }) => {
  await prepareApiCheckout(page);
  await page.evaluate(key => sessionStorage.setItem(key, '{broken'), RECOVERY_STORAGE_KEY);
  let submits = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/orderly/orders' && request.method() === 'POST') submits++; });
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: /recovery storage is unavailable or damaged/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /place mock order/i })).toBeDisabled();
  await expect(page.getByText(/pepperoni feast/i)).toBeVisible();
  expect(submits).toBe(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), RECOVERY_STORAGE_KEY)).toBe('{broken');
});

test('pending submission ignores a second form submit and clears the basket once', async ({ page }) => {
  await prepareApiCheckout(page);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let submits = 0;
  await page.route('**/api/orderly/orders', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    submits++;
    await barrier;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: /place mock order/i }).click();
  await expect(page.getByRole('button', { name: /placing order/i })).toBeDisabled();
  await page.locator('#checkout-form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect(submits).toBe(1);
  release();
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();
  const state = await page.evaluate(async () => ({
    cart: await (await fetch('/api/orderly/cart')).json(),
    orders: await (await fetch('/api/orderly/orders')).json(),
  }));
  expect(submits).toBe(1);
  expect(state.cart.revision).toBe(2);
  expect(state.cart.items).toEqual([]);
  expect(state.orders).toHaveLength(1);
});
