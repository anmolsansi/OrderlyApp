import { expect, test, type Page } from '@playwright/test';

const PROFILE_KEY = 'orderlyapp.marketplace.demoProfile.v1';

async function saveRealMockOrder(page: Page, name: string): Promise<string> {
  await page.goto('/sign-in?next=%2Frestaurants%2Fmarios-pizza');
  await page.getByLabel('Demo name').fill(name);
  await page.getByRole('button', { name: /use demo profile|save profile and continue/i }).click();
  await page.getByRole('link', { name: /pepperoni feast/i }).click();
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page).toHaveURL(/\/cart/);
  await page.getByRole('link', { name: /continue to checkout/i }).click();
  await expect(page.getByRole('button', { name: /place mock order/i })).toBeEnabled();
  await page.getByRole('button', { name: /place mock order/i }).click();
  await expect(page).toHaveURL(/\/order-confirmation\?orderId=/);
  const id = new URL(page.url()).searchParams.get('orderId');
  expect(id).toBeTruthy();
  return id!;
}

test('profile name and forged local id preserve own receipts and cannot access another guest receipt', async ({ page, context, browser }) => {
  const ownOrder = await saveRealMockOrder(page, 'Guest A Demo');
  const guestBefore = (await context.cookies()).find(cookie => cookie.name === 'orderly_guest');
  expect(guestBefore).toBeTruthy();

  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    const foreignOrder = await saveRealMockOrder(otherPage, 'Guest B Demo');
    await otherPage.evaluate(key => {
      const profile = JSON.parse(localStorage.getItem(key)!);
      profile.id = 'guest-b-display-only';
      localStorage.setItem(key, JSON.stringify(profile));
    }, PROFILE_KEY);

    await page.evaluate(key => {
      const profile = JSON.parse(localStorage.getItem(key)!);
      profile.id = 'guest-b-display-only';
      profile.name = 'Guest B Demo';
      localStorage.setItem(key, JSON.stringify(profile));
    }, PROFILE_KEY);
    await page.goto('/account');
    await expect(page.getByLabel('Display name')).toHaveValue('Guest B Demo');
    await page.getByLabel('Display name').fill('Renamed A Demo');
    await page.getByRole('button', { name: /save display name/i }).click();
    await expect(page.getByRole('status')).toContainText(/demo name saved/i);

    const access = await page.evaluate(async ({ ownOrder, foreignOrder }) => {
      const own = await fetch(`/api/orderly/orders/${ownOrder}`);
      const foreign = await fetch(`/api/orderly/orders/${foreignOrder}`, {
        headers: { 'X-Orderly-Owner': 'guest-b-display-only' },
      });
      const history = await fetch('/api/orderly/orders');
      return {
        ownStatus: own.status,
        ownId: (await own.json()).id,
        foreignStatus: foreign.status,
        ids: (await history.json()).map((order: { id: string }) => order.id),
      };
    }, { ownOrder, foreignOrder });
    expect(access.ownStatus).toBe(200);
    expect(access.ownId).toBe(ownOrder);
    expect(access.foreignStatus).toBe(404);
    expect(access.ids).toContain(ownOrder);
    expect(access.ids).not.toContain(foreignOrder);
    expect((await context.cookies()).find(cookie => cookie.name === 'orderly_guest')?.value).toBe(guestBefore!.value);

    await page.evaluate(() => sessionStorage.setItem('orderlyapp.marketplace.checkoutRecovery.v1', 'synthetic-old-scope'));
    await page.getByRole('button', { name: /start fresh guest session/i }).click();
    await expect(page.getByRole('status')).toContainText(/fresh guest session started/i);
    const resetAccess = await page.evaluate(async orderId => {
      const history = await fetch('/api/orderly/orders');
      const receipt = await fetch(`/api/orderly/orders/${orderId}`);
      return { history: await history.json(), status: receipt.status };
    }, ownOrder);
    expect(resetAccess).toEqual({ history: [], status: 404 });
    expect(await page.evaluate(() => sessionStorage.getItem('orderlyapp.marketplace.checkoutRecovery.v1'))).toBeNull();
    expect((await otherPage.request.get(`/api/orderly/orders/${foreignOrder}`)).status()).toBe(200);
  } finally {
    await otherContext.close();
  }
});

test('browser upgrade removes legacy passwords while retaining unrelated preferences', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('orderlyapp.marketplace.authAccounts.v1', JSON.stringify([{ password: 'synthetic-legacy-secret' }]));
    localStorage.setItem('orderlyapp.marketplace.session.v1', JSON.stringify({ userId: 'legacy-owner' }));
    localStorage.setItem('orderlyapp.marketplace.profile.v1', JSON.stringify({ password: 'synthetic-legacy-secret' }));
    localStorage.setItem('orderlyapp.marketplace.addresses.v1', '[]');
    localStorage.setItem('unrelated.preference', 'keep-me');
  });
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /choose a demo profile/i })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  const snapshot = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])));
  for (const key of ['authAccounts', 'session', 'profile', 'addresses']) {
    expect(snapshot[`orderlyapp.marketplace.${key}.v1`]).toBeUndefined();
  }
  expect(JSON.stringify(snapshot)).not.toContain('synthetic-legacy-secret');
  expect(snapshot['unrelated.preference']).toBe('keep-me');
});

test('blocked checkout recovery cleanup reports that the server guest already rotated', async ({ page, context }) => {
  await page.goto('/sign-in?next=%2Faccount');
  await page.getByRole('button', { name: /use demo profile/i }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.evaluate(async () => { await fetch('/api/orderly/session', { method: 'POST' }); });
  const before = (await context.cookies()).find(cookie => cookie.name === 'orderly_guest');
  expect(before).toBeTruthy();
  await page.evaluate(() => {
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key: string): void {
      if (this === window.sessionStorage && key === 'orderlyapp.marketplace.checkoutRecovery.v1') {
        throw new DOMException('Synthetic recovery cleanup block', 'SecurityError');
      }
      originalRemove.call(this, key);
    };
  });
  await page.getByRole('button', { name: /start fresh guest session/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /fresh guest session started, but old checkout recovery data could not be cleared/i })).toBeVisible();
  expect((await context.cookies()).find(cookie => cookie.name === 'orderly_guest')?.value).not.toBe(before!.value);
  await expect(page.getByRole('button', { name: /start fresh guest session/i })).toBeEnabled();
});

test('receipt gateway preserves bounded pages and rejects foreign cursors', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push(await saveRealMockOrder(page, 'Pagination Demo'));
  const other = await browser.newContext();
  try {
    const foreign = await saveRealMockOrder(await other.newPage(), 'Foreign Pagination Demo');
    const result = await page.evaluate(async foreignId => {
      const first = await fetch('/api/orderly/orders?limit=2&owner_id=forged');
      const a: { id: string }[] = await first.json();
      const second = await fetch(`/api/orderly/orders?limit=2&cursor=${a.at(-1)!.id}`);
      const b: { id: string }[] = await second.json();
      const invalid = await fetch('/api/orderly/orders?limit=51');
      const foreignCursor = await fetch(`/api/orderly/orders?cursor=${foreignId}`);
      const foreignRead = await fetch(`/api/orderly/orders/${foreignId}`);
      return { firstStatus: first.status, secondStatus: second.status,
        a: a.map(r => r.id), b: b.map(r => r.id), invalid: invalid.status,
        foreignCursor: foreignCursor.status, foreignCode: (await foreignCursor.json()).error.code,
        foreignRead: foreignRead.status };
    }, foreign);
    expect(result).toEqual({ firstStatus: 200, secondStatus: 200, a: [ids[2], ids[1]], b: [ids[0]],
      invalid: 422, foreignCursor: 422, foreignCode: 'invalid_cursor', foreignRead: 404 });
  } finally {
    await other.close();
  }
});
