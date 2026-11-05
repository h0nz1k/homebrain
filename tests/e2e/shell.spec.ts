import { expect, test } from '@playwright/test';

test('český shell a panel Odpady řízený konfigurací HA', async ({ page }, testInfo) => {
  // Dopoledne v den svozu (po 14:00 se dnešní svoz bere jako vyvezený).
  await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
  await page.goto('/homebrain-dnes');
  await expect(page.getByRole('region', { name: 'Dnes', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toHaveCount(0);
  // HA replaces the config and supplies only the panel-relative route.
  await page.evaluate(() => {
    window.top!.history.pushState(null, '', '/homebrain-odpady');
    window.top!.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  });
  await expect(page.getByText('Každá nádoba má svůj den', { exact: true })).toBeVisible();
  await expect(page.locator('.wb-hero h2')).toHaveText('Papír');
  await expect(page.getByText('Není nastavena vazba na entitu odpadů')).not.toBeVisible();
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Dnes', exact: true })).toBeVisible();
  await testInfo.attach('dnes', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('úzký panel otevírá nabídku HA', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/homebrain-odpady');
  await page.evaluate(() => {
    document.addEventListener('hass-toggle-menu', () => (document.body.dataset.menu = 'open'), {
      once: true,
    });
  });
  await page.getByRole('button', { name: 'Otevřít nabídku' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-menu', 'open');
});

for (const viewport of [
  { width: 360, height: 800 },
  { width: 800, height: 1280 },
  { width: 1440, height: 900 },
]) {
  test(`panel Odpady: kontrola rozložení ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/homebrain-odpady');
    await expect(page.locator('.wb-hero h2')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toHaveCount(0);
    const menu = page.getByRole('button', { name: 'Otevřít nabídku' });
    await expect(menu).toHaveCount(viewport.width <= 600 ? 1 : 0);
    expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await testInfo.attach(`panel-${viewport.width}x${viewport.height}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

test('starý panel přesměruje na Dnes přes navigaci HA', async ({ page }) => {
  await page.goto('/homebrain');
  await expect(page).toHaveURL(/\/homebrain-dnes$/);
  await expect(page.getByRole('region', { name: 'Dnes', exact: true })).toBeVisible();
});
