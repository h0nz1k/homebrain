import { expect, test, type Locator } from '@playwright/test';

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  reducedMotion: 'reduce',
});

/** What the user sees: the projected floor polygons relative to the map panel. */
function floorFit(map3d: Locator) {
  return map3d.evaluate((element) => {
    const panel = element.querySelector('.rb-map3d')!.getBoundingClientRect();
    const canvas = element.querySelector('canvas')!;
    const box = canvas.getBoundingClientRect();
    const [left, top, right, bottom] = (canvas.dataset.floorBox ?? '').split(',').map(Number);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    const fills =
      Math.abs(box.left - panel.left) <= 1 &&
      Math.abs(box.right - panel.right) <= 1 &&
      Math.abs(box.top - panel.top) <= 1 &&
      Math.abs(box.bottom - panel.bottom) <= 1;
    const inside = left! >= 0 && top! >= 0 && right! <= box.width && bottom! <= box.height;
    const width = (right! - left!) / panel.width;
    const height = (bottom! - top!) / panel.height;
    // Tall panels are limited by the height, wide ones by the width.
    const cover = panel.height > panel.width ? height : width;
    return fills && inside ? Math.round(cover * 100) : 0;
  });
}

test('3D mapa vyplní panel: půdorys ≥ 75 % a celý uvnitř (360/800/1280/1440)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', 'Viewports are set by the test.');
  await page.goto('/homebrain-roboti?mapa3d=prehled');
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  const map3d = page.getByTestId('robots-map-3d');
  for (const [width, height] of [
    [360, 800],
    [800, 1280],
    [1280, 900],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => floorFit(map3d), { message: `${width}×${height}` })
      .toBeGreaterThanOrEqual(75);
    const live = map3d.locator('[data-map3d-room][data-live]');
    await expect(live).toBeVisible();
    if (width >= 800) await expect(map3d.locator('[data-map3d-room]:visible')).toHaveCount(8);
  }
});

test('3D mapa sdílí pořadí místností s 2D a pamatuje pohled pro každého robota', async ({
  page,
}) => {
  await page.goto('/homebrain-roboti?mapa3d=prehled');
  const map2d = page.getByTestId('robots-vector-map');
  const map3d = page.getByTestId('robots-map-3d');
  const mode2d = page.getByRole('radio', { name: '2D', exact: true });
  const mode3d = page.getByRole('radio', { name: '3D', exact: true });
  await expect(map2d).toBeVisible();
  await expect(mode2d).toHaveAttribute('aria-checked', 'true');
  await expect(map3d.locator('canvas')).toHaveCount(0);

  await page.getByTestId('robots-room-1').click();
  await mode3d.click();
  const canvas = map3d.locator('canvas');
  await expect(canvas).toBeVisible();
  const expectFloorFitted = () => expect.poll(() => floorFit(map3d)).toBeGreaterThanOrEqual(75);
  await expectFloorFitted();
  await expect(map3d.locator('[data-map3d-room="8"]')).toHaveText('Šatna');
  await expect(map3d.locator('[data-map3d-room][data-live]')).toHaveCount(1);
  await expect(map3d.locator('[data-map3d-room="1"] .rb-map3d-badge')).toHaveText('1');
  const room = map3d.locator('[data-map3d-room="3"]');
  await expect(room).toHaveAttribute('style', /left:/);
  const overviewPosition = (await room.getAttribute('style'))!;
  const top = map3d.getByRole('button', { name: 'Shora' });
  await top.click();
  await expect(top).toHaveAttribute('aria-pressed', 'true');
  await expect(room).not.toHaveAttribute('style', overviewPosition);
  await expectFloorFitted();

  await canvas.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  const position = await room.evaluate((element: HTMLElement) => ({
    x: (Number.parseFloat(element.style.left) / 100) * element.parentElement!.clientWidth,
    y: (Number.parseFloat(element.style.top) / 100) * element.parentElement!.clientHeight,
  }));
  await canvas.click({ position });
  await expect(room.locator('.rb-map3d-badge')).toHaveText('2');
  await expect(page.getByTestId('robots-room-3')).toHaveAttribute('aria-pressed', 'true');

  await map3d.getByRole('button', { name: 'Výchozí', exact: true }).click();
  await expect(room).toHaveAttribute('style', overviewPosition);
  await expectFloorFitted();

  await mode2d.click();
  await expect(map2d.getByTestId('robots-map-room-3')).toHaveAttribute('data-selected', 'true');
  await expect(map2d.locator('[data-rv-label="3"] .rv-badge')).toHaveText('2');
  await mode3d.click();
  await page.reload();
  await expect(mode3d).toHaveAttribute('aria-checked', 'true');
  await expect(map3d.locator('canvas')).toBeVisible();

  await page.getByTestId('robots-floor-2').click();
  await expect(mode2d).toHaveAttribute('aria-checked', 'true');
  await expect(map2d).toBeVisible();
  await page.getByTestId('robots-floor-1').click();
  await expect(map3d.locator('canvas')).toBeVisible();
});

test('bez WebGL se zobrazí 2D mapa s krátkou poznámkou', async ({ page }) => {
  await page.goto('/homebrain-roboti?mapa3d=bez-webgl');
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await expect(page.getByText('3D pohled není dostupný. Zobrazujeme 2D mapu.')).toBeVisible();
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  await page.getByRole('radio', { name: '2D', exact: true }).click();
  await expect(page.getByText('3D pohled není dostupný. Zobrazujeme 2D mapu.')).toHaveCount(0);
});
