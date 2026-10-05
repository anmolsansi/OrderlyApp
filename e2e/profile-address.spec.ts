import { expect, test, type Page } from '@playwright/test';

const DEMO_PROFILE_STORAGE_KEY = 'orderlyapp.marketplace.demoProfile.v1';
const UNRELATED_STORAGE_KEY = 'orderlyapp.st10.unrelated-proof';

async function chooseDemoProfile(page: Page): Promise<void> {
  const submit = page.getByRole('button', { name: /use demo profile|save profile and continue/i });
  await expect(submit).toBeVisible();
  await submit.click();
}

async function prepareApiCart(page: Page): Promise<void> {
  await page.goto('/sign-in?next=%2Frestaurants%2Fmarios-pizza');
  await page.getByLabel('Demo name').fill('ST-10 Demo');
  await page.locator('input[name="demo-address"][value="demo-address-2"]').check();
  await chooseDemoProfile(page);
  await expect(page).toHaveURL(/\/restaurants\/marios-pizza/);

  await page.getByRole('link', { name: /pepperoni feast/i }).click();
  await page.getByLabel(/large/i).check();
  await page.getByLabel(/jalapeños/i).check();
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByRole('link', { name: /continue to checkout/i })).toBeEnabled();
}

async function prepareApiCheckout(page: Page): Promise<void> {
  await prepareApiCart(page);
  await page.getByRole('link', { name: /continue to checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByRole('button', { name: /place mock order/i })).toBeEnabled();
}

for (const destination of ['/sign-in', '/account', '/checkout']) {
  test(`denied localStorage getter recovers on ${destination}`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));
    if (destination === '/checkout') await prepareApiCart(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('Synthetic getter block', 'SecurityError'); },
      });
    });
    await page.goto(destination);
    await expect(page.getByText('Demo profile storage is unavailable', { exact: true })).toBeVisible();
    if (destination === '/sign-in') {
      await expect(page.getByRole('button', { name: /continue without saving/i })).toBeVisible();
    } else {
      await page.getByRole('button', { name: /use temporary demo profile/i }).click();
      if (destination === '/checkout') {
        await expect(page.getByRole('button', { name: /place mock order/i })).toBeEnabled();
        await page.getByRole('button', { name: /place mock order/i }).click();
        await expect(page).toHaveURL(/\/order-confirmation\?orderId=/);
        await expect(page.getByText('100 Demo Street', { exact: false })).toBeVisible();
      } else {
        await expect(page.getByText('Temporary demo profile', { exact: true })).toBeVisible();
      }
    }
    expect(pageErrors).toEqual([]);
  });
}

test('denied sessionStorage getter blocks new checkout without sending an order', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await prepareApiCheckout(page);
  let submittedOrders = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/orderly/orders') submittedOrders += 1;
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new DOMException('Synthetic recovery getter block', 'SecurityError'); },
    });
  });
  await page.reload();
  await expect(page.getByText(/enable browser storage and reload before submitting/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /place mock order/i })).toBeDisabled();
  await page.locator('#checkout-form').evaluate(form => (form as HTMLFormElement).requestSubmit());
  expect(submittedOrders).toBe(0);
  await expect(page).toHaveURL(/\/checkout$/);
  expect(pageErrors).toEqual([]);
});

test('sessionStorage access denied after load rejects submission before the API call', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await prepareApiCheckout(page);
  let submittedOrders = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/orderly/orders') submittedOrders += 1;
  });
  await page.evaluate(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new DOMException('Synthetic late recovery getter block', 'SecurityError'); },
    });
  });
  await page.getByRole('button', { name: /place mock order/i }).click();
  await expect(page.getByText('Checkout recovery storage is unavailable. No order was submitted.', { exact: true })).toBeVisible();
  expect(submittedOrders).toBe(0);
  await expect(page).toHaveURL(/\/checkout$/);
  expect(pageErrors).toEqual([]);
});

test('unsafe profile return destinations always fall back inside the app', async ({ page }) => {
  const unsafeDestinations = [
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    '/%2F%2Fevil.example/steal',
    '/restaurants/%2e%2e/account',
  ];

  for (const destination of unsafeDestinations) {
    await page.goto(`/sign-in?next=${encodeURIComponent(destination)}`);
    await chooseDemoProfile(page);
    await expect(page).toHaveURL(/\/account$/);
    expect(new URL(page.url()).pathname).toBe('/account');
  }

  await page.goto(`/sign-in?next=${encodeURIComponent('/checkout')}`);
  await chooseDemoProfile(page);
  await expect(page).toHaveURL(/\/checkout$/);
});

test('corrupt profile data is recoverable and late recovery does not overwrite deliberate checkout input', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await prepareApiCart(page);
  await page.evaluate(({ profileKey, unrelatedKey }) => {
    localStorage.setItem(profileKey, '{bad-json');
    localStorage.setItem(unrelatedKey, 'keep-me');
  }, { profileKey: DEMO_PROFILE_STORAGE_KEY, unrelatedKey: UNRELATED_STORAGE_KEY });

  await page.getByRole('link', { name: /continue to checkout/i }).click();
  await expect(page.getByText('Demo profile is invalid', { exact: true })).toBeVisible();

  const street = page.getByLabel('Delivery address');
  await street.fill('123 Deliberate Lane');
  await page.getByRole('button', { name: /clear local demo data/i }).click();

  await expect(page.getByText(/create a password-free demo profile/i)).toBeVisible();
  await expect(street).toHaveValue('123 Deliberate Lane');
  expect(await page.evaluate(key => localStorage.getItem(key), UNRELATED_STORAGE_KEY)).toBe('keep-me');
  expect(pageErrors).toEqual([]);
});

test('disabled profile storage offers an explicit temporary checkout profile without crashing', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await page.addInitScript(() => {
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key: string): void {
      if (this === window.localStorage && key.startsWith('orderlyapp.marketplace')) {
        throw new DOMException('Synthetic storage block', 'SecurityError');
      }
      originalRemoveItem.call(this, key);
    };
  });

  await page.goto('/checkout');
  await expect(page.getByText('Demo profile storage is unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /use temporary demo profile/i }).click();
  await expect(page.getByText(/temporary synthetic profile is used only for this checkout/i)).toBeVisible();
  await expect(page.getByLabel('Saved synthetic address')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('keyboard and 375px checkout preserve the selected address into the durable receipt', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await prepareApiCheckout(page);

  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(noHorizontalOverflow).toBe(true);

  const addressSelect = page.getByLabel('Saved synthetic address');
  await expect(addressSelect).toHaveValue('demo-address-2');
  await expect(page.getByLabel('Delivery address')).toHaveValue('200 Sample Avenue');

  await addressSelect.focus();
  // Native select type-ahead also works in headless macOS Chromium.
  await page.keyboard.type('Demo home');
  await expect(addressSelect).toHaveValue('demo-address-1');
  await expect(page.getByLabel('Delivery address')).toHaveValue('100 Demo Street');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Name')).toBeFocused();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');

  const placeOrder = page.getByRole('button', { name: /place mock order/i });
  await placeOrder.focus();
  await page.keyboard.press('Enter');

  const summary = page.locator('#checkout-validation-summary');
  await expect(summary).toBeFocused();
  await expect(summary).toContainText('Name is required.');
  await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#checkout-name-error')).toHaveText('Name is required.');

  await page.getByLabel('Name').focus();
  await page.keyboard.type('Keyboard Demo');
  await expect(page.getByLabel('Name')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(placeOrder).toBeEnabled();

  await placeOrder.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/order-confirmation\?orderId=/);
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();
  await expect(page.getByText('100 Demo Street', { exact: false })).toBeVisible();

  await page.reload();
  await expect(page.getByText('100 Demo Street', { exact: false })).toBeVisible();
});
