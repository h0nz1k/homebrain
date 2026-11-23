import { expect, test } from '@playwright/test';

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  reducedMotion: 'reduce',
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
  await expect(map3d.locator('canvas')).toBeVisible();
  await expect(map3d.locator('[data-map3d-room="1"] .rb-map3d-badge')).toHaveText('1');
  const top = map3d.getByRole('button', { name: 'Pohled shora' });
  await top.click();
  await expect(top).toHaveAttribute('aria-pressed', 'true');

  const room = map3d.locator('[data-map3d-room="3"]');
  await expect(room).toHaveAttribute('style', /left:/);
  const box = await room.boundingBox();
  if (!box) throw new Error('Chybí umístění místnosti na 3D mapě');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(room.locator('.rb-map3d-badge')).toHaveText('2');
  await expect(page.getByTestId('robots-room-3')).toHaveAttribute('aria-pressed', 'true');

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
