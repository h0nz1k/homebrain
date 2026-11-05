/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/** Ambient kiosk for the wall tablet (#38): orientation, night, stale data, role-safe content. */
test.describe('Dnes – nástěnný kiosk', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Kiosk e2e běží jednou v projektu desktop');
  });

  test('samostatný panel /homebrain-kiosk vždy zobrazí jen Dnes v kiosku', async ({ page }) => {
    for (const path of ['/homebrain-kiosk', '/homebrain-kiosk/wine']) {
      await page.goto(path);
      await expect(page.getByTestId('today')).toBeVisible();
      await expect(page.locator('.hb-shell')).toHaveAttribute('data-kiosk', 'true');
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expect(page.locator('.hb-topbar')).toHaveCount(0);
    }
  });

  async function open(page: Page, query: string) {
    await page.goto(`/homebrain-dnes?kiosk=1&${query}`);
    await expect(page.getByTestId('today')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  }

  /** Everything fits the screen: no scroll and nothing hidden under the bottom edge. */
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

  async function noHealthData(page: Page) {
    const text = await page.getByTestId('today').innerText();
    expect(text).not.toMatch(/léky|Zdraví/i);
  }

  test.describe('na šířku 1280×800', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    for (const state of ['a', 'b', 'c'] as const) {
      test(`stav ${state} – vejde se, bez zdravotních dat`, async ({ page }) => {
        await open(page, `state=${state}`);
        await expect(page.getByTestId('today')).toHaveAttribute('data-orientation', 'landscape');
        await expect(page.getByTestId('ambient-sky')).toBeVisible();
        await assertFits(page);
        expect(await minFontPx(page)).toBeGreaterThanOrEqual(16);
        await noHealthData(page);
      });
    }

    test('čerstvá data – tichý stav „Aktuální“', async ({ page }) => {
      await open(page, 'state=a');
      const pill = page.getByTestId('ha-freshness');
      await expect(pill).toHaveText('Aktuální');
      await expect(pill).toHaveAttribute('data-freshness', 'fresh');
      await expect(page.getByTestId('today')).toHaveAttribute('data-freshness', 'fresh');
    });

    test('zastaralá data – viditelně označená a ztlumená', async ({ page }) => {
      await open(page, 'state=a&ha_age=900');
      const pill = page.getByTestId('ha-freshness');
      await expect(pill).toHaveText('Data nejsou aktuální · před 15 min');
      await expect(page.getByTestId('today')).toHaveClass(/today-stale/);
      const opacity = await page
        .locator('.today-temperature')
        .evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(opacity).toBeLessThan(0.6);
      // The clock is local and stays at full brightness.
      const clock = await page
        .getByTestId('today-clock')
        .evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(clock).toBe(1);
      await assertFits(page);
    });

    test('bez spojení – stav nekonkuruje kritické výstraze', async ({ page }) => {
      await open(page, 'state=c');
      await expect(page.getByTestId('ha-freshness')).toHaveText(/^Bez spojení s domácností/);
      await expect(page.getByTestId('hero-signal')).toHaveAttribute('data-severity', 'critical');
      await assertFits(page);
    });

    test('noc 22–6 h – jen hodiny, teplota a zítřek, žádný pohyb', async ({ page }) => {
      await open(page, 'state=a-night');
      const today = page.getByTestId('today');
      await expect(today).toHaveAttribute('data-night', 'true');
      await expect(page.getByTestId('signal-card')).toHaveCount(0);
      await expect(page.getByTestId('ribbon-card')).toHaveCount(0);
      await expect(page.locator('.today-tomorrow')).toBeVisible();
      const running = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.playState === 'running' &&
                (a as CSSAnimation).animationName?.startsWith('today-drift'),
            ).length,
      );
      expect(running).toBe(0);
      const overlay = await page
        .locator('.today-night-overlay')
        .evaluate((el) => getComputedStyle(el).opacity);
      expect(Number(overlay)).toBeGreaterThan(0);
      // Night clock is centred (calm composition).
      const box = (await page.getByTestId('today-clock').boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(40);
      await assertFits(page);
    });

    test('noční hodiny lze nastavit nebo vypnout v URL', async ({ page }) => {
      await open(page, 'state=a-night&night=off');
      await expect(page.getByTestId('today')).toHaveAttribute('data-night', 'false');
      await open(page, 'state=a-night&night=23:30-6');
      await expect(page.getByTestId('today')).toHaveAttribute('data-night', 'false');
      await open(page, 'state=a-night&night=21-7');
      await expect(page.getByTestId('today')).toHaveAttribute('data-night', 'true');
    });
  });

  test.describe('na výšku 800×1280', () => {
    test.use({ viewport: { width: 800, height: 1280 } });

    for (const state of ['a', 'b', 'c'] as const) {
      test(`stav ${state} – portrét se vejde`, async ({ page }) => {
        await open(page, `state=${state}`);
        await expect(page.getByTestId('today')).toHaveAttribute('data-orientation', 'portrait');
        await expect(page.getByTestId('today')).toHaveClass(/today-portrait/);
        // The sun arc would cross the stacked clock and temperature.
        await expect(page.locator('.today-sun-band')).toHaveCount(0);
        await assertFits(page);
        expect(await minFontPx(page)).toBeGreaterThanOrEqual(16);
        await noHealthData(page);
      });
    }

    test('klidný den – velké hodiny nahoře, obsah vyplní výšku', async ({ page }) => {
      await open(page, 'state=a');
      const clock = (await page.getByTestId('today-clock').boundingBox())!;
      expect(clock.height).toBeGreaterThan(200);
      expect(Math.abs(clock.x + clock.width / 2 - 400)).toBeLessThan(30);
      const ribbon = (await page.getByTestId('ribbon-card').boundingBox())!;
      expect(ribbon.y).toBeGreaterThan(clock.y + clock.height);
    });

    test('noc na výšku', async ({ page }) => {
      await open(page, 'state=a-night');
      await expect(page.getByTestId('today')).toHaveAttribute('data-night', 'true');
      await assertFits(page);
    });
  });
});
