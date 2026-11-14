import { expect, test, type Page } from '@playwright/test';

// Roboti – předvolby a výchozí nastavení úklidu (dev mock: start zaznamená volání služeb,
// která by integrace poslala; nic se neodesílá do HA).
type Call = { domain: string; service: string; service_data: Record<string, unknown> };
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hbRobotCalls: Call[] }).__hbRobotCalls);

test('výchozí nastavení se použije při úklidu místností bez předvolby', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/homebrain-roboti');
  await page.getByTestId('robots-defaults-edit').click();
  const editor = page.getByTestId('robots-preset-editor');
  await editor.getByRole('radio', { name: 'Vysát' }).click();
  await editor.getByRole('radio', { name: 'Tiché' }).click();
  await page.getByTestId('robots-preset-save').click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('robots-defaults-edit')).toContainText('Vysát');
  // The inline controls are prefilled with the remembered default.
  await expect(
    page.getByTestId('robots-controls').getByRole('radio', { name: 'Tiché' }),
  ).toBeChecked();

  await page.getByTestId('robots-room-2').click();
  await page.getByTestId('robots-start').click();
  expect(await calls(page)).toHaveLength(0);
  await page.getByTestId('robots-confirm-send').click();
  await expect(page.getByText(/Čekám na skutečný stav/).first()).toBeVisible();
  const sent = await calls(page);
  expect(sent.map((c) => `${c.domain}.${c.service}`)).toEqual([
    'select.select_option',
    'vacuum.set_fan_speed',
    'vacuum.send_command',
  ]);
  expect(sent[0]!.service_data).toEqual({ option: 'vacuum' });
  expect(sent[1]!.service_data).toEqual({ fan_speed: 'quiet' });
  expect(sent[2]!.service_data).toEqual({
    command: 'app_segment_clean',
    params: [{ segments: [2], repeat: 1 }],
  });
});

test('nová předvolba → chip → spuštění jedním klepnutím', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/homebrain-roboti');
  await page.getByTestId('robots-preset-add').click();
  const editor = page.getByTestId('robots-preset-editor');
  // Name is required.
  await page.getByTestId('robots-preset-save').click();
  await expect(page.getByTestId('robots-preset-error')).toContainText('název');
  await page.getByTestId('robots-preset-name').fill('Důkladně 2×');
  await editor.getByRole('radio', { name: 'Mopovat' }).click();
  // Mop-only: suction is not offered, water + route are.
  await expect(editor.getByRole('radiogroup', { name: 'Sání' })).toHaveCount(0);
  await editor.getByRole('radio', { name: '2×' }).click();
  await page.getByTestId('robots-preset-room-3').click();
  await page.getByTestId('robots-preset-room-2').click();
  await page.getByTestId('robots-preset-save').click();
  await expect(editor).toHaveCount(0);

  const chip = page.getByTestId('robots-presets').getByRole('button', {
    name: 'Spustit předvolbu Důkladně 2×',
  });
  await expect(chip).toBeVisible();
  // Owner decision: no confirm dialog – the chip starts after a 5 s „Zrušit“ window.
  await chip.click();
  await expect(page.getByTestId('robots-confirm')).toHaveCount(0);
  await expect(page.getByText('Spouštím „Důkladně 2×“…').first()).toBeVisible();
  expect(await calls(page)).toHaveLength(0);
  await expect.poll(async () => (await calls(page)).length, { timeout: 12_000 }).toBeGreaterThan(0);
  const sent = await calls(page);
  expect(sent[0]).toMatchObject({ service: 'select_option', service_data: { option: 'mop' } });
  expect(sent.some((c) => c.service === 'set_fan_speed')).toBe(false);
  expect(sent.at(-1)!.service_data).toEqual({
    command: 'app_segment_clean',
    params: [{ segments: [3, 2], repeat: 2 }],
  });

  // Edit via „Upravit“ (chips switch to edit mode), then delete: the chip disappears.
  await page.getByTestId('robots-presets-manage').click();
  await page
    .getByTestId('robots-presets')
    .getByRole('button', { name: 'Upravit předvolbu Důkladně 2×' })
    .click();
  await expect(page.getByTestId('robots-preset-name')).toHaveValue('Důkladně 2×');
  await page.getByTestId('robots-preset-delete').click();
  await expect(
    page.getByTestId('robots-presets').getByRole('button', { name: /Důkladně 2×/ }),
  ).toHaveCount(0);
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});

test('předvolba: „Zrušit“ do 5 s nic neodešle', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/homebrain-roboti?presets=demo');
  await page
    .getByTestId('robots-presets')
    .getByRole('button', { name: 'Spustit předvolbu Rychlé vysátí' })
    .click();
  await page.getByRole('button', { name: 'Zrušit' }).click();
  await expect(page.getByText('Spuštění „Rychlé vysátí“ zrušeno.').first()).toBeVisible();
  await page.waitForTimeout(6_000);
  expect(await calls(page)).toHaveLength(0);
});

test('editor předvolby: poslední místnost není schovaná pod patičkou', async ({ page }) => {
  await page.goto('/homebrain-roboti?presets=demo');
  await page.getByTestId('robots-preset-add').click();
  const editor = page.getByTestId('robots-preset-editor');
  const chips = editor.locator('[data-testid^="robots-preset-room-"]');
  const last = chips.last();
  await last.scrollIntoViewIfNeeded();
  await editor.evaluate((el) => {
    const box = el.closest('.hb-sheet') ?? el;
    box.scrollTop = box.scrollHeight;
  });
  const chipBox = (await last.boundingBox())!;
  const footBox = (await page.locator('.hb-sheet-foot').boundingBox())!;
  expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(footBox.y + 1);
});

const DEEP_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

for (const vp of DEEP_VIEWPORTS) {
  test(`Důkladné trasy jen při mopu – nápověda bez překryvu (${vp.width}×${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/homebrain-roboti');
    await page.getByRole('radio', { name: 'Pokročilé' }).click();
    const controls = page.getByTestId('robots-controls');
    await controls.getByRole('radio', { name: 'Obojí' }).click();
    await expect(controls.getByRole('radio', { name: 'Důkladně+' })).toHaveCount(0);
    await expect(controls.getByRole('radio', { name: 'Důkladně', exact: true })).toHaveCount(0);
    await controls.getByRole('radio', { name: 'Mopovat' }).click();
    await controls.getByRole('radio', { name: 'Důkladně+' }).click();
    await controls.getByRole('radio', { name: 'Obojí' }).click();
    const hint = page.getByTestId('robots-deep-routes-hint');
    await expect(hint).toHaveText(
      'Důkladné trasy robot používá jen při samotném vytírání – při vysávání s vytíráním se použije Standardní.',
    );
    await expect(controls.getByRole('radio', { name: '3×' })).toHaveCount(0);
    const box = await hint.boundingBox();
    const foot = await page.getByTestId('robots-start').boundingBox();
    expect(box).not.toBeNull();
    expect(foot).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(foot!.y + 1);
  });
}

test('Max+ jen při samotném vysávání', async ({ page }) => {
  await page.goto('/homebrain-roboti');
  await page.getByTestId('robots-defaults-edit').click();
  const editor = page.getByTestId('robots-preset-editor');
  await expect(editor.getByRole('radio', { name: 'Max+' })).toHaveCount(0);
  await editor.getByRole('radio', { name: 'Vysát' }).click();
  await editor.getByRole('radio', { name: 'Max+' }).click();
  await editor.getByRole('radio', { name: 'Obojí' }).click();
  await expect(page.getByTestId('robots-maxplus-hint')).toHaveText(
    'Max+ jen při samotném vysávání',
  );
  await expect(editor.getByRole('radio', { name: 'Max', exact: true })).toBeChecked();
  await expect(editor.getByRole('radio', { name: 'Max+' })).toHaveCount(0);
});
