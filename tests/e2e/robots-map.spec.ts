import { expect, test, type Page } from '@playwright/test';

// Roboti fáze B (Refs #94): vektorová mapa z vymyšlených půdorysů dev mocku.
const markerPos = (page: Page) =>
  page.getByTestId('robots-map-robot').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];
  });

test('vektorová mapa: místnosti, popisky, výběr klepnutím synchronní s čipy', async ({ page }) => {
  await page.goto('/homebrain-roboti');
  const map = page.getByTestId('robots-vector-map');
  await expect(map).toBeVisible();
  await expect(page.locator('.rb-map')).toHaveAttribute('data-map-kind', 'vector');
  await expect(map.locator('.rv-room')).toHaveCount(8);
  await expect(map.locator('[data-rv-label="1"]')).toHaveText('Obývací pokoj');
  await expect(page.getByTestId('robots-map-dock')).toBeVisible();
  await expect(map.locator('.rv-nogo')).toHaveCount(1);

  // Label sits inside its (L-shaped) room.
  const inside = await page.evaluate(() => {
    const label = document.querySelector('[data-rv-label="1"]')!.getBoundingClientRect();
    const hit = document
      .elementsFromPoint(label.x + label.width / 2, label.y + label.height / 2)
      .find((el) => el.classList.contains('rv-room'));
    return hit?.getAttribute('data-testid');
  });
  expect(inside).toBe('robots-map-room-1');

  await page.getByTestId('robots-map-room-3').click();
  await page.getByTestId('robots-map-room-2').click({ position: { x: 60, y: 20 } });
  await expect(page.getByTestId('robots-room-3')).toContainText('1');
  await expect(page.getByTestId('robots-room-2')).toContainText('2');
  await expect(map.locator('[data-rv-label="3"] .rv-badge')).toHaveText('1');
  await expect(page.getByTestId('robots-map-room-3')).toHaveAttribute('data-selected', 'true');
  await page.getByTestId('robots-room-3').click();
  await expect(page.getByTestId('robots-map-room-3')).not.toHaveAttribute('data-selected', 'true');
  await expect(map.locator('[data-rv-label="2"] .rv-badge')).toHaveText('1');
});

test('rastrový podklad jen s ?mapa=rastr; výchozí je vektor, trasa ztlumená s přepínačem', async ({
  page,
}) => {
  await page.goto('/homebrain-roboti?theme=light&mapa=rastr');
  const map = page.getByTestId('robots-vector-map');
  await expect(map).toHaveAttribute('data-base', 'ready');
  const base = page.getByTestId('robots-map-base');
  await expect(base).toHaveAttribute('href', /demo-1-light\.png/);
  await expect(page.getByTestId('robots-map-base-walls')).toHaveAttribute('href', /light-walls/);
  // The bitmap really loaded and the overlays share its frame.
  const loaded = await base.evaluate((el) => {
    const svg = (el as SVGImageElement).ownerSVGElement!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return { w: box.width, inside: box.left >= svg.left - 40 && box.right <= svg.right + 40 };
  });
  expect(loaded.w).toBeGreaterThan(100);
  expect(loaded.inside).toBe(true);
  await expect(page.getByTestId('robots-map-walls')).toHaveCount(0);
  await page.getByTestId('robots-map-room-2').click();
  await expect(page.getByTestId('robots-room-2')).toContainText('1');

  // Default = vector drawing (one shared-arc partition); the raster is opt-in only.
  await page.goto('/homebrain-roboti');
  await expect(page.getByTestId('robots-map-walls')).toBeVisible();
  await expect(page.getByTestId('robots-map-base')).toHaveCount(0);
  const vmap = page.getByTestId('robots-vector-map');
  await expect(vmap).toHaveAttribute('data-trail', 'faded');
  await page.getByTestId('robots-trail-toggle').click();
  await expect(vmap).toHaveAttribute('data-trail', 'full');
});

test('robot se mezi aktualizacemi plynule posouvá po dráze', async ({ page }) => {
  await page.goto('/homebrain-roboti?mapapoll=2000');
  await expect(page.getByTestId('robots-map-robot')).toBeVisible();
  const samples: number[][] = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await markerPos(page));
    await page.waitForTimeout(500);
  }
  const moves = samples
    .slice(1)
    .map((p, i) => Math.hypot(p[0]! - samples[i]![0]!, p[1]! - samples[i]![1]!));
  // It moved overall, in several small steps (gliding), never one big jump.
  expect(moves.filter((d) => d > 0.5).length).toBeGreaterThanOrEqual(3);
  const total = moves.reduce((a, b) => a + b, 0);
  expect(Math.max(...moves)).toBeLessThan(total * 0.7);
});

// One full page load per case (three in one test exceeded 30 s on a loaded host).
for (const [name, query, kind] of [
  ['robot bez vektorových dat', 'robot=3', 'image'],
  ['chyba parseru', 'vektor=chyba', null],
  ['vypínač ?mapa=obrazek', 'mapa=obrazek', null],
] as const) {
  test(`záložní obrázek mapy: ${name}`, async ({ page }) => {
    await page.goto(`/homebrain-roboti?${query}`);
    await expect(page.getByTestId('robots-map')).toBeVisible();
    await expect(page.getByTestId('robots-vector-map')).toHaveCount(0);
    if (kind) await expect(page.locator('.rb-map')).toHaveAttribute('data-map-kind', kind);
  });
}

test('omezený pohyb: mapa bez běžících animací', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL ?? ''}/homebrain-roboti`);
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  await page.getByTestId('robots-map-room-3').click();
  const running = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === 'running' &&
            (a.effect as KeyframeEffect | null)?.target?.closest?.('.rv'),
        ).length,
  );
  expect(running).toBe(0);
  await context.close();
});

test('mapa na cestě panelu: popisky v místnostech, mimo robota, výběr se souhrnem', async ({
  page,
}) => {
  await page.goto('/homebrain-roboti');
  const map = page.getByTestId('robots-vector-map');
  await expect(map).toBeVisible();
  await page.getByTestId('robots-room-6').click();
  await page.getByTestId('robots-room-2').click();
  await expect(map.locator('.rv-room[data-selected]')).toHaveCount(2);
  await expect(page.getByTestId('robots-selection-summary')).toContainText('2 místnosti');
  await expect(page.getByTestId('robots-start')).toContainText('2 místnosti');
  // Planned route runs over the door graph (orthogonal, through door centres).
  await expect(page.getByTestId('robots-map-route')).toHaveAttribute('data-route', 'doors');
  // Wait for the glide to finish, then check the real-DOM label layout.
  await page.waitForTimeout(1500);
  const report = await page.evaluate(() => {
    const spot = document.querySelector('[data-rv-bot-spot]')?.getBoundingClientRect();
    const out: string[] = [];
    let shown = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.rv-label'))) {
      if (el.hasAttribute('data-hidden')) continue;
      shown += 1;
      const box = el.getBoundingClientRect();
      const room = document
        .querySelector(`[data-testid='robots-map-room-${el.dataset.rvLabel}']`)!
        .getBoundingClientRect();
      if (box.left < room.left || box.right > room.right) out.push(`${el.textContent} přetéká`);
      if (
        spot &&
        box.left < spot.right - 1 &&
        box.right > spot.left + 1 &&
        box.top < spot.bottom - 1 &&
        box.bottom > spot.top + 1
      )
        out.push(`${el.textContent} pod robotem`);
    }
    const tail = document.querySelector('[data-rv-tail]');
    return { out, shown, tail: !!tail?.getAttribute('x2') };
  });
  expect(report.out).toEqual([]);
  expect(report.shown).toBeGreaterThanOrEqual(6);
  expect(report.tail).toBe(true);
});
