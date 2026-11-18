import { expect, test, type Page } from '@playwright/test';

// Lazy chunk + 3235 × 1300 drawing: give slow CI runners room.
test.describe.configure({ timeout: 90_000 });

// Topení – celé schéma (p3i): fullscreen pan/zoom from the Toky card, dev mock data.

async function open(page: Page, query: string) {
  await page.goto(`/homebrain-topeni?${query}`);
  await page.getByTestId('heating-full-open').click({ timeout: 20_000 });
  const sheet = page.getByTestId('heating-full-schematic');
  await expect(sheet.getByTestId('heating-full-svg')).toBeVisible({ timeout: 30_000 });
  return sheet;
}

/** Smallest rendered font size (CSS px) of the labels fully inside the viewport. */
async function minVisibleLabelPx(page: Page) {
  return page.getByTestId('heating-full-viewport').evaluate((port) => {
    const r = port.getBoundingClientRect();
    let min = Infinity;
    for (const t of port.querySelectorAll<SVGTextElement>('text[data-label]')) {
      const b = t.getBoundingClientRect();
      if (
        b.width === 0 ||
        b.left < r.left ||
        b.right > r.right ||
        b.top < r.top ||
        b.bottom > r.bottom
      )
        continue;
      if (t.closest('[data-label-group^="legend"]')) continue;
      min = Math.min(min, b.height / 1.2);
    }
    return min;
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

for (const theme of ['dark', 'light'] as const) {
  test(`celé schéma ${theme}: živá data, porucha směšovače, otazníky, bez kódů PLC`, async ({
    page,
  }) => {
    const sheet = await open(page, `topeni=heating&ventil=porucha&theme=${theme}`);
    await expect(sheet).toHaveAttribute('data-fs-theme', theme);
    // fault is never clipped: HTML strip above the drawing + ring/pill on the valve body
    await expect(sheet.getByTestId('heating-full-alert')).toContainText('Směšovací ventil');
    await expect(
      sheet.locator('[data-glyph="valve_mix"][data-path="A"] [data-fault-glyph]'),
    ).toHaveCount(1);
    await expect(sheet.locator('path[data-route="jbyp_to_mix"]')).toHaveAttribute(
      'data-state',
      'closed',
    );
    await expect(sheet.locator('[data-flow-route="jbyp_to_mix"]')).toHaveCount(0);
    // heat pump: compressor running, readouts outside the cabinet
    await expect(sheet.getByTestId('heating-full-hp')).toHaveAttribute('data-compressor', 'on');
    await expect(sheet.locator('[data-label="hp_t_out"]')).toContainText('Výstup do topení');
    await expect(sheet.locator('[data-label="hp_coll_in"] [data-reading="none"]')).toHaveText(/–/u);
    // on-site questions stay visible
    for (const q of ['?1', '?2', '?3']) {
      await expect(sheet.locator('[data-badge-for] text', { hasText: q })).toHaveCount(1);
    }
    const text = await sheet.getByTestId('heating-full-svg').textContent();
    expect(text).not.toMatch(/\b[XYR]\d{2,4}(\.\d)?\b/u);
    expect(text).not.toMatch(new RegExp(`${'sol'}ank|${'br'}ine`, 'i'));
    // service view adds the addresses of the (here synthetic) private map
    await sheet.getByTestId('heating-full-service').click();
    await expect(sheet.locator('[data-service-code="hp_t_out"]')).toHaveText('X336');
    await sheet.getByTestId('heating-full-close').click();
    await expect(sheet).toHaveCount(0);
  });
}

test('celé schéma: předvolby, čitelné popisky a přiblížení', async ({ page }, info) => {
  const sheet = await open(page, 'topeni=heating&theme=dark');
  const narrow = (page.viewportSize()?.width ?? 0) < 700;
  // phone opens on the technical room at a readable scale, wide screens on the whole drawing
  await expect(sheet).toHaveAttribute('data-preset', narrow ? 'tech' : 'all');
  for (const id of ['tech', 'pool', 'house'] as const) {
    await sheet.getByTestId(`heating-full-preset-${id}`).click();
    await expect(sheet).toHaveAttribute('data-preset', id);
    if (narrow || info.project.name === 'desktop') {
      expect(await minVisibleLabelPx(page), `${id} labels`).toBeGreaterThanOrEqual(11.9);
    }
  }
  await sheet.getByTestId('heating-full-preset-all').click();
  const fit = Number(await sheet.getAttribute('data-scale'));
  await page.getByRole('button', { name: 'Přiblížit' }).click();
  await expect
    .poll(async () => Number(await sheet.getAttribute('data-scale')))
    .toBeGreaterThan(fit);
  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(noScroll).toBeLessThanOrEqual(0);
});

test('celé schéma: pohyb jen bez omezení pohybu', async ({ page }) => {
  await open(page, 'topeni=heating&theme=dark');
  await expect.poll(() => infinite(page)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => infinite(page)).toBe(0);
});
