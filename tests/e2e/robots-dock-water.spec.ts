import { expect, test } from '@playwright/test';

test('water_empty: návod, návrat do doku, potvrzení doplnění', async ({ page }) => {
  await page.goto('/homebrain-roboti?robots=water');
  await expect(page.getByTestId('robots-problem')).toContainText('Došla čistá voda');
  await expect(page.getByTestId('robots-dock-refill-hint')).toContainText('vrátí do doku');
  await expect(page.getByTestId('robots-dock-return-home')).toBeEnabled();
  await page.getByTestId('robots-dock-return-home').click();
  await expect(page.getByTestId('robots-confirm')).toContainText('doku');
  await page.getByRole('button', { name: 'Zrušit' }).click();

  await page.getByTestId('robots-dock-ack-refilled').click();
  await expect(page.getByTestId('robots-problem')).toHaveCount(0);
  await expect(page.getByTestId('robots-dock-ack-chip')).toContainText('Čeká na kontrolu v doku');

  await page.reload();
  await expect(page.getByTestId('robots-dock-ack-chip')).toBeVisible();
  await expect(page.getByTestId('robots-problem')).toHaveCount(0);
});
