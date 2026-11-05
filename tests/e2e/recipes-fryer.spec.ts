import { expect, test } from '@playwright/test';

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
  await expect(card).toContainText('Demo hranolky', { timeout: 10_000 });
  // Temperature is plain text 'current / target °C' (no second bar next to the step bar).
  await expect(page.getByTestId('recipes-fryer-temp')).toHaveText('189 / 200 °C');
  await expect(card.locator('.hb-stepper')).toHaveCount(1);
  // Meta line under the title: one line, no dangling separators.
  await expect(page.getByTestId('recipes-fryer-meta')).toHaveText(
    'Fritéza · Demo hranolky · Zaplnění 3/7',
  );
  // Hierarchy: Pozastavit is the primary, Zastavit a quiet secondary after it.
  await expect(page.getByTestId('recipes-fryer-pause')).toHaveAttribute('data-variant', 'primary');
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

test('Recepty na desktopu: karta fritézy má výšku a akce hned pod obsahem', async ({ page }) => {
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
      stopRight: r('[data-testid="recipes-fryer-stop"]').right - c.left,
      ring: r('[data-testid="recipes-fryer-ring"]').right <= r('.rc-fl-head').left,
    };
  });
  expect(geo.h).toBeGreaterThanOrEqual(240);
  expect(geo.w).toBeLessThanOrEqual(880);
  expect(geo.gap).toBeLessThan(32);
  expect(geo.stopRight).toBeLessThanOrEqual(880);
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
