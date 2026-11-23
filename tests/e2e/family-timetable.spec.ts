import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

// Školní rozvrh (dev mock `?rozvrh=full|holiday`: Ema until 12:05, Kuba Wednesday until 14:40).
// Dnes fixtures: `state=b` = Monday 7:25, `state=d` = Thursday 20:45. Refs #175.

const shots = process.env.HB_TIMETABLE_SHOTS;

async function shot(page: Page, name: string, theme: string) {
  if (!shots) return;
  const { width, height } = page.viewportSize()!;
  await page.screenshot({
    path: join(shots, `${name}-${width}x${height}-${theme}.png`),
    fullPage: true,
  });
}

async function openPerson(page: Page, name: string, query = '') {
  await page.goto(`/homebrain-rodina?rozvrh=full${query}`);
  await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('family-person-tile').filter({ hasText: name }).click();
  return page.getByTestId('family-person');
}

test.describe('Rodina – školní rozvrh', () => {
  test('detail dítěte: dnešní hodiny, aktuální hodina a týden', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-23T08:40:00+01:00'));
    const detail = await openPerson(page, 'Ema');
    const card = detail.getByTestId('family-timetable');
    await expect(card.getByTestId('family-timetable-title')).toHaveText('Dnes ve škole 7:30–12:05');
    await expect(card.locator('li[aria-current="time"]')).toContainText('M');
    await expect(detail.getByTestId('family-wifi-presence')).toHaveText('ve škole · podle rozvrhu');
    await card.getByRole('button', { name: /Celý týden/ }).click();
    await expect(card.getByTestId('family-timetable-week')).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test('po vyučování ukáže zítřek, Kuba ve středu odpoledne', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-24T15:00:00+01:00'));
    const detail = await openPerson(page, 'Kuba');
    await expect(detail.getByTestId('family-timetable-title')).toHaveText(
      'Zítra do školy 7:30–14:40',
    );
    await expect(detail.getByText('Polední přestávka 12:05–13:05')).toBeVisible();
  });

  test('editor rozvrhu: dvouhodinovka čipy, 44px cíle', async ({ page }) => {
    await page.goto('/homebrain-rodina?rozvrh=full');
    await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Nastavení osob' }).click();
    const settings = page.getByTestId('family-person-settings');
    await settings.getByRole('group', { name: 'Ema' }).getByTestId('timetable-open').click();
    const editor = page.getByTestId('timetable-editor');
    await editor.getByTestId('timetable-cell-4-2').click();
    await editor.getByRole('button', { name: 'Vv', exact: true }).click();
    await editor.getByRole('button', { name: 'Vv', exact: true }).click();
    await expect(editor.getByTestId('timetable-cell-4-3')).toHaveText('Vv');
    const cell = (await editor.getByTestId('timetable-cell-0-1').boundingBox())!;
    expect(cell.height).toBeGreaterThanOrEqual(44);
    const table = (await editor.locator('.fam-tt-grid').boundingBox())!;
    expect(table.x + table.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await editor.getByRole('button', { name: /Hotovo/ }).click();
    await settings.getByTestId('timetable-school-open').click();
    const school = page.getByTestId('timetable-school-editor');
    await expect(school.getByLabel('1. hodina od')).toHaveValue('07:30');
    await expect(school.getByTestId('timetable-items').getByLabel('S sebou na Tv')).toHaveValue(
      'cvičky a úbor',
    );
  });
});

test.describe('Dnes – školní rozvrh', () => {
  test('ráno řádek na dítě, večer zítřek a co s sebou', async ({ page }) => {
    await page.goto('/homebrain-dnes?state=b&rozvrh=full&role=adult');
    const lines = page.getByTestId('today-school').getByTestId('school-timetable');
    await expect(lines).toHaveText([
      'Ema · škola 7:30–12:05 · s sebou: cvičky a úbor (Tv)',
      'Kuba · škola 7:30–13:00',
    ]);
    await page.goto('/homebrain-dnes?state=d&rozvrh=full&role=adult');
    await expect(lines).toHaveText(['Zítra Ema 7:30–12:05', 'Zítra Kuba 7:30–12:05']);
  });

  test('večer před prázdninami jen „Zítra volno“, kiosk nic', async ({ page }) => {
    await page.goto('/homebrain-dnes?state=d&rozvrh=holiday&role=adult');
    await expect(page.getByTestId('school-timetable')).toHaveText([
      'Zítra volno (podzimní prázdniny)',
    ]);
    await page.goto('/homebrain-dnes?state=b&rozvrh=full&role=kiosk&kiosk=1');
    await expect(page.getByTestId('today-clock')).toBeVisible();
    await expect(page.getByTestId('school-timetable')).toHaveCount(0);
  });
});

test.describe('Školní rozvrh – snímky', () => {
  test.use({ deviceScaleFactor: 1 });
  test('nastavení, detail, Dnes ráno/večer/před prázdninami', async ({ page }, testInfo) => {
    test.skip(!shots || testInfo.project.name === 'desktop', 'HB_TIMETABLE_SHOTS=<dir>');
    test.setTimeout(180_000);
    const viewports = [
      { width: 360, height: 800 },
      { width: 800, height: 1280 },
      { width: 1280, height: 800 },
    ];
    // One project produces every viewport (the other one only differs in its default size).
    test.skip(testInfo.project.name !== 'mobile-s21');
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
        await page.clock.setFixedTime(new Date('2026-11-25T08:40:00+01:00'));
        const detail = await openPerson(page, 'Kuba', `&theme=${theme}`);
        await detail.getByTestId('family-timetable').getByRole('button').first().click();
        await expect(detail.getByTestId('family-timetable-week')).toBeVisible();
        await shot(page, 'person-detail', theme);
        await page.goto(`/homebrain-rodina?rozvrh=full&theme=${theme}`);
        await page.getByRole('button', { name: 'Nastavení osob' }).click();
        await page
          .getByTestId('family-person-settings')
          .getByRole('group', { name: 'Ema' })
          .getByTestId('timetable-open')
          .click();
        await expect(page.getByTestId('timetable-editor')).toBeVisible();
        await shot(page, 'settings-grid', theme);
        await page.getByRole('button', { name: /Hotovo/ }).click();
        await page.getByTestId('timetable-school-open').click();
        await expect(page.getByTestId('timetable-school-editor')).toBeVisible();
        await shot(page, 'settings-school', theme);
        for (const [name, query] of [
          ['today-morning', 'state=b&rozvrh=full'],
          ['today-evening', 'state=d&rozvrh=full'],
          ['today-holiday-eve', 'state=d&rozvrh=holiday'],
        ]) {
          await page.goto(`/homebrain-dnes?${query}&skola=full&role=adult&theme=${theme}`);
          await expect(page.getByTestId('school-timetable').first()).toBeVisible();
          await shot(page, name!, theme);
        }
      }
    }
  });
});
