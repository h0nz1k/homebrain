import { expect, test } from '@playwright/test';

// Energie „Srovnání nabídek“ on the synthetic dev backend (invented consumption and prices).

test('správce vidí pořadí nabídek, měsíční srovnání a přidá nabídku', async ({ page }) => {
  await page.goto('/homebrain-energie');
  const card = page.getByTestId('energy-offers');
  await expect(card).toBeVisible({ timeout: 20_000 });
  const ranks = card.getByTestId('energy-offer-rank');
  await expect(ranks).toHaveCount(3);
  const totals = await ranks.evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute('data-total'))),
  );
  expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  await expect(card.getByTestId('energy-offers-headline')).toContainText('Nejvýhodnější');
  await expect(card.getByTestId('energy-offers-big')).toHaveText(/^Ušetřili byste/);
  await expect(card.getByTestId('energy-offer-export-hint')).toBeVisible();
  // value labels stay inside the chart card
  const chart = await card.locator('.en-off-chart').boundingBox();
  for (const label of await card.getByTestId('energy-offer-bar-value').all()) {
    const b = (await label.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(chart!.y);
    expect(b.y + b.height).toBeLessThanOrEqual(chart!.y + chart!.height);
  }
  await expect(card.getByTestId('energy-offer-bar-month')).toHaveCount(12);
  await card.getByTestId('energy-offer-bar-month').first().click();
  await expect(card.getByTestId('energy-offer-readout')).toContainText('Kč');

  await card.getByTestId('energy-offer-add').click();
  const sheet = page.getByTestId('energy-offer-edit');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('energy-offer-field-name').fill('Levná fixace');
  await sheet.getByTestId('energy-offer-field-price_vt').fill('1 990');
  await sheet.getByTestId('energy-offer-field-price_nt').fill('1890,5');
  await sheet.getByTestId('energy-offer-save').click();
  await expect(sheet).toBeHidden();
  await expect(ranks).toHaveCount(4);
  await expect(ranks.first()).toContainText('Levná fixace');

  // edit: switch the new offer to spot with buy-back
  await ranks.first().getByTestId('energy-offer-edit-open').click();
  await expect(sheet.getByTestId('energy-offer-field-name')).toHaveValue('Levná fixace');
  await sheet.getByRole('radio', { name: 'Spot (OTE)' }).click();
  await sheet.getByTestId('energy-offer-field-margin').fill('450');
  await sheet.getByTestId('energy-offer-save').click();
  await expect(sheet).toBeHidden();
  await expect(card.getByText(/spot plus 450\sKč\/MWh/)).toBeVisible();

  await card.getByText('Jak počítáme a předpoklady').click();
  await expect(card.getByTestId('energy-offers-assumptions')).toContainText(
    'Regulované ceny 2026 bez DPH',
  );
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});

test('dospělý vidí srovnání jen pro čtení, kiosk ho nevidí', async ({ page }) => {
  await page.goto('/homebrain-energie?role=adult');
  const card = page.getByTestId('energy-offers');
  await expect(card.getByTestId('energy-offer-rank')).toHaveCount(3, { timeout: 20_000 });
  await expect(card.getByTestId('energy-offer-add')).toHaveCount(0);
  await expect(card.getByTestId('energy-offer-edit-open')).toHaveCount(0);
  await expect(card.getByTestId('energy-offer-regulated-open')).toHaveCount(0);
});

test('kiosk srovnání nabídek nevidí', async ({ page }) => {
  await page.goto('/homebrain-energie?role=kiosk');
  await expect(page.getByTestId('energy-price')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('energy-offers')).toHaveCount(0);
});

for (const width of [390, 800, 1280]) {
  test(`nabídky: text se nepřekrývá při ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/homebrain-energie');
    const rows = page.getByTestId('energy-offer-rank');
    await expect(rows).toHaveCount(3);
    for (const row of await rows.all()) {
      const errors = await row.evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const rects: { text: string; box: DOMRect }[] = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const box of Array.from(range.getClientRects())) {
            if (box.width && box.height) rects.push({ text: node.textContent, box });
          }
        }
        const bounds = el.getBoundingClientRect();
        const errors: string[] = [];
        for (const [i, a] of rects.entries()) {
          if (a.box.left < bounds.left - 1 || a.box.right > bounds.right + 1)
            errors.push(`mimo řádek: ${a.text}`);
          for (const b of rects.slice(i + 1)) {
            if (Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 &&
                Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1)
              errors.push(`${a.text} × ${b.text}`);
          }
        }
        return errors;
      });
      expect(errors).toEqual([]);
      const badge = row.locator('.en-off-kind');
      expect(await badge.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(24);
    }
  });
}
