import { expect, test } from '@playwright/test';

async function mockBackendCartAndOrders(page: import('@playwright/test').Page) {
  let backendCart: any[] = [];
  const backendOrders: Record<string, any> = {};

  await page.route('**', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.match(/^\/sessions\/[^/]+\/cart$/)) {
      if (request.method() === 'GET') {
        await route.fulfill({ json: { session_id: 'session-e2e', items: backendCart, updated_at: new Date().toISOString() } });
        return;
      }
      if (request.method() === 'PUT') {
        backendCart = JSON.parse(request.postData() ?? '{"items":[]}').items;
        await route.fulfill({ json: { session_id: 'session-e2e', items: backendCart, updated_at: new Date().toISOString() } });
        return;
      }
      if (request.method() === 'DELETE') {
        backendCart = [];
        await route.fulfill({ json: { session_id: 'session-e2e', items: backendCart, updated_at: new Date().toISOString() } });
        return;
      }
    }

    if (url.pathname === '/orders' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}');
      const order = {
        id: 'ORD-BACKEND',
        session_id: payload.session_id,
        cart_items: payload.cart_items,
        subtotal_cents: payload.subtotal_cents,
        status: 'Placed',
        created_at: new Date().toISOString(),
      };
      backendOrders[order.id] = order;
      backendCart = [];
      await route.fulfill({ status: 201, json: order });
      return;
    }

    if (url.pathname === '/orders' && request.method() === 'GET') {
      await route.fulfill({ json: Object.values(backendOrders) });
      return;
    }

    const orderMatch = url.pathname.match(/^\/orders\/([^/]+)$/);
    if (orderMatch && request.method() === 'GET') {
      const order = backendOrders[orderMatch[1]];
      await route.fulfill(order ? { json: order } : { status: 404, json: { error: { code: 'not_found', message: 'Order not found' } } });
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
  await expect(page.getByText(/mock visa/i)).toBeVisible();
  await page.getByRole('complementary').getByRole('link', { name: /^sign in$/i }).click();
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByRole('button', { name: /place order/i }).click();
  await expect(page).toHaveURL(/\/order-confirmation\?orderId=ORD-BACKEND/);
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /mock receipt details/i })).toBeVisible();
  await page.reload();
  await expect(page.getByText('ORD-BACKEND', { exact: true })).toBeVisible();
});

test('supports local signup, signout, and returning sign in', async ({ page }) => {
  await page.goto('/sign-in?next=%2Faccount');
  await page.getByRole('button', { name: /^sign up$/i }).click();
  await page.getByLabel('Name').fill('Riley Local');
  await page.getByLabel('Email').fill('riley.local@example.com');
  await page.getByLabel('Phone').fill('+1-555-0199');
  await page.getByLabel('Password').fill('password-1');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.locator('input[value="Riley Local"]')).toBeVisible();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page.getByRole('heading', { name: /sign in required/i })).toBeVisible();

  await page.getByRole('link', { name: /^sign in$/i }).click();
  await page.getByLabel('Email').fill('riley.local@example.com');
  await page.getByLabel('Password').fill('password-1');
  await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/account/);
  await expect(page.locator('input[value="Riley Local"]')).toBeVisible();
});

test('restaurant filters open the list page and checkout is disabled when empty', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /top rated/i }).click();
  await expect(page).toHaveURL(/filter=Top\+rated|filter=Top%20rated/);
  await expect(page.getByRole('heading', { name: /pizza restaurants near you/i })).toBeVisible();
  await page.goto('/checkout');
  await expect(page.getByText(/your cart is empty/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /place order/i })).toBeDisabled();
});

test('restaurant discovery shows sort, no-results, and error states', async ({ page }) => {
  await page.goto('/restaurants');
  await page.getByLabel(/sort restaurants/i).selectOption('rating');
  await page.getByRole('button', { name: /apply/i }).click();
  await expect(page).toHaveURL(/sort=rating/);
  await expect(page.getByText(/sorted by highest rating/i)).toBeVisible();

  await page.goto('/restaurants?query=no-match&filter=All%20pizza');
  await expect(page.getByRole('heading', { name: /no restaurants found/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /clear filters/i })).toBeVisible();

  await page.goto('/restaurants?state=error');
  await expect(page.locator('.discovery-state-card[role="alert"]')).toContainText(/temporarily unavailable/i);
  await expect(page.getByRole('link', { name: /retry/i })).toBeVisible();
});
