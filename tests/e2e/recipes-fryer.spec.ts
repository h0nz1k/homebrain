import { expect, test } from '@playwright/test';

// Several dev-server navigations per test; first module render is slow under CI/host load.
test.describe.configure({ timeout: 120_000 });

// Live airfryer card: synthetic `demo_fryer` entities via `?fryerlive=<scenario>` (dev only).

test('Recepty: fritéza peče – odpočet, teploty, pozastavit, zastavit s potvrzením', async ({
  page,
}) => {
  await page.goto('/homebrain-recepty?fryerlive=cooking');
  const card = page.getByTestId('recipes-fryer-live');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('recipes-fryer-state')).toHaveText('Peče');
  await expect(card).toContainText('AutoCook 14 · fáze 2');
  await expect(page.getByTestId('recipes-fryer-temp')).toContainText('189');
  await expect(page.getByTestId('recipes-fryer-temp')).toContainText('cíl 200 °C');
  // Local countdown between HA updates (8:42 at load, then ticks down).
  const first = await page.getByTestId('recipes-fryer-countdown').innerText();
  await expect
    .poll(async () => page.getByTestId('recipes-fryer-countdown').innerText(), { timeout: 5_000 })
    .not.toBe(first);
  await expect(page.getByTestId('recipes-fryer-keep_warm')).toHaveCount(0);
  await page.getByTestId('recipes-fryer-stop').click();
  const dialog = page.getByTestId('recipes-fryer-stop-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Nechat péct' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId('recipes-fryer-stop').click();
  await page.getByTestId('recipes-fryer-stop-confirm').click();
  // Toast text is also mirrored into a screen-reader live region, so target the toast itself.
  await expect(page.getByTestId('hb-toast')).toContainText('Fritéza · zastavit');
});

test('Recepty: protřepat, šuplík venku, hotovo, chyba; vypnutá fritéza je skrytá', async ({
  page,
}) => {
  const cases: Array<[string, string]> = [
    ['action', 'Protřepejte nebo otočte jídlo'],
    ['drawer', 'Šuplík otevřený'],
    ['done', 'Hotovo'],
    ['warm', 'Udržuje teplé'],
    ['error', 'Chyba 3'],
    ['preheat', 'Předehřívá'],
  ];
  for (const [scenario, label] of cases) {
    await page.goto(`/homebrain-recepty?fryerlive=${scenario}`);
    await expect(page.getByTestId('recipes-fryer-state')).toHaveText(label, { timeout: 20_000 });
  }
  await expect(page.getByTestId('recipes-fryer-pause')).toHaveCount(1); // preheat
  await page.goto('/homebrain-recepty?fryerlive=done');
  await expect(page.getByTestId('recipes-fryer-keep_warm')).toBeVisible({ timeout: 20_000 });
  await page.goto('/homebrain-recepty?fryerlive=off');
  await expect(page.getByTestId('recipes-grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('recipes-fryer-live')).toHaveCount(0);
});

test('Recepty na telefonu 390 px: karta fritézy nepřetéká', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/homebrain-recepty?fryerlive=cooking&theme=light');
  const card = page.getByTestId('recipes-fryer-live');
  await expect(card).toBeVisible({ timeout: 20_000 });
  const overflow = await card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Array.from(el.querySelectorAll('*'))
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5)).length;
  });
  expect(overflow).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Dnes: běžící fritéza má signál, protřepání je naléhavé', async ({ page }) => {
  await page.goto('/homebrain-dnes?fryerlive=action');
  await expect(page.getByText('Fritéza · Protřepejte jídlo')).toBeVisible({
    timeout: 20_000,
  });
  // Act-now fryer leads Dnes: hero above the day ribbon, whole card in the first phone viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/homebrain-dnes?fryerlive=action');
  const hero = page.getByTestId('hero-signal');
  await expect(hero).toContainText('Fritéza · Protřepejte jídlo', { timeout: 20_000 });
  const heroBox = (await hero.boundingBox())!;
  const ribbonBox = (await page.getByTestId('ribbon-card').boundingBox())!;
  expect(heroBox.y).toBeLessThan(ribbonBox.y);
  expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(844);
  // A running fryer is a regular card (countdown), not an act-now hero above the ribbon.
  await page.goto('/homebrain-dnes?fryerlive=cooking');
  await expect(page.getByText(/Fritéza · Peče/).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/homebrain-dnes?fryerlive=off');
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Fritéza ·/)).toHaveCount(0);
});
