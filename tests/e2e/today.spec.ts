/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

const CARD_LIMITS = { mobile: 3, desktop: 5, kiosk: 3 } as const;
type LayoutSize = keyof typeof CARD_LIMITS;

const STATES_ABC = ['a', 'b', 'c'] as const;
type StateAbc = (typeof STATES_ABC)[number];

test.describe('Dnes – obrazovka Today', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'Dnes e2e běží jednou v projektu desktop (viewport přes test.use)',
    );
  });

  type CaseOptions = { tag?: string; theme?: 'light' };

  async function gotoToday(page: Page, size: LayoutSize, state: string, opts: CaseOptions = {}) {
    const failedFonts: string[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.woff2') && response.status() >= 400) {
        failedFonts.push(`${response.status()} ${response.url()}`);
      }
    });
    const params = new URLSearchParams({ state });
    if (size === 'kiosk') {
      params.set('kiosk', '1');
    }
    if (opts.theme) {
      params.set('theme', opts.theme);
    }
    await page.goto(`/today?${params.toString()}`);
    await expect(page.getByTestId('today')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const interLoaded = await page.evaluate(() =>
      [200, 400].every((weight) => document.fonts.check(`${weight} 16px Inter`, 'Dnes')),
    );
    expect(interLoaded).toBe(true);
    expect(failedFonts).toEqual([]);
  }

  async function saveShot(page: Page, size: LayoutSize, state: string, tag?: string) {
    const dir = process.env.HB_SHOTS_DIR;
    if (!dir) {
      return;
    }
    const viewport = page.viewportSize();
    const name = tag ?? `${viewport?.width ?? 0}x${viewport?.height ?? 0}`;
    await page.screenshot({
      path: `${dir}/dnes-${size}-${name}-${state}.png`,
      fullPage: size === 'mobile',
    });
  }

  async function assertNoOverflow(page: Page, size: LayoutSize) {
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(metrics.scrollWidth).toBe(metrics.innerWidth);
    if (size === 'desktop' || size === 'kiosk') {
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
    }
  }

  async function assertHaFreshness(page: Page) {
    await expect(page.getByTestId('ha-freshness')).toHaveCount(1);
    await expect(page.getByTestId('ha-freshness')).toBeVisible();
  }

  async function assertTemperatureOnce(page: Page) {
    const temp = page.getByTestId('today-temp');
    await expect(temp).toBeVisible();
    const number = (await temp.innerText()).match(/[−-]?\d+(?:[.,]\d+)?|—/)?.[0] ?? '';
    expect(number.length).toBeGreaterThan(0);
    const matches = await page.evaluate((num) => {
      // Teplota (text node s číslem) smí být na obrazovce vidět jen jednou.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let count = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.trim() !== num) {
          continue;
        }
        const parent = node.parentElement;
        if (!parent) {
          continue;
        }
        const rect = parent.getBoundingClientRect();
        const style = window.getComputedStyle(parent);
        if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden') {
          count += 1;
        }
      }
      return count;
    }, number);
    expect(matches).toBe(1);
  }

  async function assertRibbon(page: Page) {
    const labelLoc = page.getByTestId('ribbon-label');
    const labelCount = await labelLoc.count();
    const boxes: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (let i = 0; i < labelCount; i += 1) {
      const label = labelLoc.nth(i);
      if (!(await label.isVisible())) {
        continue;
      }
      const text = (await label.innerText()).trim();
      expect(text).not.toContain('…');
      const box = await label.boundingBox();
      expect(box).not.toBeNull();
      boxes.push({
        left: box!.x,
        right: box!.x + box!.width,
        top: box!.y,
        bottom: box!.y + box!.height,
      });
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps =
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        expect(overlaps).toBe(false);
      }
    }

    await page.evaluate(() => {
      const isVisible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        const style = window.getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none';
      };
      const centerX = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      };
      const hourlies = Array.from(
        document.querySelectorAll('[data-testid="ribbon-hourly"]'),
      ).filter(isVisible);
      // Popisek hodiny může být skrytý (kolize s „teď“), pozice ticku ale platí dál.
      const tickCenters = Array.from(document.querySelectorAll('[data-testid="ribbon-tick"]')).map(
        centerX,
      );
      for (const hourly of hourlies) {
        const cx = centerX(hourly);
        const aligned = tickCenters.some((tx) => Math.abs(tx - cx) <= 2);
        if (!aligned) {
          throw new Error(`ribbon-hourly center ${cx} not aligned to a ribbon-tick`);
        }
      }
    });
  }

  // Ribbon událost → signál, který ji popisuje (fixtures). Viditelná karta = na stuze jen značka.
  const RIBBON_SIGNALS: Record<string, string> = {
    'waste-plastic': 'waste.today.plastic',
    'meds-morning': 'health.meds',
    'rain-front': 'weather.nowcast.rain',
    'cheap-79': 'energy.cheap.now',
    'cal-meeting': 'cal.meeting',
    'cal-dinner': 'cal.dinner',
  };

  async function assertRibbonDedupe(page: Page) {
    const problems = await page.evaluate((map) => {
      const out: string[] = [];
      for (const [ribbonId, signalId] of Object.entries(map)) {
        const card = document.querySelector(
          `[data-testid="hero-signal"][data-id="${signalId}"],[data-testid="signal-card"][data-id="${signalId}"]`,
        );
        const marker = document.querySelector(
          `[data-testid="ribbon-marker"][data-id="${ribbonId}"]`,
        );
        const label = document.querySelector(`[data-testid="ribbon-label"][data-id="${ribbonId}"]`);
        if (card && !marker) out.push(`${ribbonId}: chybí značka`);
        if (card && label) out.push(`${ribbonId}: popisek duplikuje kartu ${signalId}`);
      }
      return out;
    }, RIBBON_SIGNALS);
    expect(problems).toEqual([]);
  }

  async function assertCenteredEventLabel(page: Page, id: string) {
    const label = page.locator(`[data-testid="ribbon-label"][data-id="${id}"]`);
    const marker = page.locator(`[data-testid="ribbon-marker"][data-id="${id}"]`);
    const lb = await label.boundingBox();
    const mb = await marker.boundingBox();
    expect(lb).not.toBeNull();
    expect(mb).not.toBeNull();
    expect(Math.abs(lb!.x + lb!.width / 2 - (mb!.x + mb!.width / 2))).toBeLessThanOrEqual(3);
  }

  async function assertContentReachable(page: Page) {
    const result = await page.evaluate(() => {
      const content = document.querySelector('.today-content');
      const last = Array.from(content?.children ?? [])
        .filter((el) => el.getBoundingClientRect().height > 0 && el.tagName !== 'STYLE')
        .at(-1);
      last?.scrollIntoView({ block: 'end' });
      return { bottom: last?.getBoundingClientRect().bottom, height: innerHeight };
    });
    expect(result.bottom).toBeDefined();
    expect(result.bottom!).toBeLessThanOrEqual(result.height);
    await expect(page.locator('.hb-nav-bottom')).toHaveCount(0);
  }

  async function assertStatusChipsAligned(page: Page) {
    const card = page.getByTestId('ribbon-card');
    const chips = page.getByTestId('status-chips');
    await expect(card).toBeVisible();
    if ((await chips.count()) === 0) {
      return;
    }
    const cardBox = await card.boundingBox();
    const chipsBox = await chips.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(chipsBox).not.toBeNull();
    expect(Math.abs(chipsBox!.x - cardBox!.x)).toBeLessThanOrEqual(2);
    expect(
      Math.abs(chipsBox!.x + chipsBox!.width - (cardBox!.x + cardBox!.width)),
    ).toBeLessThanOrEqual(2);
  }

  async function assertSunArcClear(page: Page) {
    const band = page.getByTestId('sun-band');
    if ((await band.count()) === 0) {
      return;
    }
    const overlaps = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const arc = box('[data-testid="sun-band"]');
      const hit = (r?: DOMRect) =>
        !!arc &&
        !!r &&
        arc.left < r.right &&
        arc.right > r.left &&
        arc.top < r.bottom &&
        arc.bottom > r.top;
      return {
        clock: hit(box('.today-clock')),
        weather: hit(box('.today-weather')),
        summary: hit(box('[data-testid="today-summary"]')),
      };
    });
    expect(overlaps).toEqual({ clock: false, weather: false, summary: false });
  }

  async function assertStateA(page: Page) {
    await expect(page.getByTestId('hero-signal')).toHaveCount(0);
    await expect(page.getByTestId('signal-card')).toHaveCount(0);
    await expect(page.getByTestId('day-ribbon')).toBeVisible();
    await expect(page.getByTestId('footer-more')).toHaveCount(0);
  }

  async function assertStateBc(page: Page, size: LayoutSize, state: StateAbc) {
    await expect(page.getByTestId('hero-signal')).toBeVisible();
    const cards = page.getByTestId('signal-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeLessThanOrEqual(CARD_LIMITS[size]);

    const footerMore = page.getByTestId('footer-more');
    if ((await footerMore.count()) > 0 && (await footerMore.isVisible())) {
      const text = (await footerMore.innerText()).trim();
      // Neutrální text: počítá jen skryté položky, ne viditelná oznámení.
      const match = text.match(/^Další (\d+) · Zobrazit vše$/);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(1);
    }
    const footer = page.getByTestId('today-footer');
    if ((await footer.count()) > 0) {
      await expect(footer).not.toContainText('upozornění');
    }

    if (state === 'c') {
      await expect(page.getByTestId('hero-signal')).toHaveAttribute('data-severity', 'critical');
    }
  }

  async function assertKioskTypography(page: Page) {
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="today"]');
      if (!root) {
        throw new Error('missing [data-testid=today]');
      }
      const offenders: string[] = [];
      const elements = Array.from(root.querySelectorAll('*'));
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) {
          continue;
        }
        let hasText = false;
        for (const child of Array.from(el.childNodes)) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
            hasText = true;
            break;
          }
        }
        if (!hasText) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') {
          continue;
        }
        const px = parseFloat(style.fontSize);
        if (px < 16) {
          offenders.push(`${el.tagName}.${el.className} font-size=${style.fontSize}`);
        }
      }
      if (offenders.length > 0) {
        throw new Error(`font-size < 16px: ${offenders.slice(0, 5).join('; ')}`);
      }
    });
  }

  async function assertKioskAnimations(page: Page) {
    await page.evaluate(() => {
      const allowedProps = new Set([
        'transform',
        'opacity',
        'offset',
        'computedOffset',
        'easing',
        'composite',
      ]);
      for (const anim of document.getAnimations()) {
        const timing = anim.effect?.getTiming();
        const iterations = timing?.iterations;
        const infinite =
          iterations === Infinity ||
          (typeof iterations === 'number' && !Number.isFinite(iterations));
        if (!infinite) {
          continue;
        }
        const rawDuration = timing?.duration;
        const durationMs =
          typeof rawDuration === 'number'
            ? rawDuration
            : rawDuration == null
              ? 0
              : parseFloat(String(rawDuration));
        if (durationMs < 60_000) {
          throw new Error(`infinite animation duration ${durationMs}ms < 60000ms`);
        }
        if (anim.effect instanceof KeyframeEffect) {
          for (const frame of anim.effect.getKeyframes()) {
            for (const key of Object.keys(frame)) {
              if (!allowedProps.has(key)) {
                throw new Error(`animated property not allowed: ${key}`);
              }
            }
          }
        }
      }
    });
  }

  async function runStateCase(
    page: Page,
    size: LayoutSize,
    state: StateAbc,
    opts: CaseOptions = {},
  ) {
    await gotoToday(page, size, state, opts);
    await assertNoOverflow(page, size);
    await assertHaFreshness(page);
    await assertTemperatureOnce(page);
    await assertRibbon(page);
    await assertRibbonDedupe(page);
    if (size === 'mobile') {
      await assertContentReachable(page);
    }

    if (size === 'desktop' || size === 'kiosk') {
      await assertStatusChipsAligned(page);
      await assertSunArcClear(page);
    }

    if (state === 'a') {
      await assertStateA(page);
      if (size === 'desktop') {
        await assertCenteredEventLabel(page, 'cal-dinner');
        await expect(page.getByTestId('ribbon-sunrise')).toHaveCount(1);
      }
    } else {
      await assertStateBc(page, size, state);
    }

    if (size === 'kiosk') {
      await expect(page.getByTestId('ambient-sky')).toBeVisible();
      await assertKioskTypography(page);
      await assertKioskAnimations(page);
      if (state === 'c') {
        await expect(page.getByTestId('today')).toHaveAttribute('data-night', 'false');
        const heroBox = await page.getByTestId('hero-signal').boundingBox();
        const ribbonBox = await page.getByTestId('ribbon-card').boundingBox();
        expect(heroBox!.y + heroBox!.height).toBeLessThanOrEqual(ribbonBox!.y);
        const titlePx = await page
          .locator('[data-testid="hero-signal"] h2')
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(titlePx).toBeGreaterThanOrEqual(56);
      }
    }

    await saveShot(page, size, state, opts.tag);
  }

  test.describe('mobile 390×844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const state of STATES_ABC) {
      test(`state ${state}`, async ({ page }) => {
        await runStateCase(page, 'mobile', state);
      });
    }
  });

  test.describe('mobile 360×800', () => {
    test.use({ viewport: { width: 360, height: 800 } });

    for (const state of STATES_ABC) {
      test(`state ${state}`, async ({ page }) => {
        await runStateCase(page, 'mobile', state);
      });
    }
  });

  test.describe('mobile 800×1280', () => {
    test.use({ viewport: { width: 800, height: 1280 } });

    for (const state of STATES_ABC) {
      test(`state ${state}`, async ({ page }) => {
        await runStateCase(page, 'mobile', state);
      });
    }
  });

  test.describe('kiosk 1280×800', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    for (const state of STATES_ABC) {
      test(`state ${state}`, async ({ page }) => {
        await runStateCase(page, 'kiosk', state);
      });
    }

    test('state a-night – data-night', async ({ page }) => {
      await gotoToday(page, 'kiosk', 'a-night');
      await expect(page.getByTestId('today')).toHaveAttribute('data-night', 'true');
      await assertNoOverflow(page, 'kiosk');
      // Noční kiosk je záměrně jen hodiny – bez hlavičky a pilulky čerstvosti.
      await expect(page.getByTestId('ha-freshness')).toHaveCount(0);
      await expect(page.getByTestId('hero-signal')).toHaveCount(0);
      await expect(page.getByTestId('signal-card')).toHaveCount(0);
      await expect(page.getByTestId('today-clock')).toBeVisible();
      await saveShot(page, 'kiosk', 'a-night');
    });

    test.describe('reduced motion', () => {
      test.use({ reducedMotion: 'reduce' });

      test('žádné běžící animace', async ({ page }) => {
        await gotoToday(page, 'kiosk', 'a');
        const running = await page.evaluate(
          () => document.getAnimations().filter((a: Animation) => a.playState === 'running').length,
        );
        expect(running).toBe(0);
      });
    });
  });

  test.describe('desktop 1440×900', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    for (const state of STATES_ABC) {
      test(`state ${state}`, async ({ page }) => {
        await runStateCase(page, 'desktop', state);
      });
    }

    test('state b – světlé téma', async ({ page }) => {
      await runStateCase(page, 'desktop', 'b', { theme: 'light', tag: 'light' });
      await expect(page.locator('[data-theme="light"]').first()).toBeVisible();
    });
  });
});

test.describe('Dnes – živá data přes falešné HA spojení (?live=1)', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'běží jen v projektu desktop');
  });

  for (const size of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ] as const) {
    test(`produkční adaptér ukazuje teplotu stanice a stav HA – ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      // Syntetický snapshot počasí je pro den MOCK_NOW (2026-10-31 10:40 Praha).
      await page.clock.setFixedTime(new Date('2026-10-31T10:40:00+01:00'));
      await page.goto('/today?live=1');
      await expect(page.getByTestId('today')).toBeVisible();
      const temp = page.getByTestId('today-temp');
      await expect(temp).toContainText(/\d/);
      await expect(temp).not.toContainText('—');
      await expect(page.getByTestId('ha-freshness')).toContainText('HA · před');
      await expect(page.getByTestId('ha-freshness')).not.toContainText('odpojeno');
      await expect(page.getByText('Počasí není k dispozici')).toHaveCount(0);
      await expect(page.getByTestId('ribbon-card')).toContainText('východ 06:56');
      await expect(page.getByTestId('ribbon-card')).toContainText('západ 16:47');
      await expect(page.locator('.hb-ribbon-cheap')).not.toHaveCount(0);
      await expect(page.locator('.hb-ribbon-hourly')).not.toHaveCount(0);
      const dir = process.env.HB_SHOTS_DIR;
      if (dir)
        await page.screenshot({ path: `${dir}/today-live-${size.name}.png`, fullPage: true });
    });
  }
});
