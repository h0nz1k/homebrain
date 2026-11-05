import { expect, test } from '@playwright/test';

// Minutky + Vajíčka (dev server, synthetic mock API; the mock „server“ timers are shared by
// tabs through localStorage, like the integration shares them between devices).
const TIMERS = '/homebrain-recepty/minutky';

test('vajíčka: čas podle vstupů, kalibrační příznak, spuštění pojmenované minutky', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/homebrain-recepty');
  await page.getByTestId('recipes-kitchen-timers').click();
  await expect(page).toHaveURL(/\/homebrain-recepty\/minutky/);
  await expect(page.getByTestId('kitchen-timers-empty')).toBeVisible();

  const wizard = page.getByTestId('eggs-wizard');
  const time = page.getByTestId('eggs-time');
  // Default: slepičí M, chlazené, 2 ks, NAMĚKKO.
  await expect(time).toHaveText('5:00');
  await expect(page.getByTestId('eggs-uncalibrated')).toHaveCount(0);
  await wizard.getByRole('radio', { name: 'NAHNILIČKO' }).click();
  await expect(time).toHaveText('6:00');
  await page.getByTestId('eggs-chilled').click();
  await expect(time).toHaveText('4:49');
  await wizard.getByRole('radio', { name: 'NATVRDO' }).click();
  await expect(page.getByTestId('eggs-uncalibrated')).toHaveCount(0);
  await wizard.getByRole('radio', { name: 'XL' }).click();
  await expect(page.getByTestId('eggs-uncalibrated')).toBeVisible();
  await wizard.getByRole('radio', { name: 'M', exact: true }).click();
  await wizard.getByRole('radio', { name: 'Křepelčí' }).click();
  await expect(wizard.getByRole('radio', { name: 'XL' })).toBeDisabled();
  await wizard.getByRole('radio', { name: 'Slepičí' }).click();
  await wizard.getByRole('radio', { name: 'NAMĚKKO' }).click();
  await page.getByTestId('eggs-chilled').click();
  await wizard.getByRole('button', { name: 'Více vajec' }).click();
  await expect(page.getByTestId('eggs-count')).toHaveText('3 ks');

  await page.getByTestId('eggs-start').click();
  const card = page.getByTestId('recipes-timer');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Vejce M naměkko (3 ks)');
  await expect(card).toHaveAttribute('data-status', 'running');
});

test('minutky: více paralelně, +1 min, pauza, zrušení, sdílení s Dnes', async ({ context }) => {
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(TIMERS + '?theme=light');
  await phone.getByTestId('kitchen-timer-name').fill('Těstoviny');
  await phone.getByTestId('kitchen-preset-10').click();
  await phone.getByTestId('kitchen-timer-minutes').fill('3');
  await phone.getByTestId('kitchen-timer-start').click();
  const cards = phone.getByTestId('recipes-timer');
  await expect(cards).toHaveCount(2);
  // Soonest first: the unnamed 3 min timer.
  await expect(cards.first()).toContainText('Minutka 3 min');
  await expect(cards.first()).toContainText(/2:5\d|3:00/);
  await cards.first().getByRole('button', { name: '+1 min' }).click();
  await expect(cards.first()).toContainText(/3:5\d|4:00/);
  await cards.first().getByRole('button', { name: 'Pozastavit' }).click();
  await expect(phone.locator('[data-testid="recipes-timer"][data-status="paused"]')).toHaveCount(1);

  // No horizontal overflow on the phone.
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Dnes (another device) shows the running timers compactly.
  const today = await context.newPage();
  await today.setViewportSize({ width: 1280, height: 800 });
  await today.goto('/homebrain-dnes?timers=1');
  const signal = today.getByText(/Minutka · Těstoviny/).first();
  await expect(signal).toBeVisible({ timeout: 20_000 });

  // Cancel both; Dnes card disappears.
  for (let i = 0; i < 2; i += 1) {
    await cards.first().getByRole('button', { name: 'Zrušit časovač' }).click();
  }
  await expect(cards).toHaveCount(0);
  await expect(today.getByText(/Minutka( v pauze)? · /)).toHaveCount(0, { timeout: 20_000 });
});
