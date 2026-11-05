import { expect, test, type Page } from '@playwright/test';

// Přístup: live enrolment progress from BioLock firmware (biolock-firmware#9) against the dev mock.
// Synthetic people only; events are pushed through `window.__hbAccess.emit(...)`.

type Emit = (e: unknown) => void;
const emit = (page: Page, data: Record<string, unknown>) =>
  page.evaluate((d) => {
    (window as unknown as { __hbAccess: { emit: Emit } }).__hbAccess.emit({
      event: 'enroll_progress',
      time: new Date().toISOString(),
      data: d,
    });
  }, data);
const base = { request_id: 'c0de-7', modality: 'face', name: 'Petra' };

test('Zápis z HA skriptu: živý průběh, nápověda, odpočet a kroky', async ({ page }) => {
  await page.goto('/homebrain-pristup?enroll_progress=1');
  await expect(page.getByTestId('access-person')).toHaveCount(3);
  await emit(page, { ...base, state: 'armed', remaining_s: 30, text: 'Připravuji snímač…' });
  const banner = page.getByTestId('access-enrol-status');
  await expect(banner).toHaveAttribute('data-progress', 'armed');
  await expect(banner).toContainText('Připravuji snímač…');
  await expect(banner).toContainText('Zápis: Petra · obličej');
  await emit(page, { ...base, state: 'detected', hint: 'too_far', remaining_s: 24 });
  await expect(banner).toContainText('Přibliž se');
  await expect(page.getByTestId('hb-step-enrol-1')).toHaveAttribute('aria-current', 'step');
  // left/right is unverified on hardware → generic hint even if the firmware says a direction
  await emit(page, { ...base, state: 'detected', hint: 'move_left', text: 'Posuň obličej doleva' });
  await expect(banner).toContainText('Posuň obličej doprostřed před snímač');
  // smooth local countdown between firmware ticks
  const secs = banner.getByTestId('hb-live-secs');
  const first = Number(await secs.textContent());
  await expect
    .poll(async () => Number(await secs.textContent()), { timeout: 4000 })
    .toBeLessThan(first);
  await emit(page, { ...base, state: 'capturing', hint: 'hold_still', remaining_s: 20 });
  await expect(banner).toContainText('Vidím obličej – nehýbej se');
  await expect(page.getByTestId('hb-step-enrol-2')).toHaveAttribute('data-state', 'active');
  await emit(page, { ...base, state: 'saving', remaining_s: 19 });
  await emit(page, { ...base, state: 'done', remaining_s: 0, text: 'Hotovo – zapsáno' });
  await expect(banner).toHaveAttribute('data-phase', 'ok');
  await expect(page.getByTestId('hb-step-enrol-4')).toHaveAttribute('data-state', 'done');
  expect(await page.locator('html').evaluate((r) => r.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});

test('Zápis selže: důvod, rada a Zkusit znovu spustí nový zápis', async ({ page }) => {
  await page.goto('/homebrain-pristup?enroll_progress=1&service=1&enroll_ms=300');
  await expect(page.getByTestId('access-person')).toHaveCount(3);
  await emit(page, { ...base, modality: 'palm', state: 'armed', remaining_s: 30 });
  await emit(page, { ...base, modality: 'palm', state: 'capturing', remaining_s: 22 });
  await emit(page, {
    ...base,
    modality: 'palm',
    state: 'failed',
    hint: 'face_instead_of_palm',
    reason: 'face_instead_of_palm',
  });
  const banner = page.getByTestId('access-enrol-status');
  await expect(banner).toHaveAttribute('data-phase', 'failed');
  await expect(banner).toContainText('Zachycen obličej místo dlaně');
  await expect(page.getByTestId('hb-step-enrol-2')).toHaveAttribute('data-state', 'error');
  await banner.getByTestId('access-enrol-retry').click();
  await expect(banner).toHaveAttribute('data-phase', 'ok', { timeout: 5000 });
  const log = await page.evaluate(
    () =>
      (window as unknown as { __hbAccessLog: Array<{ action: string; data: unknown }> })
        .__hbAccessLog,
  );
  expect(log.find((e) => e.action === 'enroll_palm')?.data).toMatchObject({ name: 'Petra' });
});

test('Servisní režim vypnutý: nabídne zapnutí s potvrzením a zkusí znovu', async ({ page }) => {
  await page.goto('/homebrain-pristup?enroll_progress=1&enroll_ms=300');
  await expect(page.getByTestId('access-person')).toHaveCount(3);
  await emit(page, { ...base, state: 'armed' });
  await emit(page, {
    ...base,
    state: 'failed',
    hint: 'service_mode_off',
    reason: 'service_mode_off',
  });
  const banner = page.getByTestId('access-enrol-status');
  await expect(banner).toContainText('Servisní režim je vypnutý');
  await banner.getByTestId('access-enrol-service').click();
  await page.getByRole('button', { name: 'Zapnout a zkusit znovu' }).click();
  await expect(banner).toHaveAttribute('data-phase', 'ok', { timeout: 5000 });
  const actions = await page.evaluate(() =>
    (window as unknown as { __hbAccessLog: Array<{ action: string }> }).__hbAccessLog.map(
      (e) => e.action,
    ),
  );
  expect(actions.indexOf('service_mode')).toBeLessThan(actions.indexOf('enroll_face'));
});

test('Starší firmware bez průběhu: původní banner čekání a výsledku', async ({ page }) => {
  await page.goto('/homebrain-pristup');
  await expect(page.getByTestId('access-person')).toHaveCount(3);
  await page.evaluate(() =>
    (
      window as unknown as { __hbAccess: { externalEnrol: (s: unknown) => void } }
    ).__hbAccess.externalEnrol({ type: 'face', name: 'Petra', ok: true }),
  );
  const banner = page.getByTestId('access-enrol-status');
  await expect(banner).toHaveAttribute('data-phase', 'ok');
  await expect(banner).not.toHaveAttribute('data-progress', /.+/);
  await expect(page.getByTestId('hb-step-enrol-0')).toHaveCount(0);
});

test('Průvodce: krok ukazuje živý průběh vlastního zápisu; Zařízení ukáže stav snímače', async ({
  page,
}) => {
  await page.goto('/homebrain-pristup?enroll_progress=1&service=1&enroll_ms=2400');
  await page.getByTestId('access-add').click();
  await page.getByTestId('access-name').fill('Jan');
  await page.getByTestId('access-name-next').click();
  await page.getByTestId('access-start').click();
  const status = page.getByTestId('access-step-status');
  await expect(status).toContainText('Přibliž se');
  await expect(status.getByTestId('hb-live-secs')).toBeVisible();
  await expect(status).toContainText('Uloženo', { timeout: 6000 });
  await page.goto('/homebrain-pristup/zarizeni?enroll_progress=1');
  await expect(page.getByTestId('access-enrol-diag-state')).toContainText('Nic neprobíhá');
});
