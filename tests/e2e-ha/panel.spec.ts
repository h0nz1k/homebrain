import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Tokeny vytváří `node ha-test/onboard.mjs` (gitignored, jen testovací HA).
const tokens = JSON.parse(
  readFileSync(new URL('../../ha-test/.auth/admin.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

test('panel HomeBrain se načte ve skutečném HA a zobrazí Odpady', async ({ page }, testInfo) => {
  await page.addInitScript(
    `localStorage.setItem('hassTokens', ${JSON.stringify(JSON.stringify(tokens))});`,
  );
  await page.goto('/homebrain');
  const panel = page.frameLocator('iframe');
  await expect(panel.getByRole('heading', { name: 'Dnes', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await panel
    .getByRole('navigation', { name: 'Hlavní navigace' })
    .getByRole('link', { name: 'Odpady', exact: true })
    .click();
  await expect(panel.getByText('Každá nádoba má svůj den', { exact: true })).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Nejbližší svozy' })).toContainText('Papír');
  await expect(panel.getByText('Není nastavena vazba na entitu odpadů')).not.toBeVisible();
  await testInfo.attach('ha-odpady', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
