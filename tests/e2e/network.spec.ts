import { expect, test, type Page } from '@playwright/test';

// Síť (dev mock: synthetic house with 7 APs and 3 switches, `?sit=` scenario, `?role=` role).

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Síť – správce', () => {
  test('přehled: hero s hlavním problémem, „Co s tím“ a tipy', async ({ page }) => {
    await page.goto('/homebrain-sit');
    const hero = page.getByTestId('network-hero');
    await expect(hero).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('network-headline')).toHaveText('Terasa vypadává');
    await expect(hero).toContainText('3 problémy · 2 tipy');
    await expect(page.getByTestId('network-problem')).toHaveCount(3);
    await expect(page.getByTestId('network-problem').first()).toContainText('Co s tím');
    await expect(page.getByTestId('network-tip')).toHaveCount(2);
    await expect(page.getByTestId('network-ap')).toHaveCount(7);
    // All APs online: the count is calm, only „1 nestabilní“ is amber.
    await expect(page.getByTestId('network-stat-aps')).toHaveAttribute('data-tone', 'ok');
    await expect(page.getByTestId('network-stat-aps')).toHaveAttribute('data-detail-tone', 'warn');
    await expect(page.getByTestId('network-house')).toContainText('\u22121. patro');
    // The title lives in the shell top bar only.
    await expect(page.getByRole('heading', { level: 1, name: 'Síť' })).toHaveClass(/hb-sr-only/);
    await noSidewaysScroll(page);
  });

  test('přehled: „Co s tím“ v hero vede na kartu, která titulek neopakuje', async ({ page }) => {
    await page.goto('/homebrain-sit');
    await expect(page.getByTestId('network-hero')).toBeVisible({ timeout: 20_000 });
    const first = page.getByTestId('network-problem').first();
    await expect(first).toHaveAttribute('data-in-hero', 'true');
    await expect(first.locator('h4')).not.toHaveText('Terasa vypadává');
    await expect(first).toContainText('Upozornění');
    await page.getByTestId('network-hero-fix').click();
    await expect(first).toBeFocused();
    await expect(first).toBeInViewport();
  });

  test('záložky: switche s pomalým portem a zařízení s hlídáním', async ({ page }) => {
    await page.goto('/homebrain-sit');
    await expect(page.getByTestId('network-hero')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('radio', { name: 'Switche' }).click();
    await expect(page.getByTestId('network-switch')).toHaveCount(3);
    await expect(page.locator('[data-testid="network-port"][data-slow]')).toHaveCount(1);
    await page.getByRole('radio', { name: 'Zařízení' }).click();
    await expect(page.getByTestId('network-device').first()).toContainText('Tablet Kuchyň');
    await page.getByRole('button', { name: 'Hlídat Notebook' }).click();
    await expect(page.getByRole('button', { name: 'Nehlídat Notebook' })).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('klidný stav a výpadek internetu', async ({ page }) => {
    await page.goto('/homebrain-sit?sit=ok');
    await expect(page.getByTestId('network-headline')).toHaveText('Síť v pořádku', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('network-no-problems')).toBeVisible();
    await page.goto('/homebrain-sit?sit=down');
    await expect(page.getByTestId('network-headline')).toHaveText('Internet nefunguje', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('network-hero')).toHaveAttribute('data-net-state', 'critical');
  });

  test('Wi-Fi pro hosty: QR a úprava jen pro správce', async ({ page }) => {
    await page.goto('/homebrain-sit');
    await expect(page.getByTestId('network-hero')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('radio', { name: 'Hosté' }).click();
    await expect(page.getByRole('img', { name: 'QR kód Wi-Fi Host demo' })).toBeVisible();
    await page.getByTestId('network-guest-edit').click();
    await page.getByLabel('Název sítě (SSID)').fill('Host nový');
    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByTestId('network-guest-ssid')).toHaveText('Host nový');
  });
});

for (const role of ['kiosk', 'adult'] as const)
  test(`Síť – ${role}: jen souhrn a QR, žádný seznam zařízení`, async ({ page }) => {
    await page.goto(`/homebrain-sit?role=${role}`);
    const summary = page.getByTestId('network-summary');
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary).toHaveAttribute('data-net-state', 'problem');
    await expect(page.getByTestId('network-headline')).toHaveText('Terasa vypadává');
    await expect(page.getByRole('img', { name: 'QR kód Wi-Fi Host demo' })).toBeVisible();
    await expect(page.getByTestId('network-hero')).toHaveCount(0);
    await expect(page.getByTestId('network-device')).toHaveCount(0);
    await expect(page.getByTestId('network-guest-edit')).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Sekce' })).toHaveCount(0);
    await noSidewaysScroll(page);
  });

test('Síť – nenastavená hostovská Wi-Fi ukáže nápovědu', async ({ page }) => {
  await page.goto('/homebrain-sit?role=kiosk&hoste=0&sit=ok');
  await expect(page.getByTestId('network-guest-hint')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('network-headline')).toHaveText('Síť v pořádku');
});
