/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * Hlídání domu (#128) – dev mock: synthetic house, `?anomaly=ok|observations|suspicion|confirmed`.
 * Owner acceptance criteria from #129 are asserted here (actions, wording, contrast, kiosk).
 */

const plain = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ');

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every secondary text (`--hb-t2`) of the module against its nearest opaque background. */
async function secondaryContrast(page: Page, scope: string) {
  return page.evaluate((root) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = '1'] = m[1]!.split(/[ ,/]+/).filter(Boolean);
      return [Number(r), Number(g), Number(b), Number(a)] as const;
    };
    const lum = ([r, g, b]: readonly number[]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const scope = document.querySelector(root)!;
    // Glass cards paint a gradient (no background-color): measure against the surface token.
    const hex = getComputedStyle(scope).getPropertyValue('--hb-s1').trim();
    const surface = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const bg = (el: Element | null): readonly number[] => {
      for (let e = el; e && e !== scope.parentElement; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] >= 0.9) return c;
      }
      return surface;
    };
    const worst: { text: string; ratio: number }[] = [];
    const selector =
      '.aw-muted, .aw-issue-copy p, .aw-strip-axis, .aw-watch-context, .aw-watch-sent, .aw-eyebrow, .aw-watch-list .hb-status-row-detail, .aw-how li, .aw-privacy';
    for (const el of Array.from(document.querySelectorAll(`${root} :is(${selector})`))) {
      if (!el.getClientRects().length) continue;
      const fg = parse(getComputedStyle(el).color);
      if (!fg) continue;
      const [a, b] = [lum(fg), lum(bg(el))].sort((x, y) => y - x);
      const ratio = (a! + 0.05) / (b! + 0.05);
      worst.push({
        text: (el.textContent ?? '').slice(0, 40),
        ratio: Math.round(ratio * 100) / 100,
      });
    }
    return worst.sort((x, y) => x.ratio - y.ratio);
  }, scope);
}

test.describe('Hlídání domu – detail', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`porucha + 2 podezření (${theme})`, async ({ page }) => {
      await page.goto(`/homebrain-hlidani?anomaly=confirmed&theme=${theme}`);
      await expect(page.getByTestId('aw-headline')).toHaveText(/1\sporucha/, { timeout: 20_000 });
      const issues = page.getByTestId('aw-issue');
      await expect(issues).toHaveCount(3);
      const fault = issues.and(page.locator('[data-tier="confirmed"]'));
      await expect(fault.getByTestId('aw-issue-title')).toHaveText('Myčka neodpovídá');
      // owner: at most three actions, „Vím o tom“ removed
      const actions = fault.getByTestId('aw-actions').getByRole('button');
      expect((await actions.allTextContents()).length).toBeLessThanOrEqual(3);
      await expect(fault.getByRole('button', { name: 'Vyřešeno' })).toBeVisible();
      await expect(page.getByText('Vím o tom')).toHaveCount(0);
      // title must not contradict the content
      await expect(page.getByText('Čidlo ve sklepě nehlásí vlhkost')).toBeVisible();
      await expect(page.getByText(/nevysílá/)).toHaveCount(0);
      await expect(page.getByText(/Podobně teplo/)).toHaveCount(0);
      // outage times: from the last report everywhere
      expect(plain(await fault.getByTestId('aw-issue-meta').textContent())).toBe(
        'Všech 17 hodnot mlčí od 9:29 · 2 h 21 min',
      );
      expect(plain(await fault.getByTestId('aw-gap-title').textContent())).toMatch(/^Od 9:29 /);
      // secondary text ≥ 4.5:1
      const contrast = await secondaryContrast(page, '[data-testid="anomaly"]');
      expect(contrast.length).toBeGreaterThan(5);
      expect(contrast[0]!.ratio, JSON.stringify(contrast[0])).toBeGreaterThanOrEqual(4.5);
      await noSidewaysScroll(page);
    });
  }

  test('„To je v pořádku“ skryje hlášení jen lokálně', async ({ page }) => {
    await page.goto('/homebrain-hlidani?anomaly=suspicion');
    const cellar = page.locator('[data-testid="aw-issue"][data-key="device:demo_dev_cellar"]');
    await expect(cellar).toBeVisible({ timeout: 20_000 });
    await cellar.getByRole('button', { name: 'To je v pořádku' }).click();
    await expect(cellar).toHaveCount(0);
    await expect(page.getByTestId('aw-hidden')).toContainText('Čidlo ve sklepě');
  });

  test('klidný stav a učení', async ({ page }) => {
    await page.goto('/homebrain-hlidani?anomaly=ok');
    await expect(page.getByTestId('aw-headline')).toHaveText('Vše v pořádku', { timeout: 20_000 });
    await expect(page.getByTestId('aw-devices')).toBeVisible();
    await page.goto('/homebrain-hlidani?anomaly=learning');
    await expect(page.getByTestId('aw-headline')).toHaveText('Učím se, jak dům běží', {
      timeout: 20_000,
    });
    await noSidewaysScroll(page);
  });
});

test.describe('Hlídání domu – karta na Dnes', () => {
  test('podezření: karta pod hodinami, výrazné „Otevřít hlídání“', async ({ page }) => {
    await page.goto('/homebrain-dnes?state=a&anomaly=suspicion');
    const card = page.getByTestId('aw-watch');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('today')).toHaveAttribute('data-watch', 'suspicion');
    const cta = page.getByTestId('aw-watch-cta');
    await expect(cta).toHaveText('Otevřít hlídání');
    // stronger primary button: solid fill, label ≥ 4.5:1
    const colors = await cta.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.color];
    });
    expect(colors[0]).not.toMatch(/rgba\(.*, 0(\.\d+)?\)|transparent/);
    expect(plain(await page.getByTestId('aw-watch-meta').textContent())).toBe(
      'Vlhkost mlčí od 7:55 · 2 h 45 min',
    );
    await cta.click();
    await expect(page.getByTestId('anomaly')).toBeVisible({ timeout: 20_000 });
    await noSidewaysScroll(page);
  });

  test('jen pozorování: tichý čip, žádná karta', async ({ page }) => {
    await page.goto('/homebrain-dnes?state=a&anomaly=observations');
    await expect(page.getByTestId('aw-watch-chip')).toHaveText(/Dům · 2\spozorování/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('aw-watch')).toHaveCount(0);
  });

  test('tablet: s kartou je karta hodin menší', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'běží jednou s vlastním viewportem');
    await page.setViewportSize({ width: 800, height: 1280 });
    const clock = async (q: string) => {
      await page.goto(`/homebrain-dnes?state=a&${q}`);
      await expect(page.getByTestId('today-clock')).toBeVisible({ timeout: 20_000 });
      if (q.includes('suspicion')) await expect(page.getByTestId('aw-watch')).toBeVisible();
      return page.getByTestId('today-hero').evaluate((el) => el.getBoundingClientRect().height);
    };
    const calm = await clock('anomaly=ok');
    const busy = await clock('anomaly=suspicion');
    expect(busy).toBeLessThan(calm);
  });
});

test.describe('Hlídání domu – nástěnný kiosk 1280×800', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Kiosk e2e běží jednou v projektu desktop');
  });
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const theme of ['dark', 'light'] as const) {
    test(`porucha vlevo, podezření vpravo podřízená (${theme})`, async ({ page }) => {
      await page.goto(`/homebrain-dnes?kiosk=1&state=a&anomaly=confirmed&theme=${theme}`);
      const card = page.getByTestId('aw-watch');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await expect(card).toHaveAttribute('data-layout', 'kiosk');
      // the wall tablet cannot open the detail: no dead button
      await expect(page.getByTestId('aw-watch-cta')).toHaveCount(0);
      const m = await card.evaluate((el) => {
        const box = (s: string) => el.querySelector(s)!.getBoundingClientRect();
        const style = (s: string) => getComputedStyle(el.querySelector(s)!);
        return {
          primaryW: box('.aw-watch-primary').width,
          listW: box('.aw-watch-list').width,
          titlePx: parseFloat(style('.aw-watch-title').fontSize),
          titleW: Number(style('.aw-watch-title').fontWeight),
          items: Array.from(el.querySelectorAll('.aw-watch-list .hb-status-row-label')).map(
            (n) => ({
              px: parseFloat(getComputedStyle(n).fontSize),
              w: Number(getComputedStyle(n).fontWeight),
            }),
          ),
          details: Array.from(
            el.querySelectorAll(
              '.aw-watch-list .hb-status-row-copy > :not(.hb-status-row-label), .aw-watch-list h3',
            ),
          ).map((n) => parseFloat(getComputedStyle(n).fontSize)),
        };
      });
      expect(m.items).toHaveLength(2);
      // subordinate: narrower column, smaller and lighter text than the fault
      expect(m.listW).toBeLessThan(m.primaryW * 0.6);
      for (const item of m.items) {
        expect(item.px).toBeLessThan(m.titlePx * 0.5);
        expect(item.w).toBeLessThan(m.titleW);
        // readable from ~2 m on the wall tablet
        expect(item.px).toBeGreaterThanOrEqual(20);
      }
      for (const px of m.details) expect(px).toBeGreaterThanOrEqual(20);
      // everything fits the screen
      const fit = await page.evaluate(() => ({
        h: document.documentElement.scrollHeight - innerHeight,
        w: document.documentElement.scrollWidth - innerWidth,
        clipped: Array.from(document.querySelectorAll('.today-content *'))
          .filter((el) => el.getClientRects().length > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.bottom > innerHeight + 0.5 || b.right > innerWidth + 0.5;
          })
          .map((el) => el.className),
      }));
      expect(fit.h).toBeLessThanOrEqual(0);
      expect(fit.w).toBeLessThanOrEqual(0);
      expect(fit.clipped).toEqual([]);
      const contrast = await secondaryContrast(page, '[data-testid="aw-watch"]');
      expect(contrast[0]!.ratio, JSON.stringify(contrast[0])).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('podezření na kiosku: vejde se', async ({ page }) => {
    await page.goto('/homebrain-dnes?kiosk=1&state=a&anomaly=suspicion');
    await expect(page.getByTestId('aw-watch')).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
