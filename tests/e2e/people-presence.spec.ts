/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * „Kdo je doma“ – synthetic dev household (`?lide=none|home`, default mixed: 4 doma, 2 pryč,
 * 1 nevím… see dev.tsx). Only doma / pryč / nevím, never places or times.
 */
const EXPECTED = [
  'Jan: doma',
  'Mamínka: doma',
  'Adámek: pryč',
  'Valinka: doma',
  'Babi: pryč',
  'Děda: nevím',
];

async function labels(page: Page) {
  return page
    .getByTestId('presence-person')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
}

async function insideViewport(page: Page) {
  const result = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    w: innerWidth,
    outside: Array.from(document.querySelectorAll('.hb-presence *'))
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5)
      .map((el) => el.className),
  }));
  expect(result.scrollW).toBe(result.w);
  expect(result.outside).toEqual([]);
}

test.describe('Kdo je doma', () => {
  test('Dnes: lišta nahoře, stav textem i barvou, živá změna bez reloadu', async ({ page }) => {
    await page.goto('/homebrain-dnes');
    await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 });
    const strip = page.getByTestId('presence');
    await expect(strip).toBeVisible({ timeout: 20_000 });
    await expect(strip).toHaveAttribute('data-size', 'md');
    expect(await labels(page)).toEqual(EXPECTED);
    await expect(page.getByRole('list', { name: 'Kdo je doma' })).toContainText('doma');
    await expect(page.getByRole('list', { name: 'Kdo je doma' })).toContainText('pryč');
    // Above the hero (top strip).
    const stripBox = (await strip.boundingBox())!;
    const heroBox = (await page.getByTestId('today-hero').boundingBox())!;
    expect(stripBox.y).toBeLessThan(heroBox.y);
    // Green vs red status ring.
    const dots = await page
      .locator('.hb-presence-person .hb-presence-avatar')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).outlineColor));
    expect(dots[0]).not.toBe(dots[2]);
    await insideViewport(page);

    await page.evaluate(() =>
      (window as unknown as { __hbPeople: { set(id: string, s: string): void } }).__hbPeople.set(
        'person.adamek',
        'home',
      ),
    );
    await expect(page.getByTestId('presence-person').nth(2)).toHaveAttribute(
      'aria-label',
      'Adámek: doma',
    );
    // Privacy: no places, times or ETA anywhere in the strip.
    await expect(strip).not.toContainText(/Práce|Škola|min|:\d\d/);
  });

  test('bez osob se lišta vůbec nevykreslí', async ({ page }) => {
    await page.goto('/homebrain-dnes?lide=none');
    await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('today-hero')).toBeVisible();
    await expect(page.getByTestId('presence')).toHaveCount(0);
    await page.goto('/homebrain-rodina?lide=none');
    await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('presence')).toHaveCount(0);
  });

  test('Rodina: přehled ukazuje kdo je doma', async ({ page }) => {
    await page.goto('/homebrain-rodina');
    await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('presence')).toBeVisible({ timeout: 20_000 });
    expect(await labels(page)).toEqual(EXPECTED);
    await insideViewport(page);
  });

  test('kiosk: velké čipy v záhlaví, vše se vejde', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Kiosk e2e běží jednou v projektu desktop');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/homebrain-dnes?kiosk=1&state=a');
    await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const strip = page.getByTestId('presence');
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute('data-size', 'lg');
    expect(await labels(page)).toEqual(EXPECTED);
    const sizes = await page
      .locator('.hb-presence-name, .hb-presence-state')
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
    // Landscape kiosk: the row sits under the clock (no extra header row) without touching it.
    const stripBox = (await strip.boundingBox())!;
    const clockBox = (await page.getByTestId('today-clock').boundingBox())!;
    expect(stripBox.y).toBeGreaterThanOrEqual(clockBox.y + clockBox.height);
    // The red 'pryč' ring stays at full strength (no filter/opacity on the avatar).
    const away = await page
      .locator('.hb-presence-person[data-status="away"] .hb-presence-avatar')
      .first()
      .evaluate((el) => ({
        filter: getComputedStyle(el).filter,
        opacity: getComputedStyle(el).opacity,
      }));
    expect(away).toEqual({ filter: 'none', opacity: '1' });
    const fit = await page.evaluate(() => ({
      scrollH: document.documentElement.scrollHeight,
      h: innerHeight,
      clipped: Array.from(document.querySelectorAll('.today-content *'))
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => el.getBoundingClientRect().bottom > innerHeight)
        .map((el) => el.className),
    }));
    expect(fit.scrollH).toBeLessThanOrEqual(fit.h);
    expect(fit.clipped).toEqual([]);
    await insideViewport(page);
  });
});
