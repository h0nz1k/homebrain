import { expect, test, type Locator } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  !(
    a.x + a.width <= b.x + 0.5 ||
    b.x + b.width <= a.x + 0.5 ||
    a.y + a.height <= b.y + 0.5 ||
    b.y + b.height <= a.y + 0.5
  );

/** Detail header: photo, title block, stock box, Dohledat button and Vivino link never overlap or clip. */
async function expectHeroLayout(detail: Locator) {
  await detail.locator('.wine-detail-scroll').evaluate((el) => el.scrollTo(0, 0));
  const scroll = (await detail.locator('.wine-detail-scroll').boundingBox())!;
  const boxes: Record<string, Box> = {};
  for (const [k, sel] of [
    ['photo', '.wine-hero-bottle .wine-bottle-frame'],
    ['text', '.wine-hero-text'],
    ['stock', '.wine-stockbox'],
    ['button', '[data-testid=wine-lookup]'],
    ['vivino', '[data-testid=wine-vivino]'],
  ] as const) {
    const b = await detail.locator(sel).boundingBox();
    expect(b, k).toBeTruthy();
    boxes[k] = b!;
    // fully inside the detail panel horizontally
    expect(b!.x, `${k} left`).toBeGreaterThanOrEqual(scroll.x - 0.5);
    expect(b!.x + b!.width, `${k} right`).toBeLessThanOrEqual(scroll.x + scroll.width + 0.5);
  }
  const keys = Object.keys(boxes);
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      expect(intersects(boxes[keys[i]!]!, boxes[keys[j]!]!), `${keys[i]} × ${keys[j]}`).toBe(false);
  // photo stays a thumbnail, the button label wraps to at most two lines
  expect(boxes.photo!.width).toBeLessThanOrEqual(140);
  const lines = await detail.getByTestId('wine-lookup').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = Array.from(range.getClientRects())
      .filter((r) => r.height > 0)
      .map((r) => r.top)
      .sort((a, b) => a - b);
    // baseline-aligned label + smaller hint differ by a few px on the same line
    return tops.filter((t, i) => i === 0 || t - tops[i - 1]! > 8).length;
  });
  expect(lines).toBeLessThanOrEqual(2);
  // sticky action bar (Otevřít láhev / Upravit hodnocení) stays inside the panel
  const panel = (await detail.boundingBox())!;
  for (const b of await detail.locator('.wine-actions button').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x + r.width, 'action bar button right edge').toBeLessThanOrEqual(
      panel.x + panel.width + 0.5,
    );
  }
  // stock box text not clipped
  const clipped = await detail
    .locator('.wine-stockbox')
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  expect(clipped).toBe(false);
}

test('Vinotéka: přehled, hledání, drawer filtrů, otevření poslední lahve', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/wine');
  await expect(page.getByRole('heading', { name: 'Vinotéka', exact: true }).first()).toBeAttached();
  await expect(page.getByTestId('wine-result-count')).toContainText('50 z 50 vín');
  // Mobile hides metrics like the approved design; the cooler card stays.
  if (testInfo.project.name === 'desktop')
    await expect(page.getByTestId('wine-metrics')).toBeVisible();
  await expect(page.getByTestId('wine-cellar-chip')).toContainText('11,8 °C');
  await expect(page.getByTestId('wine-cellar-chip')).toContainText('16,4 °C');

  const started = Date.now();
  await page.getByTestId('wine-search').fill('pálava synthetic');
  await expect(page.getByTestId('wine-result-count')).not.toContainText('50 z 50');
  expect(Date.now() - started).toBeLessThan(3000);
  const afterSearch = await page.getByTestId('wine-card').count();
  expect(afterSearch).toBeGreaterThan(0);
  expect(afterSearch).toBeLessThan(50);
  for (const text of await page.getByTestId('wine-card').allInnerTexts())
    expect(text).toContain('Pálava');

  await page.getByTestId('wine-search').fill('');
  await page.getByTestId('wine-more-filters').click();
  const drawer = page.getByTestId('wine-filters');
  await expect(drawer).toBeVisible();
  await drawer.getByTestId('wine-filter-color-red').click();
  await drawer.getByTestId('wine-filter-zone').selectOption('Zóna B');
  await expect(drawer.getByTestId('wine-filter-apply')).toHaveText(/^Zobrazit \d+ výsled/);
  await drawer.getByTestId('wine-filter-apply').click();
  await expect(drawer).toBeHidden();
  const reds = page.getByTestId('wine-card');
  expect(await reds.count()).toBeGreaterThan(0);
  // Cards show 'ročník · přívlastek'; colour is carried by the bottle art (red varieties).
  for (const text of await reds.allInnerTexts())
    expect(text).toMatch(/Rulandské modré|Frankovka|Svatovavřinecké|Zweigeltrebe|Cabernet/);

  await page.getByTestId('wine-search').fill('neexistující víno');
  await expect(page.getByText('Žádné víno neodpovídá hledání')).toBeVisible();
  await page.getByTestId('wine-clear-search').click();
  await page.getByTestId('wine-more-filters').click();
  await page.getByTestId('wine-filter-reset').click();
  await expect(page.getByTestId('wine-filter-apply')).toHaveText('Zobrazit 50 výsledků');
  await page.getByTestId('wine-filter-apply').click();
  await expect(page.getByTestId('wine-filters')).toBeHidden();

  const lastBottle = page
    .getByTestId('wine-card')
    .filter({ has: page.locator('[data-testid=wine-card-qty]', { hasText: /^1 ks$/ }) })
    .first();
  await lastBottle.click();
  const detail = page.getByTestId('wine-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('wine-photo-placeholder')).toBeVisible();
  await expectHeroLayout(detail);
  // Prices live in the detail only (cards never show them).
  for (const text of await page.getByTestId('wine-card').allInnerTexts())
    expect(text).not.toContain('Kč');
  await expect(detail.getByTestId('wine-price-history')).toBeVisible();
  await expect(detail.getByTestId('wine-price-spark')).toBeVisible();
  await expect(detail.getByTestId('wine-price-lots').locator('li').first()).toContainText('Kč');
  await page.getByTestId('wine-consume').click();
  await expect(page.getByTestId('wine-confirm')).toContainText('Otevřít poslední láhev?');
  await page.getByTestId('wine-confirm-ok').click();
  await expect(page.getByTestId('hb-toast').last()).toContainText('Zbývá 0 ks');
  await expect(page.getByTestId('wine-detail-qty')).toHaveText('0');
  await page.getByTestId('wine-tab-history').click();
  await expect(page.getByTestId('wine-history')).toContainText('Odepsáno');
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await testInfo.attach(`vinoteka-${testInfo.project.name}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('Vinotéka: import objednávky (text) s kontrolou součtu a Doplnit ze Znovínu s fotkou', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/wine');
  await page.getByTestId('wine-card').first().waitFor();
  // Without a photo, cards use the photo-like SVG inside the same 3:4 studio frame.
  const frame = page.getByTestId('wine-card').first().locator('.wine-bottle-frame');
  const box = await frame.boundingBox();
  expect(box && Math.abs(box.width / box.height - 0.75) < 0.02).toBeTruthy();
  await page.getByTestId('wine-nav-import').click();
  await expect(page.getByTestId('wine-import-pdf')).toContainText('Nahrát PDF objednávky');
  const order = [
    'Ukázkový Ryzlink',
    'suché/pozdní sběr 2024/Ukázková řada',
    'Šarže 9101 /Obj. číslo Z 9101 /Obsah 0,75 l',
    '2 ks 300 Kč',
    'Cena celkem: 300 Kč',
  ].join('\n');
  await page.getByTestId('wine-import-order-text').fill(order);
  await page.getByTestId('wine-import-order-preview').click();
  await expect(page.getByTestId('wine-import-check')).toContainText('souhlasí');
  await expect(page.getByTestId('wine-import-order-plan')).toContainText('Z 9101');
  await page.getByTestId('wine-import-order-apply').click();
  await expect(page.getByTestId('wine-import-order-plan')).toContainText('Naskladněno');
  // Photos/facts are filled automatically in the background after the import.
  await expect(page.getByTestId('wine-auto-enrich')).toContainText(
    /Doplňuji fotky a popisy ze Znovínu… \d+\/1|doplněny: \d+ z 1/,
  );
  await expect(page.getByTestId('wine-auto-enrich')).toContainText('doplněny: 1 z 1', {
    timeout: 15_000,
  });

  await page.getByTestId('wine-nav-catalog').click();
  await page.getByTestId('wine-card').first().click();
  const detail = page.getByTestId('wine-detail');
  await expect(detail.getByTestId('wine-photo-placeholder')).toBeVisible();
  await expectHeroLayout(detail);
  // Prices live in the detail only (cards never show them).
  for (const text of await page.getByTestId('wine-card').allInnerTexts())
    expect(text).not.toContain('Kč');
  await expect(detail.getByTestId('wine-price-history')).toBeVisible();
  await expect(detail.getByTestId('wine-price-spark')).toBeVisible();
  await expect(detail.getByTestId('wine-price-lots').locator('li').first()).toContainText('Kč');
  // Vivino is a plain external search link (no scraping, no API key).
  await expect(detail.getByTestId('wine-vivino')).toHaveAttribute(
    'href',
    /^https:\/\/www\.vivino\.com\/search\/wines\?q=/,
  );
  // Dohledat: universal lookup → diff preview → apply only the checked fields.
  await detail.getByTestId('wine-lookup').click();
  const diff = detail.getByTestId('wine-lookup-diff');
  await expect(diff).toBeVisible();
  await expect(detail.getByTestId('wine-lookup-source')).toContainText('Znovín');
  await expect(diff.getByTestId('wine-lookup-photo')).toBeChecked();
  // The panel scrolls clear of the action bar: the URL field is fully visible above it.
  await expect
    .poll(async () => {
      const url = await detail.getByTestId('wine-lookup-url').boundingBox();
      const bar = await detail.getByTestId('wine-actions').boundingBox();
      return url && bar ? bar.y - (url.y + url.height) : -1;
    })
    .toBeGreaterThanOrEqual(0);
  await detail.getByTestId('wine-lookup-apply').click();
  await expect(page.getByTestId('hb-toast').last()).toContainText('ze zdroje Znovín');
  await expect(detail.getByTestId('wine-photo')).toBeVisible();
  await expect(detail.getByTestId('wine-description')).toBeVisible();
});

for (const vp of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`Vinotéka: hlavička detailu bez překryvu ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/wine');
    await page.getByTestId('wine-card').first().click();
    const detail = page.getByTestId('wine-detail');
    await expect(detail).toBeVisible();
    await expectHeroLayout(detail);
  });
}

test('Vinotéka: detail v HA cestě a návrat tlačítkem Zpět', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/homebrain-vinoteka');
  await page.getByTestId('wine-card').first().click();
  await expect(page).toHaveURL(/\/homebrain-vinoteka\/[^/]+$/);
  await expect(page.getByTestId('wine-detail')).toBeVisible();
  // Mobile detail is a modal overlay; section navigation is available on desktop.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('wine-nav-import').click();
  await expect(page).toHaveURL(/\/homebrain-vinoteka$/);
  await expect(page.getByTestId('wine-import-pdf')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('wine-detail')).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goBack();
  await expect(page).toHaveURL(/\/homebrain-vinoteka$/);
  await expect(page.getByTestId('wine-detail')).toHaveCount(0);
});

test('Vinotéka: přidat víno – ruční EAN → návrh → uložení', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/wine');
  await page.getByTestId('wine-card').first().waitFor();
  await page.getByTestId('wine-add-open').click();
  const sheet = page.getByTestId('wine-add');
  await expect(sheet.getByRole('heading', { name: 'Přidat víno' })).toBeVisible();
  // Prod HA without an ai_task entity: AI tile is disabled with a Czech hint.
  await expect(sheet.getByTestId('wine-add-ai-off')).toBeVisible();
  await sheet.getByTestId('wine-add-scan').click();
  await sheet.getByTestId('wine-add-ean').fill('8006220001669');
  await sheet.getByTestId('wine-add-ean-go').click();
  const prop = sheet.getByTestId('wine-add-proposal').first();
  await expect(prop).toContainText('Prosecco DOC Treviso');
  await expect(prop).toContainText('Shoda podle EAN');
  // Opaque surface (nothing bleeds through) and a sheet sized to its content.
  const geo = await sheet.evaluate((el) => {
    const body = el.querySelector('.wine-sheet-body') as HTMLElement;
    return {
      bg: getComputedStyle(el).backgroundColor,
      sheetH: el.getBoundingClientRect().height,
      slack: body.clientHeight - body.scrollHeight,
    };
  });
  expect(geo.bg).not.toMatch(/rgba\(.*,\s*0?\.\d+\)$/);
  expect(geo.sheetH).toBeLessThan(844 * 0.75);
  expect(geo.slack).toBeLessThanOrEqual(1);
  await prop.click();
  await expect(sheet.getByTestId('wine-add-f-producer')).toHaveValue('Mionetto');
  await sheet.getByTestId('wine-add-save').click();
  await expect(page.getByTestId('hb-toast').last()).toContainText('Přidáno: Prosecco DOC Treviso');
  await expect(page.getByTestId('wine-add')).toHaveCount(0);
  // the sheet never overflows the mobile viewport horizontally
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(390);
});
