/// <reference lib="dom" />
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const action = (page: Page) => page.getByRole('button', { name: 'Pozvat na kávu' });

async function capture(page: Page, info: TestInfo, theme: string, state: string) {
  if (!process.env.HB_COFFEE_SCREENSHOTS && !process.env.CI) return;
  const name = `${page.viewportSize()!.width}-${theme}-${state}`;
  await page.evaluate(() => document.fonts.ready);
  const screenshot = await page.screenshot({
    path: `test-results/coffee-invite/${name}.png`,
    animations: 'disabled',
  });
  await info.attach(name, { body: screenshot, contentType: 'image/png' });
}

test('Dnes: nenastavený skript skryje akci, chybějící skript ji vypne', async ({ page }) => {
  await page.goto('/homebrain-dnes?coffee=hidden');
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 });
  await expect(action(page)).toHaveCount(0);

  await page.goto('/homebrain-dnes?coffee=missing');
  await expect(action(page)).toBeDisabled();
  await expect(action(page)).toHaveAccessibleDescription('Skript pozvánky v HA chybí');
});

test('Dnes: při chybě odeslání ukáže srozumitelné oznámení', async ({ page }) => {
  await page.goto('/homebrain-dnes?coffee=error');
  await action(page).click();
  const toast = page.getByTestId('hb-toast');
  await expect(toast).toContainText('Pozvánku se nepodařilo odeslat.');
  await expect(toast).toHaveAttribute('data-kind', 'error');
});

const screens = [
  { width: 360, height: 800, layout: 'mobile' },
  { width: 800, height: 1280, layout: 'desktop' },
  { width: 1280, height: 800, layout: 'kiosk' },
];

for (const { layout, width, height } of screens) {
  for (const theme of ['dark', 'light']) {
    test(`Dnes: pozvánka a třicetisekundová prodleva (${width}, ${theme})`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'desktop', 'Rozměr obrazovky určuje test');
      await page.setViewportSize({ width, height });
      const panel = layout === 'kiosk' ? '/homebrain-kiosk' : '/homebrain-dnes';
      await page.clock.install({ time: new Date('2026-11-08T12:00:00Z') });

      await page.goto(`${panel}?state=a&night=off&lide=none&theme=${theme}&coffee=off`);
      await expect(action(page)).toBeDisabled();
      await expect(action(page)).toHaveAccessibleDescription('TV v obýváku neběží');
      await capture(page, info, theme, 'tv-off');

      await page.goto(`${panel}?state=a&night=off&lide=none&theme=${theme}&coffee=on`);
      await expect(page.getByTestId('today')).toHaveAttribute('data-layout', layout);
      await expect(action(page)).toBeEnabled();
      await expect(action(page)).toBeInViewport();
      await expect(page.locator('.hb-shell')).toHaveAttribute('data-theme', theme);
      await capture(page, info, theme, 'enabled');

      await action(page).click();
      await expect(action(page)).toBeDisabled();
      await expect(action(page)).toHaveAccessibleDescription('Pozvánka běží');
      const toast = page.getByTestId('hb-toast');
      await expect(toast).toContainText('Pozvánka odeslána na TV.');
      await expect(toast).toHaveAttribute('data-kind', 'success');
      await capture(page, info, theme, 'toast');
      await toast.getByRole('button', { name: 'Zavřít oznámení' }).click();
      await expect(toast).toHaveCount(0);
      await capture(page, info, theme, 'cooldown');

      await page.clock.fastForward(30_000);
      await expect(action(page)).toBeEnabled();
    });
  }
}
