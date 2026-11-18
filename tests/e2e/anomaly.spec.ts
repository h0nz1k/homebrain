/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * Hlídání domu (#128) – dev mock: synthetic house, `?anomaly=ok|observations|suspicion|confirmed`.
 * Owner acceptance criteria from #129 are asserted here (actions, wording, contrast, kiosk).
 */

const plain = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ');

/** „2 h 21 min od posledního hlášení (9:29)“ – the one outage phrase (owner, #129). */
const OUTAGE = /(\d+ h(?: \d+ min)?|\d+ min) od posledního hlášení \((\d{1,2}):(\d{2})\)/;

/** Every outage phrase in `texts` is well-formed and counts exactly to `clock` („10:40“). */
function expectOutages(texts: string[], clock: string) {
  const [ch, cm] = clock.split(':').map(Number);
  for (const text of texts) {
    const m = plain(text).match(OUTAGE);
    expect(m, `„${text}“ must say „… od posledního hlášení (h:mm)“`).not.toBeNull();
    const d = m![1]!.match(/(?:(\d+) h)?(?: ?(\d+) min)?/)!;
    const minutes = Number(d[1] ?? 0) * 60 + Number(d[2] ?? 0);
    const last = Number(m![2]) * 60 + Number(m![3]);
    expect(last + minutes, `${text} vs. clock ${clock}`).toBe(ch! * 60 + cm!);
  }
}

/** Text blocks that wrap must not leave a single word alone on the last line. */
async function orphans(page: Page, scope: string) {
  return page.evaluate((root) => {
    const out: string[] = [];
    const blocks = Array.from(document.querySelectorAll(`${root} :is(h2, h3, p, small, span)`));
    for (const el of blocks) {
      if (!el.getClientRects().length) continue;
      // leaf blocks only (a hidden separator like „ · “ on the kiosk does not count)
      if (Array.from(el.children).some((c) => c.getClientRects().length)) continue;
      const text = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('');
      if (text.trim().split(/\s+/).length < 3) continue;
      // React may split a text into several text nodes: measure every word in each of them
      const tops: number[] = [];
      const range = document.createRange();
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const value = node.textContent ?? '';
        for (const m of value.matchAll(/\S+/g)) {
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          tops.push(Math.round(range.getBoundingClientRect().top));
        }
      }
      if (!tops.length) continue;
      const lastTop = tops.at(-1)!;
      if (new Set(tops).size > 1 && tops.filter((t) => t === lastTop).length === 1) out.push(text);
    }
    return out;
  }, scope);
}

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
      '.aw-muted, .aw-issue-copy p, .aw-strip-axis, .aw-watch-context, .aw-eyebrow, .aw-watch-list small, .aw-hint, .aw-how li, .aw-privacy';
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
      await page.goto(`/homebrain-hlidani?anomaly=confirmed&theme=${theme}&session=owner`);
      await expect(page.getByTestId('aw-headline')).toHaveText(/1\sporucha/, { timeout: 20_000 });
      const issues = page.getByTestId('aw-issue');
      await expect(issues).toHaveCount(3);
      const fault = issues.and(page.locator('[data-tier="confirmed"]'));
      await expect(fault.getByTestId('aw-issue-title')).toHaveText('Myčka neodpovídá');
      // owner: exactly Vyřešeno (primary, same on every tier), Otevřít zařízení, Skrýt (link)
      await expect(fault.getByRole('button', { name: 'Otevřít zařízení' })).toBeVisible();
      for (const card of await issues.all()) {
        const buttons = card.getByTestId('aw-actions').getByRole('button');
        expect(await buttons.allTextContents()).toEqual([
          'Vyřešeno',
          'Otevřít zařízení',
          'Skrýt na 7 dní',
        ]);
        const look = await buttons.evaluateAll((els) =>
          els.map((el) => {
            const s = getComputedStyle(el);
            return `${el.getAttribute('data-variant')}|${s.backgroundColor}|${s.color}`;
          }),
        );
        expect(look[0]).toMatch(/^primary\|/);
        expect(look[1]).toMatch(/^secondary\|/);
        expect(look[2]).toMatch(/^null\|rgba\(0, 0, 0, 0\)/);
        await expect(card.getByTestId('aw-resolve-hint')).toHaveText(
          'Pokud potíž trvá, za 2\u00a0h se hlášení vrátí.',
        );
      }
      const resolveLooks = await page
        .getByRole('button', { name: 'Vyřešeno' })
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
      expect(new Set(resolveLooks).size).toBe(1);
      await expect(page.getByText(/Vím o tom|To je v pořádku|Ztlumit/)).toHaveCount(0);
      // title must not contradict the content; natural, impersonal Czech
      await expect(page.getByText('Čidlo ve sklepě nehlásí vlhkost')).toBeVisible();
      await expect(page.getByText('V obýváku je neobvykle teplo')).toBeVisible();
      await expect(page.getByText(/Odchylka trvá 2\sh 20\smin\./)).toBeVisible();
      const all = plain(await page.getByTestId('anomaly').textContent());
      expect(all).not.toMatch(
        /nevysílá|Podobně teplo|mlčí|Hlídám|hlídám|ukážu|naměřil|přidám|další fázi|déle než 30|Klima obývák:/,
      );
      expect(all).toContain('Upozornění na telefon zatím nejsou zapnutá.');
      expect(all).toContain('Hlídáno 12 zařízení');
      expect(all).toContain('z historie Home Assistantu');
      expect(all).toMatch(/Porucha\s*nejdříve ve 12:45/);
      expect(all).toMatch(/Porucha\s*až při extrémní hodnotě/);
      // every outage string (card lines + timelines) counts to the page clock „Aktualizováno 10:40“
      await expect(
        page.getByText(/^Aktualizováno 10:40 · z historie Home Assistantu$/),
      ).toBeVisible();
      expect(plain(await fault.getByTestId('aw-issue-meta').textContent())).toBe(
        'Neposílá žádné údaje · 2 h 21 min od posledního hlášení (8:19)',
      );
      const silentMetas = [
        plain(await fault.getByTestId('aw-issue-meta').textContent()),
        plain(
          await issues
            .and(page.locator('[data-key="device:demo_dev_cellar"]'))
            .getByTestId('aw-issue-meta')
            .textContent(),
        ),
      ];
      const gaps = await page.getByTestId('aw-gap-title').allTextContents();
      expect(gaps).toHaveLength(2);
      expectOutages([...silentMetas, ...gaps], '10:40');
      // 24 h strip: the tier is not told by colour alone (height + pattern)
      const bars = await page
        .locator('.aw-strip-bars [data-tier]')
        .evaluateAll((els) =>
          Object.fromEntries(
            els.map((el) => [
              el.getAttribute('data-tier'),
              `${Math.round(el.getBoundingClientRect().height)}|${getComputedStyle(el).backgroundImage !== 'none'}`,
            ]),
          ),
        );
      const h = (t: string) => Number(bars[t]!.split('|')[0]);
      expect(h('ok')).toBeLessThan(h('observation'));
      expect(h('observation')).toBeLessThan(h('suspicion'));
      expect(h('suspicion')).toBeLessThan(h('confirmed'));
      for (const t of ['observation', 'suspicion', 'confirmed']) expect(bars[t]).toMatch(/\|true$/);
      // secondary text ≥ 4.5:1
      const contrast = await secondaryContrast(page, '[data-testid="anomaly"]');
      expect(contrast.length).toBeGreaterThan(5);
      expect(contrast[0]!.ratio, JSON.stringify(contrast[0])).toBeGreaterThanOrEqual(4.5);
      await noSidewaysScroll(page);
    });
  }

  test('„Vyřešeno“ na podezření skryje hlášení jen lokálně', async ({ page }) => {
    await page.goto('/homebrain-hlidani?anomaly=suspicion');
    const cellar = page.locator('[data-testid="aw-issue"][data-key="device:demo_dev_cellar"]');
    await expect(cellar).toBeVisible({ timeout: 20_000 });
    await cellar.getByRole('button', { name: 'Vyřešeno' }).click();
    await expect(cellar).toHaveCount(0);
    await expect(page.getByTestId('aw-hidden')).toContainText('Čidlo ve sklepě');
    await expect(page.getByTestId('aw-hidden')).toContainText(
      'Vyřešeno. Pokud potíž trvá, za 2\u00a0h se hlášení vrátí.',
    );
  });

  test('klidný stav a učení', async ({ page }) => {
    await page.goto('/homebrain-hlidani?anomaly=ok');
    await expect(page.getByTestId('aw-headline')).toHaveText('Vše v pořádku', { timeout: 20_000 });
    await expect(page.getByTestId('aw-devices')).toBeVisible();
    await page.goto('/homebrain-hlidani?anomaly=learning');
    await expect(page.getByTestId('aw-headline')).toHaveText('Hlídání se učí, jak dům běží', {
      timeout: 20_000,
    });
    await noSidewaysScroll(page);
  });
});

test.describe('Hlídání domu – karta na Dnes', () => {
  test('podezření: karta pod hodinami, výrazné „Otevřít hlídání“, jeden čas', async ({ page }) => {
    await page.goto('/homebrain-dnes?state=a&anomaly=suspicion');
    const card = page.getByTestId('aw-watch');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('today')).toHaveAttribute('data-watch', 'suspicion');
    const cta = page.getByTestId('aw-watch-cta');
    await expect(cta).toHaveText('Otevřít hlídání');
    // stronger primary button: solid fill, ≥ 48 px tall
    const colors = await cta.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.color, String(el.getBoundingClientRect().height)];
    });
    expect(colors[0]).not.toMatch(/rgba\(.*, 0(\.\d+)?\)|transparent/);
    expect(Number(colors[2])).toBeGreaterThanOrEqual(48);
    // one clock for the whole page: card + every row count to the Dnes clock
    const clock = (await page.getByTestId('today-clock').textContent())!.trim();
    expect(clock).toBe('10:40');
    expect(plain(await page.getByTestId('aw-watch-meta').textContent())).toBe(
      '2 h 45 min od posledního hlášení (7:55)',
    );
    await expect(card.getByText(/Aktualizováno/)).toHaveCount(0);
    const items = page.getByTestId('aw-watch-item');
    const rows = (await items.allTextContents()).map(plain);
    expect(rows).toEqual([
      'V obýváku je neobvykle teplo28,1 °C, obvykle 20,5 °C',
      'Myčka neodpovídá1 h 11 min od posledního hlášení (9:29)',
    ]);
    expectOutages([plain(await page.getByTestId('aw-watch-meta').textContent()), rows[1]!], clock);
    await expect(card).toContainText('Hlídáno 12 zařízení');
    // rows are tappable: button with a chevron, opens the detail
    for (const row of await items.all()) {
      expect(await row.evaluate((el) => el.tagName)).toBe('BUTTON');
      await expect(row.locator('.aw-row-chevron')).toBeVisible();
    }
    await items.first().click();
    await expect(page.getByTestId('anomaly')).toBeVisible({ timeout: 20_000 });
  });

  test('porucha na telefonu: každý čas výpadku „od posledního hlášení“', async ({ page }) => {
    await page.goto('/homebrain-dnes?state=a&anomaly=confirmed');
    await expect(page.getByTestId('aw-watch')).toBeVisible({ timeout: 20_000 });
    const meta = plain(await page.getByTestId('aw-watch-meta').textContent());
    expect(meta).toBe('Neposílá žádné údaje · 2 h 21 min od posledního hlášení (8:19)');
    const rows = (await page.getByTestId('aw-watch-item').allTextContents()).map(plain);
    expect(rows[0]).toBe('Čidlo ve sklepě nehlásí vlhkost3 h 55 min od posledního hlášení (6:45)');
    expectOutages([meta, rows[0]!], '10:40');
    await noSidewaysScroll(page);
  });

  test('jen pozorování: tichý čip, žádná karta', async ({ page }) => {
    await page.goto('/homebrain-dnes?state=a&anomaly=observations');
    await expect(page.getByTestId('aw-watch-chip')).toHaveText(/Dům · 2\spozorování/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('aw-watch')).toHaveCount(0);
  });

  for (const [w, h] of [
    [1280, 800],
    [800, 1280],
  ] as const) {
    test(`tablet ${w}×${h}: s kartou kompaktní řádek hodin a celý Průběh dne`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'běží jednou s vlastním viewportem');
      await page.setViewportSize({ width: w, height: h });
      const measure = async (q: string) => {
        await page.goto(`/homebrain-dnes?state=a&${q}`);
        await expect(page.getByTestId('today-clock')).toBeVisible({ timeout: 20_000 });
        if (q.includes('suspicion')) await expect(page.getByTestId('aw-watch')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        return page.evaluate(() => {
          const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const clock = box('[data-testid="today-clock"]');
          const temp = box('[data-testid="today-temp"]');
          return {
            hero: box('[data-testid="today-hero"]').height,
            clockPx: parseFloat(getComputedStyle(document.querySelector('.today-clock')!).fontSize),
            oneRow: Math.abs(clock.top + clock.height / 2 - (temp.top + temp.height / 2)) < 16,
            sun: document.querySelector('.today-sun-band')?.getClientRects().length ?? 0,
            ribbonBottom: box('[data-testid="ribbon-card"]').bottom,
            vh: innerHeight,
          };
        });
      };
      const calm = await measure('anomaly=ok');
      const busy = await measure('anomaly=suspicion');
      expect(busy.hero).toBeLessThan(calm.hero * 0.6);
      expect(busy.clockPx).toBeLessThanOrEqual(80);
      expect(busy.oneRow).toBe(true);
      expect(busy.sun).toBe(0);
      // the day timeline is not clipped on the landscape tablet
      if (w > h) expect(busy.ribbonBottom).toBeLessThanOrEqual(busy.vh);
      await expect(page.getByTestId('aw-watch-cta')).toBeVisible();
    });
  }
});

test.describe('Hlídání domu – nástěnný kiosk 1280×800', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Kiosk e2e běží jednou v projektu desktop');
  });
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const [scenario, theme] of [
    ['confirmed', 'dark'],
    ['confirmed', 'light'],
    ['suspicion', 'dark'],
  ] as const) {
    test(`${scenario}: podezření podřízená, vše ≥ 22 px, bez sirotků (${theme})`, async ({
      page,
    }) => {
      await page.goto(`/homebrain-dnes?kiosk=1&state=a&anomaly=${scenario}&theme=${theme}`);
      const card = page.getByTestId('aw-watch');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await expect(card).toHaveAttribute('data-layout', 'kiosk');
      // the wall tablet cannot open the detail: no dead button, rows are not buttons
      await expect(page.getByTestId('aw-watch-cta')).toHaveCount(0);
      await expect(card.locator('button')).toHaveCount(0);
      const m = await card.evaluate((el) => {
        const box = (s: string) => el.querySelector(s)!.getBoundingClientRect();
        const style = (s: string) => getComputedStyle(el.querySelector(s)!);
        const lum = (c: string) => {
          const [r, g, b] = c.match(/[\d.]+/g)!.map(Number);
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        // every visible text node of the card, with its rendered font size
        const sizes: { text: string; px: number }[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const parent = n.parentElement!;
          if (!n.textContent!.trim() || !parent.getClientRects().length) continue;
          if (getComputedStyle(parent).display === 'none') continue;
          sizes.push({
            text: n.textContent!.trim(),
            px: parseFloat(getComputedStyle(parent).fontSize),
          });
        }
        const lines = Array.from(el.querySelectorAll('.aw-watch-list .hb-status-row-copy > *')).map(
          (n) => ({
            text: n.textContent,
            lineH: parseFloat(getComputedStyle(n).lineHeight),
            h: n.getBoundingClientRect().height,
            clipped: n.scrollWidth > n.clientWidth + 1,
          }),
        );
        return {
          primaryW: box('.aw-watch-primary').width,
          listW: box('.aw-watch-list').width,
          titlePx: parseFloat(style('.aw-watch-title').fontSize),
          titleW: Number(style('.aw-watch-title').fontWeight),
          headW: Number(style('.aw-watch-list h3').fontWeight),
          titleLum: lum(style('.aw-watch-title').color),
          items: Array.from(el.querySelectorAll('.aw-watch-list .hb-status-row-label')).map(
            (n) => ({
              px: parseFloat(getComputedStyle(n).fontSize),
              w: Number(getComputedStyle(n).fontWeight),
              lum: lum(getComputedStyle(n).color),
            }),
          ),
          sizes,
          lines,
        };
      });
      expect(m.items).toHaveLength(2);
      // subordinate: narrower column, regular-weight heading, smaller, lighter, muted items
      expect(m.listW).toBeLessThan(m.primaryW * 0.8);
      expect(m.headW).toBeLessThanOrEqual(400);
      for (const item of m.items) {
        expect(item.px).toBeLessThan(m.titlePx * 0.6);
        expect(item.w).toBeLessThan(m.titleW);
        expect(item.w).toBeLessThanOrEqual(400);
        if (theme === 'dark') expect(item.lum).toBeLessThan(m.titleLum);
      }
      // every text of the card readable from ~2 m: ≥ 22 px
      for (const t of m.sizes) expect(t.px, t.text).toBeGreaterThanOrEqual(22);
      // single-line items, nothing cut off
      for (const line of m.lines) {
        expect(line.h, line.text!).toBeLessThanOrEqual(line.lineH * 1.2);
        expect(line.clipped, line.text!).toBe(false);
      }
      expect(await orphans(page, '[data-testid="aw-watch"]')).toEqual([]);
      // outage strings everywhere count to the kiosk clock
      const clock = (await page.getByTestId('today-clock').textContent())!.trim();
      const outageTexts = [
        plain(await page.getByTestId('aw-watch-meta').textContent()),
        ...(await page.getByTestId('aw-watch-item').allTextContents()).map(plain),
      ].filter((t) => t.includes('hlášení'));
      expect(outageTexts.length).toBe(2);
      expectOutages(outageTexts, clock);
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
});
