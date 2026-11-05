import { expect, test, type Page } from '@playwright/test';

test('obrazovka Energie na mockových datech', async ({ page }, testInfo) => {
  await page.goto('/homebrain-energie');
  await expect(page.getByRole('heading', { name: 'Energie', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByTestId('energy-price')).toBeVisible();
  await expect(page.getByTestId('energy-cheap-today')).toContainText('13–15 h');
  await expect(page.getByTestId('energy-flow')).toContainText('Baterie');
  await expect(page.getByTestId('energy-7d').locator('.en-bar-day')).toHaveCount(7);
  await expect(page.getByTestId('energy-24h').locator('polyline')).toHaveCount(2);
  await expect(page.getByRole('button')).toHaveCount(await page.getByRole('button').count());
  // ENE-006: no horizontal page overflow, the price chart scrolls inside its card.
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await testInfo.attach(`energie-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('nedostupná data Energie', async ({ page }) => {
  await page.goto('/homebrain-energie?energy=unavailable');
  await expect(page.getByText('Nedostupné').first()).toBeVisible();
  await expect(page.getByTestId('energy-flow-pv')).toContainText('–');
});

test('vybitá baterie v noci', async ({ page }) => {
  await page.goto('/homebrain-energie?energy=night');
  await expect(page.getByTestId('energy-signals')).toContainText('Baterie 9 %');
});

test('karta Spotřebiče a dokončená myčka', async ({ page }) => {
  await page.goto('/homebrain-energie?dishwasher=finished');
  const card = page.getByTestId('energy-appliances');
  await expect(card).toBeVisible();
  await expect(card.getByRole('listitem')).toHaveCount(4);
  await expect(page.getByTestId('energy-appliance-heat_pump')).toContainText('Běží');
  await expect(page.getByTestId('energy-appliance-heat_pump')).toContainText('% domu');
  await expect(page.getByTestId('energy-appliance-dishwasher')).toContainText('Dokončeno');
  await expect(page.getByTestId('energy-appliance-coffee_maker')).toContainText('Pohotovost');
  await expect(page.getByTestId('energy-signals')).toContainText('Myčka dokončila');
  // Read-only: the card offers no controls for the appliance switches.
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(card.getByRole('switch')).toHaveCount(0);
});

test.describe('Doporučení', () => {
  test('poledne: přebytek se zahodí, myčka teď, střídač a předpověď FVE', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
    await page.goto('/homebrain-energie?dishwasher=idle');
    const card = page.getByTestId('energy-advice');
    await expect(card).toBeVisible();
    await expect(card.locator('.en-adv-item')).toHaveCount(3);
    await expect(page.getByTestId('energy-inverter')).toContainText('Normální');
    await expect(page.getByTestId('energy-pv-forecast')).toContainText('FVE dnes');
    await expect(page.getByTestId('energy-curtailment')).toContainText('Bez akce se zahodí');
    const dishwasher = page.getByTestId('energy-advice-dishwasher');
    await expect(dishwasher).toHaveAttribute('data-urgent', 'true');
    // shared reason shown once at card level
    await expect(page.getByTestId('energy-advice-shared')).toContainText(
      'Jinak se přebytek zahodí',
    );
    await expect(page.getByTestId('energy-advice-heat_pump')).toContainText('informativně');
    await expect(page.getByTestId('energy-advice-basis')).toContainText('sklon panelů 35° (odhad)');
    await expect(page.getByTestId('energy-advice-basis')).toContainText('nic nezapíná');
    expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  });

  test('večer bez FVE: okno podle ceny a tichých hodin', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-02T19:00:00+02:00'));
    await page.goto('/homebrain-energie?pv=unconfigured');
    await expect(page.getByTestId('energy-advice-basis')).toContainText('Předpověď FVE chybí');
    const dishwasher = page.getByTestId('energy-advice-dishwasher');
    await expect(dishwasher).toHaveAttribute('data-status', 'ok');
    await expect(dishwasher).toContainText('Kč/kWh');
  });

  test('nedostatek dat', async ({ page }) => {
    await page.goto('/homebrain-energie?energy=nodata&pv=unconfigured');
    const card = page.getByTestId('energy-advice');
    await expect(card.locator('[data-status="insufficient"]')).toHaveCount(3);
    await expect(page.getByTestId('energy-advice-dishwasher')).toContainText('Nedostatek dat');
    await expect(page.getByTestId('energy-advice-dishwasher')).toContainText('Chybí: spotové ceny');
  });
});

/** Physical links each source → destination pair passes (mirror of PAIR_LINKS in flow.ts). */
const PAIR_LINKS: Record<string, string[]> = {
  'pv-house': ['pv-hub', 'hub-ac', 'ac-house'],
  'pv-battery': ['pv-hub', 'battery-hub'],
  'pv-grid': ['pv-hub', 'hub-ac', 'grid-ac'],
  'grid-house': ['grid-ac', 'ac-house'],
  'grid-battery': ['grid-ac', 'hub-ac', 'battery-hub'],
  'battery-house': ['battery-hub', 'hub-ac', 'ac-house'],
  'battery-grid': ['battery-hub', 'hub-ac', 'grid-ac'],
};
const kw = (t: string | null) => Number((t ?? '').replace(/[^\d,]/g, '').replace(',', '.'));

/**
 * Review 003 model: no number on a line. Every node text line must keep clear of the drawn lanes,
 * the arrowheads and the other node texts; text stays inside the diagram stage.
 */
async function textOverLanes(page: Page) {
  return page.getByTestId('energy-flow').evaluate((root) => {
    const stage = root.querySelector('.ef-stage')!.getBoundingClientRect();
    const pts: { x: number; y: number; hw: number }[] = [];
    for (const p of Array.from(root.querySelectorAll<SVGPathElement>('.ef-svg path.ef-wire'))) {
      const m = p.getScreenCTM();
      if (!m || !p.getAttribute('d')) continue;
      const hw = ((parseFloat(getComputedStyle(p).strokeWidth) || 2) * Math.abs(m.a)) / 2;
      const len = p.getTotalLength();
      for (let s = 0; s <= len; s += 1.5) {
        const q = p.getPointAtLength(s);
        pts.push({ x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f, hw });
      }
    }
    const chevs = Array.from(root.querySelectorAll('.ef-chev')).map((c) =>
      c.getBoundingClientRect(),
    );
    const lines: { t: string; b: DOMRect; node: string }[] = [];
    const range = document.createRange();
    for (const label of Array.from(root.querySelectorAll<HTMLElement>('.ef-label'))) {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        range.selectNodeContents(n);
        for (const b of Array.from(range.getClientRects()))
          lines.push({ t: n.textContent.trim(), b, node: label.dataset.node ?? '' });
      }
    }
    const out: string[] = [];
    for (const { t, b, node } of lines) {
      if (
        pts.some(
          (q) =>
            q.x > b.left - q.hw &&
            q.x < b.right + q.hw &&
            q.y > b.top - q.hw &&
            q.y < b.bottom + q.hw,
        )
      )
        out.push(`${node} "${t}" × čára`);
      if (
        chevs.some(
          (c) => c.left < b.right && b.left < c.right && c.top < b.bottom && b.top < c.bottom,
        )
      )
        out.push(`${node} "${t}" × šipka`);
      if (b.bottom > stage.bottom + 0.5 || b.right > stage.right + 0.5 || b.left < stage.left - 0.5)
        out.push(`${node} "${t}" mimo diagram`);
    }
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        const [a, c] = [lines[i]!, lines[j]!];
        if (a.node === c.node) continue;
        if (
          a.b.left < c.b.right - 1 &&
          c.b.left < a.b.right - 1 &&
          a.b.top < c.b.bottom - 1 &&
          c.b.top < a.b.bottom - 1
        )
          out.push(`${a.node} "${a.t}" × ${c.node} "${c.t}"`);
      }
    return out;
  });
}

test.describe('Hero: piktogramový diagram toků', () => {
  const scenarios = [
    {
      flow: 'noon',
      at: '2026-06-02T13:00:00+02:00',
      consumers: ['dishwasher', 'heat_pump'],
      flows: ['pv-house', 'pv-grid', 'pv-battery'],
    },
    {
      flow: 'evening',
      at: '2026-06-02T19:30:00+02:00',
      consumers: ['coffee_maker'],
      flows: ['pv-house', 'battery-house'],
    },
    {
      flow: 'night',
      at: '2026-06-02T02:00:00+02:00',
      consumers: [],
      flows: ['grid-house'],
    },
    {
      flow: 'nightcharge',
      at: '2026-06-02T02:30:00+02:00',
      consumers: [],
      flows: ['grid-house', 'grid-battery'],
    },
    {
      // L1 imports 0.8 kW while L2 + L3 export 2.1 kW: both grid directions at once.
      flow: 'mixed',
      at: '2026-06-02T13:00:00+02:00',
      consumers: ['coffee_maker'],
      flows: ['pv-house', 'pv-grid', 'grid-house', 'pv-battery'],
    },
  ] as const;
  for (const sc of scenarios)
    test(`scénář ${sc.flow}: toky podle zdroje, šipky na každém úseku, čísla jen u uzlů`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date(sc.at));
      await page.goto(`/homebrain-energie?flow=${sc.flow}`);
      const hero = page.getByTestId('energy-flow');
      await expect(hero).toBeVisible();
      // One route per source → destination pair; idle pairs are not drawn at all.
      const flows = await hero
        .locator('g[data-testid^="energy-flow-edge-"]')
        .evaluateAll((els) =>
          els
            .map((el) => el.getAttribute('data-testid')!.slice(17))
            .filter((id) => /^(pv|grid|battery)-/.test(id)),
        );
      expect([...flows].sort()).toEqual([...sc.flows].sort());
      // No number sits on a line any more: no value pills, no text inside the SVG.
      await expect(hero.locator('.ef-pill, [data-testid$="-value"]')).toHaveCount(0);
      expect(await hero.locator('.ef-svg text').count()).toBe(0);
      // Direction without motion: an arrowhead on every link each active flow passes.
      for (const id of sc.flows)
        for (const link of PAIR_LINKS[id]!)
          expect(
            await hero.locator(`.ef-chev[data-link="${link}"]`).count(),
            `${id} · ${link}`,
          ).toBeGreaterThan(0);
      // Colour = source: arrows on the sun → inverter cable are all sun-coloured, and the sun
      // feeds the inverter by ONE line whatever it supplies.
      if (sc.flows.some((id) => id.startsWith('pv-')))
        await expect(hero.locator('.ef-chev[data-link="pv-hub"]')).toHaveCount(1);
      const ids = await hero
        .locator('[data-testid^="energy-flow-consumer-"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.slice(21)));
      expect(ids).toEqual([...sc.consumers]);
      if (!sc.consumers.length)
        await expect(page.getByTestId('energy-flow-consumers')).toContainText(
          'Žádný velký spotřebič neběží',
        );
      if (sc.flow === 'noon') {
        // Strings are text at the sun node, not extra lines.
        await expect(page.getByTestId('energy-flow-pv')).toContainText('FV1');
        await expect(page.getByTestId('energy-flow-house-sources')).toContainText('ze slunce');
        // Lanes of one source move in step (same dot period on the shared cable).
        const period = async (id: string) =>
          Number(await page.getByTestId(`energy-flow-edge-${id}`).getAttribute('data-period'));
        expect(await period('pv-house')).toBe(await period('pv-grid'));
      }
      if (sc.flow === 'mixed') {
        // Values live at the nodes, with the source colour rows.
        const house = page.getByTestId('energy-flow-house-sources');
        await expect(house).toContainText('ze slunce 1,5 kW');
        await expect(house).toContainText('ze sítě 0,8 kW');
        const grid = page.getByTestId('energy-flow-grid');
        await expect(grid).toContainText('1,3 kW do sítě');
        await expect(grid).toContainText('odběr 0,8 kW');
        await expect(grid).toContainText('dodávka 2,1 kW');
        await expect(page.getByTestId('energy-flow-grid-sources')).toContainText('ze slunce 2,1');
      }
      expect(await textOverLanes(page)).toEqual([]);
      expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    });

  test('klepnutí na uzel otevře detail, Escape zavře', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
    await page.goto('/homebrain-energie?flow=noon');
    await page.getByTestId('energy-flow-node-pv').click();
    const sheet = page.getByTestId('energy-flow-sheet');
    await expect(sheet).toContainText('String FV1');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('prefers-reduced-motion: žádné běžící animace toků', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
    await page.goto('/homebrain-energie?flow=noon');
    await expect(page.getByTestId('energy-flow-consumer-dishwasher')).toBeVisible();
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              (a.effect as KeyframeEffect | null)?.target instanceof Element &&
              ((a.effect as KeyframeEffect).target as Element).closest('.ef-hero'),
          ).length,
    );
    expect(running).toBe(0);
    // Direction stays readable without motion.
    expect(await page.locator('.ef-chev').count()).toBeGreaterThan(0);
    await ctx.close();
  });
});

test.describe('Fáze: tři fáze, nesymetrie a saldování', () => {
  const at = '2026-06-02T18:30:00+02:00';

  test('vyrovnané fáze', async ({ page }) => {
    await page.clock.setFixedTime(new Date(at));
    await page.goto('/homebrain-energie?flow=balanced');
    const ph = page.getByTestId('energy-phases');
    await expect(ph).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('energy-phases-state')).toHaveText('vyrovnané');
    await expect(ph).toContainText('jistič 3×25 A');
    await expect(page.getByTestId('energy-phases-saldo')).toHaveCount(0);
    for (const i of [1, 2, 3])
      await expect(page.getByTestId(`energy-phase-l${i}`)).toHaveAttribute('data-dir', 'in');
  });

  test('tepelné čerpadlo na L1: vysoká nesymetrie, detail s historií', async ({ page }) => {
    await page.clock.setFixedTime(new Date(at));
    await page.goto('/homebrain-energie?flow=asym');
    const ph = page.getByTestId('energy-phases');
    await expect(ph).toHaveAttribute('data-state', 'warn');
    await expect(ph).toContainText('18 A rozdíl fází');
    // 4,42 kW ≈ 19 A = 77 % of 3×25 A: below the 80 % mark, the warning comes from the 18 A spread.
    await expect(page.getByTestId('energy-phase-l1')).not.toHaveAttribute('data-hot', /.*/);
    await expect(page.getByTestId('energy-phases-hint')).toContainText('rezerva 6 A');
    await expect(page.getByTestId('energy-phases-hint')).toContainText('Tepelné čerpadlo táhne L1');
    await expect(page.getByTestId('energy-flow-grid-dir')).toHaveAttribute('data-dir', 'in');
    await ph.click();
    await expect(page.getByTestId('energy-phases-sheet')).toBeVisible();
    await expect(page.locator('.ef-spark')).toHaveCount(3);
    await expect(page.getByTestId('energy-phases-stats')).toContainText('Rozdíl nad 16 A');
    await expect(page.getByTestId('energy-phases-sheet')).toContainText('nejspíš L1');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('energy-phases-sheet')).toHaveCount(0);
  });

  test('L1 odebírá, L2 + L3 dodávají: saldování elektroměru', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
    await page.goto('/homebrain-energie?flow=mixed');
    await expect(page.getByTestId('energy-phases-saldo')).toContainText(
      'L1 odebírá 0,8 kW, L2 + L3 dodávají 2,1 kW → elektroměr počítá dodávku 1,3 kW',
    );
    await expect(page.getByTestId('energy-phase-l1')).toHaveAttribute('data-dir', 'in');
    await expect(page.getByTestId('energy-phase-l2')).toHaveAttribute('data-dir', 'out');
    await expect(page.getByTestId('energy-flow-grid-dir')).toHaveAttribute('data-dir', 'out');
  });
});

test.describe('Hero: text u uzlů mimo čáry (telefon a tablet)', () => {
  for (const width of [360, 820])
    for (const flow of ['morning', 'mixed', 'noon', 'nightcharge'] as const)
      test(`${width} px, scénář ${flow}: žádný text přes čáry, šipky ani jiný uzel`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.clock.setFixedTime(new Date('2026-06-02T09:21:00+02:00'));
        await page.goto(`/homebrain-energie?flow=${flow}`);
        const hero = page.getByTestId('energy-flow');
        await expect(hero.locator('.ef-chev').first()).toBeVisible();
        expect(await textOverLanes(page)).toEqual([]);
        // Node texts end above the phase strip.
        const stage = await hero.locator('.ef-stage').boundingBox();
        const phases = await page.getByTestId('energy-phases').boundingBox();
        expect(stage!.y + stage!.height).toBeLessThanOrEqual(phases!.y + 1);
        if (flow === 'morning') {
          // Prod rc.13: the house lists both sources with their power.
          const house = page.getByTestId('energy-flow-house-sources');
          await expect(house).toContainText('ze slunce 0,5 kW');
          await expect(house).toContainText('ze sítě 2,7 kW');
        }
      });

  test('820 px: inverter lanes leave the board at one height towards grid and house', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
    await page.goto('/homebrain-energie?flow=mixed');
    const hero = page.getByTestId('energy-flow');
    await expect(hero.locator('.ef-chev').first()).toBeVisible();
    const y = async (sel: string) => {
      const b = await hero.locator(sel).boundingBox();
      return b!.y + b!.height / 2;
    };
    // Sun → grid (left of the board) and sun → house (right of it) share one row.
    expect(
      Math.abs(
        (await y('.ef-chev[data-link="grid-ac"][data-testid$="-pv-grid"]')) -
          (await y('.ef-chev[data-link="ac-house"][data-testid$="-pv-house"]')),
      ),
    ).toBeLessThan(1);
  });
});

test.describe('Hero: rozvaděč a sedící čísla (mobil 360 px)', () => {
  for (const flow of ['cloudy', 'nightcharge'] as const)
    test(`scénář ${flow}: toky přes rozvaděč, součty u uzlů sedí`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.clock.setFixedTime(
        new Date(flow === 'cloudy' ? '2026-06-02T14:06:00+02:00' : '2026-06-02T23:40:00+02:00'),
      );
      await page.goto(`/homebrain-energie?flow=${flow}`);
      const hero = page.getByTestId('energy-flow');
      await expect(hero.locator('.ef-chev').first()).toBeVisible();
      const geo = await hero.evaluate((root) => {
        const board = root.querySelector('[data-testid="energy-flow-board"]') as SVGRectElement;
        const half = board.width.baseVal.value / 2;
        const J = { x: board.x.baseVal.value + half, y: board.y.baseVal.value + half };
        // Closest approach of every drawn flow to the board centre (diagram units).
        const near: Record<string, number> = {};
        for (const g of Array.from(root.querySelectorAll('g.ef-edge'))) {
          const path = g.querySelector('path.ef-wire') as SVGPathElement;
          const len = path.getTotalLength();
          let best = Infinity;
          for (let s = 0; s <= len; s += 0.5) {
            const p = path.getPointAtLength(s);
            best = Math.min(best, Math.hypot(p.x - J.x, p.y - J.y));
          }
          near[g.getAttribute('data-testid')!.replace('energy-flow-edge-', '')] = best;
        }
        return { near, half };
      });
      // Every flow passes over the AC board.
      for (const id of Object.keys(geo.near)) expect(geo.near[id], id).toBeLessThan(geo.half * 1.5);
      const val = async (id: string) =>
        kw(await page.locator(`[data-testid="${id}"] .ef-val`).first().textContent());
      const src = async (node: string, source: string) =>
        kw(
          await page
            .getByTestId(`energy-flow-${node}-sources`)
            .locator(`[data-source="${source}"]`)
            .textContent(),
        );
      if (flow === 'cloudy') {
        // Prod 14:06: the grid node and the house's "ze sítě" row show the same number.
        expect(await val('energy-flow-grid')).toBe(await src('house', 'grid'));
        expect(await val('energy-flow-pv')).toBe(await src('house', 'pv'));
        expect(await val('energy-flow-house')).toBeCloseTo(
          (await src('house', 'pv')) + (await src('house', 'grid')),
          5,
        );
        await expect(page.getByTestId('energy-flow-pv')).toContainText('FV1 0,2 kW');
        await expect(page.getByTestId('energy-flow-own')).toContainText('30 %');
      } else {
        // Night charging: grid → board → inverter → battery, plus grid → house.
        expect(geo.near['grid-battery']).toBeLessThan(geo.half * 1.5);
        expect(await val('energy-flow-grid')).toBeCloseTo(
          (await val('energy-flow-house')) + (await val('energy-flow-battery')),
          5,
        );
        await expect(page.getByTestId('energy-flow-battery-sources')).toContainText('ze sítě');
      }
    });
  for (const width of [320, 360])
    test(`noční nabíjení ${width} px: popisky se vejdou, baterie vlevo od vedení střídač ↕ rozvaděč`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.clock.setFixedTime(new Date('2026-06-02T23:40:00+02:00'));
      await page.goto('/homebrain-energie?flow=nightcharge');
      const hero = page.getByTestId('energy-flow');
      await expect(hero.locator('.ef-chev').first()).toBeVisible();
      await expect(page.getByTestId('energy-flow-battery')).toContainText('nabíjí');
      const m = await hero.evaluate((root) => {
        const r = root.getBoundingClientRect();
        const out: string[] = [];
        for (const el of Array.from(root.querySelectorAll('.ef-label *'))) {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && (b.right > r.right + 0.5 || b.left < r.left - 0.5))
            out.push(el.textContent ?? '');
        }
        const lane = root.querySelector('.ef-chev[data-link="hub-ac"]')!.getBoundingClientRect();
        const bat = root
          .querySelector('[data-testid="energy-flow-battery"]')!
          .getBoundingClientRect();
        return { out, batClear: lane.left - bat.right };
      });
      expect(m.out).toEqual([]);
      // The battery label (incl. its temperature chip) stays left of the inverter ↕ board lane.
      expect(m.batClear).toBeGreaterThan(4);
    });
  for (const flow of ['noon', 'mixed', 'morning', 'nightcharge'])
    test(`320 px světlé téma (${flow}): popisky a teploty se nepřekrývají, nečinný vodič je čitelný`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
      await page.goto(`/homebrain-energie?flow=${flow}&theme=light`);
      const hero = page.getByTestId('energy-flow');
      await expect(hero.locator('.ef-chev').first()).toBeVisible();
      expect(await textOverLanes(page)).toEqual([]);
      const m = await hero.evaluate((root) => {
        const r = root.getBoundingClientRect();
        const issues: string[] = [];
        const boxes = Array.from(root.querySelectorAll('.ef-label > *'))
          .map((el) => ({ el, b: el.getBoundingClientRect(), t: (el.textContent ?? '').trim() }))
          .filter((x) => x.b.width > 0);
        for (const x of Array.from(root.querySelectorAll('.ef-label *'))) {
          const b = x.getBoundingClientRect();
          if (b.width > 0 && (b.right > r.right + 0.5 || b.left < r.left - 0.5))
            issues.push(`out: ${x.textContent}`);
        }
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!.b;
            const c = boxes[j]!.b;
            if (
              a.left < c.right - 1 &&
              c.left < a.right - 1 &&
              a.top < c.bottom - 1 &&
              c.top < a.bottom - 1
            )
              issues.push(`overlap: ${boxes[i]!.t} | ${boxes[j]!.t}`);
          }
        // Node texts keep 2 px clear of the AC board plate.
        const board = root
          .querySelector('[data-testid="energy-flow-board"]')!
          .getBoundingClientRect();
        for (const x of boxes)
          if (
            x.b.left < board.right + 2 &&
            board.left < x.b.right + 2 &&
            x.b.top < board.bottom + 2 &&
            board.top < x.b.bottom + 2
          )
            issues.push(`board: ${x.t}`);
        // Temperature chips are the catalog Pill.
        const temps = Array.from(root.querySelectorAll('[data-testid$="-temp"]'));
        const notPill = temps.filter((t) => !t.classList.contains('hb-pill')).length;
        // Contrast of the idle cable against the card (opaque colour expected in light).
        const rail = root.querySelector('[data-testid="energy-flow-rails"]');
        const cs = rail ? getComputedStyle(rail) : null;
        let bg = 'rgb(255, 255, 255)';
        for (let e: Element | null = root; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
            bg = c;
            break;
          }
        }
        return { issues, notPill, stroke: cs?.stroke ?? null, op: cs?.strokeOpacity ?? null, bg };
      });
      expect(m.issues).toEqual([]);
      expect(m.notPill).toBe(0);
      // Noon / mixed: every cable carries something, so no idle rail is drawn.
      if (flow === 'noon' || flow === 'mixed') {
        expect(m.stroke).toBeNull();
        return;
      }
      expect(m.stroke).not.toBeNull();
      // color-mix() computes to `color(srgb r g b)` (0–1), plain colours to rgb() (0–255).
      const rgb = (s: string) =>
        (s.match(/[\d.]+/g) ?? [])
          .slice(0, 3)
          .map((v) => Number(v) * (s.startsWith('color(') ? 255 : 1));
      const lum = (c: number[]) => {
        const [R, G, B] = c.map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
      };
      const [l1, l2] = [lum(rgb(m.stroke!)), lum(rgb(m.bg))].sort((a, b) => b - a);
      expect(Number(m.op)).toBe(1);
      expect((l1! + 0.05) / (l2! + 0.05)).toBeGreaterThanOrEqual(3);
    });
});
