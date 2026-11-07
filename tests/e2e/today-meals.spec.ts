/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/** Dnes „Co se dnes vaří“ (Mealie) + „Povinnosti dětí dnes“ (Rodina) – synthetic dev data. */
async function open(page: Page, query: string) {
  await page.goto(`/homebrain-dnes?${query}`);
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('today-meals')).toBeVisible({ timeout: 20_000 });
}

async function noHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    w: innerWidth,
    outside: Array.from(document.querySelectorAll('.today-home *'))
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5)
      .map((el) => el.className),
  }));
  expect(result.scrollW).toBe(result.w);
  expect(result.outside).toEqual([]);
}

test.describe('Dnes – jídla a povinnosti (desktop)', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'běží v projektu desktop');
  });

  test('jídla v pořadí dne, známý recept otevře Recepty', async ({ page }) => {
    await open(page, 'state=a');
    const rows = page.getByTestId('today-meal');
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText('Snídaně');
    await expect(rows.last()).toContainText('Večeře');
    await noHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Svíčková na smetaně' }).click();
    await expect(page).toHaveURL(/\/homebrain-recepty\/a10+$/, { timeout: 20_000 });
  });

  test('povinnosti dětí – souhrn, klik otevře Rodinu', async ({ page }) => {
    await open(page, 'state=a');
    const chores = page.getByTestId('today-chores');
    await expect(chores).toContainText('Povinnosti dětí dnes');
    await expect(page.getByTestId('today-chore-kid')).toHaveCount(2);
    await expect(chores).toContainText('2/3');
    await expect(chores).toContainText('1 po termínu');
    await chores.click();
    await expect(page).toHaveURL(/\/homebrain-rodina/, { timeout: 20_000 });
  });

  test('prázdný jídelníček je klidný, nápověda Mealie jen pro admina', async ({ page }) => {
    await open(page, 'state=a&jidlo=empty');
    await expect(page.getByTestId('today-meals-empty')).toHaveText(
      'Nic naplánováno – naplánujte v Mealie',
    );
    await expect(page.getByTestId('today-chores')).toHaveCount(0);
    await open(page, 'state=a&jidlo=empty&role=adult');
    await expect(page.getByTestId('today-meals-empty')).toHaveText('Nic naplánováno');
  });

  test('kiosk 1280×800: jídla bez odkazů, vše se vejde', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, 'kiosk=1&state=a');
    await expect(page.getByTestId('today-meal')).toHaveCount(4);
    await expect(page.locator('.today-meal-link')).toHaveCount(0);
    await expect(page.getByTestId('today-chores')).toBeVisible();
    const fit = await page.evaluate(() => ({
      scrollH: document.documentElement.scrollHeight,
      h: innerHeight,
      clipped: Array.from(document.querySelectorAll('.today-home *'))
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => el.getBoundingClientRect().bottom > innerHeight)
        .map((el) => el.className),
    }));
    expect(fit.scrollH).toBeLessThanOrEqual(fit.h);
    expect(fit.clipped).toEqual([]);
  });
});

test.describe('Dnes – jídla a povinnosti (telefon)', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright vyžaduje destrukturaci fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-s21', 'běží v projektu mobile-s21');
  });

  test('dlaždice pod sebou, nic nepřetéká', async ({ page }) => {
    await open(page, 'state=a');
    await expect(page.getByTestId('today-meal')).toHaveCount(4);
    const [meals, chores] = await Promise.all([
      page.getByTestId('today-meals').boundingBox(),
      page.getByTestId('today-chores').boundingBox(),
    ]);
    expect(chores!.y).toBeGreaterThanOrEqual(meals!.y + meals!.height - 1);
    await noHorizontalOverflow(page);
  });
});
