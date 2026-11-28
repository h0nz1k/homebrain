/**
 * Wine label photo zoom viewer (WIN-027).
 *
 * Full-page screenshots are saved to test-results/wine-photo-zoom/ at three viewport
 * sizes (360×780 phone, 800×1280 tablet, 1280×800 kiosk) in both dark and light themes.
 *
 * Run with: LD_LIBRARY_PATH=/home/agentops/.local/share/lana/tv-card/.browsers/libs
 *           PLAYWRIGHT_CHROMIUM=<path> heavy pnpm exec playwright test tests/e2e/wine-photo-zoom.spec.ts
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Navigate to the catalog and open the mock wine that has a photo. */
async function openFirstWineDetail(page: Page, theme?: 'dark' | 'light') {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(theme ? `/homebrain-vinoteka?theme=${theme}` : '/homebrain-vinoteka');
  await page.getByTestId('wine-card').first().waitFor({ timeout: 20_000 });
  // Mock wine-001 is the only one with a photo; the catalog sort decides where it is.
  await page
    .getByTestId('wine-card')
    .filter({ has: page.locator('img') })
    .first()
    .click();
  const detail = page.getByTestId('wine-detail');
  await expect(detail).toBeVisible({ timeout: 10_000 });
  return detail;
}

// ---------------------------------------------------------------------------
// Core behaviour tests
// ---------------------------------------------------------------------------

test('WIN-027: zoom trigger voláno kliknutím, otevře dialog, double-click zvětší, Esc zavře', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });

  const detail = await openFirstWineDetail(page);

  // Trigger button is present on a wine with a photo.
  const triggerBtn = detail.getByTestId('wine-photo-zoom-btn');
  await expect(triggerBtn).toBeVisible();
  await expect(triggerBtn).toHaveAttribute('aria-label', 'Zvětšit fotku etikety');

  // Open the viewer.
  await triggerBtn.click();
  const dialog = page.getByRole('dialog', { name: /Fotka etikety/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // The viewer image is displayed.
  const viewerImg = page.getByTestId('wine-viewer-img');
  await expect(viewerImg).toBeVisible();

  // Double-click to zoom – assert scale > 1.
  const imgBox = (await viewerImg.boundingBox())!;
  await page.mouse.dblclick(imgBox.x + imgBox.width / 2, imgBox.y + imgBox.height / 2);
  await page.waitForTimeout(200);
  const scale = Number(await viewerImg.getAttribute('data-scale'));
  expect(scale).toBeGreaterThan(1);

  // Press Esc – dialog disappears, focus returns to the trigger.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(triggerBtn).toBeFocused();
});

test('WIN-027: zoom trigger není přítomen u vína bez fotky', async ({ page }) => {
  test.setTimeout(30_000);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/homebrain-vinoteka');
  await page.getByTestId('wine-card').first().waitFor();

  // Find a card that does NOT have a photo (wine-002 onwards has no photo in mock).
  const cards = page.getByTestId('wine-card');
  const count = await cards.count();
  let openedNoPhoto = false;
  for (let i = 1; i < Math.min(count, 10); i++) {
    await cards.nth(i).click();
    const detail = page.getByTestId('wine-detail');
    await expect(detail).toBeVisible();
    const hasBtn = await detail.getByTestId('wine-photo-zoom-btn').count();
    if (hasBtn === 0) {
      await expect(detail.getByTestId('wine-photo-placeholder')).toBeVisible();
      openedNoPhoto = true;
      break;
    }
    await page.goBack();
    await page.getByTestId('wine-card').first().waitFor();
  }
  expect(openedNoPhoto, 'mock must have wines without photos').toBe(true);
});

test('WIN-027: zavřít pomocí X', async ({ page }) => {
  test.setTimeout(30_000);
  const detail = await openFirstWineDetail(page);
  await detail.getByTestId('wine-photo-zoom-btn').click();
  const dialog = page.getByRole('dialog', { name: /Fotka etikety/ });
  await expect(dialog).toBeVisible();
  await page.getByTestId('wine-viewer-close').click();
  await expect(dialog).toHaveCount(0);
});

test('WIN-027: backdrop při 1× zavře dialog', async ({ page }) => {
  test.setTimeout(30_000);
  const detail = await openFirstWineDetail(page);
  await detail.getByTestId('wine-photo-zoom-btn').click();
  const dialog = page.getByRole('dialog', { name: /Fotka etikety/ });
  await expect(dialog).toBeVisible();
  // Click the top-left corner (backdrop area).
  await page.mouse.click(10, 10);
  await expect(dialog).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Screenshots: 3 viewports × 2 themes
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { name: 'phone-360x780', width: 360, height: 780 },
  { name: 'tablet-800x1280', width: 800, height: 1280 },
  { name: 'kiosk-1280x800', width: 1280, height: 800 },
] as const;

const THEMES = ['dark', 'light'] as const;

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`Screenshot: ${vp.name} ${theme}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const detail = await openFirstWineDetail(page, theme);
      const triggerBtn = detail.getByTestId('wine-photo-zoom-btn');
      await expect(triggerBtn).toBeVisible();
      // The kiosk/desktop detail is a sticky side pane; bring it into view for the shot.
      await detail.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Screenshot 1: detail with trigger.
      await page.screenshot({
        path: `test-results/wine-photo-zoom/${vp.name}-${theme}-detail.png`,
      });

      // Open viewer.
      await triggerBtn.click();
      await expect(page.getByRole('dialog', { name: /Fotka etikety/ })).toBeVisible();
      await expect(page.getByTestId('wine-viewer-img')).toBeVisible();
      await page.waitForTimeout(300);

      // Screenshot 2: viewer at 1×.
      await page.screenshot({
        path: `test-results/wine-photo-zoom/${vp.name}-${theme}-viewer-1x.png`,
      });

      // Zoom in with + button.
      await page.getByTestId('wine-viewer-zoom-in').click();
      await page.getByTestId('wine-viewer-zoom-in').click();
      await page.waitForTimeout(300);

      // Screenshot 3: viewer zoomed.
      await page.screenshot({
        path: `test-results/wine-photo-zoom/${vp.name}-${theme}-viewer-zoomed.png`,
      });
    });
  }
}
