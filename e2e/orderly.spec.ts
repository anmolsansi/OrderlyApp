import { expect, test } from '@playwright/test';

async function mockBackendCartAndOrders(page: import('@playwright/test').Page) {
  let backendCart: any[] = [];
  let cartRevision = 0;
  const backendOrders: Record<string, any> = {};
  const idempotencyOrders: Record<string, string> = {};
  const catalogFingerprint = 'a'.repeat(64);

  function totals(tipCents: number) {
    const subtotalCents = backendCart.reduce((sum, item) => sum + item.base_price_cents * item.quantity, 0);
    const discountCents = subtotalCents > 0 ? Math.min(500, subtotalCents) : 0;
    const deliveryFeeCents = subtotalCents > 0 ? 199 : 0;
    const serviceFeeCents = subtotalCents > 0 ? 249 : 0;
    const taxCents = subtotalCents > 0 ? 44 : 0;
    return {
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      delivery_fee_cents: deliveryFeeCents,
      service_fee_cents: serviceFeeCents,
      tax_cents: taxCents,
      tip_cents: tipCents,
      total_cents: Math.max(0, subtotalCents - discountCents) + deliveryFeeCents + serviceFeeCents + taxCents + tipCents,
    };
  }

  await page.route('**', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/orderly/session' && request.method() === 'POST') {
      await route.fulfill({ json: { schema_version: 1, expires_at: '2030-01-31T00:00:00Z' } });
      return;
    }

    if (url.pathname === '/api/orderly/cart') {
      if (request.method() === 'GET') {
        await route.fulfill({ json: { schema_version: 1, revision: cartRevision, items: backendCart } });
        return;
      }
      if (request.method() === 'PUT') {
        const payload = JSON.parse(request.postData() ?? '{"items":[]}');
        if (payload.expected_revision !== cartRevision) {
          await route.fulfill({
            status: 409,
            json: {
              error: { code: 'cart_conflict', message: 'Basket changed', request_id: 'legacy-e2e-conflict', fields: [] },
              current_cart: { schema_version: 1, revision: cartRevision, items: backendCart },
            },
          });
          return;
        }
        backendCart = (payload.items ?? []).map((item: any) => ({
          ...item,
          name: item.menu_item_id === 'pepperoni-feast' ? 'Pepperoni Feast' : 'Canonical item',
          base_price_cents: item.menu_item_id === 'pepperoni-feast' ? 1499 : 1000,
        }));
        cartRevision += 1;
        await route.fulfill({ json: { schema_version: 1, revision: cartRevision, items: backendCart } });
        return;
      }
      if (request.method() === 'DELETE') {
        const payload = JSON.parse(request.postData() ?? '{}');
        if (payload.expected_revision !== cartRevision) {
          await route.fulfill({
            status: 409,
            json: {
              error: { code: 'cart_conflict', message: 'Basket changed', request_id: 'legacy-e2e-delete-conflict', fields: [] },
              current_cart: { schema_version: 1, revision: cartRevision, items: backendCart },
            },
          });
          return;
        }
        backendCart = [];
        cartRevision += 1;
        await route.fulfill({ json: { schema_version: 1, revision: cartRevision, items: backendCart } });
        return;
      }
    }

    if (url.pathname === '/api/orderly/checkout/quote' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}');
      if (payload.expected_revision !== cartRevision) {
        await route.fulfill({
          status: 409,
          json: { error: { code: 'cart_conflict', message: 'Basket changed', request_id: 'e2e-quote-conflict', fields: [] } },
        });
        return;
      }
      await route.fulfill({
        json: {
          schema_version: 1,
          cart_revision: cartRevision,
          catalog_fingerprint: catalogFingerprint,
          totals: totals(payload.tip_cents ?? 0),
        },
      });
      return;
    }

    if (url.pathname === '/api/orderly/orders' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}');
      const idempotencyKey = request.headers()['idempotency-key'] ?? '';
      const replayOrderId = idempotencyOrders[idempotencyKey];
      if (replayOrderId) {
        await route.fulfill({ status: 200, json: backendOrders[replayOrderId] });
        return;
      }
      if (payload.expected_revision !== cartRevision) {
        await route.fulfill({
          status: 409,
          json: { error: { code: 'cart_conflict', message: 'Basket changed', request_id: 'e2e-order-conflict', fields: [] } },
        });
        return;
      }
      const orderTotals = totals(payload.checkout?.tip_cents ?? 0);
      const order = {
        schema_version: 1,
        id: '11111111-1111-4111-8111-111111111112',
        status: 'Placed',
        created_at: new Date().toISOString(),
        items: backendCart.map(item => ({
          id: item.id,
          restaurant_id: item.restaurant_id,
          menu_item_id: item.menu_item_id,
          name: item.name,
          unit_price_cents: item.base_price_cents,
          quantity: item.quantity,
          line_total_cents: item.base_price_cents * item.quantity,
          modifiers: [],
          ...(item.special_instructions ? { special_instructions: item.special_instructions } : {}),
        })),
        checkout: payload.checkout,
        totals: orderTotals,
        pricing_version: 'mock-v1',
      };
      backendOrders[order.id] = order;
      idempotencyOrders[idempotencyKey] = order.id;
      backendCart = [];
      cartRevision += 1;
      await route.fulfill({ status: 201, json: order });
      return;
    }

    if (url.pathname === '/api/orderly/orders' && request.method() === 'GET') {
      await route.fulfill({ json: Object.values(backendOrders) });
      return;
    }

    const orderMatch = url.pathname.match(/^\/api\/orderly\/orders\/([^/]+)$/);
    if (orderMatch && request.method() === 'GET') {
      const order = backendOrders[orderMatch[1]];
      await route.fulfill(order ? { json: order } : {
        status: 404,
        json: { error: { code: 'order_not_found', message: 'Order not found', request_id: 'e2e-order-missing', fields: [] } },
      });
      return;
    }

    await route.fallback();
  });
}

test('search opens restaurant list and restaurant menu page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /pizza delivery now/i })).toBeVisible();
  await page.getByRole('searchbox', { name: /search pizza restaurants and menu items/i }).fill('pepperoni');
  await page.getByRole('button', { name: /search/i }).click();
  await expect(page).toHaveURL(/\/restaurants\?query=pepperoni/);
  await expect(page.getByRole('heading', { name: /search results for “pepperoni”/i })).toBeVisible();
  await page.getByRole('link', { name: /mario's pizza lab/i }).first().click();
  await expect(page).toHaveURL(/\/restaurants\/marios-pizza/);
  await expect(page.getByRole('heading', { name: /mario's pizza lab/i })).toBeVisible();
});

test('customizes an item, reviews payment, and places order', async ({ page }) => {
  await mockBackendCartAndOrders(page);
  await page.goto('/restaurants/marios-pizza');
  await page.getByRole('link', { name: /pepperoni feast/i }).click();
  await expect(page).toHaveURL(/\/restaurants\/marios-pizza\/items\/pepperoni-feast/);
  await expect(page.getByRole('heading', { name: /pepperoni feast/i })).toBeVisible();
  await page.getByLabel(/large/i).check();
  await page.getByLabel(/jalapeños/i).check();
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByRole('heading', { name: /your cart/i })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/pepperoni feast/i).first()).toBeVisible();
  await page.getByRole('link', { name: /continue to checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByText(/mock payment, no card details collected/i)).toBeVisible();
  await page.getByRole('complementary').getByRole('link', { name: /create demo profile/i }).click();
  await page.getByRole('button', { name: /use demo profile/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByRole('button', { name: /place mock order/i }).click();
  await expect(page).toHaveURL(/\/order-confirmation\?orderId=11111111-1111-4111-8111-111111111112/);
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /receipt details/i })).toBeVisible();
  await page.reload();
  await expect(page.getByText('11111111-1111-4111-8111-111111111112', { exact: true }).first()).toBeVisible();
});

test('demo profile is password-free and cannot silently change guest ownership', async ({ page, context }) => {
  await page.goto('/sign-in?next=%2Faccount');

  await page.evaluate(async () => {
    await fetch('/api/orderly/session', { method: 'POST' });
  });
  const [guestBeforeProfile] = (await context.cookies()).filter(cookie => cookie.name === 'orderly_guest');
  expect(guestBeforeProfile).toBeTruthy();

  await expect(page.getByLabel(/password/i)).toHaveCount(0);
  await expect(page.getByLabel(/email/i)).toHaveCount(0);
  await page.getByLabel('Demo name').fill('Riley Demo');
  await page.locator('input[name="demo-address"][value="demo-address-2"]').check();
  await page.getByRole('button', { name: /use demo profile/i }).click();

  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByLabel('Display name')).toHaveValue('Riley Demo');
  await page.getByLabel('Display name').fill('Riley Renamed');
  await page.getByRole('button', { name: /save display name/i }).click();
  await expect(page.getByRole('status')).toContainText(/demo name saved/i);

  const [guestAfterRename] = (await context.cookies()).filter(cookie => cookie.name === 'orderly_guest');
  expect(guestAfterRename.value).toBe(guestBeforeProfile.value);

  await page.getByRole('button', { name: /forget local profile/i }).click();
  await expect(page.getByRole('heading', { name: /choose a demo profile/i })).toBeVisible();
  const [guestAfterForget] = (await context.cookies()).filter(cookie => cookie.name === 'orderly_guest');
  expect(guestAfterForget.value).toBe(guestBeforeProfile.value);
});

test('explicit fresh guest reset rotates ownership separately from the demo profile', async ({ page, context }) => {
  await page.goto('/sign-in?next=%2Faccount');
  await page.getByRole('button', { name: /use demo profile/i }).click();
  await expect(page).toHaveURL(/\/account/);

  await page.evaluate(async () => {
    await fetch('/api/orderly/session', { method: 'POST' });
  });
  const [guestBeforeReset] = (await context.cookies()).filter(cookie => cookie.name === 'orderly_guest');
  expect(guestBeforeReset).toBeTruthy();

  await page.getByRole('button', { name: /start fresh guest session/i }).click();
  await expect(page.getByRole('heading', { name: /choose a demo profile/i })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/fresh guest session started/i);

  const [guestAfterReset] = (await context.cookies()).filter(cookie => cookie.name === 'orderly_guest');
  expect(guestAfterReset.value).not.toBe(guestBeforeReset.value);
  expect(guestAfterReset.httpOnly).toBe(true);
});

test('restaurant filters open the list page and checkout is disabled when empty', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /top rated/i }).click();
  await expect(page).toHaveURL(/filter=Top\+rated|filter=Top%20rated/);
  await expect(page.getByRole('heading', { name: /pizza restaurants near you/i })).toBeVisible();
  await page.goto('/checkout');
  await expect(page.getByText(/your cart is empty/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /place mock order/i })).toBeDisabled();
});

test('restaurant discovery shows sort, no-results, and real API error states', async ({ page }) => {
  await page.goto('/restaurants');
  await page.getByLabel(/sort restaurants/i).selectOption('rating');
  await page.getByRole('button', { name: /apply/i }).click();
  await expect(page).toHaveURL(/sort=rating/);
  await expect(page.getByText(/sorted by highest rating/i)).toBeVisible();

  await page.goto('/restaurants?query=no-match&filter=All%20pizza');
  await expect(page.getByRole('heading', { name: /no restaurants found/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /clear filters/i })).toBeVisible();

  await page.route('**/api/orderly/restaurants', async route => {
    await route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'storage_unavailable',
          message: 'Catalog API is unavailable',
          request_id: 'legacy-e2e-catalog-error',
          fields: [],
        },
      },
    });
  });
  await page.goto('/restaurants');
  await expect(page.locator('.discovery-state-card[role="alert"]')).toContainText(/temporarily unavailable/i);
  await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
});

test('guest session is HttpOnly, opaque, stable on bootstrap, and rotated on reset', async ({ page, context }) => {
  await page.goto('/');

  const first = await page.evaluate(async () => {
    const response = await fetch('/api/orderly/session', { method: 'POST' });
    return { status: response.status, body: await response.json() };
  });
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ schema_version: 1 });
  expect(first.body).not.toHaveProperty('guest_id');
  expect(first.body).not.toHaveProperty('session_id');

  const [firstCookie] = (await context.cookies()).filter(cookie => cookie.name === 'orderly_guest');
  expect(firstCookie).toBeTruthy();
  expect(firstCookie.httpOnly).toBe(true);
  expect(firstCookie.sameSite).toBe('Lax');
  expect(firstCookie.path).toBe('/api/orderly');
  expect(firstCookie.secure).toBe(false);
  expect(firstCookie.value).toMatch(/^v1\.[A-Za-z0-9_-]+\.\d+\.[A-Za-z0-9_-]+$/);

  await page.evaluate(async () => {
    await fetch('/api/orderly/session', { method: 'POST' });
  });
  const [stableCookie] = (await context.cookies()).filter(cookie => cookie.name === 'orderly_guest');
  expect(stableCookie.value).toBe(firstCookie.value);

  const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(localStorageKeys).not.toContain('orderlyapp.marketplace.backendSession.v1');

  const reset = await page.evaluate(async () => {
    const response = await fetch('/api/orderly/session/reset', { method: 'POST' });
    return response.status;
  });
  expect(reset).toBe(200);

  const [resetCookie] = (await context.cookies()).filter(cookie => cookie.name === 'orderly_guest');
  expect(resetCookie.value).not.toBe(firstCookie.value);
  expect(resetCookie.httpOnly).toBe(true);
  expect(resetCookie.path).toBe('/api/orderly');
});
