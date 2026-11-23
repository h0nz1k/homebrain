/// <reference lib="dom" />
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const action = (page: Page) => page.getByRole('button', { name: 'Pozvat na kávu' });
const status = (page: Page) => page.locator('.today-coffee-status');

async function capture(page: Page, info: TestInfo, theme: string, state: string) {
  if (!process.env.HB_COFFEE_SCREENSHOTS && !process.env.CI) return;
  const name = `${page.viewportSize()!.width}-${theme}-${state}`;
  await page.evaluate(() => document.fonts.ready);
  const screenshot = await page.screenshot({
    path: `test-results/coffee-invite-r1/${name}.png`,
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

test('Dnes: nově přihlášený panel ukazuje odpočet ze serveru', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T12:00:00Z') });
  await page.goto('/homebrain-dnes?coffee=cooldown');
  await expect(action(page)).toBeDisabled();
  await expect(status(page)).toHaveText(/^Znovu za \d+ s$/);
  const initial = await status(page).textContent();
  await page.clock.fastForward(5000);
  await expect(status(page)).not.toHaveText(initial!);
  await expect(status(page)).toHaveText(/^Znovu za \d+ s$/);
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
      const url = `${panel}?state=a&night=off&lide=none&theme=${theme}&coffee=`;

      await page.goto(`${url}off`);
      await expect(action(page)).toBeDisabled();
      await expect(action(page)).toHaveAccessibleDescription('TV v obýváku neběží');
      const buttonBox = (await action(page).boundingBox())!;
      const statusBox = (await status(page).boundingBox())!;
      const summaryBox = (await page.getByTestId('today-summary').boundingBox())!;
      expect(buttonBox.height).toBeGreaterThanOrEqual(48);
      expect(buttonBox.y).toBeGreaterThanOrEqual(summaryBox.y + summaryBox.height);
      expect(buttonBox.x).toBeCloseTo(summaryBox.x, 0);
      if (width === 360) {
        expect(statusBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
        expect(statusBox.x).toBeCloseTo(buttonBox.x, 0);
      }
      await expect(status(page)).toHaveCSS(
        'font-size',
        await action(page).evaluate((button) => getComputedStyle(button).fontSize),
      );
      await capture(page, info, theme, 'tv-off');

      await page.goto(`${url}on`);
      await expect(page.getByTestId('today')).toHaveAttribute('data-layout', layout);
      await expect(action(page)).toBeEnabled();
      await expect(action(page)).toBeInViewport();
      await expect(page.locator('.hb-shell')).toHaveAttribute('data-theme', theme);
      await capture(page, info, theme, 'enabled');

      await action(page).click();
      await expect(action(page)).toBeDisabled();
      await expect(action(page)).toHaveAccessibleDescription('✓ Pozvánka odeslána na TV');
      await expect(page.getByTestId('hb-toast')).toHaveCount(0);
      await capture(page, info, theme, 'just-sent');

      await page.clock.fastForward(5000);
      await expect(status(page)).toHaveText(/^Znovu za \d+ s$/);
      await capture(page, info, theme, 'cooldown-countdown');
      await page.clock.fastForward(30_000);
      await expect(action(page)).toBeEnabled();
      await expect(status(page)).toBeHidden();

      await page.goto(`${url}error`);
      await action(page).click();
      await expect(action(page)).toHaveAccessibleDescription('Pozvánku se nepodařilo odeslat');
      await expect(action(page)).toBeEnabled();
      await expect(page.getByTestId('hb-toast')).toHaveCount(0);
      await capture(page, info, theme, 'error');
    });
  }
}
