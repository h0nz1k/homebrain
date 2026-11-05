import { expect, test, type Page } from '@playwright/test';

// Přístup (BioLock) against the dev mock: synthetic people only (Jan, Petra, Tomáš), no device.

type LogEntry = { action: string; data: Record<string, unknown> };
const actions = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __hbAccessLog: LogEntry[] }).__hbAccessLog.map((e) => ({
      action: e.action,
      data: e.data,
    })),
  );

test('Osoby: lidé ze snímače a doporučení přezapsat', async ({ page }) => {
  await page.goto('/homebrain-pristup');
  await expect(page.getByTestId('access-person')).toHaveCount(3);
  for (const name of ['Jan', 'Petra', 'Tomáš'])
    await expect(page.getByTestId('access-person').filter({ hasText: name })).toHaveCount(1);
  const chip = page.getByTestId('access-reenroll-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveText('Přezapsat');
  await expect(page.getByTestId('access-reenroll')).toHaveAttribute('aria-label', /doporučeno/);
  const tomas = page.getByTestId('access-person').filter({ hasText: 'Tomáš' });
  await expect(tomas.getByTestId('access-reenroll-chip')).toBeVisible();
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});

test('Průvodce: přezapsání smaže staré ID až po úspěšném zápisu', async ({ page }) => {
  await page.goto('/homebrain-pristup?enroll_ms=150');
  await page.getByTestId('access-reenroll').click();
  const wizard = page.getByTestId('access-wizard');
  await expect(wizard).toBeVisible();
  await expect(wizard.getByTestId('access-start')).toBeEnabled();
  let log = await actions(page);
  expect(log.some((e) => e.action === 'delete_user')).toBe(false);
  await wizard.getByTestId('access-start').click();
  await expect(wizard.getByTestId('access-step-status')).toContainText('Uloženo');
  await expect(page.getByTestId('access-wizard-done')).toBeVisible();
  log = await actions(page);
  const enroll = log.findIndex((e) => e.action === 'enroll_face');
  const del = log.findIndex((e) => e.action === 'delete_user');
  expect(enroll).toBeGreaterThanOrEqual(0);
  expect(del).toBeGreaterThan(enroll);
  expect(log[del]!.data).toEqual({ user_id: 3 });
});

test('Průvodce: nová osoba, celý postup', async ({ page }) => {
  await page.goto('/homebrain-pristup?enroll_ms=150');
  await page.getByTestId('access-add').click();
  await page.getByTestId('access-name').fill('Jan');
  await page.getByTestId('access-name-next').click();
  const status = page.getByTestId('access-step-status');
  await page.getByTestId('access-start').click();
  await expect(status).toContainText('Uloženo');
  await expect(page.getByTestId('hb-step-right')).toHaveAttribute('data-state', 'active');
  await page.getByTestId('access-start').click();
  await expect(status).toContainText('Uloženo');
  await expect(page.getByTestId('hb-step-left')).toHaveAttribute('data-state', 'active');
  await page.getByTestId('access-skip').click();
  await expect(page.getByTestId('access-wizard-done')).toBeVisible();
  const log = await actions(page);
  const palm = log.find((e) => e.action === 'enroll_palm');
  expect(palm?.data).toMatchObject({ name: 'Jan', timeout_s: 30 });
  expect(log.some((e) => e.action === 'label')).toBe(true);
  await page.getByTestId('access-wizard-finish').click();
  await expect(page.getByTestId('access-wizard')).toHaveCount(0);
});

test('Průvodce: chyba zápisu má český důvod a radu, opakování projde', async ({ page }) => {
  await page.goto('/homebrain-pristup?enroll_ms=150&access_fail=face_instead_of_palm');
  await page.getByTestId('access-add').click();
  await page.getByTestId('access-name').fill('Petra');
  await page.getByTestId('access-name-next').click();
  await page.getByTestId('access-skip').click();
  await expect(page.getByTestId('hb-step-right')).toHaveAttribute('data-state', 'active');
  await page.getByTestId('access-start').click();
  const status = page.getByTestId('access-step-status');
  await expect(status).toContainText('Zachycen obličej místo dlaně');
  await expect(status).toContainText('Zakryjte dlaní obličej');
  await expect(status).toHaveAttribute('data-state', 'error');
  await page.getByTestId('access-retry').click();
  await expect(status).toContainText('Uloženo');
});

test('Zařízení: přepínače servisního režimu a odemykání', async ({ page }) => {
  await page.goto('/homebrain-pristup');
  await page.getByRole('radio', { name: 'Zařízení' }).click();
  await expect(page.getByTestId('access-device')).toBeVisible();
  const service = page.getByTestId('access-service');
  await expect(service).toHaveAttribute('aria-checked', 'false');
  const action = page.getByRole('radiogroup', { name: 'Akce při rozpoznání' });
  await expect(action.getByRole('radio').first()).toBeDisabled();
  await service.click();
  await expect(service).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('access-countdown')).toContainText('Vypne se za');
  await expect(action.getByRole('radio').first()).toBeEnabled();
  await action.getByRole('radio', { name: 'Otevřít západku' }).click();
  // Riskier option asks first (Nuki auto-lock hint).
  await page.getByTestId('access-confirm-ok').click();
  await expect(action.getByRole('radio', { name: 'Otevřít západku' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const bio = page.getByTestId('access-biometric');
  const before = await bio.getAttribute('aria-checked');
  await bio.click();
  await expect(bio).not.toHaveAttribute('aria-checked', before!);
  const log = await actions(page);
  expect(log.map((e) => e.action)).toEqual(
    expect.arrayContaining(['service_mode', 'recognition_action', 'biometric']),
  );
});

test('Osoby: matice obličej · pravá · levá a důvod v posledních průchodech', async ({ page }) => {
  await page.goto('/homebrain-pristup?enroll_ms=300');
  const cards = page.getByTestId('access-person');
  await expect(cards).toHaveCount(3);
  for (const name of ['Jan', 'Petra', 'Tomáš']) {
    const labels = await cards
      .filter({ hasText: name })
      .locator('.hb-tile-label')
      .allTextContents();
    expect(labels).toHaveLength(3);
    expect(labels[0]).toBe('Obličej');
    expect(labels[1]).toMatch(/^(Pravá|Dlaň\?)$/);
    expect(labels[2]).toMatch(/^(Levá|Dlaň\?)$/);
  }
  // Every tile in a row has the same top for its status line (scan by column).
  const tops = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid=access-person]')).map((c) =>
      Array.from(c.querySelectorAll('.hb-tile-status')).map((el) =>
        Math.round(el.getBoundingClientRect().top),
      ),
    ),
  );
  for (const row of tops) expect(new Set(row).size).toBe(1);
  // Unknown hand: the tile itself leads to the hand test (no separate small button).
  await cards
    .filter({ hasText: 'Jan' })
    .getByRole('button', { name: /neznámá ruka/ })
    .click();
  await expect(page.getByRole('radio', { name: 'Test ruky' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('radio', { name: 'Osoby' }).click();
  await expect(page.getByTestId('access-history-item').filter({ hasText: 'Tomáš' })).toContainText(
    'odemykání vypnuto',
  );
});
