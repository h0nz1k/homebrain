/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/** Dnes „Maso v troubě“ (MEATER probes) – synthetic dev probes via `?maso=1|2|4`. */
async function open(page: Page, query: string) {
  await page.goto(`/homebrain-dnes?${query}`);
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function noHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    w: innerWidth,
    outside: Array.from(document.querySelectorAll('.today-cooking *'))
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5)
      .map((el) => el.className),
  }));
  expect(result.scrollW).toBe(result.w);
  expect(result.outside).toEqual([]);
}

test.describe('Dnes – Maso v troubě', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop' && testInfo.project.name !== 'mobile-s21',
      'běží v projektech desktop a mobile-s21',
    );
  });

  test('bez aktivního pečení se karta nezobrazí', async ({ page }) => {
    await open(page, 'state=a');
    await expect(page.getByTestId('today-hero')).toBeVisible();
    await expect(page.getByTestId('today-cooking')).toHaveCount(0);
    await expect(page.getByText('Maso v troubě')).toHaveCount(0);
  });

  test('dvě sondy nahoře na Dnes, „Sundat z tepla“ zvýrazněné', async ({ page }) => {
    await open(page, 'state=a&maso=2');
    const card = page.getByTestId('today-cooking');
    await expect(card).toBeVisible();
    const probes = page.getByTestId('cooking-probe');
    await expect(probes).toHaveCount(2);
    // „Sundat z tepla“ leads, the cooking probe follows.
    await expect(probes.first()).toHaveAttribute('data-alert', 'true');
    await expect(probes.first()).toContainText('Sundat z tepla');
    await expect(probes.nth(1)).toContainText('Vepřová plec');
    await expect(probes.nth(1)).toContainText('Peče se');
    await expect(probes.nth(1)).toContainText('za 12 min');
    await expect(probes.nth(1)).toContainText(/Trouba 162\s°C/);
    // Top of Dnes: above the clock/weather hero.
    const cardBox = (await card.boundingBox())!;
    const heroBox = (await page.getByTestId('today-hero').boundingBox())!;
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(heroBox.y + 1);
    await noHorizontalOverflow(page);
  });

  test('čtyři sondy včetně odhadu času a odpočinku', async ({ page }) => {
    await open(page, 'state=a&maso=4');
    await expect(page.getByTestId('cooking-probe')).toHaveCount(4);
    await expect(page.getByTestId('cooking-probe').nth(2)).toContainText('Sonda 3');
    await expect(page.getByTestId('cooking-probe').nth(2)).toContainText('odhaduje se…');
    await expect(page.getByTestId('cooking-probe').first()).toContainText('Sundat z tepla');
    await expect(page.getByTestId('cooking-probe').nth(3)).toContainText('Odpočívá');
    await noHorizontalOverflow(page);
  });

  for (const role of ['adult', 'child', 'kiosk'] as const) {
    test(`role ${role} kartu vidí (jen čtení)`, async ({ page }) => {
      await open(page, `state=a&maso=1&role=${role}`);
      await expect(page.getByTestId('today-cooking')).toBeVisible();
      await expect(page.getByTestId('today-cooking').getByRole('button')).toHaveCount(0);
    });
  }

  test('omezený pohyb: pulz „Sundat z tepla“ neběží', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'state=a&maso=2');
    await expect(page.getByTestId('cooking-probe').first()).toHaveAttribute('data-alert', 'true');
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              (a as CSSAnimation).animationName === 'today-cooking-pulse',
          ).length,
    );
    expect(running).toBe(0);
  });
});

test.describe('kiosk 1280×800 – Maso v troubě', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'kiosk běží v projektu desktop');
  });

  /** Same rule as today-kiosk.spec.ts: no scroll, nothing under the bottom edge. */
  async function assertFits(page: Page) {
    const result = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      w: innerWidth,
      h: innerHeight,
      clipped: Array.from(document.querySelectorAll('.today-content *'))
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.bottom > innerHeight || box.right > innerWidth;
        })
        .map((el) => el.className),
    }));
    expect(result.scrollW).toBe(result.w);
    expect(result.scrollH).toBeLessThanOrEqual(result.h);
    expect(result.clipped).toEqual([]);
  }

  async function minFontPx(page: Page) {
    return page.evaluate(() =>
      Math.min(
        ...Array.from(document.querySelectorAll('.today-content *'))
          .filter((el) => el.getClientRects().length > 0)
          .filter((el) =>
            Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim()),
          )
          .map((el) => parseFloat(getComputedStyle(el).fontSize)),
      ),
    );
  }

  for (const [state, maso] of [
    ['a', '1'],
    ['a', '2'],
    ['b', '2'],
    ['a', '4'],
    ['b', '4'],
  ] as const) {
    test(`stav ${state}, ${maso} sond – vejde se a čte se z dálky`, async ({ page }) => {
      await open(page, `kiosk=1&state=${state}&maso=${maso}&role=kiosk`);
      await expect(page.getByTestId('cooking-probe')).toHaveCount(Number(maso));
      await assertFits(page);
      expect(await minFontPx(page)).toBeGreaterThanOrEqual(16);
      const big = await page
        .getByTestId('cooking-internal')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(big).toBeGreaterThanOrEqual(48);
    });
  }

  test('kritická výstraha má přednost – karta se skryje', async ({ page }) => {
    await open(page, 'kiosk=1&state=c&maso=2&role=kiosk');
    await expect(page.getByTestId('today')).toHaveAttribute('data-state-severity', 'critical');
    await expect(page.getByTestId('today-cooking')).toHaveCount(0);
    await assertFits(page);
  });
});
