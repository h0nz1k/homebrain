import { expect, test } from '@playwright/test';

// Roboti (Refs #94): 3 syntetičtí roboti z dev mocku; volání služeb se jen zaznamenají.
test('patra, stav, chyba s návodem a úklid místností v pořadí', async ({ page }, testInfo) => {
  // Long scenario (3 floors, sheet twice, full-page screenshot): ~25 s on a loaded host.
  test.setTimeout(60_000);
  await page.goto('/homebrain-roboti');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toContainText('Přízemí');
  await expect(tabs.nth(2)).toContainText('3. patro');
  await expect(page.getByTestId('robots-state')).toHaveText('Uklízí místnosti');
  await expect(page.getByTestId('robots-battery')).toContainText('64 %');
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();

  await page.getByTestId('robots-floor-2').click();
  await expect(page.getByTestId('robots-problem')).toContainText('Zamotaný hlavní kartáč');
  await expect(page.getByTestId('robots-part-cleaning_fluid')).toContainText('Došel');
  await page.getByTestId('robots-fixed-resume').click();
  await expect(page.getByTestId('robots-confirm')).toContainText('pokračovat v úklidu');
  await page.getByRole('button', { name: 'Zrušit' }).click();
  await expect(page.getByTestId('robots-confirm')).toHaveCount(0);

  await page.getByTestId('robots-floor-3').click();
  await expect(page.getByTestId('robots-part-sensors')).toContainText('Vyčistit teď');
  await expect(page.getByTestId('robots-home')).toBeDisabled();

  await page.getByTestId('robots-floor-1').click();
  await page.getByTestId('robots-room-3').click();
  await page.getByTestId('robots-room-2').click();
  await expect(page.getByTestId('robots-room-3')).toContainText('1');
  await expect(page.getByTestId('robots-room-2')).toContainText('2');
  await page.getByRole('radio', { name: 'Mopovat' }).click();
  await page.getByTestId('robots-start').click();
  const sheet = page.getByTestId('robots-confirm');
  await expect(sheet).toContainText('Režim: Mopovat');
  await expect(sheet).toContainText('1. Jídelna → 2. Kuchyně');
  expect(
    await page.evaluate(
      () => (window as unknown as { __hbRobotCalls: unknown[] }).__hbRobotCalls.length,
    ),
  ).toBe(0);
  await page.getByTestId('robots-confirm-send').click();
  await expect(page.getByText(/Čekám na skutečný stav/).first()).toBeVisible();
  const calls = await page.evaluate(
    () => (window as unknown as { __hbRobotCalls: Record<string, unknown>[] }).__hbRobotCalls,
  );
  expect(calls.map((call) => `${call.domain}.${call.service}`)).toEqual([
    'select.select_option',
    'vacuum.send_command',
  ]);
  expect(calls[1]!.service_data).toEqual({
    command: 'app_segment_clean',
    params: [{ segments: [3, 2], repeat: 1 }],
  });
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await testInfo.attach(`roboti-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('zrušení potvrzení nic neodešle', async ({ page }) => {
  await page.goto('/homebrain-roboti');
  await page.getByTestId('robots-pause').click();
  await expect(page.getByTestId('robots-confirm')).toContainText('Pozastavit úklid');
  await page.getByRole('button', { name: 'Zrušit' }).click();
  await expect(page.getByTestId('robots-confirm')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __hbRobotCalls: unknown[] }).__hbRobotCalls.length,
    ),
  ).toBe(0);
});

test('omezený pohyb: žádné běžící animace', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/homebrain-roboti');
  await expect(page.getByTestId('robots-hero')).toBeVisible();
  const running = await page.evaluate(
    () => document.getAnimations().filter((animation) => animation.playState === 'running').length,
  );
  expect(running).toBe(0);
  await context.close();
});

test('ovládání: stejně široké segmenty, pokročilé (voda, mopování, průchody), čipy od kraje', async ({
  page,
}) => {
  await page.goto('/homebrain-roboti');
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  // Room chips start flush: no fade (and no half chip) at the start edge.
  const row = page.locator('.rb-map-row .rb-chips');
  await expect(row).not.toHaveAttribute('data-fade', /start/);
  const flush = await row.evaluate((el) => {
    const first = el.querySelector('[data-testid^="robots-room-"]')!.getBoundingClientRect();
    return Math.round(first.left - el.getBoundingClientRect().left);
  });
  expect(flush).toBeGreaterThanOrEqual(0);
  expect(flush).toBeLessThanOrEqual(2);

  const widths = (name: string) =>
    page
      .getByRole('radiogroup', { name })
      .evaluate((el) =>
        Array.from(el.querySelectorAll('button')).map((b) => b.getBoundingClientRect().width),
      );
  for (const name of ['Režim']) {
    const w = await widths(name);
    expect(Math.max(...w) - Math.min(...w), name).toBeLessThan(1.5);
    const clipped = await page.getByRole('radiogroup', { name }).evaluate((el) =>
      Array.from(el.querySelectorAll('button'))
        .filter((b) => {
          const range = document.createRange();
          range.selectNodeContents(b);
          const cs = getComputedStyle(b);
          const inner = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return range.getBoundingClientRect().width > inner + 0.5;
        })
        .map((b) => b.textContent),
    );
    expect(clipped, name).toEqual([]);
  }
  await expect(page.getByRole('radiogroup', { name: 'Sání' })).toBeVisible();
  await page.getByRole('radio', { name: 'Pokročilé' }).click();

  // Water, mop route and passes only under „Pokročilé“.
  await expect(page.getByRole('radiogroup', { name: 'Voda' })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Průchody' })).toBeVisible();
  await page.getByRole('radio', { name: 'Vysát' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Voda' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Obojí' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Voda' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Mopování' })).toBeVisible();
  await page.getByRole('radio', { name: 'Vysoká' }).click();
  await page.getByRole('radio', { name: 'Důkladně', exact: true }).click();
  await page.getByRole('radio', { name: '2×' }).click();
  await page.getByTestId('robots-room-3').click();
  await page.getByTestId('robots-start').click();
  const sheet = page.getByTestId('robots-confirm');
  await expect(sheet).toContainText('Voda: Vysoká');
  await expect(sheet).toContainText('Mopování: Důkladně');
  await page.getByTestId('robots-confirm-send').click();
  await expect(page.getByText(/Čekám na skutečný stav/).first()).toBeVisible();
  const calls = await page.evaluate(
    () => (window as unknown as { __hbRobotCalls: Record<string, unknown>[] }).__hbRobotCalls,
  );
  const last = calls[calls.length - 1]!;
  expect(last.service_data).toEqual({
    command: 'app_segment_clean',
    params: [{ segments: [3], repeat: 2 }],
  });
  expect(
    calls
      .filter((c) => c.service === 'select_option')
      .map((c) => (c.service_data as { option: string }).option),
  ).toEqual(expect.arrayContaining(['high', 'deep']));
});
