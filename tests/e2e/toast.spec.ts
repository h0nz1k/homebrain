import { expect, test } from '@playwright/test';

// Jednotná oznámení (packages/ui toast): jeden uložený tok na modul + rozložení dle viewportu.

test('odpady: přepnutí připomínky potvrdí sdílené oznámení', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
  await page.goto('/waste');
  const reminders = page.getByRole('complementary', { name: 'Připomínky' });
  await reminders.getByRole('switch').first().uncheck();
  const toast = page.getByTestId('hb-toast').last();
  await expect(toast).toContainText('Večerní připomínka vypnuta');
  await expect(toast).toHaveAttribute('data-kind', 'success');
  await expect(page.locator('[data-hb-live="polite"]')).toHaveText('Večerní připomínka vypnuta');
  await reminders.getByRole('switch').first().check();
  // Stejné id nahradí předchozí oznámení – nehromadí se.
  await expect(page.getByTestId('hb-toast')).toHaveCount(1);
  await expect(page.getByTestId('hb-toast')).toContainText('Večerní připomínka zapnuta');
});

test('oznámení: dole uprostřed na mobilu, vpravo dole na desktopu, nad bezpečnou zónou', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
  await page.goto('/waste');
  await page
    .getByRole('complementary', { name: 'Připomínky' })
    .getByRole('switch')
    .first()
    .uncheck();
  const toast = page.getByTestId('hb-toast').last();
  await expect(toast).toBeVisible();
  const box = (await toast.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThan(vp.height - 8);
  const centred = Math.abs(box.x + box.width / 2 - vp.width / 2) < 4;
  const right = vp.width - (box.x + box.width) < 40;
  if (testInfo.project.name === 'desktop') expect(right).toBe(true);
  else if (testInfo.project.name === 'mobile-s21') expect(centred).toBe(true);
  else expect(centred || right).toBe(true);
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    vp.width,
  );
});
