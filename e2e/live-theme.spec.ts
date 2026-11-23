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

test('theme header wraps, remains operable at text zoom, and keeps an unsaved draft on resize', async ({ page }) => {
  await page.goto('/sign-in');
  const name = page.getByLabel('Demo name');
  await name.fill('Keep during zoom and resize');
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const button = toggle(page);
    await expect(button).toBeVisible();
    const rect = await button.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    await button.click();
    await expect(name).toHaveValue('Keep during zoom and resize');
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const button = toggle(page);
  await expect(button).toBeVisible();
  const dimensions = await button.evaluate(element => {
    const r = element.getBoundingClientRect();
    return { width: r.width, height: r.height, right: r.right };
  });
  expect(dimensions.width).toBeGreaterThanOrEqual(44);
  expect(dimensions.height).toBeGreaterThanOrEqual(44);
  expect(dimensions.right).toBeLessThanOrEqual(376);
  await expect(name).toHaveValue('Keep during zoom and resize');
});

function contrastRatio(first: string, second: string): number {
  function luminance(color: string): number {
    const values = color.match(/[0-9.]+/g)?.slice(0, 3).map(Number);
    if (!values || values.length !== 3) throw new Error(`Unsupported CSS color: ${color}`);
    const [r, g, b] = values.map(channel => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('approved action, semantic, and link pairs retain readable contrast in both themes', async ({ page }) => {
  await page.goto('/sign-in');
  for (const theme of ['light', 'dark'] as const) {
    await expectTheme(page, theme);
    const colors = await page.evaluate(() => {
      const panel = document.createElement('section');
      panel.className = 'live-task-screen';
      panel.innerHTML = '<div class="live-panel"><button class="live-primary-action">Save order</button><p class="live-status-success">Order confirmed</p><p class="live-status-warning">Order outcome uncertain</p><p class="live-status-error">Could not save</p><a href="/sign-in">Help with order</a></div>';
      document.body.appendChild(panel);
      const color = (selector: string, property: 'color' | 'backgroundColor') => getComputedStyle(panel.querySelector(selector)!).getPropertyValue(property === 'backgroundColor' ? 'background-color' : 'color');
      const result = {
        pageBackground: getComputedStyle(panel).backgroundColor,
        panelBackground: color('.live-panel', 'backgroundColor'),
        buttonBackground: color('.live-primary-action', 'backgroundColor'),
        buttonText: color('.live-primary-action', 'color'),
        success: color('.live-status-success', 'color'),
        warning: color('.live-status-warning', 'color'),
        error: color('.live-status-error', 'color'),
        link: color('a', 'color'),
      };
      panel.remove();
      return result;
    });
    expect(contrastRatio(colors.buttonBackground, colors.buttonText)).toBeGreaterThanOrEqual(4.5);
    for (const textColor of [colors.success, colors.warning, colors.error, colors.link]) {
      expect(contrastRatio(colors.panelBackground, textColor)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(colors.pageBackground, colors.panelBackground)).toBeGreaterThan(1);
    const button = toggle(page);
    expect(await button.evaluate(el => getComputedStyle(el).minHeight)).toBe('44px');
    await button.focus();
    expect(await button.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('3px');
    expect(await button.evaluate(el => getComputedStyle(el).outlineOffset)).toBe('3px');
    await button.click();
  }
});

test('CON-39 synthetic fixture agrees with local theme defaults and rejects invalid enum', async ({ page }) => {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/restaurant-service/v1.json'), 'utf8')) as {
    schema_version: number;
    synthetic: boolean;
    contracts: Record<string, {
      contract: string;
      schema_version: number;
      synthetic: boolean;
      live_provider_verified: boolean;
      positive: { payload: { theme: string; source: string } };
      negative: { name: string; path: string; value: string; expected_status: number }[];
    }>;
  };
  const contract = fixture.contracts['CON-39'];
  expect(fixture.synthetic).toBe(true);
  expect(fixture.schema_version).toBe(1);
  expect(contract.contract).toBe('CON-39');
  expect(contract.schema_version).toBe(1);
  expect(contract.synthetic).toBe(true);
  expect(contract.live_provider_verified).toBe(false);
  expect(contract.positive.payload).toEqual({ theme: 'light', source: 'default' });
  const invalid = contract.negative.find(candidate => candidate.name === 'invalid_enum');
  expect(invalid).toMatchObject({ path: 'theme', expected_status: 422 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_KEY, value: invalid!.value });
  await page.goto('/sign-in');
  await expectTheme(page, 'light');
  // The extra-field 422 fixture belongs to the shared HTTP contract, not this local-only toggle.
  expect(contract.negative.find(candidate => candidate.name === 'unknown_mutation_field')).toMatchObject({ expected_status: 422 });
});
