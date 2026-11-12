import { expect, test } from '@playwright/test';
import { join } from 'node:path';

test('zprávy: potvrzení, prázdný stav a rozložení bez vodorovného posunu', async ({
  page,
}, testInfo) => {
  await page.goto('/homebrain-zpravy');
  await expect(page.getByRole('heading', { name: 'Zprávy', exact: true })).toBeVisible();
  await expect(page.getByText('Potvrzeno – odpověď „Beru“')).toBeVisible();
  await expect(page.getByText('Předáno službě')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const viewport = page.viewportSize()!;
  const size = `${viewport.width}x${viewport.height}`;
  const evidence = process.env.HB_COMM_SCREENSHOT_DIR;
  await page.screenshot({
    path: evidence
      ? join(evidence, `communication-${size}.png`)
      : testInfo.outputPath('communication.png'),
  });
  if (evidence && viewport.width === 360) {
    await page.goto('/homebrain-zpravy?theme=light');
    await expect(page.getByText('Potvrzeno – odpověď „Beru“')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(evidence, `communication-${size}-light.png`) });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/homebrain-zpravy?messages=empty');
  await expect(page.getByText('Zatím žádné zprávy')).toBeVisible();
});
