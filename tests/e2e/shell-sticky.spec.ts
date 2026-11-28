/**
 * Sticky module content inside the shell <main> (wine detail pane, heating schematic).
 * main must not be a scroll container, otherwise sticky elements never stick.
 */
import { expect, test } from '@playwright/test';

test('Vinotéka: detail zůstane vidět po kliknutí na víno níž v seznamu (1280×800)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/homebrain-vinoteka');
  const cards = page.getByTestId('wine-card');
  await cards.first().waitFor({ timeout: 20_000 });
  const card = cards.nth(12);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  const detail = page.getByTestId('wine-detail');
  await expect(detail).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const box = await detail.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(200);
  // Scrolling further keeps it pinned under the top bar.
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(300);
  const box2 = await detail.boundingBox();
  expect(Math.abs(box2!.y - box!.y)).toBeLessThan(4);
});

test('Shell: main není scroll kontejner a stránka nepřetéká do šířky (360 px)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/homebrain-vinoteka');
  await page.getByTestId('wine-card').first().waitFor({ timeout: 20_000 });
  const r = await page.evaluate(() => {
    const host = document.querySelector('homebrain-panel');
    const root = (host?.shadowRoot ?? document) as Document | ShadowRoot;
    const main = root.querySelector('main')!;
    const cs = getComputedStyle(main);
    return {
      ox: cs.overflowX,
      oy: cs.overflowY,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(r.ox).toBe('clip');
  expect(r.oy).toBe('visible');
  expect(r.docOverflow).toBeLessThanOrEqual(0);
});
