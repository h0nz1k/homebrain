import { expect, test, type Page } from '@playwright/test';

// Android/iOS back (HA Companion = WebView.goBack()) must stay inside HomeBrain: close the
// open sheet first, then return to the previous HomeBrain view, and only leave at the root.

/** What HA's sidebar does: push the panel URL on HA's window and fire `location-changed`. */
async function haNavigate(page: Page, url: string) {
  await page.evaluate((target) => {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }, url);
}

test.beforeEach(async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== 'mobile-s21', 'back gesture flow is a phone scenario');
  await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
});

test('energie: zpět zavře sheet, další zpět vrátí předchozí pohled HomeBrain', async ({ page }) => {
  // Dev fixtures read the query at load, so the scenario is set on the first document.
  await page.goto('/homebrain-dnes?flow=noon');
  await expect(page.locator('.hb-topbar-title')).toHaveText('Dnes');
  await haNavigate(page, '/homebrain-energie?flow=noon');
  await expect(page.getByTestId('energy-flow-node-pv')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, 200));

  await page.getByTestId('energy-flow-node-pv').click();
  const sheet = page.getByTestId('energy-flow-sheet');
  await expect(sheet).toBeVisible();

  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/homebrain-energie\?flow=noon$/);
  await expect(page.getByTestId('energy-flow-node-pv')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/homebrain-dnes\?flow=noon$/);
  await expect(page.locator('.hb-topbar-title')).toHaveText('Dnes');
});

test('energie: zavření tlačítkem nenechá v historii mrtvý krok', async ({ page }) => {
  await page.goto('/homebrain-dnes?flow=noon');
  await haNavigate(page, '/homebrain-energie?flow=noon');
  await expect(page.getByTestId('energy-flow-node-pv')).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('energy-flow-node-pv').click();
    await expect(page.getByTestId('energy-flow-sheet')).toBeVisible();
    await page.getByTestId('energy-flow-sheet').locator('.ef-close').click();
    await expect(page.getByTestId('energy-flow-sheet')).toHaveCount(0);
  }
  // One back = previous view, not three dead sheet entries.
  await page.goBack();
  await expect(page).toHaveURL(/\/homebrain-dnes\?flow=noon$/);
});

test('zdraví: záložky jsou v URL, zpět vrátí na Dnes, další zpět opustí modul', async ({
  page,
}) => {
  await page.goto('/homebrain-energie');
  await haNavigate(page, '/homebrain-zdravi');
  await expect(page.getByTestId('health-tab-dnes')).toHaveAttribute('aria-selected', 'true', {
    timeout: 20_000,
  });
  for (const tab of ['progres', 'odmeny', 'data']) {
    await page.getByTestId(`health-tab-${tab}`).click();
    await expect(page.getByTestId(`health-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`/homebrain-zdravi/${tab}$`));
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/homebrain-zdravi$/);
  await expect(page.getByTestId('health-tab-dnes')).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/homebrain-energie$/);
});

test('zdraví: deep link na záložku funguje', async ({ page }) => {
  await page.goto('/homebrain-zdravi/odmeny');
  await expect(page.getByTestId('health-tab-odmeny')).toHaveAttribute('aria-selected', 'true');
});

test('vinotéka: filtry i detail zavře zpět, zavření detailu nepřidá krok', async ({ page }) => {
  await page.goto('/homebrain-dnes');
  await haNavigate(page, '/homebrain-vinoteka');
  await expect(page.getByTestId('wine-card').first()).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('wine-filters-open').click();
  await expect(page.getByTestId('wine-filters')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('wine-filters')).toHaveCount(0);
  await expect(page).toHaveURL(/\/homebrain-vinoteka$/);

  await page.getByTestId('wine-card').first().click();
  await expect(page.getByTestId('wine-detail')).toBeVisible();
  await expect(page).toHaveURL(/\/homebrain-vinoteka\/.+/);
  await page.goBack();
  await expect(page.getByTestId('wine-detail')).toHaveCount(0);
  await expect(page).toHaveURL(/\/homebrain-vinoteka$/);

  // Close via UI, then a single back leaves to the previous view (no detail reopening).
  await page.getByTestId('wine-card').first().click();
  await expect(page.getByTestId('wine-detail')).toBeVisible();
  await page
    .getByTestId('wine-detail')
    .getByRole('button', { name: /Zpět na katalog|Zavřít detail/ })
    .first()
    .click();
  await expect(page.getByTestId('wine-detail')).toHaveCount(0);
  await expect(page).toHaveURL(/\/homebrain-vinoteka$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/homebrain-dnes$/);
});

test('kiosk: bez záložek a bez nových záznamů historie', async ({ page }) => {
  await page.goto('/homebrain-kiosk');
  await expect(page.locator('.hb-shell')).toHaveAttribute('data-kiosk', 'true');
  const length = await page.evaluate(() => window.history.length);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.history.length)).toBe(length);
  expect(await page.evaluate(() => window.history.state)).toBeNull();
});
