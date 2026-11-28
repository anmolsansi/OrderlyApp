import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

let browserBundle: string;
const syntheticToken = 'synthetic-token-not-valid-for-auth';

/**
 * Bundle the actual panel and pure model with a runner-only fixture. No Next
 * route, Clerk impersonation, application flag, or test token reaches the API.
 */
test.beforeAll(async () => {
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve(process.cwd(), 'e2e/fixtures/staff-selection-harness.tsx'),
        name: 'StaffSelectionHarness',
        formats: ['iife'],
      },
    },
  });
  const bundles = Array.isArray(result) ? result : [result];
  const chunks = bundles.flatMap((bundle) => {
    if (!('output' in bundle)) throw new Error('Expected an isolated browser bundle');
    return bundle.output.filter((entry) => entry.type === 'chunk');
  });
  if (chunks.length !== 1 || chunks[0].type !== 'chunk') throw new Error('Expected one browser bundle');
  browserBundle = chunks[0].code;
});

async function mount(page: Page, mode = '', theme = 'light') {
  await page.route('**/synthetic-staff-panel', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><main id="staff-harness"></main></body></html>',
  }));
  await page.goto('/synthetic-staff-panel' + mode);
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
  await page.addStyleTag({ content: readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8') });
  await page.addScriptTag({ content: browserBundle });
}

async function assertNoStoredToken(page: Page) {
  expect(await page.evaluate((token) => {
    const storageText = [localStorage, sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? '';
        return [key, storage.getItem(key) ?? ''].join(' ');
      }),
    ).join('');
    return storageText.includes(token) || document.body.innerText.includes(token);
  }, syntheticToken)).toBe(false);
}

test('isolated staff panel keyboard cancellation preserves draft and confirmed switch clears workspace', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page);
  const owner = page.getByRole('button', { name: 'r-one (Owner)' });
  const staff = page.getByRole('button', { name: 'r-two (Order staff)' });
  await expect(owner).toBeVisible();
  expect((await owner.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await owner.focus();
  await page.keyboard.press('Enter');
  const draft = page.getByRole('textbox', { name: 'Draft notes' });
  await draft.fill('unsaved owner draft');
  await staff.focus();
  await page.keyboard.press('Enter');
  const cancel = page.getByRole('button', { name: 'Keep editing' });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(staff).toBeFocused();
  await expect(draft).toHaveValue('unsaved owner draft');
  await page.keyboard.press('Enter');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Discard changes and switch' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(staff).toBeFocused();
  await expect(draft).toHaveValue('');
  await expect(staff).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'r-three (Cashier)' }).click();
  await expect(page.getByRole('button', { name: 'r-three (Cashier)' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Isolated sign-in slot')).toBeVisible();
  await expect(draft).toHaveCount(0);
  await expect(owner).toHaveCount(0);
  await assertNoStoredToken(page);
});

test('isolated unavailable state retries without exposing old data', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(page, '#unavailable', 'dark');
  await expect(page.getByText('Staff access is unavailable. Please try again.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Draft notes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('button', { name: 'r-one (Owner)' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Draft notes' })).toHaveCount(0);
  await assertNoStoredToken(page);
});

for (const [mode, copy] of [
  ['#loading', 'Loading staff access'],
  ['#signed-out', 'Isolated sign-in slot'],
  ['#denied', 'Access denied'],
  ['#empty', 'You have no active restaurant memberships'],
]) {
  test('isolated staff panel ' + mode + ' does not expose a workspace', async ({ page }) => {
    await mount(page, mode);
    await expect(page.getByText(copy, { exact: false })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Allowed restaurants' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Draft notes' })).toHaveCount(0);
    await assertNoStoredToken(page);
  });
}
