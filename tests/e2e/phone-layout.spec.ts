import { expect, test, type Locator, type Page } from '@playwright/test';

// Phone layout regression (Android Companion ~360–412 CSS px): every bottom sheet reachable in
// the dev mocks must fit the viewport, the page must not scroll sideways, and the sticky top bar
// must be opaque so scrolled card titles never show through it.

const WIDTHS = [360, 390, 412] as const;
const THEMES = ['dark', 'light'] as const;

type Opener = { name: string; path: string; sheet: string; open: (page: Page) => Promise<void> };

const OPENERS: Opener[] = [
  {
    name: 'Přístup: detail osoby',
    path: '/homebrain-pristup',
    sheet: 'access-person-sheet',
    open: async (page) => page.getByTestId('access-person-menu').first().click(),
  },
  {
    name: 'Přístup: průvodce přidáním',
    path: '/homebrain-pristup',
    sheet: 'access-wizard',
    open: async (page) => page.getByTestId('access-add').click(),
  },
  {
    name: 'Přístup: potvrzení akce',
    path: '/homebrain-pristup',
    sheet: 'access-confirm',
    open: async (page) => {
      await page.getByRole('radio', { name: 'Zařízení' }).click();
      await page.getByTestId('access-service').click();
      const action = page.getByRole('radiogroup', { name: 'Akce při rozpoznání' });
      await expect(action.getByRole('radio').first()).toBeEnabled();
      await action.getByRole('radio', { name: 'Otevřít západku' }).click();
    },
  },
  {
    name: 'Energie: detail toku',
    path: '/homebrain-energie?flow=noon',
    sheet: 'energy-flow-sheet',
    open: async (page) => {
      await expect(page.getByTestId('energy-flow-node-pv')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('energy-flow-node-pv').click();
    },
  },
  {
    name: 'Vinotéka: přidat víno',
    path: '/homebrain-vinoteka',
    sheet: 'wine-add',
    open: async (page) => {
      await page.getByTestId('wine-card').first().waitFor({ timeout: 20_000 });
      await page.getByTestId('wine-add-open').click();
    },
  },
  {
    name: 'Vinotéka: filtry',
    path: '/homebrain-vinoteka',
    sheet: 'wine-filters',
    open: async (page) => {
      await page.getByTestId('wine-card').first().waitFor({ timeout: 20_000 });
      await page.getByTestId('wine-filters-open').click();
    },
  },
  {
    name: 'Roboti: předvolba',
    path: '/homebrain-roboti?presets=demo',
    sheet: 'robots-preset-editor',
    open: async (page) => {
      await page.getByTestId('robots-preset-add').click();
      await page
        .getByTestId('robots-preset-editor')
        .getByRole('radio', { name: 'Mopovat' })
        .click();
    },
  },
  {
    name: 'Recepty: fritéza',
    path: '/homebrain-recepty?fryer=1',
    sheet: 'recipes-airfryer-dialog',
    open: async (page) => {
      await page
        .getByTestId('recipes-card')
        .filter({ hasText: 'Kuřecí stehna' })
        .locator('button.open')
        .click();
      await page.getByTestId('recipes-start').click();
      await page.getByTestId('recipes-next').click();
      await page.getByTestId('recipes-airfryer-send').click();
    },
  },
];

const withTheme = (path: string, theme: string) =>
  theme === 'light' ? `${path}${path.includes('?') ? '&' : '?'}theme=light` : path;

/** Sheet inside the viewport, page not scrollable sideways, no descendant past the sheet edge. */
async function expectFits(page: Page, sheet: Locator) {
  await expect(sheet).toBeVisible();
  // Let the rise animation finish (transform only, but keep the measurement stable).
  await page.waitForTimeout(450);
  const m = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const spill = Array.from(el.querySelectorAll<HTMLElement>('*'))
      .filter((child) => {
        const c = child.getBoundingClientRect();
        if (c.width === 0 || c.height === 0) return false;
        // Inside horizontal scrollers (segmented tabs, chip strips) overflow is intentional.
        for (let p = child.parentElement; p && p !== el; p = p.parentElement)
          if (getComputedStyle(p).overflowX !== 'visible') return false;
        return c.right > r.right + 0.5 || c.left < r.left - 0.5;
      })
      .map((child) => `${child.tagName.toLowerCase()}.${child.className}`)
      .slice(0, 5);
    return {
      left: r.left,
      right: r.right,
      vw: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sheetOverflow: el.scrollWidth - el.clientWidth,
      spill,
    };
  });
  expect(m.left, 'sheet left edge').toBeGreaterThanOrEqual(-0.5);
  expect(m.right, 'sheet right edge').toBeLessThanOrEqual(m.vw + 0.5);
  expect(m.scrollWidth, 'page scrollWidth').toBeLessThanOrEqual(m.vw);
  expect(m.sheetOverflow, 'sheet scrolls sideways').toBeLessThanOrEqual(1);
  expect(m.spill, 'content past the sheet edge').toEqual([]);
}

test.describe('telefon: sheety se vejdou na šířku', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    // Widths are set explicitly; one project is enough.
    test.skip(testInfo.project.name !== 'mobile-s21', 'phone widths only');
  });
  for (const width of WIDTHS)
    for (const theme of THEMES)
      for (const o of OPENERS)
        test(`${o.name} · ${width} px · ${theme}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(withTheme(o.path, theme));
          await o.open(page);
          await expectFits(page, page.getByTestId(o.sheet));
        });
});

test.describe('telefon: Přístup – dlaždice, záložky, štítky', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-s21', 'phone widths only');
  });
  for (const width of WIDTHS)
    test(`Osoby · ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/homebrain-pristup');
      await expect(page.getByTestId('access-person')).toHaveCount(3);
      const m = await page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const seg = box('.ac-bar .hb-seg');
        const card = box('[data-testid=access-person]');
        const statuses = Array.from(document.querySelectorAll<HTMLElement>('.hb-tile-status'));
        const clipped = statuses
          .flatMap((s) => [s, ...Array.from(s.querySelectorAll<HTMLElement>('*'))])
          .filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 0.5)
          .map((e) => e.textContent);
        const outside = statuses
          .filter((s) => {
            const t = s.closest('.hb-tile')!.getBoundingClientRect();
            const r = s.getBoundingClientRect();
            return r.right > t.right + 0.5 || r.left < t.left - 0.5;
          })
          .map((e) => e.textContent);
        const wrappedPills = Array.from(document.querySelectorAll<HTMLElement>('.hb-pill'))
          .filter((p) => p.getClientRects().length > 0)
          .filter((p) => {
            const lh = parseFloat(getComputedStyle(p).lineHeight);
            const pad =
              parseFloat(getComputedStyle(p).paddingTop) +
              parseFloat(getComputedStyle(p).paddingBottom);
            return p.getBoundingClientRect().height > lh * 1.5 + pad;
          })
          .map((p) => p.textContent);
        return {
          seg: [seg.left, seg.right],
          card: [card.left, card.right],
          statuses: statuses.length,
          clipped,
          outside,
          wrappedPills,
          scrollWidth: document.documentElement.scrollWidth,
          vw: window.innerWidth,
        };
      });
      expect(m.statuses).toBeGreaterThan(0);
      expect(m.clipped, 'tile status text clipped').toEqual([]);
      expect(m.outside, 'tile status outside its tile').toEqual([]);
      expect(Math.abs(m.seg[0]! - m.card[0]!), 'tabs start with the cards').toBeLessThanOrEqual(1);
      expect(Math.abs(m.seg[1]! - m.card[1]!), 'tabs end with the cards').toBeLessThanOrEqual(1);
      expect(m.wrappedPills, 'pill text wrapped').toEqual([]);
      expect(m.scrollWidth).toBeLessThanOrEqual(m.vw);
    });
});

test.describe('telefon: horní lišta je při posunu neprůhledná', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-s21', 'phone widths only');
  });
  for (const theme of THEMES)
    test(`Energie · 390 px · ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(withTheme('/homebrain-energie?flow=noon', theme));
      await expect(page.getByTestId('energy-flow-node-pv')).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => window.scrollTo(0, 400));
      const bar = await page.locator('.hb-topbar').evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        // Base colour alpha: rgb(...) = 1, rgba/color(... / a) = a.
        const alpha = /\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/.exec(cs.backgroundColor);
        return {
          top: r.top,
          position: cs.position,
          alpha: alpha ? Number(alpha[1] ?? alpha[2]) : 1,
          opacity: Number(cs.opacity),
          scrollY: window.scrollY,
        };
      });
      expect(bar.scrollY, 'page scrolled').toBeGreaterThan(0);
      expect(bar.position).toBe('sticky');
      expect(Math.abs(bar.top), 'bar stuck at top').toBeLessThanOrEqual(1);
      expect(bar.alpha, 'opaque bar background').toBe(1);
      expect(bar.opacity).toBe(1);
      // Whatever sits under the bar's centre is the bar itself (nothing painted above it).
      const hit = await page.evaluate(() => {
        const b = document.querySelector('.hb-topbar')!.getBoundingClientRect();
        const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return Boolean(el?.closest('.hb-topbar'));
      });
      expect(hit).toBe(true);
    });
});
