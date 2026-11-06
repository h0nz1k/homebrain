import { expect, test, type Page } from '@playwright/test';

// Several dev-server navigations per test; first module render is slow under CI/host load.
test.describe.configure({ timeout: 120_000 });

// Live airfryer card: synthetic `demo_fryer` entities via `?fryerlive=<scenario>` (dev only).

test('Recepty: fritéza peče – odpočet, teploty, pozastavit, zastavit s potvrzením', async ({
  page,
}) => {
  await page.goto('/homebrain-recepty?fryerlive=cooking');
  const card = page.getByTestId('recipes-fryer-live');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('recipes-fryer-state')).toHaveText('Peče');
  // Calm states lead with the food; the phase is the status pill.
  await expect(page.getByTestId('recipes-fryer-title')).toHaveText('Hranolky', { timeout: 10_000 });
  // Temperature value is plain text; the target sits in its label.
  await expect(page.getByTestId('recipes-fryer-temp')).toHaveText('189 °C');
  await expect(card).toContainText('cíl 200 °C');
  await expect(card.locator('.hb-stepper')).toHaveCount(1);
  // Same three phases from the start, with the same labels on phone and desktop.
  await expect(card.locator('.hb-step-t')).toHaveText(['Ohřev', 'Pečení', 'Hotovo']);
  await expect(card.locator('.hb-step-t').first()).toBeVisible();
  // Meta line under the title: one line, no dangling separators.
  await expect(page.getByTestId('recipes-fryer-meta')).toHaveText('Fritéza · Zaplnění 3/7');
  // One progress display: the ring. Phases are a text line only (no segment bars).
  await expect(card.locator('.hb-step-n').first()).toBeHidden();
  await expect(page.getByTestId('recipes-fryer-ring')).toHaveCount(1);
  // Hierarchy: the countdown is the hero; Pozastavit and Zastavit are both quiet secondaries.
  await expect(page.getByTestId('recipes-fryer-pause')).toHaveAttribute(
    'data-variant',
    'secondary',
  );
  await expect(page.getByTestId('recipes-fryer-stop')).not.toHaveAttribute(
    'data-variant',
    'primary',
  );
  // Local countdown between HA updates (8:42 at load, then ticks down).
  const first = await page.getByTestId('recipes-fryer-countdown').innerText();
  await expect
    .poll(async () => page.getByTestId('recipes-fryer-countdown').innerText(), { timeout: 5_000 })
    .not.toBe(first);
  await expect(page.getByTestId('recipes-fryer-keep_warm')).toHaveCount(0);
  await page.getByTestId('recipes-fryer-stop').click();
  const dialog = page.getByTestId('recipes-fryer-stop-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Nechat péct' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId('recipes-fryer-stop').click();
  await page.getByTestId('recipes-fryer-stop-confirm').click();
  // Toast text is also mirrored into a screen-reader live region, so target the toast itself.
  await expect(page.getByTestId('hb-toast')).toContainText('Fritéza · zastavit');
});

const STATE_CASES: Array<[string, string]> = [
  ['action', 'Protřepejte jídlo'],
  ['drawer', 'Šuplík otevřený'],
  ['paused', 'Pozastaveno'],
  ['done', 'Hotovo'],
  ['warm', 'Udržuje teplé'],
  ['error', 'Fritéza hlásí chybu'],
  ['preheat', 'Předehřívá'],
];
// One navigation per test: a loop over all states in one test timed out under host load.
for (const [scenario, label] of STATE_CASES) {
  test(`Recepty: fritéza ve stavu ${scenario} – nadpis a hierarchie akcí`, async ({ page }) => {
    await page.goto(`/homebrain-recepty?fryerlive=${scenario}`);
    const card = page.getByTestId('recipes-fryer-live');
    await expect(page.getByTestId('recipes-fryer-state')).toHaveText(label, { timeout: 20_000 });
    const primaries = card.locator('.hb-btn[data-variant="primary"]');
    if (scenario === 'preheat') {
      await expect(page.getByTestId('recipes-fryer-pause')).toHaveCount(1);
    } else if (scenario === 'done') {
      await expect(page.getByTestId('recipes-fryer-keep_warm')).toHaveAttribute(
        'data-variant',
        'primary',
      );
      await expect(page.getByTestId('recipes-fryer-stop')).toHaveText('Ukončit');
      await expect(primaries).toHaveCount(1);
    } else {
      // Resume happens on the device (not verified from HA): guidance, no fake primary.
      await expect(primaries).toHaveCount(0);
      await expect(page.getByTestId('recipes-fryer-stop')).toBeVisible();
    }
    if (scenario === 'paused' || scenario === 'action' || scenario === 'drawer') {
      await expect(page.getByTestId('recipes-fryer-guide')).toContainText(
        scenario === 'paused' ? 'Pokračovat lze na fritéze' : 'fritéza pokračuje sama',
      );
    }
    if (scenario === 'paused') {
      await expect(page.getByTestId('recipes-fryer-paused-badge')).toBeVisible();
      // Paused must not look disabled: full-contrast title.
      const [title, t1] = await page.getByTestId('recipes-fryer-state').evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--hb-t1)';
        el.parentElement!.appendChild(probe);
        const ref = getComputedStyle(probe).color;
        probe.remove();
        return [getComputedStyle(el).color, ref];
      });
      expect(title).toBe(t1);
      await expect(page.getByTestId('recipes-fryer-state')).not.toHaveCSS('opacity', /^0\./);
    }
    if (scenario === 'action' || scenario === 'drawer') {
      // The stopped countdown is plain text, not a pill/button.
      const held = page.getByTestId('recipes-fryer-held');
      await expect(held).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(held.locator('button')).toHaveCount(0);
    }
    if (scenario === 'error') {
      // Solid red band carries the title and the error code (no red pill on red).
      const band = page.getByTestId('recipes-fryer-band');
      await expect(band).toContainText('Fritéza hlásí chybu');
      await expect(band.getByTestId('recipes-fryer-code')).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
    }
  });
}

test('Recepty: vypnutá fritéza je skrytá', async ({ page }) => {
  await page.goto('/homebrain-recepty?fryerlive=off');
  await expect(page.getByTestId('recipes-grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('recipes-fryer-live')).toHaveCount(0);
});

test('Recepty na desktopu: karta fritézy – kroužek | obsah | ilustrace, akce hned pod obsahem', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/homebrain-recepty?fryerlive=cooking');
  const card = page.getByTestId('recipes-fryer-live');
  await expect(card).toBeVisible({ timeout: 20_000 });
  const geo = await card.evaluate((el) => {
    const r = (sel: string) => el.querySelector(sel)!.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    return {
      h: c.height,
      w: c.width,
      gap: r('[data-testid="recipes-fryer-actions"]').top - r('.rc-fl-steps').bottom,
      stopIn: r('[data-testid="recipes-fryer-stop"]').right <= c.right,
      art: r('.rc-fl-side-art').left >= r('.rc-fl-main').right,
      ring: r('[data-testid="recipes-fryer-ring"]').right <= r('.rc-fl-head').left,
    };
  });
  expect(geo.h).toBeGreaterThanOrEqual(240);
  expect(geo.gap).toBeLessThan(32);
  expect(geo.stopIn).toBe(true);
  expect(geo.art).toBe(true);
  expect(geo.ring).toBe(true);
});

test('Recepty na telefonu 390 px: karta fritézy nepřetéká', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/homebrain-recepty?fryerlive=cooking&theme=light');
  const card = page.getByTestId('recipes-fryer-live');
  await expect(card).toBeVisible({ timeout: 20_000 });
  const overflow = await card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Array.from(el.querySelectorAll('*'))
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5)).length;
  });
  expect(overflow).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Dnes: protřepání fritézy je naléhavý hero nad páskou dne', async ({ page }) => {
  await page.goto('/homebrain-dnes?fryerlive=action');
  await expect(page.getByText('Fritéza · Protřepejte jídlo')).toBeVisible({
    timeout: 20_000,
  });
  // Act-now fryer leads Dnes: hero above the day ribbon, whole card in the first phone viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/homebrain-dnes?fryerlive=action');
  const hero = page.getByTestId('hero-signal');
  await expect(hero).toContainText('Fritéza · Protřepejte jídlo', { timeout: 20_000 });
  const heroBox = (await hero.boundingBox())!;
  const ribbonBox = (await page.getByTestId('ribbon-card').boundingBox())!;
  expect(heroBox.y).toBeLessThan(ribbonBox.y);
  expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(844);
});

test('Dnes: běžící fritéza je běžná karta, vypnutá nemá signál', async ({ page }) => {
  // A running fryer is a regular card (countdown), not an act-now hero above the ribbon.
  await page.goto('/homebrain-dnes?fryerlive=cooking');
  await expect(page.getByText(/Fritéza · Peče/).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/homebrain-dnes?fryerlive=off');
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Fritéza ·/)).toHaveCount(0);
});

// Owner photo set (HA /local/homebrain/airfryer/, never in the repo): SYNTHETIC manifest + SVG here.
const fryerManifest = {
  schema: 1,
  model: 'Synthetic fryer',
  images: { front: 'demo/front.svg', drawerOpen: 'demo/open.svg' },
  hotspots: { display: [40, 10, 60, 26], drawer: [4, 40, 96, 96] },
};
const fryerSvg = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 210" width="200" height="210"><rect x="10" y="4" width="180" height="200" rx="24" fill="${fill}"/></svg>`;
async function serveFryerPhotos(page: Page, available = true) {
  await page.route('**/local/homebrain/airfryer/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!available) return route.fulfill({ status: 404, body: '' });
    if (path.endsWith('/manifest.json')) return route.fulfill({ json: fryerManifest });
    if (path.endsWith('/demo/front.svg'))
      return route.fulfill({ body: fryerSvg('#22262c'), contentType: 'image/svg+xml' });
    if (path.endsWith('/demo/open.svg'))
      return route.fulfill({ body: fryerSvg('#3a2f22'), contentType: 'image/svg+xml' });
    return route.fulfill({ status: 404, body: '' });
  });
}

test('Recepty: fritéza s fotkou – přední pohled při pečení, vysunutý šuplík při protřepání', async ({
  page,
}) => {
  await serveFryerPhotos(page);
  await page.goto('/homebrain-recepty?fryerlive=cooking');
  const photo = page.getByTestId('recipes-fryer-photo');
  await expect(photo).toBeVisible({ timeout: 20_000 });
  await expect(photo).toHaveAttribute('data-phase', 'cooking');
  await expect(photo.locator('img')).toHaveAttribute(
    'src',
    /\/local\/homebrain\/airfryer\/demo\/front\.svg$/,
  );
  await expect(page.locator('.rc-fa')).toHaveCount(0);
  await page.goto('/homebrain-recepty?fryerlive=action');
  await expect(photo).toBeVisible({ timeout: 20_000 });
  await expect(photo).toHaveAttribute('data-out', 'true');
  await expect(photo.locator('img')).toHaveAttribute('src', /demo\/open\.svg$/);
  // Rejected: no resume / start control next to the photo.
  await expect(page.getByRole('button', { name: /Protřepáno|Pokračovat|Spustit/ })).toHaveCount(0);
});

test('Recepty: fritéza s fotkou – chyba i reduced motion bez smyček', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await serveFryerPhotos(page);
  await page.goto('/homebrain-recepty?fryerlive=cooking');
  const photo = page.getByTestId('recipes-fryer-photo');
  await expect(photo).toBeVisible({ timeout: 20_000 });
  const loops = await page.evaluate(() => {
    const card = document.querySelector('[data-testid=recipes-fryer-live]');
    return document.getAnimations().filter((a) => {
      const effect = a.effect as KeyframeEffect | null;
      return (
        a.playState === 'running' &&
        card?.contains(effect?.target ?? null) &&
        effect?.getTiming().iterations === Infinity
      );
    }).length;
  });
  expect(loops).toBe(0);
  await page.goto('/homebrain-recepty?fryerlive=error');
  await expect(photo).toHaveAttribute('data-phase', 'error', { timeout: 20_000 });
  await ctx.close();
});

test('Recepty: bez fotek fritézy zůstává SVG ilustrace', async ({ page }) => {
  await serveFryerPhotos(page, false);
  await page.goto('/homebrain-recepty?fryerlive=cooking');
  await expect(page.getByTestId('recipes-fryer-live')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.rc-fa').first()).toBeVisible();
  await expect(page.getByTestId('recipes-fryer-photo')).toHaveCount(0);
});
