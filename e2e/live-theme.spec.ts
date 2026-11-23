import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const THEME_KEY = 'orderlyapp.theme.v1';

function toggle(page: Page) {
  return page.getByRole('button', { name: /^switch to (dark|light) mode$/i });
}

async function expectTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.getByRole('button', { name: `Switch to ${theme === 'light' ? 'dark' : 'light'} mode` })).toBeVisible();
}

test('fresh browser starts light, switch persists both directions', async ({ page }) => {
  await page.goto('/sign-in');
  await expectTheme(page, 'light');
  await toggle(page).click();
  await expectTheme(page, 'dark');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('dark');
  await page.reload();
  await expectTheme(page, 'dark');
  await toggle(page).click();
  await expectTheme(page, 'light');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('light');
});

test('saved dark applies before hydration or any external scripts load', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, 'dark'), THEME_KEY);
  await page.route('**/*', route => route.request().resourceType() === 'script' ? route.abort() : route.continue());
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
});

test('unknown stored preference cannot select a third theme', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, 'system'), THEME_KEY);
  await page.goto('/sign-in');
  await expectTheme(page, 'light');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('system');
  await toggle(page).click();
  await expectTheme(page, 'dark');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('dark');
});

test('a denied localStorage property never prevents manual theme changes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('Synthetic security denial'); },
    });
  });
  await page.goto('/sign-in');
  await expectTheme(page, 'light');
  await toggle(page).click();
  await expectTheme(page, 'dark');
  await toggle(page).click();
  await expectTheme(page, 'light');
});

test('a denied theme read falls back to light while writes can still succeed', async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (name: string) {
      if (name === key) throw new Error('Synthetic theme read denial');
      return original.call(this, name);
    };
  }, THEME_KEY);
  await page.goto('/sign-in');
  await expectTheme(page, 'light');
  await toggle(page).click();
  await expectTheme(page, 'dark');
});
