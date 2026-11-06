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
  await chip.click();
  const sheet = page.getByTestId('robots-confirm');
  await expect(sheet).toContainText('Spustit „Důkladně 2×“?');
  await expect(sheet).toContainText('1. Jídelna → 2. Kuchyně · 2× každou');
  expect(await calls(page)).toHaveLength(0);
  await page.getByTestId('robots-confirm-send').click();
  await expect(page.getByText(/Čekám na skutečný stav/).first()).toBeVisible();
  const sent = await calls(page);
  expect(sent[0]).toMatchObject({ service: 'select_option', service_data: { option: 'mop' } });
  expect(sent.some((c) => c.service === 'set_fan_speed')).toBe(false);
  expect(sent.at(-1)!.service_data).toEqual({
    command: 'app_segment_clean',
    params: [{ segments: [3, 2], repeat: 2 }],
  });

  // Edit from the confirmation sheet, then delete: the chip disappears.
  await chip.click();
  await page.getByTestId('robots-preset-edit').click();
  await expect(page.getByTestId('robots-preset-name')).toHaveValue('Důkladně 2×');
  await page.getByTestId('robots-preset-delete').click();
  await expect(chip).toHaveCount(0);
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});
