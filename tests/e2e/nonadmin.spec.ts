import { expect, test, type Page } from '@playwright/test';

// Ne-admin uživatelé (ADR-0002 Fáze 4). Dev mock: `?session=<role>` odpoví na
// `homebrain/session/get` jako integrace pro ne-admin účet s danou rolí (guest = bez mapování),
// `?role=` přepne mock data modulů (Rodina, Dnes) na stejnou roli.

const OPENED: Array<[path: string, ready: (page: Page) => Promise<void>]> = [
  ['/homebrain-dnes', (page) => expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 })],
  [
    '/homebrain-odpady',
    (page) =>
      expect(page.getByText('Každá nádoba má svůj den', { exact: true })).toBeVisible({
        timeout: 20_000,
      }),
  ],
  [
    '/homebrain-pocasi',
    (page) => expect(page.getByTestId('weather-now-temp')).toBeVisible({ timeout: 20_000 }),
  ],
  [
    '/homebrain-rodina',
    (page) => expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 }),
  ],
  [
    '/homebrain-energie',
    (page) => expect(page.getByTestId('energy-price')).toBeVisible({ timeout: 20_000 }),
  ],
];

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Ne-admin dospělý', () => {
  for (const [path, ready] of OPENED) {
    test(`vidí ${path} bez stavu „Nemáte přístup“`, async ({ page }) => {
      await page.goto(`${path}?session=adult&role=adult`);
      await ready(page);
      await expect(page.getByTestId('hb-no-access')).toHaveCount(0);
      await noSidewaysScroll(page);
    });
  }

  test('Rodina: dospělý schvaluje povinnosti, ale nastavení kalendářů nevidí', async ({ page }) => {
    await page.goto('/homebrain-rodina?session=adult&role=adult');
    await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('family-approve')).toBeVisible();
    await page.goto('/homebrain-rodina?session=adult&role=adult&rodina=empty');
    await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Vyberte rodinný kalendář v Nastavení → Rodina.')).toHaveCount(0);
  });

  test('Nastavení zůstává jen pro správce', async ({ page }) => {
    await page.goto('/homebrain-nastaveni?session=adult&role=adult');
    await expect(page.getByTestId('hb-no-access')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Uživatel bez role (guest)', () => {
  for (const [path] of OPENED) {
    test(`${path}: klidný stav „Nemáte přístup“, žádná data`, async ({ page }) => {
      await page.goto(`${path}?session=guest`);
      const state = page.getByTestId('hb-no-access');
      await expect(state).toBeVisible({ timeout: 20_000 });
      await expect(state).toContainText('Nemáte přístup');
      await expect(state).toContainText('Uživatelé a role');
      for (const id of ['today', 'family', 'weather-now-temp', 'energy-price']) {
        await expect(page.getByTestId(id)).toHaveCount(0);
      }
      await expect(page.getByText('Každá nádoba má svůj den', { exact: true })).toHaveCount(0);
      await noSidewaysScroll(page);
    });
  }
});

test('dítě: Energie je mimo jeho roli', async ({ page }) => {
  await page.goto('/homebrain-energie?session=child&role=child');
  await expect(page.getByTestId('hb-no-access')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('energy-price')).toHaveCount(0);
});
