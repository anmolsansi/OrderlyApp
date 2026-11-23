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

test('denied persistence still toggles within the page but resets after reload', async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key) throw new Error('Synthetic theme write denial');
      return original.call(this, name, value);
    };
  }, THEME_KEY);
  await page.goto('/sign-in');
  await toggle(page).click();
  await expectTheme(page, 'dark');
  await toggle(page).click();
  await expectTheme(page, 'light');
  await toggle(page).click();
  await expectTheme(page, 'dark');
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBeNull();
  await page.reload();
  await expectTheme(page, 'light');
});

test('theme switch preserves an unsaved form node, its value and existing focus', async ({ page }) => {
  await page.goto('/sign-in');
  const name = page.getByLabel('Demo name');
  await name.fill('Unsubmitted draft, do not replace');
  await name.evaluate(element => { element.dataset.themeNode = 'original'; });
  await name.focus();
  // Programmatic activation checks that switching theme itself never steals form focus.
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.live-theme-toggle')?.click());
  await expectTheme(page, 'dark');
  await expect(name).toHaveValue('Unsubmitted draft, do not replace');
  await expect(name).toBeFocused();
  expect(await name.getAttribute('data-theme-node')).toBe('original');
  const button = toggle(page);
  await button.focus();
  await page.keyboard.press('Enter');
  await expectTheme(page, 'light');
  await expect(button).toBeFocused();
  await expect(name).toHaveValue('Unsubmitted draft, do not replace');
  expect(await name.getAttribute('data-theme-node')).toBe('original');
});

test('saved dark restores without a React hydration warning', async ({ page }) => {
  const hydrationWarnings: string[] = [];
  page.on('console', message => {
    if (/hydration|did not match|server rendered html/i.test(message.text())) hydrationWarnings.push(message.text());
  });
  page.on('pageerror', error => {
    if (/hydration|did not match|server rendered html/i.test(error.message)) hydrationWarnings.push(error.message);
  });
  await page.addInitScript(key => localStorage.setItem(key, 'dark'), THEME_KEY);
  await page.goto('/sign-in');
  await expectTheme(page, 'dark');
  await expect(page.getByLabel('Demo name')).toBeVisible();
  expect(hydrationWarnings).toEqual([]);
});
