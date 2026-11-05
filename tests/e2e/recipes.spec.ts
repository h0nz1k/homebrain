import { expect, test } from '@playwright/test';

// Recepty (dev server, synthetic mock API – no HA, no devices; device calls are only logged).
test('detail na tabletu má dostupné CTA bez oříznutí', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/homebrain-recepty/' + 'a1'.padEnd(32, '0') + '?theme=dark');
  const start = page.getByTestId('recipes-start');
  await expect(start).toBeVisible();
  const rect = await start.boundingBox();
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(800);
  await expect(start).toBeInViewport({ ratio: 1 });
});
test('import z URL → detail → režim vaření → časovač doběhne', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-04T17:00:00+01:00') });
  await page.goto('/homebrain-recepty?music=1');
  await expect(page.getByTestId('recipes-card').first()).toBeVisible();

  await page.getByTestId('recipes-add').click();
  await page.getByTestId('recipes-import-url').fill('https://recepty.example.org/dynova-polevka');
  await page.getByTestId('recipes-import-go').click();
  await expect(page.getByTestId('recipes-preview')).toContainText('Dýňová polévka');
  await page.getByTestId('recipes-import-save').click();

  const detail = page.getByTestId('recipes-detail');
  await expect(detail).toContainText('Dýňová polévka');
  await expect(page.getByTestId('recipes-servings')).toHaveText('4 porce');
  await detail.getByRole('button', { name: 'Více porcí' }).click();
  await expect(page.getByTestId('recipes-servings')).toHaveText('5 porcí');
  // 1 kg dýně × 5/4 → 1,25 kg (Czech decimal comma)
  await expect(detail.getByTestId('recipes-ingredient').first()).toContainText('1,3 kg');
  await detail.getByTestId('recipes-ingredient').first().click();
  await expect(detail.getByTestId('recipes-ingredient').first()).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await page.getByTestId('recipes-start').click();
  const cook = page.getByTestId('recipes-cooking');
  await expect(cook).toBeVisible();
  await expect(page.getByTestId('recipes-step-no')).toHaveText('Krok 1 / 3');
  await expect(page.getByTestId('recipes-music')).toBeVisible();

  await page.getByTestId('recipes-step-timer').click();
  await expect(page.getByTestId('recipes-timer')).toHaveCount(1);
  await expect(page.getByTestId('recipes-timer')).toHaveAttribute('data-status', 'running');
  await expect(page.getByTestId('recipes-step-timer')).toHaveCount(0);

  // keyboard navigation keeps the running timer
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('recipes-step-no')).toHaveText('Krok 2 / 3');
  await page.getByTestId('recipes-step-timer').click();
  await expect(page.getByTestId('recipes-timer')).toHaveCount(2);

  await page.clock.fastForward(5 * 60 * 1000 + 1000);
  const ringing = page.locator('[data-testid=recipes-timer][data-status=ringing]');
  await expect(ringing).toHaveCount(1);
  await expect(page.locator('.hb-toast').filter({ hasText: 'Minutka' })).toBeVisible();
  await ringing.getByTestId('recipes-timer-ack').click();
  await expect(page.getByTestId('recipes-timer')).toHaveCount(1);
});

test('hudební lišta se bez nastaveného tabletu nezobrazí; fritéza čeká na potvrzení', async ({
  page,
}) => {
  await page.goto('/homebrain-recepty?fryer=1');
  await page
    .getByTestId('recipes-card')
    .filter({ hasText: 'Kuřecí stehna' })
    .locator('button.open')
    .click();
  await page.getByTestId('recipes-start').click();
  await page.getByTestId('recipes-next').click();
  await expect(page.getByTestId('recipes-step-no')).toHaveText('Krok 2 / 3');
  await expect(page.getByTestId('recipes-music')).toHaveCount(0);

  await page.getByTestId('recipes-airfryer-send').click();
  await expect(page.getByTestId('recipes-airfryer-dialog')).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __hbRecipesLog: unknown[] }).__hbRecipesLog),
  ).toEqual([]);
  // Back gesture closes the dialog without starting anything (useBackClosable).
  await page.goBack();
  await expect(page.getByTestId('recipes-airfryer-dialog')).toHaveCount(0);
  await expect(page.getByTestId('recipes-cooking')).toBeVisible();

  await page.getByTestId('recipes-airfryer-send').click();
  await page.getByTestId('recipes-airfryer-confirm').click();
  await expect(page.locator('.hb-toast').filter({ hasText: 'Fritéza běží' })).toBeVisible();
  const log = await page.evaluate(
    () => (window as unknown as { __hbRecipesLog: unknown[] }).__hbRecipesLog,
  );
  expect(log).toEqual([
    {
      kind: 'airfryer',
      payload: { temperature: 180, minutes: 25, method: 'Maso', confirmed: true },
    },
  ]);
});

test('stejný krok různých receptů má nezávislé časovače', async ({ page }) => {
  await page.goto('/homebrain-recepty/' + 'a1'.padEnd(32, '0') + '/varit/3');
  await page.getByTestId('recipes-step-timer').click();
  await expect(page.getByTestId('recipes-timer')).toHaveCount(1);
  await page.goto('/homebrain-recepty/' + 'b2'.padEnd(32, '0') + '/varit/3');
  await expect(page.getByTestId('recipes-step-timer')).toBeVisible();
  await page.getByTestId('recipes-step-timer').click();
  await expect(page.getByTestId('recipes-timer')).toHaveCount(2);
});

test('otevřená zásuvka fritézu zablokuje', async ({ page }) => {
  await page.goto('/homebrain-recepty?fryer=1&drawer=on');
  await page
    .getByTestId('recipes-card')
    .filter({ hasText: 'Kuřecí stehna' })
    .locator('button.open')
    .click();
  await page.getByTestId('recipes-start').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('recipes-airfryer-send')).toBeDisabled();
  await expect(page.getByTestId('recipes-airfryer-status')).toHaveText('Zavřete zásuvku fritézy');
});

test('minutky běží na serveru: druhé zařízení je vidí a ovládá', async ({ context }) => {
  // Two tabs of one context share the dev mock "server" (localStorage + storage events),
  // exactly like the tablet and a phone share the integration's timers.
  const url = '/homebrain-recepty/' + 'a1'.padEnd(32, '0') + '/varit/3';
  const tablet = await context.newPage();
  await tablet.setViewportSize({ width: 1280, height: 800 });
  await tablet.goto(url);
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(url);
  await expect(phone.getByTestId('recipes-cooking')).toBeVisible();
  await expect(phone.getByTestId('recipes-timer')).toHaveCount(0);

  await tablet.getByTestId('recipes-step-timer').click();
  await expect(tablet.getByTestId('recipes-timer')).toHaveCount(1);
  await expect(phone.getByTestId('recipes-timer')).toHaveCount(1);
  await expect(phone.getByTestId('recipes-timer')).toHaveAttribute('data-status', 'running');
  // The step's start chip disappears on the other device too (one timer per step).
  await expect(phone.getByTestId('recipes-step-timer')).toHaveCount(0);

  await phone.getByTestId('recipes-timer').getByRole('button', { name: 'Pozastavit' }).click();
  await expect(tablet.getByTestId('recipes-timer')).toHaveAttribute('data-status', 'paused');

  // A reload (or HA restart) keeps the server timer.
  await tablet.reload();
  await expect(tablet.getByTestId('recipes-timer')).toHaveCount(1);
});

test('nastavení: upozornění na minutky – výchozí nikdo, lze vybrat zařízení', async ({ page }) => {
  await page.goto('/homebrain-recepty/pridat');
  await page.locator('.rc-settings summary').click();
  const box = page.getByTestId('recipes-timer-notify');
  await expect(box).toContainText('Minutka');
  const first = box.getByRole('button', { name: /notify\./ }).first();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
});
