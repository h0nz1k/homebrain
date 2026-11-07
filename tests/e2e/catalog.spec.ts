import { expect, test } from '@playwright/test';

// Živý katalog komponent (apps/panel/catalog.html) – jen dev, ale musí se vykreslit bez chyb.
test('katalog: všechny sdílené prvky, tokeny a oznámení naživo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/catalog.html');
  await expect(page.getByRole('heading', { name: 'Katalog prvků a komponent' })).toBeVisible();
  const components = page.getByTestId('cat-component');
  expect(await components.count()).toBeGreaterThanOrEqual(13);
  for (const name of [
    'Toast',
    'SaveState',
    'Card',
    'Pill',
    'Sparkline',
    'ErrorState',
    'Skeleton',
    'ConfirmDialog',
  ]) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  // Tokeny se čtou z computed style v obou tématech.
  const value = page.locator('#colors .cat-pane[data-theme="dark"] .cat-val').first();
  await expect(value).not.toHaveText('—');
  await page.getByTestId('cat-toast-stack').click();
  await expect(page.locator('.cat-toaster [data-testid="hb-toast"]')).toHaveCount(3);
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect(errors).toEqual([]);
});
