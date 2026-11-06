import { expect, test, type Page } from '@playwright/test';

// Roboti – plány úklidu (dev mock: plány jen ukládá, žádný robot se nespouští).
type Call = { domain: string; service: string };
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hbRobotCalls: Call[] }).__hbRobotCalls);

test('nový plán „každou středu vytřít“: dny, čas, předvolba, noční klid', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/homebrain-roboti?presets=demo');
  const card = page.getByTestId('robots-schedules');
  await expect(card).toContainText('Žádný plán');
  await page.getByTestId('robots-schedule-add').click();
  const editor = page.getByTestId('robots-schedule-editor');
  await page.getByTestId('robots-schedule-save').click();
  await expect(page.getByTestId('robots-schedule-error')).toContainText('název');
  await page.getByTestId('robots-schedule-name').fill('Středa vytřít');
  // Only Wednesday.
  for (const day of [0, 1, 3, 4, 5, 6])
    await page.getByTestId(`robots-schedule-day-${day}`).click();
  await page.getByTestId('robots-schedule-time').fill('23:00');
  await page.getByTestId('robots-schedule-save').click();
  await expect(page.getByTestId('robots-schedule-error')).toContainText('nočního klidu');
  await page.getByTestId('robots-schedule-time').fill('13:00');
  await editor.getByRole('button', { name: 'Důkladné vytření 2×' }).click();
  await page.getByTestId('robots-schedule-save').click();
  await expect(editor).toHaveCount(0);
  const row = card.locator('[data-testid^="robots-schedule-"][data-enabled]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Každou středu · Důkladné vytření 2×');
  await expect(row.getByTestId('robots-schedule-next')).toContainText('13:00');
  expect(await calls(page)).toHaveLength(0);
});

test('vlastní nastavení + místnost, vypnutí, smazání', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/homebrain-roboti?presets=demo&schedules=demo');
  const card = page.getByTestId('robots-schedules');
  await expect(card.getByTestId('robots-schedule-result').first()).toBeVisible();
  await expect(card).toContainText('Neproběhlo · slabá baterie');
  await page.getByTestId('robots-schedule-add').click();
  const editor = page.getByTestId('robots-schedule-editor');
  await page.getByTestId('robots-schedule-name').fill('Chodba tiše');
  await page.getByTestId('robots-schedule-preset-custom').click();
  await editor.getByRole('radio', { name: 'Vysát' }).click();
  await editor.getByRole('radio', { name: 'Tiché' }).click();
  await page.getByTestId('robots-schedule-room-2').click();
  await page.getByTestId('robots-schedule-save').click();
  await expect(editor).toHaveCount(0);
  const row = card.getByRole('listitem').filter({ hasText: 'Chodba tiše' });
  await expect(row).toContainText('Každý den · 1 místnost');
  await row.getByTestId('robots-schedule-toggle').click();
  await expect(row).toContainText('Vypnuto');
  await row.getByRole('button', { name: 'Upravit plán Chodba tiše' }).click();
  await page.getByTestId('robots-schedule-delete').click();
  await expect(row).toHaveCount(0);
  expect(await calls(page)).toHaveLength(0);
});

test('pozastavení plánů (dovolená) a noční klid', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/homebrain-roboti?presets=demo&schedules=demo');
  await page.getByTestId('robots-schedules-settings').click();
  const until = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.getByTestId('robots-schedules-pause-until').fill(until);
  await page.getByTestId('robots-quiet-start').fill('21:00');
  await page.getByTestId('robots-schedules-settings-save').click();
  await expect(page.getByTestId('robots-schedules-paused')).toBeVisible();
  await expect(page.getByTestId('robots-schedules')).toContainText('Noční klid 21:00–07:00');
  await page.getByTestId('robots-schedules-settings').click();
  await page.getByTestId('robots-schedules-resume').click();
  await expect(page.getByTestId('robots-schedules-paused')).toHaveCount(0);
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});
