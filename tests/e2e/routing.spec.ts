import { expect, test, type Page } from '@playwright/test';
import panels from '../../custom_components/homebrain/panels.json' with { type: 'json' };

// Production-like routing: the dev harness only knows the panels the integration registers
// (panels.json) and, like HA, replaces any other url with the default dashboard
// (`ha-default-dashboard`). Every navigation inside HomeBrain must stay inside its panel.

const PANEL = Object.fromEntries(panels.modules.map((p) => [p.module, p.url_path])) as Record<
  string,
  string
>;
const KNOWN = new Set([
  ...panels.modules.map((p) => p.url_path),
  panels.settings.url_path,
  panels.kiosk.url_path,
]);

/** Record every url HomeBrain pushes/replaces, so even a transient bad navigation fails. */
async function trackHistory(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __hbUrls: string[] }).__hbUrls = seen;
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);
      history[method] = (state: unknown, unused: string, url?: string | URL | null) => {
        if (url != null) seen.push(new URL(String(url), location.href).pathname);
        original(state, unused, url);
      };
    }
  });
}

async function expectOnlyKnownPanels(page: Page) {
  const urls = await page.evaluate(() => (window as unknown as { __hbUrls: string[] }).__hbUrls);
  const unknown = urls.filter((url) => !KNOWN.has(url.split('/')[1] ?? ''));
  // The harness's own redirect to /lovelace is HA's answer to an unknown url: report its cause.
  expect(unknown, `navigace mimo panely HomeBrain: ${urls.join(', ')}`).toEqual([]);
}

async function expectInPanel(page: Page, panel: string, sub = '', step = '') {
  await expect(page, step).toHaveURL(
    new RegExp(`^[^?#]*/${panel.replace('/', '\\/')}${sub.replace('/', '\\/')}([?#].*)?$`),
  );
  await expect(page.getByTestId('ha-default-dashboard')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => trackHistory(page));

test('harness: neznámá adresa skončí na výchozím přehledu HA jako v produkci', async ({ page }) => {
  await page.goto('/access/test');
  await expect(page.getByTestId('ha-default-dashboard')).toBeVisible();
  await expect(page).toHaveURL(/\/lovelace$/);
  await expect(page.locator('homebrain-panel')).toHaveCount(0);
});

for (const path of [...KNOWN, `${panels.settings.url_path}/family`]) {
  test(`panel /${path} se otevře na své adrese`, async ({ page }) => {
    await page.goto(`/${path}`);
    await expect(page.locator('homebrain-panel')).toBeAttached();
    await expect(page.locator('.hb-shell')).toBeVisible({ timeout: 20_000 });
    await expectInPanel(page, path);
    await expectOnlyKnownPanels(page);
  });
}

test('Přístup: všechny záložky zůstanou v panelu, zpět vrátí Osoby, reload drží záložku', async ({
  page,
}) => {
  const P = PANEL.access!;
  await page.goto(`/${P}`);
  await expect(page.getByTestId('access-person').first()).toBeVisible({ timeout: 20_000 });
  const tabs: [string, string, () => ReturnType<Page['locator']>][] = [
    ['Test ruky', '/test', () => page.getByTestId('access-test-summary')],
    ['Zařízení', '/zarizeni', () => page.getByTestId('access-device')],
    [
      'Historie',
      '/historie',
      () =>
        page
          .getByTestId('access-history-item')
          .first()
          .or(page.getByText('Zatím žádné rozpoznání')),
    ],
    ['Osoby', '', () => page.getByTestId('access-person').first()],
  ];
  for (const [name, sub, view] of tabs) {
    await page.getByRole('radio', { name }).click();
    await expectInPanel(page, P, sub);
    await expect(view()).toBeVisible();
  }
  // Back from any tab lands on the root tab and its content follows the url.
  await page.getByRole('radio', { name: 'Test ruky' }).click();
  await page.getByRole('radio', { name: 'Zařízení' }).click();
  await expectInPanel(page, P, '/zarizeni');
  await page.goBack();
  await expectInPanel(page, P);
  await expect(page.getByRole('radio', { name: 'Osoby' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('access-person').first()).toBeVisible();
  await page.goForward();
  await expectInPanel(page, P, '/zarizeni');
  await expect(page.getByTestId('access-device')).toBeVisible();
  // Deep link + reload keep the tab.
  await page.goto(`/${P}/historie`);
  await expect(page.getByRole('radio', { name: 'Historie' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Historie' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expectInPanel(page, P, '/historie');
  await expectOnlyKnownPanels(page);
});

test('Přístup: průvodce, Přeskočit, karta osoby, služba a přepínače neopustí panel', async ({
  page,
}) => {
  const P = PANEL.access!;
  await page.goto(`/${P}?enroll_ms=150`);
  await expect(page.getByTestId('access-person').first()).toBeVisible({ timeout: 20_000 });
  // Wizard: open, name, skip a step, back closes it.
  await page.getByTestId('access-add').click();
  await expect(page.getByTestId('access-wizard')).toBeVisible();
  await page.getByTestId('access-name').fill('Jan');
  await page.getByTestId('access-name-next').click();
  await page.getByTestId('access-skip').click();
  await expectInPanel(page, P, '', 'krok 1');
  await page.goBack();
  await expect(page.getByTestId('access-wizard')).toHaveCount(0);
  await expectInPanel(page, P, '', 'krok 2');
  // Person sheet: open from the menu, back closes it.
  await page.getByTestId('access-person-menu').first().click();
  await expect(page.getByTestId('access-person-sheet')).toBeVisible();
  await expectInPanel(page, P, '', 'krok 3');
  await page.goBack();
  await expect(page.getByTestId('access-person-sheet')).toHaveCount(0);
  await expectInPanel(page, P, '', 'krok 4');
  // Service chip on the test tab and device switches.
  await page.getByRole('radio', { name: 'Test ruky' }).click();
  const service = page.getByTestId('access-test-service');
  if (await service.count()) await service.first().click();
  await expectInPanel(page, P, '/test', 'krok 5');
  await page.getByRole('radio', { name: 'Zařízení' }).click();
  const device = page.getByTestId('access-device');
  await expect(device).toBeVisible();
  for (const control of await device.locator('button, [role="switch"], input').all()) {
    if (!(await control.isEnabled())) continue;
    await control.click();
    const dialog = page.getByRole('dialog');
    if (await dialog.count()) await page.keyboard.press('Escape');
    await expectInPanel(page, P, '/zarizeni', 'krok 6');
  }
  await expectOnlyKnownPanels(page);
});

test('Zdraví: záložky, zpět a reload zůstanou v panelu', async ({ page }) => {
  const P = PANEL.health!;
  await page.goto(`/${P}`);
  for (const tab of ['progres', 'odmeny', 'data', 'dnes']) {
    await page.getByTestId(`health-tab-${tab}`).click();
    await expectInPanel(page, P, tab === 'dnes' ? '' : `/${tab}`);
    await expect(page.getByTestId(`health-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
  }
  await page.getByTestId('health-tab-data').click();
  await page.goBack();
  await expectInPanel(page, P);
  await page.goto(`/${P}/odmeny`);
  await page.reload();
  await expect(page.getByTestId('health-tab-odmeny')).toHaveAttribute('aria-selected', 'true');
  await expectOnlyKnownPanels(page);
});

test('Recepty: seznam → detail → vaření → přidat a zpět zůstanou v panelu', async ({ page }) => {
  const P = PANEL.recipes!;
  await page.goto(`/${P}`);
  await page.getByTestId('recipes-card').first().locator('button.open').click();
  await expectInPanel(page, P, '/[^/?#]+');
  await page.goBack();
  await expectInPanel(page, P);
  await page.getByTestId('recipes-add').click();
  await expectInPanel(page, P, '/pridat');
  await page.goBack();
  await expectInPanel(page, P);
  await expectOnlyKnownPanels(page);
});

test('Vinotéka: detail a návrat zůstanou v panelu', async ({ page }) => {
  const P = PANEL.wine!;
  await page.goto(`/${P}`);
  await page.getByTestId('wine-card').first().click();
  await expectInPanel(page, P, '/[^/?#]+');
  await page.goBack();
  await expectInPanel(page, P);
  await expectOnlyKnownPanels(page);
});

for (const state of ['a', 'a-night', 'b', 'c', 'd']) {
  test(`Dnes (${state}): každá navigační akce karty vede do panelu HomeBrain`, async ({ page }) => {
    await page.goto(`/${PANEL.today}?state=${state}`);
    await expect(page.locator('.hb-today')).toBeVisible({ timeout: 20_000 });
    const count = await page.locator('.hb-signal-action button:enabled').count();
    for (let i = 0; i < count; i++) {
      await page.goto(`/${PANEL.today}?state=${state}`);
      const button = page.locator('.hb-signal-action button:enabled').nth(i);
      if (!(await button.isVisible())) continue;
      await button.click();
      await expect(page.locator('.hb-shell')).toBeVisible();
      await expect(page.getByTestId('ha-default-dashboard')).toHaveCount(0);
    }
    const more = page.getByTestId('footer-more');
    if (await more.count()) {
      await more.click();
      await expectInPanel(page, PANEL.today!, '/all');
    }
    await expectOnlyKnownPanels(page);
  });
}
