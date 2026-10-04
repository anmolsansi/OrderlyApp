import { expect, test, type Page, type Route } from '@playwright/test';

const canonicalRestaurant = {
  id: 'canonical-cafe',
  name: 'Canonical Cafe',
  cuisine: 'Pizza',
  rating: 4.9,
  delivery_minutes: '20–30 min',
  delivery_fee_cents: 199,
  image_emoji: '🍕',
  is_open: true,
  tags: ['Pizza', 'Canonical'],
  menu: [{
    id: 'server-pie',
    name: 'Server Pie',
    description: 'Price and options come from the API fixture.',
    price_cents: 1200,
    image_emoji: '🍕',
    popular: true,
    available: true,
    modifier_groups: [{
      id: 'size',
      name: 'Size',
      type: 'single',
      required: true,
      min_selected: 1,
      max_selected: 1,
      default_option_id: 'small',
      options: [
        { id: 'small', name: 'Small', price_delta_cents: 0, available: true },
        { id: 'large', name: 'Large', price_delta_cents: 300, available: true },
      ],
    }],
  }],
};

type ApiCartLine = {
  id: string;
  restaurant_id: string;
  menu_item_id: string;
  name: string;
  base_price_cents: number;
  quantity: number;
  modifiers: Array<{ group_id: string; option_ids: string[] }>;
  special_instructions?: string;
};

type Harness = {
  failNextSave: boolean;
  conflictNextSave: boolean;
  requests: string[];
  cart: { schema_version: 1; revision: number; items: ApiCartLine[] };
};

function canonicalizeCartLine(input: Record<string, any>): ApiCartLine {
  return {
    id: input.id,
    restaurant_id: input.restaurant_id,
    menu_item_id: input.menu_item_id,
    name: 'Server Pie',
    base_price_cents: 1200,
    quantity: input.quantity,
    modifiers: input.modifiers ?? [],
    ...(input.special_instructions ? { special_instructions: input.special_instructions } : {}),
  };
}

async function fulfillJson(route: Route, json: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

async function installApiHarness(page: Page, initialCart?: Harness['cart']): Promise<Harness> {
  const harness: Harness = {
    failNextSave: false,
    conflictNextSave: false,
    requests: [],
    cart: initialCart ?? { schema_version: 1, revision: 0, items: [] },
  };

  await page.route('**/api/orderly/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    harness.requests.push(`${request.method()} ${url.pathname}`);

    if (url.pathname === '/api/orderly/session' && request.method() === 'POST') {
      await fulfillJson(route, { schema_version: 1, expires_at: '2030-01-31T00:00:00Z' });
      return;
    }

    if (url.pathname === '/api/orderly/restaurants' && request.method() === 'GET') {
      await fulfillJson(route, [canonicalRestaurant]);
      return;
    }

    if (url.pathname === '/api/orderly/restaurants/canonical-cafe' && request.method() === 'GET') {
      await fulfillJson(route, canonicalRestaurant);
      return;
    }

    if (url.pathname === '/api/orderly/cart' && request.method() === 'GET') {
      await fulfillJson(route, harness.cart);
      return;
    }

    if (url.pathname === '/api/orderly/cart' && request.method() === 'PUT') {
      const payload = JSON.parse(request.postData() ?? '{}');

      if (harness.failNextSave) {
        harness.failNextSave = false;
        await fulfillJson(route, {
          error: { code: 'storage_unavailable', message: 'Cart storage is unavailable', request_id: 'e2e-save-failure', fields: [] },
        }, 503);
        return;
      }

      if (harness.conflictNextSave) {
        harness.conflictNextSave = false;
        harness.cart = { ...harness.cart, revision: harness.cart.revision + 1 };
        await fulfillJson(route, {
          error: { code: 'cart_conflict', message: 'Basket changed in another tab', request_id: 'e2e-conflict', fields: [] },
          current_cart: harness.cart,
        }, 409);
        return;
      }

      if (payload.expected_revision !== harness.cart.revision) {
        await fulfillJson(route, {
          error: { code: 'cart_conflict', message: 'Basket changed in another tab', request_id: 'e2e-stale', fields: [] },
          current_cart: harness.cart,
        }, 409);
        return;
      }

      harness.cart = {
        schema_version: 1,
        revision: harness.cart.revision + 1,
        items: (payload.items ?? []).map(canonicalizeCartLine),
      };
      await fulfillJson(route, harness.cart);
      return;
    }

    if (url.pathname === '/api/orderly/cart' && request.method() === 'DELETE') {
      const payload = JSON.parse(request.postData() ?? '{}');
      if (payload.expected_revision !== harness.cart.revision) {
        await fulfillJson(route, {
          error: { code: 'cart_conflict', message: 'Basket changed in another tab', request_id: 'e2e-delete-stale', fields: [] },
          current_cart: harness.cart,
        }, 409);
        return;
      }
      harness.cart = { schema_version: 1, revision: harness.cart.revision + 1, items: [] };
      await fulfillJson(route, harness.cart);
      return;
    }

    await fulfillJson(route, { error: { code: 'not_found', message: 'Not found', request_id: 'e2e-404', fields: [] } }, 404);
  });

  return harness;
}

function initialServerCart(): Harness['cart'] {
  return {
    schema_version: 1,
    revision: 1,
    items: [{
      id: 'line-1',
      restaurant_id: 'canonical-cafe',
      menu_item_id: 'server-pie',
      name: 'Server Pie',
      base_price_cents: 1200,
      quantity: 1,
      modifiers: [{ group_id: 'size', option_ids: ['small'] }],
    }],
  };
}

test('API discovery, customization, add, edit, and reload use canonical prices', async ({ page }) => {
  const harness = await installApiHarness(page);

  await page.goto('/restaurants');
  await expect(page.getByRole('heading', { name: 'Canonical Cafe' })).toBeVisible();
  await page.getByRole('link', { name: /canonical cafe/i }).click();
  await expect(page.getByRole('heading', { name: 'Canonical Cafe' })).toBeVisible();
  await page.getByRole('link', { name: /server pie/i }).click();
  await page.getByLabel('Large').check();
  await page.getByRole('button', { name: /add to cart/i }).click();

  const cartLine = page.locator('.cart-line.detailed').filter({ hasText: 'Server Pie' });

  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByText('Server Pie', { exact: true })).toBeVisible();
  await expect(cartLine.getByText('$15.00', { exact: true })).toBeVisible();
  await expect(page.getByText('$16.99', { exact: true })).toBeVisible();
  await expect(page.getByText(/basket revision 1/i)).toBeVisible();

  await page.getByRole('button', { name: '+', exact: true }).click();
  await expect(page.getByText(/basket revision 2/i)).toBeVisible();
  await expect(cartLine.getByText('$30.00', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(/basket revision 2/i)).toBeVisible();
  await expect(page.locator('.cart-line.detailed').filter({ hasText: 'Server Pie' }).getByText('$30.00', { exact: true })).toBeVisible();
  expect(harness.cart.revision).toBe(2);
  expect(harness.cart.items[0].quantity).toBe(2);
});

test('real backend catalog and revisioned cart accept, persist, and edit canonical basket data', async ({ page }) => {
  await page.goto('/restaurants/marios-pizza');
  await expect(page.getByRole('heading', { name: /mario's pizza lab/i })).toBeVisible();
  await page.getByRole('link', { name: /pepperoni feast/i }).click();
  await page.getByLabel(/large/i).check();
  await page.getByLabel(/jalapeños/i).check();
  await page.getByRole('button', { name: /add to cart/i }).click();

  await expect(page).toHaveURL(/\/cart/);
  const cartLine = page.locator('.cart-line.detailed').filter({ hasText: 'Pepperoni Feast' });
  await expect(page.getByText(/basket revision 1/i)).toBeVisible();
  await expect(cartLine.getByText('$21.99', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(/basket revision 1/i)).toBeVisible();
  await expect(page.locator('.cart-line.detailed').filter({ hasText: 'Pepperoni Feast' }).getByText('$21.99', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '+', exact: true }).click();
  await expect(page.getByText(/basket revision 2/i)).toBeVisible();
  await expect(page.locator('.cart-line.detailed').filter({ hasText: 'Pepperoni Feast' }).getByText('$43.98', { exact: true })).toBeVisible();
});

test('failed save leaves the last accepted basket visible and keeps intent separately', async ({ page }) => {
  const harness = await installApiHarness(page, initialServerCart());
  harness.failNextSave = true;

  await page.goto('/cart');
  await expect(page.getByText(/basket revision 1/i)).toBeVisible();
  await page.getByRole('button', { name: '+', exact: true }).click();

  await expect(page.getByText(/basket change not accepted/i)).toBeVisible();
  await expect(page.getByText(/cart storage is unavailable/i)).toBeVisible();
  await expect(page.getByText(/failed change is saved as an api draft/i)).toBeVisible();
  await expect(page.getByText(/basket revision 1/i)).toBeVisible();
  expect(harness.cart.items[0].quantity).toBe(1);
});

test('two-tab style conflict shows current server basket and requires explicit reapply', async ({ page }) => {
  const harness = await installApiHarness(page, initialServerCart());
  harness.conflictNextSave = true;

  await page.goto('/cart');
  await page.getByRole('button', { name: '+', exact: true }).click();

  await expect(page.getByText(/basket changed in another tab/i).first()).toBeVisible();
  await expect(page.getByText(/basket revision 2/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /reapply my change/i })).toBeVisible();

  await page.getByRole('button', { name: /reapply my change/i }).click();
  await expect(page.getByText(/basket revision 3/i)).toBeVisible();
  await expect(page.locator('.cart-line.detailed').filter({ hasText: 'Server Pie' }).getByText('$24.00', { exact: true })).toBeVisible();
  expect(harness.cart.items[0].quantity).toBe(2);
});

test('API failure never activates fixture discovery', async ({ page }) => {
  await page.route('**/api/orderly/restaurants', async route => {
    await fulfillJson(route, {
      error: { code: 'storage_unavailable', message: 'Catalog API is unavailable', request_id: 'e2e-catalog-failure', fields: [] },
    }, 503);
  });

  await page.goto('/restaurants');
  await expect(page.getByRole('heading', { name: /discovery temporarily unavailable/i })).toBeVisible();
  await expect(page.getByText(/catalog api is unavailable/i)).toBeVisible();
  await expect(page.getByText(/mario's pizza lab/i)).toHaveCount(0);
});

test('explicit local_demo makes zero API requests and keeps checkout unavailable', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ORDERLY_DATA_MODE !== 'local_demo', 'Run with NEXT_PUBLIC_ORDERLY_DATA_MODE=local_demo to exercise the explicit preview build.');

  const apiRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/orderly')) apiRequests.push(request.url());
  });

  await page.goto('/restaurants');
  await expect(page.getByText(/local fixture preview/i).first()).toBeVisible();
  await page.getByRole('link', { name: /mario's pizza lab/i }).first().click();
  await page.getByRole('link', { name: /pepperoni feast/i }).click();

  const radios = page.getByRole('radio');
  for (let index = 0; index < await radios.count(); index += 1) {
    if (await radios.nth(index).isEnabled()) await radios.nth(index).check();
  }
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByText(/checkout unavailable in fixture preview/i)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/pepperoni feast/i).first()).toBeVisible();
  expect(apiRequests).toEqual([]);
});
