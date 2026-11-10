import { expect, test, type Locator } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 800, height: 1280 },
  { name: 'tablet-landscape', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

async function assertControlsLayout(controls: Locator) {
  const result = await controls.evaluate((root) => {
    const rootBox = root.getBoundingClientRect();
    const interactives = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [role="radio"], a[href], input, select, [data-testid^="robots-room-"]',
      ),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const boxes = interactives.map((el) => el.getBoundingClientRect());
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap =
          a.left < b.right - 0.5 &&
          a.right > b.left + 0.5 &&
          a.top < b.bottom - 0.5 &&
          a.bottom > b.top + 0.5;
        if (overlap) return { ok: false as const, reason: 'overlap' };
      }
    }
    for (const b of boxes) {
      if (b.left < rootBox.left - 0.5 || b.right > rootBox.right + 0.5) {
        return { ok: false as const, reason: 'overflow' };
      }
    }
    return { ok: true as const };
  });
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
}

for (const theme of ['dark', 'light'] as const) {
  for (const vp of VIEWPORTS) {
    test(`pokročilé volby Kraken: bez překryvu (${vp.name}, ${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const qs = theme === 'light' ? '?theme=light' : '';
      await page.goto(`/homebrain-roboti${qs}`);
      await expect(page.getByTestId('robots-vector-map')).toBeVisible();
      await page.getByRole('radio', { name: 'Pokročilé' }).click();
      await expect(page.getByRole('radiogroup', { name: 'Průchody' })).toBeVisible();
      const controls = page.getByTestId('robots-controls');
      await assertControlsLayout(controls);
      const minTap = await controls.locator('button').evaluateAll((buttons) =>
        Math.min(...buttons.map((b) => b.getBoundingClientRect().height)),
      );
      expect(minTap).toBeGreaterThanOrEqual(43);
    });
  }
}
