import { expect, test } from '@playwright/test';

test('Počasí: hustá obrazovka z mock adaptéru bez přetečení', async ({ page }, testInfo) => {
  test.setTimeout(90_000); // Full radar interaction flow, including cold lazy-module loading.
  await page.goto('/homebrain-pocasi');
  await expect(page.getByRole('heading', { name: 'Počasí', exact: true })).toBeVisible();
  await expect(page.getByTestId('weather-now-temp')).toContainText('7,8');
  // The warning is shown exactly once, inside the hero (no banner + card duplicate).
  await expect(page.getByTestId('weather-alert-banner')).toContainText('Silný vítr');
  await expect(page.getByTestId('weather-alert-banner')).toContainText('Oranžová výstraha');
  await expect(page.getByTestId('weather-hero').getByTestId('weather-warnings')).toBeVisible();
  await expect(page.getByText('Silný vítr', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('weather-hero-sentence')).toContainText('Slabý déšť');
  await expect(page.getByTestId('weather-radar-img')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('weather-radar')).toContainText('CC BY 4.0');
  await expect(page.getByTestId('weather-radar-headline')).toHaveText('Déšť za ~35 min, slabý');
  await expect(page.getByTestId('weather-radar-minutes')).toBeVisible();
  // Smooth, recoloured radar: canvas has soft (many distinct alpha) edges, not palette blocks.
  const alphas = await page
    .getByTestId('weather-radar-img')
    .locator('canvas.on')
    .evaluate((c: HTMLCanvasElement) => {
      const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const set = new Set<number>();
      for (let i = 3; i < px.length; i += 4) set.add(px[i]!);
      return set.size;
    });
  expect(alphas).toBeGreaterThan(12);
  await page.getByTestId('weather-radar-zoom-cesko').click();
  await expect(page.getByTestId('weather-radar-map')).toHaveAttribute('data-scope', 'cz');
  await expect(page.getByTestId('weather-radar-map')).toContainText('Brno');
  await page.getByTestId('weather-radar-zoom-okoli').click();
  await expect(page.getByTestId('weather-warnings')).toContainText('Silný vítr');
  await expect(page.getByTestId('weather-10d').locator('li')).toHaveCount(10);
  await expect(page.getByTestId('weather-sources')).toContainText('CC BY 4.0');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('tab', { name: 'Vítr' }).click();
  await expect(page.getByRole('tab', { name: 'Vítr' })).toHaveAttribute('aria-selected', 'true');
  await testInfo.attach('pocasi', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('Počasí: nedostupná data ukazují pomlčky', async ({ page }) => {
  await page.goto('/homebrain-pocasi?weather=unavailable');
  await expect(page.getByTestId('weather-now-temp')).toContainText('—');
  await expect(page.getByTestId('weather-10d')).toContainText('není k dispozici');
});

test('Dnes: živý feed počasí vlastní signály modulu weather', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // without `?weather` the dev host clears signal sources → deterministic Dnes fixture
  await page.goto('/homebrain-dnes?state=b');
  await expect(page.getByTestId('today')).toContainText('Déšť za 35 min');
  // `?weather=default` registers the weather feed → its nowcast signal replaces the fixture one
  await page.goto('/homebrain-dnes?state=b&weather=default');
  await expect(page.getByTestId('today')).toContainText('Déšť za ~35 min');
  await expect(page.getByTestId('today')).not.toContainText('Déšť za 35 min');
  // calm snapshot → weatherSignals() = [] → fixture weather signals are replaced, not duplicated
  await page.goto('/homebrain-dnes?state=b&weather=calm');
  await expect(page.getByTestId('today-hero')).toBeVisible();
  await expect(page.getByTestId('today')).not.toContainText('Déšť za ~35 min');
  await expect(page.getByTestId('today')).not.toContainText('Déšť za 35 min');
});

test('Počasí: radar smyčka se dá posouvat a bouřka ukáže konec deště', async ({ page }) => {
  await page.goto('/homebrain-pocasi?weather=storm');
  await expect(page.getByTestId('weather-alert-banner')).toContainText('Červená');
  const slider = page.getByTestId('weather-radar-slider');
  await expect(page.getByTestId('weather-radar-headline')).toContainText('přestane za ~25 min');
  await slider.fill('60');
  await expect(page.getByTestId('weather-radar-time')).toContainText('předpověď +60 min');
  await slider.fill('-55');
  await expect(page.getByTestId('weather-radar-time')).toContainText('před 55 min');
  await page.getByTestId('weather-radar-play').click();
  await expect(page.getByTestId('weather-radar-time')).not.toContainText('před 55 min');
});

test('Počasí: bez výstrah není banner', async ({ page }) => {
  await page.goto('/homebrain-pocasi?weather=calm');
  await expect(page.getByTestId('weather-warnings')).toContainText('Bez výstrah');
  await expect(page.getByTestId('weather-alert-banner')).toHaveCount(0);
});

test('Počasí: radar – popisky měst se nepřekrývají s čipy, graf slabého deště se škáluje', async ({
  page,
}) => {
  await page.goto('/homebrain-pocasi');
  await expect(page.getByTestId('weather-radar-img')).toBeVisible({ timeout: 15_000 });
  // Weak rain: ceiling at the 'mírný' threshold, band labels slabý + mírný (edge) only.
  await expect(page.getByTestId('weather-radar-minutes')).toHaveAttribute('data-top-mmh', '2.5');
  await expect(page.getByTestId('weather-radar-band')).toHaveText(['slabý', '↑ mírný']);
  for (const zoom of ['kraj', 'cesko', 'okoli'] as const) {
    await page.getByTestId(`weather-radar-zoom-${zoom}`).click();
    await page.waitForTimeout(700); // zoom animation (480 ms)
    const clashes = await page.getByTestId('weather-radar-map').evaluate((map) => {
      const chips = Array.from(map.querySelectorAll('[data-rv-obstacle="chip"]')).map((e) =>
        e.getBoundingClientRect(),
      );
      const out: string[] = [];
      for (const el of Array.from(
        map.querySelectorAll<HTMLElement>('[data-testid="weather-radar-place"]'),
      )) {
        if (el.hasAttribute('data-hidden')) continue;
        const r = el.getBoundingClientRect();
        for (const c of chips)
          if (r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top)
            out.push(el.textContent ?? '');
      }
      return out;
    });
    expect(clashes, zoom).toEqual([]);
  }
  // Secondary radar text stays readable (>= 11 px micro labels, >= 12 px elsewhere).
  const small = await page.getByTestId('weather-radar').evaluate((card) =>
    Array.from(
      card.querySelectorAll<HTMLElement>(
        '.wx-rv-yl,.wx-rv-xl span,.wx-rv-tx span,.wx-rv-legx span,.wx-rv-foot,.wx-rv-place',
      ),
    )
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
      .map((el) => el.textContent),
  );
  expect(small).toEqual([]);
});

test('Počasí: radar – graf se dá prohlížet kurzorem, zdroje v (i), značka „teď“ na posuvníku', async ({
  page,
}) => {
  await page.goto('/homebrain-pocasi');
  await expect(page.getByTestId('weather-radar-img')).toBeVisible({ timeout: 15_000 });
  // Smooth monotone curve (cubic Béziers), not a polyline.
  await expect(page.getByTestId('weather-radar-curve')).toHaveAttribute('d', /C/);
  const chart = page.getByTestId('weather-radar-minutes');
  // Mobile/tablet: the chart sits below the fold; mouse coords must be inside the viewport.
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  // Pointer events work for mouse and touch projects alike (mobile has no hover).
  const at = (fx: number) =>
    chart.dispatchEvent('pointermove', {
      clientX: box.x + (box.width - 54) * fx,
      clientY: box.y + box.height / 2,
      bubbles: true,
    });
  await at(0.75);
  await expect(page.getByTestId('weather-radar-scrub')).toContainText(/za 4\d min/);
  await at(0.003);
  await expect(page.getByTestId('weather-radar-scrub')).toContainText('teď');
  await chart.dispatchEvent('pointercancel', { bubbles: true });
  await expect(page.getByTestId('weather-radar-scrub')).toHaveCount(0);
  // Single-line attribution; full credits behind (i).
  const credits = page.getByTestId('weather-radar-credits');
  await expect(credits).toContainText('CC BY 4.0');
  await credits.locator('summary').click();
  await expect(credits.locator('.wx-rv-pop')).toBeVisible();
  await expect(credits.locator('.wx-rv-pop')).toContainText('Natural Earth');
  const lines = await credits
    .locator('.wx-rv-foot-l')
    .evaluate((el) =>
      Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
    );
  expect(lines).toBe(1);
  await expect(page.getByTestId('weather-radar-now')).toBeVisible();
});

test('Počasí: graf modelů – hladké křivky, méně řad, přepínací legenda a tooltip', async ({
  page,
}) => {
  await page.goto('/homebrain-pocasi');
  const card = page.getByTestId('weather-models');
  await expect(card).toBeVisible();
  // smooth cubic curves instead of polylines
  await expect(page.getByTestId('weather-models-blend')).toHaveAttribute('d', /C/);
  await expect(card.locator('polyline')).toHaveCount(0);
  const legend = page.getByTestId('weather-models-legend');
  const toggles = legend.locator('button[aria-pressed]');
  const total = await toggles.count();
  expect(total).toBeGreaterThan(3);
  await expect(legend.locator('button[aria-pressed="true"]')).toHaveCount(3);
  await expect(card.locator('path.wx-line--model')).toHaveCount(3);
  // r3: exactly one highlighted (most accurate) model, labelled directly at the line end with the mix
  await expect(card.locator('path.wx-line--model.is-hi')).toHaveCount(1);
  await expect(card.locator('.wx-endlab')).toHaveCount(2);
  await expect(legend.locator('.wx-lg-best')).toHaveCount(1);
  await toggles.nth(total - 1).click();
  await expect(card.locator('path.wx-line--model')).toHaveCount(4);
  await legend.getByRole('button', { name: 'Všechny modely' }).click();
  await expect(card.locator('path.wx-line--model')).toHaveCount(total);
  await legend.getByRole('button', { name: 'Jen hlavní' }).click();
  await expect(card.locator('path.wx-line--model')).toHaveCount(3);
  const chart = page.getByTestId('weather-models-chart');
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  await chart.dispatchEvent('pointermove', {
    clientX: box.x + box.width * 0.5,
    clientY: box.y + box.height / 2,
    pointerType: 'mouse',
    bubbles: true,
  });
  await expect(page.getByTestId('weather-models-tip')).toContainText('Mix');
  await chart.dispatchEvent('pointercancel', { bubbles: true });
  await expect(page.getByTestId('weather-models-tip')).toHaveCount(0);
});

for (const scenario of ['', 'calm'])
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ])
    test(`Počasí: mřížka bez prázdných buněk ${scenario || 'výchozí'} ${vp.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.goto(`/homebrain-pocasi${scenario ? `?weather=${scenario}` : ''}`);
      await expect(page.getByTestId('weather-radar')).toBeVisible();
      const rows = await page.locator('div.wx-grid').evaluate((grid) => {
        const g = grid.getBoundingClientRect();
        const rects = Array.from(grid.children)
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0);
        // a row = every card that starts at this top, plus cards spanning down across it
        // (desktop radar spans the station + accuracy rows)
        const byTop = new Map<number, { left: number; right: number }>();
        for (const top of Array.from(new Set(rects.map((r) => Math.round(r.top))))) {
          const row = { left: Infinity, right: -Infinity };
          for (const r of rects)
            if (Math.round(r.top) <= top && r.bottom > top + 1) {
              row.left = Math.min(row.left, r.left);
              row.right = Math.max(row.right, r.right);
            }
          byTop.set(top, row);
        }
        return Array.from(byTop.values()).map((r) => ({
          left: r.left - g.left,
          right: g.right - r.right,
        }));
      });
      // every row starts at the left edge and reaches the right edge (no empty cell)
      for (const r of rows) {
        expect(r.left).toBeLessThan(1);
        expect(r.right).toBeLessThan(1);
      }
      if (vp.width >= 1024) {
        const station = (await page.getByTestId('weather-station').boundingBox())!;
        const radar = (await page.getByTestId('weather-radar').boundingBox())!;
        expect(Math.abs(radar.y - station.y)).toBeLessThan(1);
      }
    });

test('Počasí: Včera a dnes, Historie a skóre srážek (issue #131)', async ({ page }) => {
  // 10 evidence screenshots per viewport need more than the default 30 s on a busy host
  if (process.env.HB_WEATHER_SCREENSHOT_DIR) test.setTimeout(120_000);
  await page.goto('/homebrain-pocasi');
  const yt = page.getByTestId('weather-yt');
  await expect(yt).toContainText('Dnes zatím');
  // ⚠ pressure change in the mock outranks the rain callout
  await expect(page.getByTestId('weather-yt-alert')).toContainText(
    'Průměrný tlak je dnes zatím o 26\u00a0hPa nižší než včera. Nárazy větru zatím až 16,2\u00a0m/s.',
  );
  await expect(yt.getByTestId('weather-yt-dprov')).toHaveCount(0);
  await expect(yt.getByTestId('weather-yt-missing')).toHaveCount(0);
  const ytGeo = await yt.evaluate((el) => {
    const now = el.querySelector('.wx-yt-hd--now')!;
    const [date, time] = Array.from(now.children).map((c) => c.getBoundingClientRect());
    // label vs. value in the pressure row: the value's first glyph vs. the label text's end
    const row = el.querySelector('[data-testid="weather-yt-msl"]')!;
    const th = row.querySelector('th')!;
    const r = document.createRange();
    r.selectNodeContents(th);
    const label = Array.from(r.getClientRects());
    const td = row.querySelector('td')!;
    const r2 = document.createRange();
    r2.selectNodeContents(td);
    const value = r2.getBoundingClientRect();
    const alert = el.querySelector('[data-testid="weather-yt-alert"] b')!.getBoundingClientRect();
    const icon = el.querySelector('.wx-yt-alert-ic')!.getBoundingClientRect();
    return {
      oneLine: Math.abs(date!.top - time!.top) < 2,
      // two whole lines: „so 31. 10.“ above „do 10:39“, nothing split inside either
      timeUnderDate: time!.top >= date!.bottom - 1 && date!.height < 20 && time!.height < 20,
      gap: value.left - Math.max(...label.map((l) => l.right)),
      hanging: alert.left - icon.right,
    };
  });
  // „so 31. 10. do 10:39“ on one line, else a clean break between date and time
  expect(ytGeo.oneLine || ytGeo.timeUnderDate).toBe(true);
  expect(ytGeo.gap).toBeGreaterThanOrEqual(8);
  expect(ytGeo.hanging).toBeGreaterThanOrEqual(0); // wrapped callout lines align right of ⚠
  const hist = page.getByTestId('weather-history');
  await expect(hist.getByTestId('weather-history-chart')).toBeVisible();
  await hist.getByRole('tab', { name: '30 dní' }).click();
  await expect(hist.getByTestId('weather-history-gaps')).toContainText('chybí data');
  await expect(page.getByTestId('weather-records')).toContainText('Rekordy za 30 dní');
  await expect(hist.getByTestId('weather-history-raindays')).toContainText('z\u00a029');
  // the window's exact days are on the card (today included, so 1. 10. is outside)
  await expect(hist.getByTestId('weather-history-range')).toHaveText(
    '2. 10. – 31. 10. 2026 (dnes zatím)',
  );
  // today's outline is neutral (--hb-t2), not the rain blue; mm labels sit right of the plot
  const look = await hist.evaluate((el) => {
    const g = el.querySelector('.wx-hist-chart svg > g.is-partial .wx-hist-r')!;
    const plot = el.querySelector('[data-testid="weather-history-plot"]')!.getBoundingClientRect();
    const labels = Array.from(el.querySelectorAll('.wx-hist-yl--r, .wx-hist-yt--r'));
    return {
      stroke: getComputedStyle(g).stroke,
      rain: getComputedStyle(g).fill,
      minLeft: Math.min(...labels.map((l) => l.getBoundingClientRect().left - plot.right)),
    };
  });
  expect(look.stroke).toMatch(/^rgb/);
  expect(look.stroke).not.toBe(look.rain);
  expect(look.minLeft).toBeGreaterThanOrEqual(6);
  // the x-axis chip is the selected day, framed like the selected column (not the range end)
  const chip = await hist.evaluate((el) => {
    const cur = el.querySelector('[data-testid="weather-history-cursor"]')!;
    const tick = el.querySelector('[data-testid="weather-history-seltick"]')!;
    const a = cur.getBoundingClientRect();
    const b = tick.getBoundingClientRect();
    return {
      dx: Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)),
      same: getComputedStyle(cur).borderTopColor === getComputedStyle(tick).borderTopColor,
      text: tick.textContent,
      detail: el.querySelector('[data-testid="weather-history-detail"] b')!.textContent,
    };
  });
  expect(chip.dx).toBeLessThan(1.5);
  expect(chip.same).toBe(true);
  expect(chip.detail).toContain(chip.text!);
  // touch targets: period buttons and the scrub area are at least 44 px tall
  for (const b of await hist.getByRole('tab').all())
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const chart = hist.getByTestId('weather-history-chart');
  const box = (await chart.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  // drag across the plot moves the selection
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(hist.getByTestId('weather-history-detail')).not.toContainText('30. 10.');
  await hist.getByRole('tab', { name: '30 dní' }).click(); // reset selection
  await page.getByTestId('weather-score-tab-rain').click();
  await expect(page.getByTestId('weather-score-rain')).toContainText('zachytil');
  await expect(page.getByTestId('weather-score-rain-blend')).toContainText('kombinace');
  await expect(page.getByTestId('weather-score-rain-blend').locator('.wx-rank-n')).toHaveText('1.');
  // ALADIN 0,37 → ECMWF IFS 0,30: 0,07 < 0,13 → „≈“ between the two pills
  const near = page
    .getByTestId('weather-score-rain-ecmwf_ifs')
    .getByTestId('weather-score-rain-near');
  await expect(near).toHaveText('≈');
  await expect(near).toHaveAttribute('aria-label', /rozdíl 0,07 je menší než 0,13/);
  await expect(page.getByTestId('weather-score-rain-near')).toHaveCount(4);
  // Mix is not crowned: its rank pill looks like everyone else's
  const pills = await page
    .getByTestId('weather-score-rain')
    .evaluate((el) =>
      Array.from(el.querySelectorAll('.wx-rank-n')).map((p) => getComputedStyle(p).backgroundColor),
    );
  expect(new Set(pills.slice(0, 5)).size).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Evidence for the PR (owner visual check): HB_WEATHER_SCREENSHOT_DIR=<dir> pnpm test:e2e …
  const dir = process.env.HB_WEATHER_SCREENSHOT_DIR;
  if (!dir) return;
  const { width, height } = page.viewportSize()!;
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.goto('/homebrain-pocasi?theme=light');
      await hist.getByRole('tab', { name: '30 dní' }).click();
      await page.getByTestId('weather-score-tab-rain').click();
    }
    await page.evaluate(() => document.fonts.ready);
    // The sticky shell top bar would cover element shots scrolled under it (evidence only).
    await page.addStyleTag({ content: '.hb-topbar{position:static !important}' });
    const name = (what: string) => `${dir}/weather-${what}-${width}x${height}-${theme}.png`;
    await yt.screenshot({ path: name('vcera-a-dnes'), animations: 'disabled' });
    await hist.screenshot({ path: name('historie-30d'), animations: 'disabled' });
    await page
      .getByTestId('weather-score')
      .screenshot({ path: name('skore-dest'), animations: 'disabled' });
    await hist.getByRole('tab', { name: '365 dní' }).click();
    await hist.screenshot({ path: name('historie-365d'), animations: 'disabled' });
    await hist.getByRole('tab', { name: '30 dní' }).click();
    await page.screenshot({ path: name('stranka'), fullPage: true, animations: 'disabled' });
  }
});

/** WCAG contrast of computed colours (rgb()/color(srgb …), alpha composited over the backdrop). */
test('Počasí #131: kontrast ve světlém motivu (šedý text ≥ 4,5 : 1, dnešní sloupec ≥ 3 : 1)', async ({
  page,
}) => {
  await page.goto('/homebrain-pocasi?theme=light');
  await expect(page.getByTestId('weather-history-chart')).toBeVisible();
  await page.getByTestId('weather-score-tab-rain').click();
  const res = await page.evaluate(() => {
    type C = [number, number, number, number];
    const parse = (s: string): C => {
      const n = s.match(/[\d.]+/g)!.map(Number);
      if (s.startsWith('color(')) return [n[0]! * 255, n[1]! * 255, n[2]! * 255, n[3] ?? 1];
      return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
    };
    const over = (f: C, b: C): C => [
      f[0] * f[3] + b[0] * (1 - f[3]),
      f[1] * f[3] + b[1] * (1 - f[3]),
      f[2] * f[3] + b[2] * (1 - f[3]),
      1,
    ];
    const lum = (c: C) => {
      const l = c.slice(0, 3).map((v) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
    };
    const ratio = (a: C, b: C) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    const backdrop = (el: Element): C => {
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
      let bg: C = [255, 255, 255, 1];
      for (const e of chain.reverse()) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) bg = over(c, bg);
      }
      return bg;
    };
    const probe = (v: string) => {
      const p = document.createElement('span');
      p.style.color = `var(${v})`;
      document.querySelector('.wx')!.appendChild(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    };
    const greys = new Set([probe('--hb-t2'), probe('--hb-t3')]);
    const worst: { text: string; ratio: number }[] = [];
    let checked = 0;
    for (const id of ['weather-yt', 'weather-history', 'weather-score']) {
      const card = document.querySelector(`[data-testid="${id}"]`)!;
      for (const el of Array.from(card.querySelectorAll('*'))) {
        const own = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && n.textContent!.trim(),
        );
        const cs = getComputedStyle(el);
        if (!own || !greys.has(cs.color) || (el as HTMLElement).offsetParent === null) continue;
        if (el.closest('.wx-sr, .wx-prank-lbl') && cs.position === 'absolute') continue;
        checked++;
        const r = ratio(over(parse(cs.color), backdrop(el)), backdrop(el));
        if (r < 4.5) worst.push({ text: el.textContent!.slice(0, 40), ratio: r });
      }
    }
    const bars = Array.from(
      document.querySelectorAll('[data-testid="weather-history-chart"] svg > g.is-partial rect'),
    ).map((r) => {
      const cs = getComputedStyle(r);
      const fill = parse(cs.fill);
      fill[3] *= Number(cs.fillOpacity);
      const bg = backdrop(r.closest('.wx-hist-chart')!);
      return ratio(over(fill, bg), bg);
    });
    return { checked, worst, bars };
  });
  expect(res.checked).toBeGreaterThan(20);
  expect(res.worst).toEqual([]);
  expect(res.bars.length).toBeGreaterThan(0);
  for (const r of res.bars) expect(r).toBeGreaterThanOrEqual(3);
});
