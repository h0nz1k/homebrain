import { expect, test, type Page } from '@playwright/test';

// Roboti → Údržba: one tile model for counters, tanks and guide-only parts, grouped Robot / Dok,
// most urgent first, with a summary line. Dev mock robot 3: sensors overdue (red), dock brush
// 14 % (amber), the rest fine; robot 2: cleaning fluid empty.
async function tiles(page: Page, group: 'robot' | 'dock') {
  return page
    .getByTestId(`robots-maint-${group}`)
    .locator('li')
    .evaluateAll((items) => items.map((li) => li.getAttribute('data-testid')));
}

test('údržba: jednotné dlaždice Robot / Dok seřazené podle naléhavosti', async ({ page }) => {
  await page.goto('/homebrain-roboti');
  await page.getByTestId('robots-floor-3').click();
  const care = page.getByTestId('robots-care');
  await expect(care.getByTestId('robots-maint-summary')).toHaveText('2 věci čekají', {
    timeout: 20_000,
  });
  await expect(care).toHaveAttribute('data-rb-maint', 'crit');
  // The old separate dock card / chip row are gone: one card, every item the same tile.
  await expect(page.getByTestId('robots-dock')).toHaveCount(0);
  await expect(page.getByTestId('robots-guides-more')).toHaveCount(0);
  const items = care.locator('.rb-maint-grid > li');
  await expect(care.locator('.rb-maint-grid > li > button.hb-tile')).toHaveCount(await items.count());
  expect((await tiles(page, 'robot'))[0]).toBe('robots-part-sensors');
  expect(await tiles(page, 'dock')).toEqual([
    'robots-part-dock_brush',
    'robots-part-dock_strainer',
  ]);
  await expect(page.getByTestId('robots-part-sensors')).toHaveAttribute('data-rb-tone', 'crit');
  await expect(page.getByTestId('robots-part-sensors')).toContainText('Vyčistit teď');
  await expect(page.getByTestId('robots-part-dock_brush')).toHaveAttribute('data-rb-tone', 'warn');
  await expect(page.getByTestId('robots-part-water_shortage')).toContainText('V pořádku');

  // Two columns: neighbouring tiles share a row and never overflow the card.
  const geo = await care.evaluate((card) => {
    const box = card.getBoundingClientRect();
    const rects = Array.from(card.querySelectorAll('.rb-maint-grid > li')).map((li) =>
      li.getBoundingClientRect(),
    );
    return {
      inside: rects.every((r) => r.left >= box.left - 1 && r.right <= box.right + 1),
      firstRowSameTop: Math.abs(rects[0]!.top - rects[1]!.top) < 1,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geo).toEqual({ inside: true, firstRowSameTop: true, overflow: 0 });

  // Tap → guide; the robot's dock-brush reset button is found in HA → reset after confirmation.
  await page.getByTestId('robots-guide-open-dock_brush').click();
  const sheet = page.getByTestId('robots-guide');
  await expect(sheet).toContainText('Kartáček doku');
  await sheet.getByTestId('robots-guide-reset').click();
  await expect(page.getByTestId('robots-confirm')).toContainText(
    'Vynulovat počítadlo: Kartáček doku',
  );
  await page.getByRole('button', { name: 'Zrušit' }).click();
});

test('údržba: nádrž doku je stejná dlaždice a otevře návod', async ({ page }) => {
  await page.goto('/homebrain-roboti');
  await page.getByTestId('robots-floor-2').click();
  const fluid = page.getByTestId('robots-part-cleaning_fluid');
  await expect(fluid).toContainText('Došel', { timeout: 20_000 });
  await expect(fluid).toHaveAttribute('data-rb-tone', 'crit');
  expect((await tiles(page, 'dock'))[0]).toBe('robots-part-cleaning_fluid');
  await page.getByTestId('robots-guide-open-cleaning_fluid').click();
  await expect(page.getByTestId('robots-guide')).toContainText('Saponát');
});
