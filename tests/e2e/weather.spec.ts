import { expect, test } from '@playwright/test';

test('Počasí: hustá obrazovka z mock adaptéru bez přetečení', async ({ page }, testInfo) => {
  test.setTimeout(90_000); // Full radar interaction flow, including cold lazy-module loading.
  await page.goto('/weather');
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
  await page.goto('/weather?weather=unavailable');
  await expect(page.getByTestId('weather-now-temp')).toContainText('—');
  await expect(page.getByTestId('weather-10d')).toContainText('není k dispozici');
});

test('Dnes: živý feed počasí vlastní signály modulu weather', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // without `?weather` the dev host clears signal sources → deterministic Dnes fixture
  await page.goto('/today?state=b');
  await expect(page.getByTestId('today')).toContainText('Déšť za 35 min');
  // `?weather=default` registers the weather feed → its nowcast signal replaces the fixture one
  await page.goto('/today?state=b&weather=default');
  await expect(page.getByTestId('today')).toContainText('Déšť za ~35 min');
  await expect(page.getByTestId('today')).not.toContainText('Déšť za 35 min');
  // calm snapshot → weatherSignals() = [] → fixture weather signals are replaced, not duplicated
  await page.goto('/today?state=b&weather=calm');
  await expect(page.getByTestId('today-hero')).toBeVisible();
  await expect(page.getByTestId('today')).not.toContainText('Déšť za ~35 min');
  await expect(page.getByTestId('today')).not.toContainText('Déšť za 35 min');
});

test('Počasí: radar smyčka se dá posouvat a bouřka ukáže konec deště', async ({ page }) => {
  await page.goto('/weather?weather=storm');
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
  await page.goto('/weather?weather=calm');
  await expect(page.getByTestId('weather-warnings')).toContainText('Bez výstrah');
  await expect(page.getByTestId('weather-alert-banner')).toHaveCount(0);
});

test('Počasí: radar – popisky měst se nepřekrývají s čipy, graf slabého deště se škáluje', async ({
  page,
}) => {
  await page.goto('/weather');
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
  await page.goto('/weather');
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
  await page.goto('/weather');
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
      await page.goto(`/weather${scenario ? `?weather=${scenario}` : ''}`);
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
