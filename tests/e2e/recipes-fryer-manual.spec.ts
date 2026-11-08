import { expect, test, type Page } from '@playwright/test';

// Fritéza without a recipe: dev mock `?friteza=1` (synthetic `demo_fryer` entities, commands are
// only logged in `window.__hbRecipesLog`, nothing reaches a device).
test.describe.configure({ timeout: 120_000 });

const PAGE = '/homebrain-recepty/friteza';
type LogItem = { kind: string; payload: Record<string, unknown> };
const log = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hbRecipesLog: LogItem[] }).__hbRecipesLog);

test('Fritéza: vstup ze seznamu receptů a ruční spuštění s potvrzením', async ({ page }) => {
  await page.goto('/homebrain-recepty?friteza=1');
  await page.getByTestId('recipes-fryer-open').click();
  await expect(page.getByTestId('fryer-view')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('fryer-temperature')).toHaveText('180 °C');
  await page.getByRole('button', { name: 'Teplota více' }).click();
  await page.getByRole('button', { name: 'Čas více' }).click();
  await page.getByRole('radio', { name: 'Slabé' }).click();
  await expect(page.getByTestId('fryer-temperature')).toHaveText('185 °C');
  await expect(page.getByTestId('fryer-minutes')).toHaveText('16 min');
  const start = page.getByTestId('fryer-start');
  await expect(start).toBeEnabled();
  await expect(start).toContainText('185 °C · 16 min');
  await start.click();
  const dialog = page.getByTestId('fryer-start-dialog');
  await expect(dialog).toContainText('185 °C · 16 min · slabý vzduch');
  // Nothing is sent before the confirmation.
  expect((await log(page)).filter((l) => l.kind === 'fryer_start')).toHaveLength(0);
  await page.getByTestId('fryer-start-confirm').click();
  await expect(page.getByTestId('hb-toast')).toContainText('Fritéza peče · 16 min');
  const sent = (await log(page)).filter((l) => l.kind === 'fryer_start');
  expect(sent.map((l) => l.payload)).toEqual([
    { temperature: 185, minutes: 16, air_speed: 1, probe_temperature: null, confirmed: true },
  ]);
});

test('Fritéza: sonda přidá cílovou teplotu uvnitř jídla', async ({ page }) => {
  await page.goto(`${PAGE}?friteza=1`);
  await page.getByTestId('fryer-probe').click();
  await expect(page.getByTestId('fryer-probe_temperature')).toHaveText('65 °C');
  await page.getByTestId('fryer-start').click();
  await page.getByTestId('fryer-start-confirm').click();
  await expect(page.getByTestId('hb-toast')).toBeVisible();
  const sent = (await log(page)).filter((l) => l.kind === 'fryer_start');
  expect(sent[0]?.payload.probe_temperature).toBe(65);
});

test('Fritéza: otevřený šuplík blokuje start', async ({ page }) => {
  await page.goto(`${PAGE}?friteza=1&drawer=on`);
  const blocker = page.getByTestId('fryer-blocker');
  await expect(blocker).toBeVisible({ timeout: 20_000 });
  await expect(blocker).toHaveAttribute('data-code', 'AIRFRYER_DRAWER_OPEN');
  await expect(blocker).toContainText('Šuplík je otevřený');
  await expect(page.getByTestId('fryer-start')).toBeDisabled();
});

test('Fritéza: když peče, nabídne zastavení a přidání času místo startu', async ({ page }) => {
  await page.goto(`${PAGE}?friteza=1&fryerlive=cooking`);
  await expect(page.getByTestId('recipes-fryer-live')).toBeVisible({ timeout: 20_000 });
  // Busy: no second start, the live card offers pause/stop and the page adds time.
  await expect(page.getByTestId('fryer-start')).toHaveCount(0);
  await expect(page.getByTestId('fryer-manual')).toHaveCount(0);
  await page.getByTestId('fryer-add-5').click();
  await expect(page.getByTestId('hb-toast')).toContainText('Čas prodloužen na 24 min');
  await page.getByTestId('recipes-fryer-stop').click();
  await page.getByTestId('recipes-fryer-stop-confirm').click();
  const sent = await log(page);
  expect(sent.filter((l) => l.kind === 'fryer_control').map((l) => l.payload)).toEqual([
    { action: 'add_time', minutes: 5 },
  ]);
  expect(sent.filter((l) => l.kind === 'airfryer_control').map((l) => l.payload)).toEqual([
    { action: 'stop' },
  ]);
});

test('Fritéza: oblíbené – přidat, upravit, spustit, smazat', async ({ page }) => {
  await page.goto(`${PAGE}?friteza=1`);
  await page.getByRole('radio', { name: 'Oblíbené' }).click();
  const items = page.getByTestId('fryer-fav');
  await expect(items).toHaveCount(2, { timeout: 20_000 });
  await expect(items.first()).toContainText('Hranolky');
  await expect(items.first()).toContainText('200 °C · 18 min · silný vzduch');
  // Add.
  await page.getByTestId('fryer-fav-add').click();
  const sheet = page.getByTestId('fryer-fav-sheet');
  await expect(page.getByTestId('fryer-fav-save')).toBeDisabled();
  await sheet.getByTestId('fryer-fav-name').fill('Ryba');
  await sheet.getByRole('button', { name: 'Teplota méně' }).click();
  await page.getByTestId('fryer-fav-save').click();
  await expect(items).toHaveCount(3);
  await expect(items.nth(2)).toContainText('195 °C · 18 min');
  // Edit.
  await page.getByRole('button', { name: 'Upravit Ryba' }).click();
  await sheet.getByRole('button', { name: 'Čas méně' }).click();
  await page.getByTestId('fryer-fav-save').click();
  await expect(items.nth(2)).toContainText('195 °C · 17 min');
  // Start one (with confirmation).
  await items.first().getByTestId('fryer-fav-start').click();
  await expect(page.getByTestId('fryer-start-dialog')).toContainText('Spustit „Hranolky“?');
  await page.getByTestId('fryer-start-confirm').click();
  // Delete.
  await page.getByRole('button', { name: 'Smazat Ryba' }).click();
  await page.getByTestId('fryer-fav-delete-confirm').click();
  await expect(items).toHaveCount(2);
  const kinds = (await log(page)).map((l) => l.kind).filter((k) => k.startsWith('fryer'));
  expect(kinds).toEqual([
    'fryer_favourite_save',
    'fryer_favourite_save',
    'fryer_start',
    'fryer_favourite_delete',
  ]);
});

test('Fritéza: vestavěné programy vysvětlí, proč nejdou', async ({ page }) => {
  await page.goto(`${PAGE}?friteza=1`);
  await page.getByRole('radio', { name: 'Předvolby' }).click();
  await expect(page.getByTestId('fryer-presets')).toContainText(
    'Vestavěné programy spustíte jen na fritéze',
  );
});

test('Fritéza: dítě a kiosk jen sledují stav', async ({ page }) => {
  await page.goto(`${PAGE}?friteza=1&role=child&fryerlive=cooking`);
  await expect(page.getByTestId('fryer-readonly')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('recipes-fryer-live')).toBeVisible();
  await expect(page.getByTestId('fryer-start')).toHaveCount(0);
  await expect(page.getByTestId('fryer-add-1')).toHaveCount(0);
  await expect(page.getByTestId('recipes-fryer-pause')).toHaveCount(0);
});
