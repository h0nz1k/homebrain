import { schematicGeometry } from './heating-geometry.js';
import { expect, test, type Page } from '@playwright/test';

// Topení (dev mock: synthetic heat pump with ground collector, `?topeni=` scenario, `&rooms=`).

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function infiniteAnimations(page: Page) {
  return page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).length,
  );
}

test.describe('Topení', () => {
  test('Teď: logo z manifestu (dev), LED kompresoru a bez manifestu popisek TČ', async ({
    page,
  }) => {
    await page.goto('/homebrain-topeni?topeni=heating');
    const sch = page.getByTestId('heating-schematic');
    await expect(sch).toHaveAttribute('data-hp-logo', '', { timeout: 20_000 });
    await expect(sch.getByTestId('heating-sch-hp-logo')).toBeVisible();
    const led = sch.getByTestId('heating-sch-compressor-led');
    await expect(led).toHaveClass(/ht-c3-comp-led-on/);
    const logoInside = await sch.evaluate((el) => {
      const hp = el.querySelector('[data-floor="hp"]')!.getBoundingClientRect();
      const img = el.querySelector('[data-testid="heating-sch-hp-logo"]')!.getBoundingClientRect();
      return (
        img.left >= hp.left - 1 &&
        img.right <= hp.right + 1 &&
        img.top >= hp.top - 1 &&
        img.bottom <= hp.bottom + 1
      );
    });
    expect(logoInside).toBe(true);

    await page.route('**/local/homebrain/heating/manifest.json', (route) =>
      route.fulfill({ status: 404, body: '' }),
    );
    await page.reload();
    await expect(sch).not.toHaveAttribute('data-hp-logo', '', { timeout: 20_000 });
    await expect(sch.getByTestId('heating-sch-hp-logo')).toHaveCount(0);
    await expect(sch.getByTestId('heating-sch-hp-mark')).toHaveText('TČ');

    await page.goto('/homebrain-topeni?topeni=idle');
    await expect(sch.getByTestId('heating-sch-compressor-led')).toHaveClass(/ht-c3-comp-led-off/);
  });

  test('Teď: věta, animované schéma se zemním kolektorem a čísla', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=heating');
    await expect(page.getByTestId('heating-headline')).toContainText('nahříváme nádrž', {
      timeout: 20_000,
    });
    const sch = page.getByTestId('heating-schematic');
    await expect(sch).toHaveAttribute('data-compressor', 'on');
    await expect(sch.locator('[data-pipe-id="collector"][data-active]')).toHaveCount(1);
    await expect(page.getByTestId('heating-sch-collector')).toHaveText('Zemní kolektor');
    // SVG embeds keyframe CSS containing the internal circuit name; audit rendered copy.
    expect(await page.getByTestId('heating-view').innerText()).not.toMatch(
      /Chlazení|solanka|brine|X204|X216/i,
    );
    // The activity sentence leads the card, before secondary numbers and badges.
    const heroOrder = await page.getByTestId('heating-hero').evaluate((el) => {
      const headline = el.querySelector('[data-testid="heating-headline"]')!;
      return (
        headline.getBoundingClientRect().top <
        el.querySelector('.ht-run-meta')!.getBoundingClientRect().top
      );
    });
    expect(heroOrder).toBe(true);
    await expect(sch.locator('[data-pump="charge"]')).toHaveAttribute('data-on', '');
    await expect(sch.locator('[data-pump="primary"]')).toHaveCount(0);
    // circulation pump state is not mapped by the backend (null) → not drawn
    await expect(sch.locator('[data-pump="circulation"]')).toHaveCount(0);
    await expect(page.getByTestId('heating-backup')).toHaveCount(0);
    await expect(page.getByTestId('heating-hdo')).toHaveText('Nízký tarif');
    await expect(page.getByText(/elektrick/i)).toHaveCount(0);
    expect(await infiniteAnimations(page)).toBeGreaterThan(0);
    await noSidewaysScroll(page);
  });

  for (const scenario of ['idle', 'house', 'dhw']) {
    test(`Teď ${scenario}: neověřené údaje skryté, pohyb podle stavu`, async ({ page }) => {
      await page.goto(`/homebrain-topeni?topeni=${scenario}`);
      const sch = page.getByTestId('heating-schematic');
      await expect(sch).toHaveAttribute('data-compressor', scenario === 'dhw' ? 'on' : 'off', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('heating-sch-collector')).toHaveText('Zemní kolektor');
      await expect(page.getByText('Chlazení', { exact: true })).toHaveCount(0);
      await expect(sch.locator('[data-valve]')).toHaveAttribute(
        'data-valve',
        scenario === 'dhw' ? 'dhw' : 'tank',
      );
      if (scenario !== 'dhw') {
        await expect(sch.locator('[data-pipe-id="collector"][data-active]')).toHaveCount(0);
      }
      await expect(sch.locator('[data-pump="charge"]')).toHaveAttribute(
        'aria-label',
        `Čerpadlo nabíjení: ${scenario === 'dhw' ? 'běží' : 'stojí'}`,
      );
      await expect(sch.locator('[data-pump="house"]')).toHaveAttribute(
        'aria-label',
        `Čerpadlo topení: ${scenario === 'house' ? 'běží' : 'stojí'}`,
      );
      await noSidewaysScroll(page);
    });
  }

  test('porucha zastaví proudění; záložní topení regulace nemá, takže se nezmiňuje', async ({
    page,
  }) => {
    await page.goto('/homebrain-topeni?topeni=fault');
    await expect(page.getByTestId('heating-pill')).toContainText('Porucha', { timeout: 20_000 });
    await expect(page.getByTestId('heating-schematic')).toHaveAttribute('data-compressor', 'off');
    await expect(page.getByTestId('heating-backup')).toHaveCount(0);
    await expect(page.getByText(/záložní/i)).toHaveCount(0);
    await page.getByRole('radio', { name: /Poruchy/ }).click();
    await expect(page).toHaveURL(/\/homebrain-topeni\/poruchy/);
    await expect(page.getByTestId('heating-fault').first()).toBeVisible();
    await expect(page.getByText(/záložní/i)).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('Místnosti: referenční chodba a nejchladnější pokoj', async ({ page }) => {
    await page.goto('/homebrain-topeni/mistnosti?topeni=heating&rooms=4');
    await expect(page.getByTestId('heating-room')).toHaveCount(4, { timeout: 20_000 });
    await expect(page.getByTestId('heating-room').first()).toHaveAttribute('data-coldest', '');
    await noSidewaysScroll(page);
  });

  test('Místnosti bez čidel: reference a kompaktní návod v jedné kartě', async ({ page }) => {
    await page.goto('/homebrain-topeni/mistnosti?topeni=heating&rooms=0');
    await expect(page.getByTestId('heating-rooms-empty')).toContainText('Aqara', {
      timeout: 20_000,
    });
    const ref = page.getByTestId('heating-ref-room');
    await expect(ref).toContainText('řídí topení celého domu');
    await expect(ref).toContainText('cíl 22,5');
    await expect(ref.getByTestId('heating-rooms-empty')).toContainText(
      'Nastavení HomeBrain → Moduly → Topení',
    );
    await noSidewaysScroll(page);
  });

  test('Trendy: rozsahy, překryvy, běhy kompresoru a účinnost', async ({ page }) => {
    await page.goto('/homebrain-topeni/trendy?topeni=heating');
    await expect(page.getByTestId('heating-trend')).toBeVisible({ timeout: 20_000 });
    // run lane sits between the plot and the time labels of the same chart
    const lane = await page.getByTestId('heating-trend-chart').evaluate((el) => {
      const r = (s: string) => el.querySelector(s)!.getBoundingClientRect();
      return { plot: r('.ht-chart').bottom, runs: r('.ht-runs').top, labels: r('.ht-xlabs').top };
    });
    expect(lane.runs).toBeGreaterThanOrEqual(lane.plot - 1);
    expect(lane.labels).toBeGreaterThan(lane.runs);
    await page.getByRole('radio', { name: '10 let' }).click();
    await expect(page.getByTestId('heating-trend')).toHaveAttribute('data-range', 'all');
    await expect(page.getByTestId('heating-scatter')).toBeVisible();
    await expect(page.getByTestId('heating-efficiency')).toContainText('2018/19');
    // three point groups, each with its own legend entry and trend line
    await expect(
      page.getByTestId('heating-scatter-legend').locator('span[data-group]'),
    ).toHaveCount(3);
    await expect(page.locator('.ht-fit')).toHaveCount(3);
    await noSidewaysScroll(page);
  });

  test('Sezóny: 10 let a poznámka o druhé budově', async ({ page }) => {
    await page.goto('/homebrain-topeni/sezony?topeni=heating');
    await expect(page.getByTestId('heating-season')).toHaveCount(10, { timeout: 20_000 });
    await expect(
      page.getByText('Medián délky běhu (hodinová data, orientační)', { exact: true }),
    ).toHaveCount(10);
    await expect(page.getByTestId('heating-season-note')).toContainText(
      '2018/19: druhá budova se přestala vytápět',
    );
    await noSidewaysScroll(page);
  });

  test('Režimy: ekviterm s „teď“, programy, jen ke čtení', async ({ page }) => {
    await page.goto('/homebrain-topeni/rezimy?topeni=heating');
    await expect(page.getByTestId('heating-curve-now')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('heating-readonly')).toContainText('Jen pro čtení');
    await expect(page.getByText('Chlazení', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('heating-schedule')).not.toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('nenastaveno a zastaralá data', async ({ page }) => {
    await page.goto('/homebrain-topeni?topeni=unconfigured');
    await expect(page.getByTestId('heating-unconfigured')).toBeVisible({ timeout: 20_000 });
    await page.goto('/homebrain-topeni?topeni=stale');
    await expect(page.getByTestId('heating-stale')).toBeVisible({ timeout: 20_000 });
    expect(await infiniteAnimations(page)).toBe(0);
  });

  for (const width of [360, 390, 412]) {
    for (const [tab, ready] of [
      ['', 'heating-schematic'],
      ['/mistnosti', 'heating-rooms-empty'],
      ['/trendy', 'heating-trend-chart'],
      ['/sezony', 'heating-season'],
      ['/rezimy', 'heating-curve-now'],
      ['/poruchy', 'heating-faults-ok'],
    ] as const) {
      test(`telefon ${width} px ${tab || 'Teď'}: bez vodorovného posunu`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/homebrain-topeni${tab}?topeni=heating&rooms=0`);
        await expect(page.getByTestId(ready).first()).toBeVisible({ timeout: 20_000 });
        await noSidewaysScroll(page);
      });
    }
  }

  for (const theme of ['dark', 'light']) {
    for (const scenario of ['heating', 'dhw', 'house', 'idle']) {
      for (const [width, height] of [
        [390, 844],
        [844, 390],
        [1280, 800],
      ]) {
        test(`C3 ${theme} ${scenario} ${width}×${height}: čitelné popisky a hydraulika`, async ({
          page,
        }) => {
          await page.setViewportSize({ width: width!, height: height! });
          await page.goto(`/homebrain-topeni?topeni=${scenario}&theme=${theme}`);
          const sch = page.getByTestId('heating-schematic');
          await expect(sch).toBeVisible({ timeout: 20_000 });
          await page.evaluate(() => document.fonts.ready);
          expect(await sch.evaluate(schematicGeometry)).toEqual([]);
          await noSidewaysScroll(page);
        });
      }
    }
  }

  for (const [w, h, label] of [
    [844, 390, 'telefon na šířku 844×390'],
    [1280, 800, 'tablet 1280×800'],
    [1440, 900, 'desktop 1440×900'],
    [1920, 1080, 'wide 1920×1080'],
  ] as const) {
    test(`Teď ${label}: bohatý dashboard bez přesahu`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/homebrain-topeni?topeni=heating&rooms=4');
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.getByTestId('heating-land-dash')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('heating-land-strip')).toBeVisible();
      if (w >= 844 && h <= 450) {
        await expect(page.getByTestId('heating-side-fish')).toBeVisible();
        await expect(page.getByTestId('heating-side-fish')).toContainText('vzduch');
      }
      if (w >= 1100) {
        await expect(page.getByTestId('heating-side-fish')).toBeVisible();
        await expect(page.getByTestId('heating-side-extras')).toContainText('Solár');
        await expect(page.getByTestId('heating-side-extras')).toContainText('Bazén');
      }
      await expect(page.getByTestId('heating-land-house')).toBeVisible();
      await expect(page.getByTestId('heating-land-day-chart')).toBeVisible();
      await expect(page.getByTestId('heating-stat-outdoor')).toBeHidden();
      await expect(page.getByTestId('heating-day')).toBeHidden();
      await expect(page.getByTestId('heating-land-store')).toContainText('Nádrž');

      const layout = await page.evaluate(
        ({ vw, vh }) => {
          const doc = document.documentElement;
          const main = document.querySelector('[data-testid="heating-view"]')!;
          const mainBox = main.getBoundingClientRect();
          const strip = document
            .querySelector('[data-testid="heating-land-strip"]')!
            .getBoundingClientRect();
          const sch = document
            .querySelector('[data-testid="heating-schematic"]')!
            .getBoundingClientRect();
          const dash = document
            .querySelector('[data-testid="heating-land-dash"]')!
            .getBoundingClientRect();
          const panels = Array.from(document.querySelectorAll('.ht-land-panel')).map((p) =>
            p.getBoundingClientRect(),
          );
          const overlap = (a: DOMRect, b: DOMRect) =>
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
          const panelOverlap = panels.some((a, i) =>
            panels.some(
              (b, j) =>
                i < j &&
                overlap(a, b) &&
                Math.abs(a.top - b.top) < Math.min(a.height, b.height) * 0.8,
            ),
          );
          const panelHitsStrip = panels.some((p) => overlap(p, strip));
          const panelHitsSchematic = panels.some((p) => overlap(p, sch));
          const coverLeft = Math.min(sch.left, ...panels.map((p) => p.left));
          const coverRight = Math.max(sch.right, ...panels.map((p) => p.right));
          const coverPct = (coverRight - coverLeft) / mainBox.width;
          const schSvg = document.querySelector('[data-testid="heating-schematic"] svg')!;
          const svgBox = schSvg.getBoundingClientRect();
          const textMins =
            vh <= 450
              ? Array.from(schSvg.querySelectorAll('text')).map((t) => {
                  const r = document.createRange();
                  r.selectNodeContents(t);
                  return Math.min(...Array.from(r.getClientRects()).map((x) => x.height));
                })
              : [];
          const textOverlapResult =
            vh <= 450
              ? { hit: false, note: '' }
              : (() => {
                  const root = main.querySelector('.ht-now');
                  if (!root) return { hit: false, note: '' };
                  const area = (a: DOMRect, b: DOMRect) => {
                    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                    return w > 0 && h > 0 ? w * h : 0;
                  };
                  let overlapNote = '';
                  const rects: { box: DOMRect; owner: ParentNode | null; text: string }[] = [];
                  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                  let n: Node | null;
                  while ((n = walker.nextNode())) {
                    const textNode = n;
                    if (!textNode.textContent?.trim()) continue;
                    const owner = textNode.parentElement?.closest('svg')
                      ? null
                      : textNode.parentElement;
                    if (!owner || !(owner as HTMLElement).getClientRects().length) continue;
                    if (
                      (owner as HTMLElement).closest(
                        '.ht-portrait-hero-copy, .ht-chart-wrap, [hidden], [aria-hidden="true"]',
                      )
                    ) {
                      continue;
                    }
                    const r = document.createRange();
                    r.selectNodeContents(n);
                    for (const box of Array.from(r.getClientRects())) {
                      if (box.width < 1 || box.height < 1) continue;
                      if (
                        rects.some(({ box: q, owner: o, text: t }) => {
                          if (owner === o || area(q, box) <= 24 || !overlap(q, box)) return false;
                          overlapNote = `${t} ⨯ ${textNode.textContent?.trim().slice(0, 40)}`;
                          return true;
                        })
                      ) {
                        return { hit: true, note: overlapNote };
                      }
                      rects.push({
                        box,
                        owner,
                        text: textNode.textContent?.trim().slice(0, 40) ?? '',
                      });
                    }
                  }
                  return { hit: false, note: overlapNote };
                })();
          const allPanelsInView = vh >= 1000 ? panels.every((p) => p.bottom <= vh + 1) : true;
          const pumps = document.querySelector('[data-testid="heating-land-pumps"]');
          const pumpsBox = pumps?.getBoundingClientRect();
          const chipsInView = !pumpsBox || pumpsBox.bottom <= vh + 1;
          const schematicBottomOk = sch.bottom <= vh + 1;
          let deadZoneMax = 0;
          if (vw >= 1280 && vh >= 600 && panels.length) {
            const dashRoot = document.querySelector('[data-testid="heating-land-dash"]')!;
            const dBox = dashRoot.getBoundingClientRect();
            const day = document
              .querySelector('[data-testid="heating-land-day"]')
              ?.getBoundingClientRect();
            const status = document
              .querySelector('[data-testid="heating-land-status"]')
              ?.getBoundingClientRect();
            if (day && status) {
              const orphanW =
                dBox.right - Math.max(day.right, status.right, ...panels.map((p) => p.right));
              const orphanH = dBox.bottom - Math.max(day.bottom, ...panels.map((p) => p.bottom));
              deadZoneMax = Math.max(orphanW, orphanH);
            }
          }
          const stickyTopGap = vh <= 450 && vh >= 360 ? sch.top - dash.top : null;
          const schSvgTexts = ['tank-title', 'cold-water'];
          const svgLabelPipeHits: string[] = [];
          if (vh >= 600) {
            const schRoot = document.querySelector('[data-testid="heating-schematic"]')!;
            for (const id of schSvgTexts) {
              const label = schRoot.querySelector(`[data-label="${id}"]`);
              if (!label) continue;
              const lb = label.getBoundingClientRect();
              for (const path of Array.from(
                schRoot.querySelectorAll<SVGPathElement>(
                  '.ht-c3-route > path, path[data-pipe-id], .ht-c3-metal-pipe',
                ),
              )) {
                const stroke = Number.parseFloat(getComputedStyle(path).strokeWidth) / 2;
                for (let n = 0; n <= path.getTotalLength(); n += 1) {
                  const at = path.getPointAtLength(n);
                  const pt = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM()!);
                  if (
                    pt.x + stroke > lb.left &&
                    pt.x - stroke < lb.right &&
                    pt.y + stroke > lb.top &&
                    pt.y - stroke < lb.bottom
                  ) {
                    svgLabelPipeHits.push(
                      `${id}/${path.closest('[data-pipe-id]')?.getAttribute('data-pipe-id') ?? 'pipe'}`,
                    );
                    break;
                  }
                }
              }
            }
          }
          return {
            hScroll: doc.scrollWidth - doc.clientWidth,
            schW: svgBox.width,
            schH: svgBox.height,
            schInView:
              sch.left >= -1 && sch.right <= vw + 1 && sch.bottom <= vh + 2 && sch.top >= -2,
            dashInView: dash.right <= vw + 1,
            panelOverlap,
            panelHitsStrip,
            panelHitsSchematic,
            coverPct,
            textMins,
            textOverlaps: textOverlapResult.hit,
            overlapNote: textOverlapResult.note,
            allPanelsInView,
            chipsInView,
            schematicBottomOk,
            schTop: sch.top,
            schBottom: sch.bottom,
            deadZoneMax,
            stickyTopGap,
            svgLabelPipeHits: [...new Set(svgLabelPipeHits)],
            stripH: strip.height,
          };
        },
        { vw: w, vh: h },
      );

      expect(layout.hScroll).toBeLessThanOrEqual(0);
      expect(layout.dashInView).toBe(true);
      expect(layout.panelOverlap).toBe(false);
      expect(layout.panelHitsStrip).toBe(false);
      expect(layout.panelHitsSchematic).toBe(false);
      expect(layout.textOverlaps, layout.overlapNote || '').toBe(false);

      if (h <= 450) {
        expect(layout.schW, 'readable SVG in short landscape').toBeGreaterThanOrEqual(w * 0.45);
      } else {
        expect(layout.schW).toBeGreaterThanOrEqual(w * 0.17);
        const fitMaxH = Math.max(200, h - layout.stripH - 80);
        expect(layout.schH).toBeGreaterThanOrEqual(Math.min(h * 0.48, fitMaxH) - 4);
        expect(
          layout.schematicBottomOk && layout.schInView,
          `schematic fits viewport (top=${layout.schTop} bottom=${layout.schBottom} vh=${h})`,
        ).toBe(true);
        expect(layout.chipsInView, 'pump chips visible').toBe(true);
        expect(layout.deadZoneMax, 'dead zone px').toBeLessThanOrEqual(120);
        if (w >= 1280) {
          const dayW = await page
            .getByTestId('heating-land-day')
            .evaluate((el) => el.getBoundingClientRect().width);
          const dashW = await page
            .getByTestId('heating-land-dash')
            .evaluate((el) => el.getBoundingClientRect().width);
          expect(dayW).toBeGreaterThanOrEqual(dashW * 0.88);
        }
        expect(layout.svgLabelPipeHits, layout.svgLabelPipeHits.join(', ')).toEqual([]);
        expect(layout.coverPct).toBeGreaterThanOrEqual(0.85);
        if (h >= 1000) expect(layout.allPanelsInView).toBe(true);
      }
      if (h <= 450 && h >= 360) {
        expect(layout.stickyTopGap ?? 999, 'schematic top aligned to dash').toBeLessThanOrEqual(24);
      }
      await noSidewaysScroll(page);
    });
  }

  test('Další okruhy: panely v kraji na šířku, skryté bez mapování', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/homebrain-topeni?topeni=heating');
    await expect(page.getByTestId('heating-side-fish')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('heating-side-fish')).toContainText('topí');
    await expect(page.getByTestId('heating-side-extras')).toContainText('stojí');
    await page.goto('/homebrain-topeni?topeni=heating&extras=none');
    await expect(page.getByTestId('heating-side-fish')).toHaveCount(0);
    await expect(page.getByTestId('heating-side-extras')).toHaveCount(0);
  });

  test('Teď na šířku house: ΔT jen při běhu, půda viditelná', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/homebrain-topeni?topeni=house');
    await expect(page.getByTestId('heating-land-dash')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('heating-sch-hp-delta')).toHaveCount(0);
    await expect(page.getByTestId('heating-land-house')).toContainText('Půda');
    await noSidewaysScroll(page);
  });

  test('změna nastavení omezeného pohybu zastaví i rozběhnuté částice', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=heating');
    await expect(page.getByTestId('heating-schematic')).toBeVisible({ timeout: 20_000 });
    expect(await infiniteAnimations(page)).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => infiniteAnimations(page)).toBe(0);
    await expect(page.locator('[data-pipe-id="tank-inlet"]')).toHaveAttribute('data-active', '');
  });

  test.describe('omezený pohyb', () => {
    test.use({ reducedMotion: 'reduce' });
    test('schéma je statické – žádné nekonečné animace', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/homebrain-topeni?topeni=heating');
      await expect(page.getByTestId('heating-schematic')).toBeVisible({ timeout: 20_000 });
      expect(await infiniteAnimations(page)).toBe(0);
      const chevrons = page.locator('.ht-c3-direction');
      await expect(chevrons).toHaveCount(16);
      expect(await page.getByTestId('heating-schematic').evaluate(schematicGeometry)).toEqual([]);
      for (const chevron of await chevrons.all()) await expect(chevron).toBeVisible();
    });
  });

  test('jednotky: venkovní min/max, příkon a hystereze v Režimech', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=heating&theme=light');
    await expect(page.getByTestId('heating-stat-outdoor')).toBeVisible({ timeout: 20_000 });
    const outdoorSub = await page.getByTestId('heating-stat-outdoor').innerText();
    expect(outdoorSub).toMatch(/dnes .*°C až .*°C/u);
    expect(outdoorSub).not.toMatch(/dnes -?\d+[,.]\d+ až/u);
    const meta = await page.getByTestId('heating-hero').innerText();
    expect(meta).toMatch(/\d,\d\u00a0kW/u);
    await page.goto('/homebrain-topeni/rezimy?topeni=heating&theme=light');
    await expect(page.getByTestId('heating-curve-now')).toBeVisible({ timeout: 20_000 });
    const modes = await page.getByTestId('heating-view').innerText();
    expect(modes).toMatch(/± \d+[,.]\d[\s\u00a0]°C/u);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`os chartů čitelné v ${theme} motivu`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/homebrain-topeni/trendy?topeni=heating&theme=${theme}`);
      await expect(page.getByTestId('heating-trend-chart')).toBeVisible({ timeout: 20_000 });
      const metrics = await page.evaluate(() => {
        const c = document.createElement('canvas').getContext('2d')!;
        const resolve = (color: string) => {
          c.fillStyle = color;
          c.fillRect(0, 0, 1, 1);
          return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const lum = (rgb: number[]) => {
          const lin = rgb.map((v) => {
            const x = v / 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          });
          return lin[0]! * 0.2126 + lin[1]! * 0.7152 + lin[2]! * 0.0722;
        };
        const contrast = (fg: string, bg: string) => {
          const a = lum(resolve(fg));
          const b = lum(resolve(bg));
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const card = document.querySelector('[data-testid="heating-trend"]')!;
        const cardBg = getComputedStyle(card).backgroundColor;
        const axisLabels = Array.from(document.querySelectorAll('.ht-xlabs span, .ht-ylab'));
        const contrasts = axisLabels.map((el) => {
          const style = getComputedStyle(el);
          return contrast(el instanceof SVGElement ? style.fill : style.color, cardBg);
        });
        const ylabGaps: number[] = [];
        const runsLbl = document.querySelector('.ht-runs-lbl');
        if (runsLbl) {
          const rb = runsLbl.getBoundingClientRect();
          for (const ylab of Array.from(document.querySelectorAll('.ht-ylab'))) {
            const yb = ylab.getBoundingClientRect();
            ylabGaps.push(
              Math.hypot(
                Math.max(yb.left - rb.right, rb.left - yb.right, 0),
                Math.max(yb.top - rb.bottom, rb.top - yb.bottom, 0),
              ),
            );
          }
        }
        return { contrasts, ylabGaps };
      });
      expect(metrics.contrasts.length).toBeGreaterThan(0);
      expect(Math.min(...metrics.contrasts)).toBeGreaterThanOrEqual(4.5);
      if (theme === 'light') {
        expect(metrics.ylabGaps.length).toBeGreaterThan(0);
        expect(Math.min(...metrics.ylabGaps)).toBeGreaterThanOrEqual(4);
      }
    });
  }

  test('Teď solár: hero a elektřina TČ, schéma bez solárního okruhu (SCHEMATIC_SOLAR)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=solar&theme=dark');
    await expect(page.getByTestId('heating-solar-compact')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('heating-pill')).toContainText('Solár nabíjí nádrž');
    await expect(page.getByTestId('heating-headline')).toContainText(
      'Slunce nahřívá akumulační nádrž',
    );
    await expect(page.getByTestId('heating-hero')).toContainText(/kolektor.*čerpadlo/u);
    await expect(page.getByTestId('heating-hp-electricity')).toContainText('Elektřina TČ');
    await expect(page.getByTestId('heating-hp-electricity')).toContainText('W');
    const viewText = await page.getByTestId('heating-view').innerText();
    expect(viewText).not.toMatch(/\\u00a0/);
    const sch = page.getByTestId('heating-schematic');
    await expect(sch.getByTestId('heating-sch-solar-panel')).toHaveCount(0);
    await expect(sch.getByTestId('heating-sch-solar-coil')).toHaveCount(0);
    await expect(sch.locator('[data-pipe-id="solar-supply"]')).toHaveCount(0);
    await expect(sch.locator('[data-pipe-id="solar-return"]')).toHaveCount(0);
    await expect(sch.locator('[data-pump="solar"]')).toHaveCount(0);
    await expect(sch.getByTestId('heating-sch-solar-collector')).toHaveCount(0);
    await expect(sch.getByTestId('heating-sch-solar-pump')).toHaveCount(0);
    const bannerTop = await page.getByTestId('heating-solar-compact').evaluate((el) => el.getBoundingClientRect().top);
    const roomsTop = await page
      .getByTestId('heating-rooms-mini')
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(bannerTop).toBeLessThan(roomsTop);
  });

  test('Teď kompresor: hero beze solární věty', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=heating&theme=dark');
    await expect(page.getByTestId('heating-headline')).toContainText('nahříváme nádrž', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('heating-pill')).not.toContainText('Solár nabíjí nádrž');
  });

  test('Teď solár bez účinku: varování a scénář landscape', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/homebrain-topeni?topeni=solar-nogain&theme=dark');
    await expect(page.getByTestId('heating-land-strip')).toContainText('odvzdušnění', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('heating-headline')).toContainText('bez ohřevu');
    await expect(page.getByTestId('heating-land-strip')).toContainText('Elektřina TČ');
  });

  test('Teď portrét: popisky schématu ≥ 11 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=heating');
    await expect(page.getByTestId('heating-schematic')).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const min = await page.getByTestId('heating-schematic').evaluate((el) => {
      const svg = el.querySelector('svg')!;
      const rendered = (node: SVGGraphicsElement) => {
        const b = node.getBBox();
        const m = node.getScreenCTM()!;
        const a = new DOMPoint(b.x, b.y).matrixTransform(m);
        const z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m);
        return z.y - a.y;
      };
      return Math.min(
        ...Array.from(svg.querySelectorAll('text')).map((t) => rendered(t as SVGGraphicsElement)),
      );
    });
    expect(min).toBeGreaterThanOrEqual(11);
  });

  for (const [scenario, width, height] of [
    ['solar-off-hot', 390, 844],
    ['solar-off-hot', 1280, 800],
    ['off', 390, 844],
    ['off', 1280, 800],
  ] as const) {
    test(`Upozornění ${scenario} ${width}×${height}: banner viditelný, bez překryvu hero`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/homebrain-topeni?topeni=${scenario}&theme=dark`);
      const banner = page.getByTestId('heating-alert-banner');
      await expect(banner).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('heating-hero')).toBeVisible({ timeout: 20_000 });
      const geom = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="heating-alert-banner"]')!;
        const h = document.querySelector('[data-testid="heating-hero"]')!;
        const br = b.getBoundingClientRect();
        const hr = h.getBoundingClientRect();
        const vh = window.innerHeight;
        return {
          bannerFullyVisible: br.top >= 0 && br.bottom <= vh + 1,
          noOverlap: br.bottom <= hr.top + 2,
          bannerAboveHero: br.top < hr.top,
        };
      });
      expect(geom.bannerFullyVisible).toBe(true);
      expect(geom.noOverlap).toBe(true);
      expect(geom.bannerAboveHero).toBe(true);
    });
  }

  test('Vypnuto: pill Vypnuto, ne Klidový režim', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=off&theme=dark');
    await expect(page.getByTestId('heating-pill')).toHaveText('Vypnuto', { timeout: 20_000 });
    await expect(page.getByTestId('heating-pill')).not.toContainText('Klidový');
    await expect(page.getByTestId('heating-pill')).not.toContainText('Odpočívá');
  });

  test('Režimy: karta změn nastavení', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/homebrain-topeni/rezimy?topeni=heating&theme=dark');
    const card = page.getByTestId('heating-changes-card');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('Solár');
    await expect(card).toContainText('zapnuto → vypnuto');
  });
});
