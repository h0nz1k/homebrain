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

test('pamatuje pokročilé a průchody po reloadu (localStorage / user-data)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/homebrain-roboti');
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  await page.getByRole('radio', { name: 'Pokročilé' }).click();
  await page.getByRole('radio', { name: '2×' }).click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('homebrain.robots.ui');
    return raw?.includes('"advanced":true') && raw.includes('"passes":2');
  });
  await page.reload();
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  await expect(page.getByTestId('robots-level-toggle').getByRole('radio', { name: 'Pokročilé' })).toHaveAttribute(
    'aria-checked',
    'true',
    { timeout: 15_000 },
  );
  await expect(page.getByRole('radio', { name: '2×' })).toHaveAttribute('aria-checked', 'true', {
    timeout: 15_000,
  });
});

const ROOM_GRID_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 800, height: 1280 },
  { width: 1280, height: 800 },
] as const;

async function assertRoomGrid(page: import('@playwright/test').Page) {
  const grid = page.locator('.rb-room-grid').first();
  await expect(grid).toBeVisible();
  const result = await grid.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 1) return { ok: false as const, reason: 'h-scroll' };
    const tiles = Array.from(
      el.querySelectorAll<HTMLElement>('[data-testid^="robots-room-"]'),
    ).filter((t) => t.getBoundingClientRect().width > 0);
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      if (r.right > box.right + 1 || r.left < box.left - 1) return { ok: false as const, reason: 'overflow' };
      const ico = t.querySelector('.rb-room-tile-ico');
      if (ico) {
        const ir = ico.getBoundingClientRect();
        if (ir.width < 24 || ir.height < 24) return { ok: false as const, reason: 'icon' };
      }
    }
    const rows = new Map<number, number[]>();
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      const key = Math.round(r.top);
      const row = rows.get(key) ?? [];
      row.push(r.width);
      rows.set(key, row);
    }
    for (const widths of rows.values()) {
      if (widths.length < 2) continue;
      const min = Math.min(...widths);
      const max = Math.max(...widths);
      if (max - min > 1) return { ok: false as const, reason: 'width-mismatch' };
    }
    return { ok: true as const };
  });
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
}

for (const vp of ROOM_GRID_VIEWPORTS) {
  test(`mřížka místností: stejná šířka dlaždic, bez přetékání (${vp.width}×${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/homebrain-roboti');
    await expect(page.getByTestId('robots-vector-map')).toBeVisible();
    await assertRoomGrid(page);
  });
}

test('ikony místností na dlaždici mají alespoň 24 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/homebrain-roboti');
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  const sizes = await page.locator('.rb-room-grid .rb-room-tile-ico').evaluateAll((nodes) =>
    nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const { w, h } of sizes) {
    expect(w).toBeGreaterThanOrEqual(24);
    expect(h).toBeGreaterThanOrEqual(24);
  }
});

test('ikony pokročilých voleb mají alespoň 20×20 px (telefon)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/homebrain-roboti');
  await expect(page.getByTestId('robots-vector-map')).toBeVisible();
  await page.getByRole('radio', { name: 'Pokročilé' }).click();
  const controls = page.getByTestId('robots-controls');
  await controls.scrollIntoViewIfNeeded();
  const sizes = await controls.locator('.rb-ico-opt').evaluateAll((nodes) =>
    nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const { w, h } of sizes) {
    expect(w).toBeGreaterThanOrEqual(20);
    expect(h).toBeGreaterThanOrEqual(20);
  }
});
