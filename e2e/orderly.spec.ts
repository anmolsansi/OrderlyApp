import { expect, test } from '@playwright/test';

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
  await page.goto('/restaurants/marios-pizza');
  await page.getByRole('link', { name: /pepperoni feast/i }).click();
  await expect(page).toHaveURL(/\/restaurants\/marios-pizza\/items\/pepperoni-feast/);
  await expect(page.getByRole('heading', { name: /pepperoni feast/i })).toBeVisible();
  await page.getByLabel(/large/i).check();
  await page.getByLabel(/jalapeños/i).check();
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByRole('heading', { name: /your cart/i })).toBeVisible();
  await page.getByRole('link', { name: /continue to checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByText(/mock visa/i)).toBeVisible();
  await page.getByRole('link', { name: /sign in/i }).click();
  await page.getByRole('button', { name: /continue as jamie demo/i }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByRole('button', { name: /place order/i }).click();
  await expect(page).toHaveURL(/\/order-confirmation\?orderId=/);
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /mock receipt details/i })).toBeVisible();
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
