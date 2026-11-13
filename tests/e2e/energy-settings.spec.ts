import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`nastavení energie: ${theme}, nápověda a potvrzení změny`, async ({ page }, testInfo) => {
    await page.goto(`/homebrain-energie?theme=${theme}`);
    await page.getByRole('radio', { name: 'Nastavení', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nastavení energie' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fotovoltaika', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`settings-${theme}.png`), fullPage: true });
    await testInfo.attach(`settings-${theme}`, {
      path: testInfo.outputPath(`settings-${theme}.png`),
      contentType: 'image/png',
    });
    const help = page.getByRole('button', { name: 'Nápověda: Rezerva v síti' });
    await help.click();
    await expect(page.getByRole('tooltip')).toContainText('DoD');
    const bounds = await page.getByRole('tooltip').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({ path: testInfo.outputPath(`settings-${theme}-tooltip.png`) });
    await testInfo.attach(`settings-${theme}-tooltip`, {
      path: testInfo.outputPath(`settings-${theme}-tooltip.png`),
      contentType: 'image/png',
    });
    await help.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    const reserveRow = page
      .locator('.en-setting')
      .filter({ has: page.getByRole('heading', { name: 'Rezerva v síti', exact: true }) });
    await reserveRow.getByRole('button', { name: 'Upravit' }).click();
    const reserve = page.getByRole('spinbutton', { name: 'Rezerva v síti: nová hodnota' });
    await reserve.fill('20');
    await reserve
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: 'Pokračovat' })
      .click();
    await expect(page.getByRole('alertdialog')).toContainText('1,2 kWh míň');
    await page.screenshot({ path: testInfo.outputPath(`settings-${theme}-confirm.png`) });
    await testInfo.attach(`settings-${theme}-confirm`, {
      path: testInfo.outputPath(`settings-${theme}-confirm.png`),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Potvrdit změnu' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(reserveRow.locator('.en-setting-value')).toContainText('20 %');
    expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await page.getByRole('radio', { name: 'Přehled', exact: true }).click();
    await expect(page.getByTestId('energy-flow')).toBeVisible();
  });
}
test('dospělý může nastavení pouze číst', async ({ page }) => {
  await page.goto('/homebrain-energie?role=adult');
  await page.getByRole('radio', { name: 'Nastavení', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Baterie', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
});
