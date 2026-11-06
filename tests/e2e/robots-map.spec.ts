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

// rc.20 bug: the 'Trasa' chip only flipped data-trail, the drawing stayed identical.
const trailState = (page: Page) =>
  page.getByTestId('robots-map-trail').evaluate((el) => ({
    cover: el.querySelectorAll('.rv-cover').length,
    line: Number(el.getAttribute('data-trail-line')),
    d: (el.querySelector('[data-testid="robots-map-trail-line"]')?.getAttribute('d') ?? '').length,
  }));

test('trasa: přepínač viditelně zapíná a vypíná celou dráhu (i v doku)', async ({ page }) => {
  await page.goto('/homebrain-roboti?robots=docked&scena=dok');
  await expect(page.getByTestId('robots-map-robot')).toHaveAttribute('data-docked', 'true');
  const chip = page.getByTestId('robots-trail-toggle');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  // OFF + parked: no historical trail at all.
  await expect.poll(() => trailState(page)).toEqual({ cover: 0, line: 0, d: 0 });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  // ON: whole last run = swept area + a long route line.
  await expect(page.getByTestId('robots-map-cover')).toBeVisible();
  const on = await trailState(page);
  expect(on.cover).toBe(1);
  expect(on.line).toBeGreaterThan(8);
  expect(on.d).toBeGreaterThan(200);
  // The choice survives a reload (localStorage), and OFF again removes the drawing.
  await page.reload();
  await expect(page.getByTestId('robots-map-cover')).toBeVisible();
  await page.getByTestId('robots-trail-toggle').click();
  await expect(page.getByTestId('robots-map-cover')).toHaveCount(0);
  await expect.poll(async () => (await trailState(page)).d).toBe(0);
});

test('trasa vypnutá při úklidu: jen krátký mizející konec za robotem', async ({ page }) => {
  await page.goto('/homebrain-roboti?scena=kuchyne');
  await expect(page.getByTestId('robots-map-robot')).toHaveAttribute('data-tone', 'cleaning');
  await expect(page.getByTestId('robots-map-cover')).toHaveCount(0);
  const off = await trailState(page);
  expect(off.line).toBeGreaterThan(0);
  expect(off.line).toBeLessThanOrEqual(8);
  await page.getByTestId('robots-trail-toggle').click();
  await expect(page.getByTestId('robots-map-cover')).toBeVisible();
  const on = await trailState(page);
  expect(on.line).toBeGreaterThan(off.line);
  expect(on.d).toBeGreaterThan(off.d);
});

test('otočení mapy o 90°: rozměry prohozené, popisky rovně, klik vybere správnou místnost', async ({
  page,
}) => {
  const ratio = () =>
    page.getByTestId('robots-vector-map').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.width / box.height;
    });
  await page.goto('/homebrain-roboti');
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  const r0 = await ratio();
  await page.goto('/homebrain-roboti?otoceni=90');
  const map = page.getByTestId('robots-vector-map');
  await expect(map).toHaveAttribute('data-rotation', '90');
  await expect(map.locator('.rv-room')).toHaveCount(8);
  expect(await ratio()).toBeCloseTo(1 / r0, 1);
  // Labels stay upright (no rotation in their transform) and inside their own room.
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.rv-label:not([data-hidden])')).map(
      (label) => {
        // elementsFromPoint only sees the viewport (phones scroll the map).
        label.scrollIntoView({ block: 'center' });
        const m = new DOMMatrix(getComputedStyle(label).transform);
        const box = label.getBoundingClientRect();
        const hit = document
          .elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          .find((el) => el.classList.contains('rv-room'));
        return {
          id: label.dataset.rvLabel,
          upright: Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6 && m.a > 0,
          room: hit?.getAttribute('data-testid'),
        };
      },
    ),
  );
  expect(labels.length).toBeGreaterThan(3);
  for (const label of labels) {
    expect(label.upright).toBe(true);
    expect(label.room).toBe(`robots-map-room-${label.id}`);
  }
  // Clicking where the 'Jídelna' label sits selects Jídelna (hit areas rotate with the plan).
  await map.locator('[data-rv-label="3"]').scrollIntoViewIfNeeded();
  const box = await map.locator('[data-rv-label="3"]').boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId('robots-room-3')).toContainText('1');
  await expect(page.getByTestId('robots-map-room-3')).toHaveAttribute('data-selected', 'true');
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
