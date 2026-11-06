import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Roboti – photo card (owner's photo set under /local/homebrain/robots/<robot>/, never in the repo).
// The test serves a SYNTHETIC manifest + generated SVG pictures; real photos are not used here.
const manifest = {
  schema: 1,
  model: 'Synthetic robot',
  images: { dock: 'dock.svg', bottom: 'bottom.svg', sideBrush: 'brush.svg' },
  bottom: {
    roller: [28, 42, 72, 50],
    caster: [47, 11, 53, 17],
    wheels: [
      [14, 40, 19, 61],
      [81, 40, 86, 61],
    ],
    mops: [
      [32, 78, 17],
      [68, 78, 17],
    ],
    sideBrush: { box: [-5, -3, 40], dir: 1 },
  },
  hotspots: {
    bottom: { main_brush: [50, 46], side_brush: [15, 22], sensors: [62, 8] },
    dock: { clean_tank: [30, 20], dirty_tank: [66, 20] },
  },
};
const svg = (body: string, w = 200, h = 200) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
const pictures: Record<string, string> = {
  'dock.svg': svg(
    '<rect x="40" y="10" width="120" height="270" rx="18" fill="#59606b"/>',
    200,
    290,
  ),
  'bottom.svg': svg(
    '<circle cx="100" cy="100" r="96" fill="#2b2f36"/><rect x="56" y="84" width="88" height="16" fill="#777"/>',
  ),
  'brush.svg': svg(
    '<path d="M100 100 L100 10 M100 100 L180 140 M100 100 L20 140" stroke="#ccc" stroke-width="6"/>',
  ),
};

// Synthetic maintenance guides (real ones with vendor videos live only in Home Assistant).
const guides = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../modules/robots/guides.example.json'), 'utf8'),
) as unknown;
pictures['main_brush_1.svg'] = svg('<rect width="320" height="180" fill="#3a4250"/>', 320, 180);
pictures['main_brush_poster.svg'] = svg(
  '<rect width="320" height="180" fill="#1d2430"/>',
  320,
  180,
);

async function servePhotos(page: Page) {
  await page.route('**/local/homebrain/robots/**', (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    if (file === 'manifest.json') return route.fulfill({ json: manifest });
    if (file === 'guides.json') return route.fulfill({ json: guides });
    const body = pictures[file];
    return body
      ? route.fulfill({ body, contentType: 'image/svg+xml' })
      : route.fulfill({ status: 404, body: '' });
  });
}
// Looping part animations (spin/roll/drift); one-shot fades and transitions don't count.
const running = (page: Page, loopsOnly = true) =>
  page.evaluate((loops) => {
    const card = document.querySelector('[data-testid=robots-photo]');
    return document.getAnimations().filter((a) => {
      const effect = a.effect as KeyframeEffect | null;
      if (a.playState !== 'running' || !card?.contains(effect?.target ?? null)) return false;
      return !loops || effect?.getTiming().iterations === Infinity;
    }).length;
  }, loopsOnly);

test('fotka robota: úklid animuje díly, mapa zůstává vpravo', async ({ page }) => {
  await servePhotos(page);
  await page.goto('/homebrain-roboti?photos=a,b,c');
  const photo = page.getByTestId('robots-photo');
  await expect(photo).toHaveAttribute('data-rbp-view', 'cleaning', { timeout: 20_000 });
  await expect(page.getByTestId('robots-hero-visual')).toHaveAttribute('data-rb-visual', 'photo');
  await expect.poll(() => running(page)).toBeGreaterThan(4);
  // Two mops counter-rotate.
  const dirs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.rbp-mop')).map(
      (el) => getComputedStyle(el).animationDirection,
    ),
  );
  expect(dirs).toEqual(['normal', 'reverse']);
  const vw = page.viewportSize()!.width;
  if (vw > 1080) {
    const hero = (await page.getByTestId('robots-hero').boundingBox())!;
    const map = (await page.getByTestId('robots-clean').boundingBox())!;
    expect(hero.x + hero.width).toBeLessThanOrEqual(map.x + 1);
  }
});

test('fotka robota: dok, chyba s „!“ na dílu a údržba', async ({ page }) => {
  await servePhotos(page);
  await page.goto('/homebrain-roboti?photos=a,b,c&robot=2');
  const photo = page.getByTestId('robots-photo');
  await expect(photo).toHaveAttribute('data-rbp-view', 'error', { timeout: 20_000 });
  await expect(page.getByTestId('robots-photo-badge-error')).toHaveText('Chyba');
  await expect(page.getByTestId('robots-photo-error')).toContainText('hlavní kartáč');
  const toggle = page.getByTestId('robots-photo-maintenance');
  await toggle.click();
  await expect(photo).toHaveAttribute('data-rbp-view', 'maintenance');
  await expect(page.getByTestId('robots-photo-part-main_brush')).toBeVisible();
  expect(await running(page)).toBe(0);
});

test('fotka robota: v doku, žlutá Údržba při dílu pod 25 %', async ({ page }) => {
  await servePhotos(page);
  await page.goto('/homebrain-roboti?photos=a,b,c&robots=docked');
  await expect(page.getByTestId('robots-photo')).toHaveAttribute('data-rbp-view', 'dock', {
    timeout: 20_000,
  });
  const toggle = page.getByTestId('robots-photo-maintenance');
  await expect(toggle).toHaveAttribute('data-tone', 'warn');
  await toggle.click();
  await expect(page.locator('.rbp-dot[data-low=true]').first()).toBeVisible();
});

test('fotka robota: bez fotek zůstává neutrální ilustrace', async ({ page }) => {
  await page.route('**/local/homebrain/robots/**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.goto('/homebrain-roboti');
  await expect(page.getByTestId('robots-hero-visual')).toHaveAttribute('data-rb-visual', 'art', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('robots-photo')).toHaveCount(0);
});

test.describe('omezený pohyb', () => {
  test.use({ reducedMotion: 'reduce' });
  test('fotka robota: při úklidu se nic nehýbe', async ({ page }) => {
    await servePhotos(page);
    await page.goto('/homebrain-roboti?photos=a,b,c');
    await expect(page.getByTestId('robots-photo')).toHaveAttribute('data-rbp-view', 'cleaning', {
      timeout: 20_000,
    });
    await page.waitForTimeout(300);
    expect(await running(page, false)).toBe(0);
  });
});

test('údržba: návod k dílu s fotkou, kroky, videem a vynulováním počítadla', async ({ page }) => {
  await servePhotos(page);
  await page.goto('/homebrain-roboti?photos=a,b,c');
  await page.getByTestId('robots-guide-open-main_brush').click();
  const sheet = page.getByTestId('robots-guide');
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByTestId('robots-guide-photo')).toBeVisible();
  await expect(sheet.locator('.hb-stepper[data-variant=instructions] > li')).toHaveCount(3);
  await expect(sheet.locator('.hb-step-media img')).toHaveCount(1);
  await expect(sheet.getByTestId('robots-guide-video')).toHaveAttribute(
    'src',
    /guides\/main_brush\.mp4$/,
  );
  await expect(sheet.getByRole('link', { name: 'Výrobce – návod' })).toHaveAttribute(
    'target',
    '_blank',
  );
  // The sheet fits the viewport width (phones included) – nothing scrolls sideways.
  const fits = await page.evaluate(() => {
    const box = document.querySelector('[data-testid=robots-guide]')!.getBoundingClientRect();
    return (
      box.left >= -1 &&
      box.right <= window.innerWidth + 1 &&
      document.documentElement.scrollWidth <= window.innerWidth
    );
  });
  expect(fits).toBe(true);
  await sheet.getByTestId('robots-guide-reset').click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('robots-confirm')).toContainText(
    'Vynulovat počítadlo: Hlavní kartáč',
  );
  await page.getByRole('button', { name: 'Zrušit' }).click();

  // Reset entity missing in HA → disabled action + hint; extra parts row opens the dock guide.
  await page.getByTestId('robots-guide-open-side_brush').click();
  await expect(page.getByTestId('robots-guide-reset')).toBeDisabled();
  await expect(page.getByTestId('robots-guide-reset-missing')).toContainText(
    'button.demo_robot_1_reset_side_brush',
  );
  await page.keyboard.press('Escape');
  await page.getByTestId('robots-guide-open-dust_bag').click();
  await expect(page.getByTestId('robots-guide')).toContainText('Vyměňte sáček');
});

test('údržba: bez soukromého návodu obecný postup bez videa', async ({ page }) => {
  await page.goto('/homebrain-roboti');
  await page.getByTestId('robots-guide-open-filter').click();
  const sheet = page.getByTestId('robots-guide');
  await expect(sheet).toContainText('obecný postup', { timeout: 20_000 });
  await expect(sheet.getByTestId('robots-guide-video')).toHaveCount(0);
  // No private guides → no guide-only tiles (mops, wheel, dust bag…).
  await expect(page.locator('[data-rb-kind=guide]')).toHaveCount(0);
});
