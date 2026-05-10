import { expect, test } from '@playwright/test';

test('loads restaurants and adds a customized item to cart', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /order pizza with your voice/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /mario's pizza lab/i })).toBeVisible();
  await expect(page.getByText(/restaurants seeded/i)).toBeVisible();
  await page.getByRole('button', { name: /pepperoni feast/i }).click();
  await expect(page.locator('.customizer-card h2')).toHaveText(/pepperoni feast/i);
  await page.getByLabel(/large/i).check();
  await page.getByLabel(/jalapeños/i).check();
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page.getByRole('status')).toContainText(/added pepperoni feast/i);
  await expect(page.getByRole('heading', { name: /current order/i })).toBeVisible();
});

test('typed voice command adds item and checkout creates order status', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/try a command/i).fill('add a large pepperoni pizza with jalapeños and extra cheese');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText(/intent: add_to_cart/i)).toBeVisible();
  await page.getByRole('button', { name: /continue to mock checkout/i }).click();
  await expect(page.getByRole('dialog', { name: /confirm your order/i })).toBeVisible();
  await page.getByRole('button', { name: /place mock order/i }).click();
  await expect(page.getByRole('status')).toContainText(/mock order/i);
  await expect(page.getByText(/order placed/i).last()).toBeVisible();
});

test('restaurant-only voice command selects restaurant without adding a default pizza', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/try a command/i).fill('I want to order pizza from Chicago square cut');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText(/intent: select_restaurant/i)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /chicago square cut/i })).toBeVisible();
  await expect(page.locator('.transcript')).toContainText(/showing chicago square cut/i);
  await expect(page.getByText(/your cart is empty/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /continue to mock checkout/i })).toBeDisabled();
});
