import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import panels from '../../custom_components/homebrain/panels.json' with { type: 'json' };

// Smoke proti skutečnému HA (issue #26): každý registrovaný panel HomeBrain se otevře
// v iframe HA, vykreslí shell a bundle HomeBrain nehlásí chyby do konzole.
const tokens = JSON.parse(
  readFileSync(new URL('../../ha-test/.auth/admin.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

const PATHS = [
  ...panels.modules.map((p) => p.url_path),
  panels.settings.url_path,
  panels.kiosk.url_path,
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    `localStorage.setItem('hassTokens', ${JSON.stringify(JSON.stringify(tokens))});`,
  );
});

for (const path of PATHS) {
  test(`panel /${path} se vykreslí ve skutečném HA`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.location().url.includes('/homebrain_static/')) {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (error) => {
      if (String(error.stack ?? '').includes('/homebrain_static/')) errors.push(error.message);
    });
    await page.goto(`/${path}`);
    const panel = page.frameLocator('iframe');
    await expect(panel.locator('.hb-shell')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/${path}([/?#].*)?$`));
    expect(errors, `chyby bundle HomeBrain na /${path}`).toEqual([]);
  });
}
