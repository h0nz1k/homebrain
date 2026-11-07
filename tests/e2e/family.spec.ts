import { expect, test, type Page } from '@playwright/test';

// Rodina (dev mock: synthetic household „Dcera“ + „Syn“, `?role=` role, `?rodina=empty`).

async function open(page: Page, query = '') {
  await page.goto(`/homebrain-rodina${query}`);
  await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Rodina', () => {
  test('rodič: dnešek, 7 dní, povinnosti obou dětí a nákup', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('family-today')).toContainText('Dnes v rodině');
    // The running/next event is highlighted once, not repeated in the list.
    const listed =
      (await page.getByTestId('family-event').count()) +
      (await page.getByTestId('family-next').count());
    expect(listed).toBe(4);
    await expect(page.getByTestId('family-day')).toHaveCount(7);
    await expect(page.getByTestId('family-kid')).toHaveCount(2);
    await expect(page.getByTestId('family-total').first()).toContainText('128');
    await expect(page.getByTestId('family-pending-points')).toHaveText('+4 čeká');
    await expect(page.getByTestId('family-shop-item')).toHaveCount(6);
    await noSidewaysScroll(page);
  });

  test('rodič schválí povinnost, odškrtne a přidá nákup', async ({ page }) => {
    await open(page);
    const claimed = page.locator('[data-testid="family-chore"][data-state="claimed"]');
    await expect(claimed).toHaveCount(1);
    await page.getByTestId('family-approve').click();
    await expect(claimed).toHaveCount(0);
    await page.getByTestId('family-shop-input').fill('Chleba');
    await page.getByTestId('family-shop-add').click();
    await expect(page.getByTestId('family-shopping')).toContainText('Chleba');
    await expect(page.getByTestId('family-shop-input')).toHaveValue('');
    const first = page.getByTestId('family-shop-item').first();
    await first.getByTestId('family-shop-toggle').click();
    await expect(page.locator('[data-testid="family-shop-item"][data-done]')).toHaveCount(3);
  });

  test('dítě: jen vlastní povinnosti, bez schvalování a detailů událostí', async ({ page }) => {
    await open(page, '?role=child');
    await expect(page.getByTestId('family-kid')).toHaveCount(1);
    await expect(page.getByTestId('family-chores')).toContainText('Moje povinnosti');
    await expect(page.getByTestId('family-approve')).toHaveCount(0);
    await expect(page.getByTestId('family-event-detail')).toHaveCount(0);
    const todo = page.locator('[data-testid="family-chore"][data-state="todo"]').first();
    await todo.getByTestId('family-chore-check').click();
    await expect(page.locator('[data-testid="family-chore"][data-state="claimed"]')).toHaveCount(1);
  });

  test('kuchyňský tablet: tři sloupce bez scrollu, dítě odškrtne povinnost', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '?role=kiosk&kiosk=1');
    await expect(page.getByTestId('family')).toHaveAttribute('data-kiosk', 'true');
    await expect(page.getByTestId('family-approve')).toHaveCount(0);
    await expect(page.getByTestId('family-clock')).toBeVisible();
    await expect(page.getByTestId('family-day')).toHaveCount(7);
    await expect(page.getByTestId('family-chores')).toContainText('Schválí rodič');
    const check = await page.getByTestId('family-chore-check').first().boundingBox();
    expect(check!.width).toBeGreaterThanOrEqual(48);
    const box = await page.getByTestId('family-shop-toggle').first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    await noSidewaysScroll(page);
  });

  test('mobil: nákup hned pod dneškem, před povinnostmi', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    const top = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
    expect(await top('family-shopping')).toBeLessThan(await top('family-chores'));
    expect(await top('family-today')).toBeLessThan(await top('family-shopping'));
    await noSidewaysScroll(page);
  });

  test('nic nenastaveno: neutrální text, žádná chyba', async ({ page }) => {
    await open(page, '?role=adult&rodina=empty');
    await expect(page.getByTestId('family-no-calendar')).toContainText('zatím není nastaven');
    await expect(page.getByTestId('family-chores')).toHaveCount(0);
  });
});
