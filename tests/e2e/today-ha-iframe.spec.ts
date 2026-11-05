import { expect, test, type Page } from '@playwright/test';

// HA `embed_iframe` harness: production entry in an iframe, fake hass + WS connection in the
// parent realm (apps/panel/ha-iframe.html). Synthetic day of MOCK_NOW (2026-10-31 Praha).
const NOW = new Date('2026-10-31T10:40:00+01:00');

async function openHarness(page: Page, search = '') {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/ha-iframe.html${search}`);
  await expect(page.locator('html[data-ready="true"]')).toHaveCount(1);
  const panel = page.frameLocator('iframe');
  // The iframe loads the full production entry; a cold dev server needs more than 5 s.
  await expect(panel.getByTestId('today')).toBeVisible({ timeout: 20_000 });
  return panel;
}

test.describe('Dnes v HA iframe – živý adaptér', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'stačí desktop a mobil');
  });

  test('teplota stanice, HA připojeno, slunce a události kalendáře', async ({ page }, testInfo) => {
    const panel = await openHarness(page);
    const temp = panel.getByTestId('today-temp');
    await expect(temp).toContainText('7,8');
    await expect(panel.getByText('Počasí není k dispozici')).toHaveCount(0);
    await expect(panel.getByTestId('ha-freshness')).toContainText('HA · před');
    await expect(panel.getByTestId('ribbon-card')).toContainText('východ 06:58');
    await expect(panel.getByTestId('ribbon-card')).toContainText('západ 16:47');
    // Family/school calendars: today's upcoming events, title + time only.
    await expect(
      panel.locator('[data-testid="ribbon-marker"][title="15:30 Kroužek keramiky"]'),
    ).toHaveCount(1);
    await expect(
      panel.locator('[data-testid="ribbon-marker"][title="18:00 Večeře u babičky"]'),
    ).toHaveCount(1);
    const agenda = panel.getByTestId('agenda-item');
    await expect(agenda).toHaveText(['15:30Kroužek keramiky', '18:00Večeře u babičky']);
    await expect(agenda.first()).toBeVisible();
    // Finished events (7:30 breakfast) stay off the ribbon.
    await expect(panel.locator('[data-testid="ribbon-marker"][title*="Snídaně"]')).toHaveCount(0);
    await expect(panel.locator('.hb-ribbon-cheap')).not.toHaveCount(0);
    const dir = process.env.HB_SHOTS_DIR;
    if (dir) await page.screenshot({ path: `${dir}/today-iframe-${testInfo.project.name}.png` });
  });

  test('výpadek WS ukáže „odpojeno“, po reconnectu zpět připojeno', async ({ page }) => {
    const panel = await openHarness(page);
    const pill = panel.getByTestId('ha-freshness');
    await expect(pill).toContainText('HA · před');
    await page.evaluate(() => window.__hbHarness!.disconnect());
    await expect(pill).toContainText('HA · odpojeno');
    // Measured values stay visible (last known), only the HA state changes.
    await expect(panel.getByTestId('today-temp')).toContainText('7,8');
    await page.evaluate(() => window.__hbHarness!.reconnect());
    await expect(pill).toContainText('HA · před');
    await expect(pill).not.toContainText('odpojeno');
  });
});

declare global {
  interface Window {
    __hbHarness?: { disconnect: () => void; reconnect: () => void };
  }
}
