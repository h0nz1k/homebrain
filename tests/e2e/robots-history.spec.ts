import { expect, test } from '@playwright/test';

// Roboti (Refs #165): historie úklidů, právě uklízená místnost, „Odesláno“ a stáří dat.
// Dev mock only: synthetic history, service calls are recorded and never sent anywhere.

test('naposledy uklizeno u místností a karta Historie úklidů', async ({ page }) => {
  await page.goto('/homebrain-roboti?scena=kuchyne');
  const history = page.getByTestId('robots-history');
  await expect(history).toBeVisible();
  await expect(history.getByRole('heading', { name: 'Historie úklidů' })).toBeVisible();
  const runs = history.getByTestId('robots-history-run');
  await expect(runs).toHaveCount(5);
  await expect(runs.first()).toContainText('Kuchyně, Jídelna, Chodba');
  await expect(runs.first()).toContainText('Alfa');
  await expect(runs.first()).toContainText('38 min');
  await expect(runs.first().getByTestId('robots-history-source')).toHaveText('HomeBrain');
  await expect(runs.nth(1).getByTestId('robots-history-source')).toHaveText('Aplikace');
  // Room tiles: Jídelna cleaned ~1.5 h ago (today or yesterday near midnight), WC 3 days ago.
  await expect(page.getByTestId('robots-cleaned-3')).toContainText(/Uklizeno (dnes|včera)/);
  await expect(page.getByTestId('robots-cleaned-5')).toHaveText(/Uklizeno před [34] dny/);
  await expect(page.getByTestId('robots-cleaned-8')).toHaveText('Zatím neuklizeno');
});

test('prázdná historie', async ({ page }) => {
  await page.goto('/homebrain-roboti?historie=prazdna&scena=kuchyne');
  await expect(page.getByTestId('robots-history-empty')).toBeVisible();
  await expect(page.getByTestId('robots-cleaned-1')).toHaveText('Zatím neuklizeno');
});

test('právě uklízená místnost na mapě a v čipech', async ({ page }) => {
  await page.goto('/homebrain-roboti?scena=kuchyne');
  await expect(page.getByTestId('robots-map-live-2')).toBeAttached();
  await expect(page.getByTestId('robots-live-chip')).toHaveText('Teď: Kuchyně');
  await expect(page.getByTestId('robots-room-2')).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId('robots-cleaned-2')).toHaveText('Teď uklízí');
  // The other rooms step back; the live label has no box of its own.
  await expect(page.getByTestId('robots-vector-map')).toHaveAttribute('data-has-live', 'true');
  await expect(page.getByTestId('robots-map-room-2')).toHaveAttribute('data-live', 'true');
  const dimmed = await page
    .getByTestId('robots-map-room-1')
    .evaluate((el) => getComputedStyle(el).fill);
  const live = await page
    .getByTestId('robots-map-room-2')
    .evaluate((el) => getComputedStyle(el).fill);
  expect(dimmed).not.toBe(live);
  await expect(page.locator('.rv-label[data-live]')).toHaveCSS('box-shadow', 'none');
  // A docked robot highlights nothing.
  await page.getByTestId('robots-floor-3').click();
  await expect(page.locator('[data-testid^="robots-map-live-"]')).toHaveCount(0);
  await expect(page.getByTestId('robots-live-chip')).toHaveCount(0);
});

test('příkaz odeslán → robot zatím nereagoval → zkusit znovu', async ({ page }) => {
  await page.clock.install();
  await page.goto('/homebrain-roboti?scena=kuchyne');
  await page.getByTestId('robots-pause').click();
  await page.getByTestId('robots-confirm-send').click();
  const pending = page.getByTestId('robots-pending');
  await expect(pending).toHaveText('Odesláno, čekám na robota…');
  await expect(page.getByTestId('robots-pending-retry')).toHaveCount(0);
  const count = () =>
    page.evaluate(() => (window as unknown as { __hbRobotCalls: unknown[] }).__hbRobotCalls.length);
  expect(await count()).toBe(1);
  // The mock robot never reacts: after 60 s the panel says so and offers a manual retry.
  await page.clock.fastForward('01:05');
  await expect(pending).toContainText('Pauza zatím bez odezvy');
  await expect(pending).toContainText('Robot zatím nereagoval');
  await expect(page.getByTestId('robots-pending-retry')).toBeVisible();
  // Data are stale: the age is spelled out and progress / „Uklízí …“ are dimmed.
  await expect(page.getByTestId('robots-state-age')).toHaveText(/^Stav před \d+ min$/);
  await expect(page.getByTestId('robots-live-room')).toHaveCSS('opacity', '0.5');
  const retryBox = await page.getByTestId('robots-pending-retry').boundingBox();
  expect(retryBox?.height).toBeGreaterThanOrEqual(44);
  expect(await count()).toBe(1); // no automatic retry
  await page.getByTestId('robots-pending-retry').click();
  await expect(pending).toContainText('Odesláno, čekám na robota…');
  expect(await count()).toBe(2);
});

test('stáří dat: mapa a stav jen když jsou staré', async ({ page }) => {
  await page.goto('/homebrain-roboti?scena=kuchyne');
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  await expect(page.getByTestId('robots-state-age')).toHaveCount(0);
  await expect(page.getByTestId('robots-map-age')).toHaveCount(0);
  await page.goto('/homebrain-roboti?scena=kuchyne&stari=1');
  await expect(page.getByTestId('robots-state-age')).toHaveText('Stav před 3 min');
  await expect(page.getByTestId('robots-map-age')).toHaveText('Mapa před 6 min');
  // In the dock only a map older than a day.
  await page.getByTestId('robots-floor-3').click();
  await expect(page.getByTestId('robots-map-age')).toHaveText('Mapa před 30 h');
  await expect(page.getByTestId('robots-state-age')).toHaveCount(0);
});
