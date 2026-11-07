import { expect, test } from '@playwright/test';

// Energie „Faktury“ on the synthetic dev backend (no real invoice data anywhere).
const SYNTHETIC_PDF = {
  name: 'faktura-ukazka.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% synthetic test invoice\n%%EOF\n'),
};

test('správce nahraje fakturu, zkontroluje údaje a porovná ji s měřením', async ({ page }) => {
  await page.goto('/homebrain-energie');
  const card = page.getByTestId('energy-invoices');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByTestId('energy-invoice-item')).toHaveCount(1);
  await expect(card.getByTestId('energy-invoice-contract')).toContainText('Pevná cena končí');

  await card.getByTestId('energy-invoice-file').setInputFiles(SYNTHETIC_PDF);
  const sheet = page.getByTestId('energy-invoice-edit');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('energy-invoice-field-kwh.total')).toHaveValue('540');
  await sheet.getByTestId('energy-invoice-field-total_incl_vat').fill('3012,40');
  await sheet.getByTestId('energy-invoice-save').click();
  await expect(sheet).toBeHidden();

  await expect(card.getByTestId('energy-invoice-item')).toHaveCount(2);
  await expect(card.getByTestId('energy-invoice-item').first()).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(card.getByTestId('energy-invoice-summary')).toContainText('Kč');
  await expect(card.getByTestId('energy-invoice-grid')).toContainText(
    /HA měří nákup od 1\.\s11\.\s2026/,
  );
  await expect(card.getByTestId('energy-invoice-self')).toContainText(/365\skWh/);

  await card.getByTestId('energy-invoice-apply-tariff').click();
  await page.getByTestId('energy-invoice-tariff-confirm-ok').click();
  await expect(card.getByTestId('energy-invoice-tariff')).toContainText(
    'Ceny v HomeBrainu odpovídají faktuře.',
  );
  await expect(card.getByTestId('energy-invoice-apply-tariff')).toHaveCount(0);
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});

test('dospělý vidí srovnání jen pro čtení, kiosk faktury nevidí', async ({ page }) => {
  await page.goto('/homebrain-energie?role=adult');
  const card = page.getByTestId('energy-invoices');
  await expect(card.getByTestId('energy-invoice-compare')).toBeVisible({ timeout: 20_000 });
  await expect(card.getByTestId('energy-invoice-upload')).toHaveCount(0);
  await expect(card.getByTestId('energy-invoice-edit-open')).toHaveCount(0);
  await expect(card.getByTestId('energy-invoice-apply-tariff')).toHaveCount(0);

  await page.goto('/homebrain-energie?role=kiosk');
  await expect(page.getByTestId('energy-price')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('energy-invoices')).toHaveCount(0);
});
