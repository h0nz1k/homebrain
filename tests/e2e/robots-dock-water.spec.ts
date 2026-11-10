import { expect, test } from '@playwright/test';

test('water_empty: návod, bez návratu při úklidu, potvrzení resolve_error', async ({ page }) => {
  await page.goto('/homebrain-roboti?robots=water');
  await expect(page.getByTestId('robots-problem')).toContainText('Došla čistá voda');
  await expect(page.getByTestId('robots-problem')).toContainText('Doplňte nádrž s čistou vodou v doku.');
  await expect(page.getByTestId('robots-dock-refill-hint')).toContainText('Doplněno, potvrdit');
  await expect(page.getByTestId('robots-dock-return-home')).toHaveCount(0);
  await expect(page.getByTestId('robots-dock-ack-refilled')).toContainText('Doplněno, potvrdit');

  await page.getByTestId('robots-dock-ack-refilled').click();
  await expect(page.getByTestId('hb-toast').getByText('Chyba doku potvrzena')).toBeVisible();
  const calls = await page.evaluate(
    () => (window as unknown as { __hbRobotCalls: Record<string, unknown>[] }).__hbRobotCalls,
  );
  const resolve = calls.find(
    (call) =>
      call.domain === 'vacuum' &&
      call.service === 'send_command' &&
      (call.service_data as { command?: string })?.command === 'resolve_error',
  );
  expect(resolve).toMatchObject({
    domain: 'vacuum',
    service: 'send_command',
    target: { entity_id: 'vacuum.demo_robot_1' },
    service_data: { command: 'resolve_error', params: { error_code: 38 } },
  });

  await expect(page.getByTestId('robots-dock-ack-chip')).toContainText('Voda doplněna');
  await expect(page.getByTestId('robots-part-clean_water')).toContainText('Voda doplněna');
  await expect(page.getByTestId('robots-problem')).toHaveCount(0, { timeout: 3000 });
});
