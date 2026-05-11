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
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByRole('heading', { name: /your cart/i })).toBeVisible();
  await expect(page.getByText(/mock visa/i)).toBeVisible();
  await page.getByRole('button', { name: /place order/i }).click();
  await expect(page).toHaveURL(/\/order-confirmation/);
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();
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
