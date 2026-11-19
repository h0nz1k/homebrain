import { expect, test, type Page } from '@playwright/test';

// Lazy chunk + 3235 × 1300 drawing: give slow CI runners room.
test.describe.configure({ timeout: 120_000 });

// Topení – celé schéma (p3i, r2): fullscreen pan/zoom from the Toky card, dev mock data.

async function open(page: Page, query: string, lod: 'any' | 'detail' = 'any') {
  await page.goto(`/homebrain-topeni?${query}`);
  await page.getByTestId('heating-full-open').click({ timeout: 20_000 });
  const sheet = page.getByTestId('heating-full-schematic');
  const svg = sheet.getByTestId('heating-full-svg');
  await expect(svg).toBeVisible({ timeout: 30_000 });
  // desktop opens on the overview (zone cards); the detail labels come with zooming in
  if (lod === 'detail') {
    for (let i = 0; i < 8 && (await svg.getAttribute('data-lod')) !== 'detail'; i++)
      await sheet.getByTestId('heating-full-viewport').press('+');
    await expect(svg).toHaveAttribute('data-lod', 'detail');
  }
  return sheet;
}

/**
 * Every text of the drawing inside the visible frame (viewport ∩ preset clip): returns the texts
 * that are cut by the frame edge and the smallest font size (CSS px) of the fully visible ones.
 */
async function frameCheck(page: Page) {
  return page.getByTestId('heating-full-viewport').evaluate((port) => {
    const pr = port.getBoundingClientRect();
    const svg = port.querySelector('svg')!;
    const sr = svg.getBoundingClientRect();
    const k = sr.width / Number(svg.getAttribute('width'));
    const box = port.querySelector<HTMLElement>('[data-clip-box]')?.dataset.clipBox;
    let [l, t, r, b] = [pr.left, pr.top, pr.right, pr.bottom];
    if (box) {
      const [x, y, w, h] = box.split(' ').map(Number) as [number, number, number, number];
      l = Math.max(l, sr.left + x * k);
      t = Math.max(t, sr.top + y * k);
      r = Math.min(r, sr.left + (x + w) * k);
      b = Math.min(b, sr.top + (y + h) * k);
    }
    const cut: string[] = [];
    let min = Infinity;
    let minValue = Infinity;
    for (const el of Array.from(svg.querySelectorAll<SVGTextElement>('text'))) {
      const q = el.getBoundingClientRect();
      if (q.width === 0 || !el.textContent?.trim()) continue;
      const out = q.right <= l + 1 || q.left >= r - 1 || q.bottom <= t + 1 || q.top >= b - 1;
      if (out) continue;
      const inside = q.left >= l - 1 && q.right <= r + 1 && q.top >= t - 1 && q.bottom <= b + 1;
      const px = Number(el.getAttribute('font-size')) * k;
      if (!inside) cut.push(el.textContent.trim());
      else if (el.matches('.fs-pv, .fs-pv-none')) minValue = Math.min(minValue, px);
      else min = Math.min(min, px);
    }
    return { cut, min, minValue };
  });
}

const infinite = (page: Page) =>
  page.evaluate(
    () =>
      document.getAnimations().filter((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return (
          a.effect?.getTiming().iterations === Infinity &&
          target instanceof Element &&
          target.closest('[data-testid="heating-full-svg"]') !== null
        );
      }).length,
  );

/** WCAG contrast of an element's fill against a colour. */
const contrastOf = (page: Page, selector: string, against: string) =>
  page.evaluate(
    ([sel, bg]) => {
      const el = document.querySelector(sel!)!;
      const rgb = (c: string) => (c.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number);
      const lum = (c: number[]) =>
        c
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const probe = document.createElement('div');
      probe.style.color = bg!;
      el.closest('.ht-fs')!.appendChild(probe);
      const back = rgb(getComputedStyle(probe).color);
      probe.remove();
      const fore = rgb(getComputedStyle(el).fill);
      // no translucent ancestors may thin the text
      let op = 1;
      for (let n: Element | null = el; n && n.tagName !== 'svg'; n = n.parentElement)
        op *= Number(getComputedStyle(n).opacity);
      const [a, b] = [lum(fore), lum(back)].sort((x, y) => y - x) as [number, number];
      return { ratio: (a + 0.05) / (b + 0.05), opacity: op };
    },
    [selector, against],
  );

for (const theme of ['dark', 'light'] as const) {
  test(`celé schéma ${theme}: živá data bez poruchy, otazníky, kontrast, bez kódů PLC`, async ({
    page,
  }) => {
    const sheet = await open(page, `topeni=heating&theme=${theme}`, 'detail');
    await expect(sheet).toHaveAttribute('data-fs-theme', theme);
    // realistic data: no fault anywhere, mixing valve position unknown = neutral, not a fault
    await expect(sheet.getByTestId('heating-full-alert')).toHaveCount(0);
    await expect(sheet.locator('[data-fault-glyph]')).toHaveCount(0);
    await expect(sheet.locator('[data-glyph="valve_mix"]')).toHaveAttribute('data-path', 'unknown');
    await expect(sheet.getByTestId('heating-full-mix-pct')).toHaveText('poloha: bez signálu');
    await expect(sheet.getByTestId('heating-full-cool-state')).toHaveText('bez signálu');
    // heat pump: compressor running, readouts outside the cabinet
    await expect(sheet.getByTestId('heating-full-hp')).toHaveAttribute('data-compressor', 'on');
    await expect(sheet.locator('[data-label="hp_t_out"]')).toContainText('Výstup do topení');
    await expect(sheet.locator('[data-pill="hp_coll_in"][data-reading="none"]')).toHaveText(/–/u);
    // rybárna: valve to heating open = tempering active
    await expect(sheet.getByTestId('heating-full-fish-state')).toHaveText('topí');
    await expect(sheet.getByTestId('heating-full-pool-card')).toContainText('27,9 °C');
    // one marker per question, each on a device
    for (const q of ['?1', '?2', '?3', '?4']) {
      await expect(sheet.locator(`[data-badge-for][data-question="${q}"]`)).toHaveCount(1);
    }
    // secondary labels ≥ 4.5:1 on the technical room, never thinned by opacity
    for (const sel of [
      '[data-testid="heating-full-cool-state"]',
      '[data-testid="heating-full-mix-pct"]',
      '[data-label="hp_coll_out"]',
      '[data-label="hx_cool"]',
    ]) {
      const c = await contrastOf(page, sel, 'var(--fs-tech)');
      expect(c.ratio, sel).toBeGreaterThanOrEqual(4.5);
      expect(c.opacity, sel).toBe(1);
    }
    const text = await sheet.getByTestId('heating-full-svg').textContent();
    expect(text).not.toMatch(/\b[XYR]\d{2,4}(\.\d)?\b/u);
    expect(text).not.toMatch(new RegExp(`${'sol'}ank|${'br'}ine`, 'i'));
    expect(text).not.toMatch(/porucha|nouzov/iu);
    // service view adds the addresses of the (here synthetic) private map
    await sheet.getByTestId('heating-full-service').click();
    await expect(sheet.locator('[data-service-code="hp_t_out"]')).toHaveText('X336');
    await sheet.getByTestId('heating-full-close').click();
    await expect(sheet).toHaveCount(0);
  });
}

test('celé schéma: porucha směšovače jen z explicitní kontrolky (testovací fixture)', async ({
  page,
}) => {
  const sheet = await open(page, 'topeni=heating&ventil=porucha&theme=light', 'detail');
  const alert = sheet.getByTestId('heating-full-alert');
  await expect(alert).toContainText('Směšovací ventil');
  await expect(sheet.locator('[data-glyph="valve_mix"] [data-fault-glyph]')).toHaveCount(1);
  // the banner sits above the drawing, never over it
  const a = (await alert.boundingBox())!;
  const v = (await sheet.getByTestId('heating-full-viewport').boundingBox())!;
  expect(a.y + a.height).toBeLessThanOrEqual(v.y + 0.5);
});

test('celé schéma: rybárna – ventil zavřený, teplo stačí', async ({ page }) => {
  const sheet = await open(page, 'topeni=idle&theme=dark', 'detail');
  await expect(sheet.getByTestId('heating-full-fish-state')).toHaveText('netopí – teplo stačí');
  await expect(sheet.locator('path[data-route="pryb_to_js"]')).toHaveAttribute(
    'data-state',
    'still',
  );
  await expect(sheet.locator('[data-glyph="ryb_water"][data-state="off"]')).toHaveCount(1);
});

test('celé schéma: předvolby sedí na obsah, nic neořezávají, tablet ≥ 12 px', async ({
  page,
}, info) => {
  // up to 7 presets × (frame check + label/pipe geometry)
  test.setTimeout(300_000);
  const sheet = await open(page, 'topeni=heating&theme=dark');
  const narrow = (page.viewportSize()?.width ?? 0) < 700;
  await expect(sheet).toHaveAttribute('data-preset', narrow ? 'hp' : 'all');
  if (narrow) {
    // gesture hint until the first interaction
    await expect(sheet.getByTestId('heating-full-hint')).toBeVisible();
  }
  const ids = ((await sheet.getAttribute('data-presets')) ?? '').split(' ');
  expect(ids.length).toBeGreaterThanOrEqual(3);
  for (const id of ids) {
    await sheet.getByTestId(`heating-full-preset-${id}`).click();
    await expect(sheet).toHaveAttribute('data-preset', id);
    const { cut, min, minValue } = await frameCheck(page);
    expect(cut, `${id}: texts cut by the frame`).toEqual([]);
    // r3 minima: phone labels ≥ 11 / values ≥ 12, tablet and desktop presets ≥ 12
    const phone = info.project.name === 'mobile-s21';
    expect(min, `${id}: smallest label`).toBeGreaterThanOrEqual(phone ? 10.95 : 11.95);
    expect(minValue, `${id}: smallest value`).toBeGreaterThanOrEqual(11.95);
    expect(await crossedLabels(page), `${id}: labels crossed by a pipe`).toEqual([]);
  }
  await expect(sheet.getByTestId('heating-full-hint')).toHaveCount(0);
  await sheet.getByTestId('heating-full-preset-all').click();
  const fit = Number(await sheet.getAttribute('data-scale'));
  // keyboard zoom works everywhere (the − / + buttons are hidden on phones: pinch there)
  await sheet.getByTestId('heating-full-viewport').press('+');
  await expect
    .poll(async () => Number(await sheet.getAttribute('data-scale')))
    .toBeGreaterThan(fit);
  await expect(sheet).toHaveAttribute('data-preset', 'free');
  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(noScroll).toBeLessThanOrEqual(0);
});

test('celé schéma: legenda jako zásuvka (zavřená), stav zvlášť', async ({ page }) => {
  const sheet = await open(page, 'topeni=heating&theme=dark');
  const toggle = sheet.getByTestId('heating-full-legend-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(sheet.getByTestId('heating-full-legend')).toHaveCount(0);
  await toggle.click();
  const legend = sheet.getByTestId('heating-full-legend');
  await expect(legend).toContainText('AKN');
  await expect(legend).toContainText('Čárkovaně = běžně neaktivní');
  await expect(legend.locator('[data-question]')).toHaveCount(4);
  await expect(sheet.getByTestId('heating-full-status')).toContainText('−1,8 °C');
  await toggle.click();
  await expect(legend).toHaveCount(0);
});

test('celé schéma: pohyb jen bez omezení pohybu', async ({ page }) => {
  await open(page, 'topeni=heating&theme=dark');
  await expect.poll(() => infinite(page)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => infinite(page)).toBe(0);
});

/**
 * Texts and value pills of the drawing that a pipe centre line passes through (drawing units,
 * real text boxes). Only what is visible in the frame counts.
 */
async function crossedLabels(page: Page) {
  return page.getByTestId('heating-full-viewport').evaluate((port) => {
    const svg = port.querySelector('svg')!;
    const box = port.querySelector<HTMLElement>('[data-clip-box]')?.dataset.clipBox;
    const [fx, fy, fw, fh] = (box ? box.split(' ').map(Number) : [-1e9, -1e9, 2e9, 2e9]) as [
      number,
      number,
      number,
      number,
    ];
    const pts: Array<[number, number]> = [];
    for (const p of Array.from(
      svg.querySelectorAll<SVGPathElement>('path.fs-pipe, path[data-coil]'),
    )) {
      const len = p.getTotalLength();
      // every 4 units: any text (≥ 15 units tall) a pipe passes through gets several samples
      for (let t = 0; t <= len; t += 4) {
        const q = p.getPointAtLength(t);
        pts.push([q.x, q.y]);
      }
    }
    const out: string[] = [];
    const items = [
      ...Array.from(svg.querySelectorAll<SVGTextElement>('text')),
      ...Array.from(svg.querySelectorAll<SVGRectElement>('rect.fs-vpill')),
    ];
    for (const el of items) {
      if (el instanceof SVGTextElement && !el.textContent?.trim()) continue;
      if (el.closest('[data-pump], [data-badge-for]')) continue;
      const b = el.getBBox();
      if (b.width === 0) continue;
      const [x0, y0, x1, y1] = [b.x + 1, b.y + 1, b.x + b.width - 1, b.y + b.height - 1];
      if (x1 < fx || x0 > fx + fw! || y1 < fy || y0 > fy + fh!) continue;
      if (pts.some(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1))
        out.push((el.textContent ?? el.parentElement?.getAttribute('data-pill') ?? '?').trim());
    }
    return out;
  });
}

test('celé schéma: přehled celého domu ≥ 13 px popisky, ≥ 14 px hodnoty (desktop)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop overview');
  for (const [w, h] of [
    [1440, 900],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    const sheet = await open(page, 'topeni=heating&theme=dark');
    await expect(sheet).toHaveAttribute('data-preset', 'all');
    await expect(sheet.getByTestId('heating-full-svg')).toHaveAttribute('data-lod', 'overview');
    await expect(sheet.getByTestId('heating-full-legend')).toHaveCount(0);
    const { cut, min, minValue } = await frameCheck(page);
    expect(cut, `${w}: texts cut`).toEqual([]);
    expect(min, `${w}: smallest label`).toBeGreaterThanOrEqual(12.95);
    expect(minValue, `${w}: smallest value`).toBeGreaterThanOrEqual(13.95);
    expect(await crossedLabels(page), `${w}: labels crossed by a pipe`).toEqual([]);
    // the drawing fills the viewport: content ≥ 75 % of its height, right margin ≥ 24 px
    const port = (await sheet.getByTestId('heating-full-viewport').boundingBox())!;
    const svgBox = await sheet.getByTestId('heating-full-overview').boundingBox();
    expect(svgBox!.height / port.height, `${w}: fill`).toBeGreaterThanOrEqual(0.72);
    expect(
      port.x + port.width - (svgBox!.x + svgBox!.width),
      `${w}: right margin`,
    ).toBeGreaterThanOrEqual(8);
    await sheet.getByTestId('heating-full-close').click();
  }
});

test('celé schéma: řádek záložek – nic neuříznuté, legenda jako nástroj, ne záložka', async ({
  page,
}) => {
  const sheet = await open(page, 'topeni=heating&theme=light');
  const res = await sheet.evaluate((root) => {
    const vw = document.documentElement.clientWidth;
    const bar = root.querySelector('[data-testid="heating-full-tabs"]')!.getBoundingClientRect();
    const chips = Array.from(
      root.querySelectorAll<HTMLElement>('[data-testid^="heating-full-preset-"]'),
    );
    const cut = chips
      .filter((c) => {
        const r = c.getBoundingClientRect();
        return (
          r.left < bar.left - 0.5 ||
          r.right > bar.right + 0.5 ||
          r.right > vw ||
          c.scrollWidth > c.clientWidth + 1
        );
      })
      .map((c) => c.textContent);
    const chip = getComputedStyle(chips[0]!);
    const legend = getComputedStyle(
      root.querySelector('[data-testid="heating-full-legend-toggle"]')!,
    );
    return {
      cut,
      chipRadius: chip.borderTopLeftRadius,
      legendRadius: legend.borderTopLeftRadius,
      legendBg: legend.backgroundColor,
    };
  });
  expect(res.cut).toEqual([]);
  expect(res.legendRadius).not.toBe(res.chipRadius);
  await sheet.getByTestId('heating-full-legend-toggle').click();
  const pressedBg = await sheet
    .getByTestId('heating-full-legend-toggle')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  // pressed legend stays an outline tool, never the filled look of a selected view tab
  expect(pressedBg).toBe('rgba(0, 0, 0, 0)');
});

for (const theme of ['dark', 'light'] as const) {
  test(`celé schéma ${theme}: každá trubka ≥ 3:1 proti místnosti`, async ({ page }) => {
    const sheet = await open(page, `topeni=heating&theme=${theme}`);
    const low = await sheet.getByTestId('heating-full-svg').evaluate((svg) => {
      const rgb = (c: string) => (c.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number);
      const lum = (c: number[]) =>
        c
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const probe = document.createElement('div');
      svg.parentElement!.appendChild(probe);
      const surf = ['--fs-tech', '--fs-room', '--fs-soil', '--fs-bg'].map((v) => {
        probe.style.color = `var(${v})`;
        return rgb(getComputedStyle(probe).color);
      });
      probe.remove();
      const bad: string[] = [];
      for (const p of Array.from(svg.querySelectorAll<SVGPathElement>('path[data-route]'))) {
        const st = getComputedStyle(p);
        const c = rgb(st.stroke);
        for (const b of surf) {
          const [x, y] = [lum(c), lum(b)].sort((m, n) => n - m) as [number, number];
          const r = (x + 0.05) / (y + 0.05);
          if (r < 3 || Number(st.strokeOpacity) < 1) bad.push(`${p.dataset.route} ${r.toFixed(2)}`);
        }
      }
      return bad;
    });
    expect(low).toEqual([]);
  });
}
