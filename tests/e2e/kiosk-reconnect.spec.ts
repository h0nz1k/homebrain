import { expect, test, type Page } from '@playwright/test';

// Wall tablet resilience (ADR-0002 §7, backlog #8): production entry in the HA iframe harness,
// mounted as the kiosk panel. Synthetic day of MOCK_NOW (2026-10-31 Praha).
const NOW = new Date('2026-10-31T10:40:00+01:00');

async function openKiosk(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/ha-iframe.html${search}`);
  await expect(page.locator('html[data-ready="true"]')).toHaveCount(1);
  const panel = page.frameLocator('iframe');
  await expect(panel.locator('.hb-shell[data-kiosk="true"]')).toHaveCount(1, { timeout: 20_000 });
  await expect(panel.getByTestId('today')).toBeVisible({ timeout: 20_000 });
  return panel;
}

test.describe('Kiosk – odolnost tabletu', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'stačí desktop a mobil');
  });

  test('restart HA: překryv „spojení přerušeno“, automatické pokusy, návrat bez reloadu', async ({
    page,
  }) => {
    const panel = await openKiosk(page, '?kiosk=1&admin=0');
    // A marker in the iframe document survives only if the page is NOT reloaded.
    await page.frames()[1]!.evaluate(() => {
      (window as Window & { __noReload?: boolean }).__noReload = true;
    });
    const overlay = panel.getByTestId('kiosk-reconnect');
    await expect(overlay).toHaveCount(0);

    await page.evaluate(() => window.__hbHarness!.disconnect());
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(
      panel.getByRole('alertdialog', { name: 'Spojení s Home Assistantem se přerušilo' }),
    ).toBeVisible();
    // The kiosk retries on its own (first attempt after 2 s grace + 2 s backoff).
    await expect
      .poll(() => page.evaluate(() => window.__hbHarness!.reconnectCalls()), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(panel.getByTestId('kiosk-reconnect-status')).toContainText('pokus');
    const dir = process.env.HB_SHOTS_DIR;
    if (dir)
      await page.screenshot({ path: `${dir}/kiosk-reconnect-${test.info().project.name}.png` });

    await page.evaluate(() => window.__hbHarness!.reconnect());
    await expect(overlay).toHaveCount(0);
    await expect(panel.getByTestId('today')).toBeVisible();
    await expect(panel.getByTestId('today-temp')).toContainText('7,8');
    expect(
      await page
        .frames()[1]!
        .evaluate(() => (window as Window & { __noReload?: boolean }).__noReload === true),
    ).toBe(true);
  });

  test('krátký výpadek (< 2 s) překryv vůbec neukáže', async ({ page }) => {
    const panel = await openKiosk(page, '?kiosk=1&admin=0');
    await page.evaluate(() => window.__hbHarness!.disconnect());
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__hbHarness!.reconnect());
    await page.waitForTimeout(2_500);
    await expect(panel.getByTestId('kiosk-reconnect')).toHaveCount(0);
  });

  test('kiosk otevřený administrátorem ukáže varování, ne-admin kiosk ne', async ({ page }) => {
    let panel = await openKiosk(page, '?kiosk=1');
    await expect(panel.getByTestId('kiosk-admin-warning')).toContainText(
      'Kiosk je přihlášen jako administrátor',
    );
    panel = await openKiosk(page, '?kiosk=1&admin=0');
    await expect(panel.getByTestId('today')).toBeVisible();
    await expect(panel.getByTestId('kiosk-admin-warning')).toHaveCount(0);
  });
});
