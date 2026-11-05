import { expect, test } from '@playwright/test';

// Saturday late in the ISO week – deterministic hero and Dnes signals.
const NOW = new Date('2026-10-31T10:00:00+01:00');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('obrazovka Zdraví na mockových datech', async ({ page }, testInfo) => {
  await page.goto('/homebrain-zdravi');
  await expect(page.getByRole('heading', { name: 'Zdraví', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByTestId('health-hero')).toContainText('Dnes silový trénink');
  await expect(page.getByTestId('health-hero')).toContainText('Nejbližší správný krok');
  await expect(page.getByTestId('health-week')).toContainText('2 / 3');
  // Day strip from recorder history of the last-workout sensor (mock: Wed + Fri).
  await expect(page.getByTestId('health-week').locator('li[data-state="trained"]')).toHaveCount(2);
  await expect(page.getByTestId('health-last-workout')).toContainText('včera');
  await expect(page.getByTestId('health-weight').locator('polyline')).toHaveCount(1);
  await expect(page.getByTestId('health-weight-change')).toContainText('od 2. 10.');
  await expect(page.getByTestId('health-reward-teaser')).toContainText('1 350 XP');
  // Week signals are for Dnes; the screen itself repeats only the streak warning.
  await expect(page.getByTestId('health-signals')).toHaveCount(0);
  // Read-only: the only buttons are in-module navigation (tabs / jumps), nothing writes to HA.
  await expect(page.getByTestId('health-view').locator('button:not([data-nav])')).toHaveCount(0);
  await page.getByTestId('health-tab-odmeny').click();
  await expect(page.getByTestId('health-xp')).toContainText('1 350');
  await expect(page.getByTestId('health-streak')).toContainText('2');
  await expect(page.getByTestId('health-milestones').locator('li')).toHaveCount(5);
  await page.getByTestId('health-tab-dnes').click();
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await testInfo.attach(`zdravi-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('chybějící integrace = empty state', async ({ page }) => {
  await page.goto('/homebrain-zdravi?health=missing');
  await expect(page.getByTestId('health-missing')).toContainText('v0.7.0');
});

test('prázdná instalace nepředstírá historii', async ({ page }) => {
  await page.goto('/homebrain-zdravi?health=empty&zalozka=odmeny');
  await expect(page.getByTestId('health-xp')).toContainText('Zatím bez historie');
  await expect(page.getByTestId('health-xp')).not.toContainText('0 XP');
});

test('minimum v ohrožení a streak', async ({ page }) => {
  await page.goto('/homebrain-zdravi?health=risk');
  await expect(page.getByTestId('health-hero')).toContainText('Dnes silový trénink');
  await expect(page.getByTestId('health-signals')).toContainText('Streak 2 týdny v ohrožení');
});

test('kiosk nezobrazí zdravotní data', async ({ page }) => {
  await page.goto('/homebrain-zdravi?kiosk=1&health=risk');
  await expect(page.getByTestId('health-private')).toBeVisible();
  await expect(page.getByTestId('health-week')).toHaveCount(0);
});
