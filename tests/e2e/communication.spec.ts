import { expect, test } from '@playwright/test';

test('zprávy: potvrzení, prázdný stav a rozložení bez vodorovného posunu', async ({
  page,
}, testInfo) => {
  await page.goto('/homebrain-zpravy');
  await expect(page.getByRole('heading', { name: 'Komunikační centrum' })).toBeVisible();
  await expect(page.getByText('Potvrzeno: Beru')).toBeVisible();
  await expect(page.getByText('Předáno službě')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('communication.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/homebrain-zpravy?messages=empty');
  await expect(page.getByText('Zatím žádné zprávy')).toBeVisible();
});
