import { expect, test, type Page, type TestInfo } from '@playwright/test';

const device = (info: TestInfo) => info.project.name.replace(/-.*$/, '');
async function shot(page: Page, info: TestInfo, name: string, fullPage = false) {
  await page.mouse.move(0, 0);
  const file = info.outputPath(`${device(info)}-${name}.png`);
  await page.screenshot({ path: file, fullPage, animations: 'disabled' });
  await info.attach(name, { path: file, contentType: 'image/png' });
}

for (const theme of ['dark', 'light']) {
  test(`nastavení energie: ${theme}, detail řádku, úprava a potvrzení`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/homebrain-energie?theme=${theme}`);
    await page.getByRole('radio', { name: 'Nastavení', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Fotovoltaika', exact: true })).toBeVisible();
    // The first setting is visible without scrolling, even on a 360×800 phone.
    const first = page.locator('.hb-cell').first();
    await expect(first).toBeInViewport();
    await shot(page, testInfo, theme);
    await shot(page, testInfo, `${theme}-full`, true);

    // Read-only row: same sheet, read-only, says where it is changed.
    await page.getByRole('button', { name: /^Provozní režim: .*jen pro čtení$/ }).click();
    const info = page.getByRole('dialog', { name: 'Provozní režim' });
    await expect(info).toContainText('Mění se v aplikaci SolarGo.');
    await expect(info.getByRole('spinbutton')).toHaveCount(0);
    const close = info.getByRole('button', { name: 'Zavřít' }).first();
    const closeBox = await close.boundingBox();
    expect(closeBox!.width).toBeGreaterThanOrEqual(43.5);
    expect(closeBox!.height).toBeGreaterThanOrEqual(43.5);
    await shot(page, testInfo, `${theme}-tooltip`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Warning in the Síť card with the admin action.
    const warning = page.getByRole('note').filter({ hasText: 'Limity přetoku se neshodují' });
    await warning.scrollIntoViewIfNeeded();
    await expect(warning.getByRole('button', { name: /Použít 0,08\skW/ })).toBeVisible();
    await shot(page, testInfo, `${theme}-warning`);

    // Editable row → sheet with stepper → confirm step → inverter write.
    const reserveRow = page.getByRole('button', { name: /^Rezerva v síti: / });
    await reserveRow.scrollIntoViewIfNeeded();
    await reserveRow.click();
    const sheet = page.getByRole('dialog', { name: 'Rezerva v síti' });
    await expect(sheet).toContainText(/teď 90\s%/);
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    const plus = sheet.getByRole('button', { name: 'Zvýšit: Rezerva v síti: nová hodnota' });
    await plus.click();
    await plus.click();
    await expect(sheet.getByRole('spinbutton')).toHaveValue('20');
    await shot(page, testInfo, `${theme}-edit-sheet`);
    await sheet.getByRole('button', { name: 'Pokračovat' }).click();
    const confirm = page.getByRole('dialog', {
      name: /Změnit rezervu baterie z\s10\s% na 20\s%\?/,
    });
    await expect(confirm).toContainText(/1,2\skWh míň/);
    await expect(confirm).toContainText('uloží do střídače');
    await shot(page, testInfo, `${theme}-confirm`);
    await confirm.getByRole('button', { name: 'Potvrdit změnu' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Rezerva v síti: 20\s%$/ })).toBeVisible();
    expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.getByRole('radio', { name: 'Přehled', exact: true }).click();
    await expect(page.getByTestId('energy-flow')).toBeVisible();
  });
}
test('dospělý může nastavení pouze číst', async ({ page }) => {
  await page.goto('/homebrain-energie?role=adult');
  await page.getByRole('radio', { name: 'Nastavení', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Baterie', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Použít .* i\spro předpověď/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Rezerva v síti: .*jen pro čtení$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Rezerva v síti' });
  await expect(sheet).toContainText('Mění jen správce v HomeBrainu.');
  await expect(sheet.getByRole('spinbutton')).toHaveCount(0);
});
