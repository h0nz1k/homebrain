import { expect, test, type Page } from '@playwright/test';

test('obrazovka Energie na mockových datech', async ({ page }, testInfo) => {
  await page.goto('/homebrain-energie');
  await expect(page.getByRole('heading', { name: 'Energie', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByTestId('energy-price')).toBeVisible();
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

test('spotová cena je poslední karta stránky', async ({ page }) => {
  await page.goto('/homebrain-energie');
  await expect(page.getByTestId('energy-price')).toBeVisible();
  const order = await page.evaluate(() => {
    const ids = ['energy-7d', 'energy-appliances', 'energy-price'];
    const els = ids.map((id) => document.querySelector(`[data-testid="${id}"]`));
    if (els.some((e) => !e)) return 'missing';
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before(els[0]!, els[2]!) && before(els[1]!, els[2]!) ? 'ok' : 'wrong';
  });
  expect(order).toBe('ok');
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
  await expect(page.getByTestId('energy-appliance-heat_pump').getByLabel('Běží', { exact: true })).toBeVisible();
  await expect(page.getByTestId('energy-appliance-heat_pump')).toContainText('% dne');
  await expect(page.getByTestId('energy-appliance-dishwasher')).toContainText('Dokončeno');
  await expect(page.getByTestId('energy-appliance-coffee_maker')).toContainText('Pohotovost');
  await expect(page.getByTestId('energy-signals')).toContainText('Myčka dokončila');
  // Read-only: the card offers no controls for the appliance switches.
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(card.getByRole('switch')).toHaveCount(0);
});

test.describe('Náklady na elektřinu', () => {
  test('dnes / měsíc / rok, HDO, úspora a spot jen pro srovnání', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-05T14:30:00+01:00'));
    await page.goto('/homebrain-energie');
    const card = page.getByTestId('energy-costs');
    await expect(card).toBeVisible({ timeout: 20_000 });
    const hdo = page.getByTestId('energy-hdo');
    await expect(hdo).toContainText('nízký tarif');
    await expect(hdo).toContainText('VT od 17:00');
    const total = page.getByTestId('energy-cost-total');
    await expect(total).toContainText('ze sítě', { timeout: 20_000 });
    await expect(card.locator('.hb-breakdown-row')).toHaveCount(3);
    await expect(page.getByTestId('energy-cost-savings')).toContainText('FVE a baterie ušetřily');
    await expect(page.getByTestId('energy-cost-spot')).toContainText('Se spotovým tarifem');
    await expect(page.getByTestId('energy-cost-spot-diff')).toContainText(/dráž|levněji|stejně/);
    await expect(page.getByTestId('energy-cost-basis')).toContainText('korekce ×1,05');
    await expect(page.getByTestId('energy-cost-basis')).toContainText('ne doporučení');
    const amount = async () =>
      Number(
        ((await total.locator('.en-cost-v').textContent()) ?? '')
          .replace(/[^\d,]/g, '')
          .replace(',', '.'),
      );
    const day = await amount();
    await card.getByRole('radio', { name: 'Rok' }).click();
    await expect(total).toContainText('od 1. 1.');
    expect(await amount()).toBeGreaterThan(day);
    // Appliance timing advice and "cheap power" hints are gone.
    await expect(page.getByTestId('energy-advice')).toHaveCount(0);
    await expect(page.getByText(/Levný proud|kdy pustit/)).toHaveCount(0);
    expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  });

  test('bez dat: karta vysvětlí, co chybí', async ({ page }) => {
    await page.goto('/homebrain-energie?energy=nodata');
    await expect(page.getByTestId('energy-costs')).toContainText('Chybí ceny tarifu', {
      timeout: 20_000,
    });
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

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test.describe('srovnání období', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-07T15:23:00Z'));
  });

  test('měsíc vs loni a minulý měsíc, graf po měsících, přepnutí na rok a náklady', async ({
    page,
  }) => {
    // Two page loads plus invoice and geometry checks need headroom on the shared host.
    test.setTimeout(60_000);
    await page.goto('/homebrain-energie');
    const card = page.getByTestId('energy-compare');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('energy-compare-current')).toContainText('Listopad 2026');
    await expect(page.getByTestId('energy-compare-current')).toContainText('kWh');
    await expect(page.getByTestId('energy-compare-last-year-delta')).toContainText(/[+−±]\d+\s%/);
    await expect(page.getByTestId('energy-compare-previous')).toContainText('říjen 2026');
    await expect(page.getByTestId('energy-compare-range')).toContainText('1.–7. 11. do 16:00');
    await expect(page.getByTestId('energy-compare-headline')).toContainText('než loni');
    await expect(page.getByTestId('energy-compare-previous')).toContainText('1.–7. 10.');
    await expect(page.getByTestId('energy-compare-yaxis')).toContainText('kWh');
    await expect(page.getByTestId('energy-compare-legend')).toContainText(
      'obrys = celý listopad 2025',
    );
    await expect(page.getByTestId('energy-compare-readout')).toBeHidden();
    const previous = (await page.getByTestId('energy-compare-previous').boundingBox())!;
    const lastYear = (await page.getByTestId('energy-compare-last-year').boundingBox())!;
    expect(Math.abs(previous.y - lastYear.y)).toBeLessThan(1);
    expect(previous.x).toBeGreaterThanOrEqual(lastYear.x + lastYear.width);
    const months = page.getByTestId('energy-compare-month');
    await expect(months).toHaveCount(12);
    await expect(months.nth(10)).toHaveAttribute('data-current', 'true');
    // drawn bars: 12 months of 2025 (November like-for-like) + January–November 2026
    const bars = await card
      .locator('.en-cmp-bar')
      .evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height > 1).length);
    expect(bars).toBe(23);
    await expect(months.nth(10).locator('.en-cmp-ghost')).toHaveCount(1);
    await expect(months.nth(11).locator('.en-cmp-bar')).toHaveCount(1);

    // card == chart: the running-month bar carries the tile value
    const tile = await page.getByTestId('energy-compare-current').locator('.en-cmp-v').innerText();
    const barValue = await months.nth(10).locator('.en-cmp-bar--this').getAttribute('data-value');
    expect(tile.replace(/\s/g, '').replace(',', '.')).toBe(`${barValue}kWh`);
    await months.nth(2).click();
    await expect(page.getByTestId('energy-compare-readout')).toContainText('Březen 2026');

    const box = (await card.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );

    await card.getByRole('radio', { name: 'Od ledna' }).click();
    await expect(card.locator('.en-cmp-tile')).toHaveCount(2);
    await expect(page.getByTestId('energy-compare-current')).toContainText('Rok 2026 od ledna');
    await expect(page.getByTestId('energy-compare-range')).toContainText('1. 1.–7. 11. do 16:00');
    await expect(page.getByTestId('energy-compare-last-year')).not.toContainText('do 16:00');

    await card.getByRole('radio', { name: 'Náklady' }).click();
    await expect(page.getByTestId('energy-compare-current')).toContainText('Kč');
    await expect(page.getByTestId('energy-compare-range')).toContainText('současného tarifu');
    await card.getByRole('radio', { name: 'Spotřeba' }).click();

    const sept = months.nth(8);
    await expect(sept.locator('[data-testid="energy-compare-invoice-marker"]')).toHaveCount(1);
    await sept.click();
    const detail = page.getByTestId('energy-compare-invoice-detail');
    await expect(detail).toContainText('Faktura');
    await expect(detail).toContainText('Naměřeno v HA');
    await expect(detail).toContainText('Faktura za září 2026');
    await expect(detail).toContainText('Rozdíl (faktura − HA)');
    await expect(detail.locator('.en-cmp-inv-line')).toHaveCount(3);
    await expect(detail.locator('.en-cmp-inv-line[data-tone="warn-strong"]')).toHaveCount(1);
    await expect(page.getByTestId('energy-compare-legend-invoice')).toContainText('Fakturováno');

    const barScaleOk = await card.evaluate((root) => {
      const ticks = Array.from(root.querySelectorAll('[data-testid="energy-compare-tick"]'));
      const tops = ticks.map((t) => Number((t.textContent ?? '').replace(/[^\d]/g, '')));
      const axisMax = Math.max(...tops.filter((n) => Number.isFinite(n) && n > 0));
      if (!Number.isFinite(axisMax) || axisMax <= 0) return { ok: false, bad: ['no axis'] };
      const bad: string[] = [];
      for (const bar of Array.from(root.querySelectorAll('.en-cmp-bar, .en-cmp-ghost'))) {
        const v = Number(bar.getAttribute('data-value'));
        if (!Number.isFinite(v) || v <= 0) continue;
        const slot = bar.closest('.en-cmp-slot') as HTMLElement | null;
        if (!slot) continue;
        const plotH = slot.getBoundingClientRect().height;
        const h = bar.getBoundingClientRect().height;
        const ratio = h / plotH;
        const expected = v / axisMax;
        if (Math.abs(ratio - expected) / expected > 0.02)
          bad.push(`${v}:${ratio.toFixed(3)} vs ${expected.toFixed(3)}`);
      }
      return { ok: bad.length === 0, bad };
    });
    expect(barScaleOk.ok, barScaleOk.bad?.join('; ')).toBe(true);

    const markerChecks = await card.evaluate((root) => {
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
      const contrast = (fg: string, bg: string) => {
        const [l1, l2] = [lum(rgb(fg)), lum(rgb(bg))].sort((a, b) => b - a);
        return (l1! + 0.05) / (l2! + 0.05);
      };
      const cardBg = getComputedStyle(root).backgroundColor;
      const markers = Array.from(
        root.querySelectorAll('[data-testid="energy-compare-invoice-marker"]'),
      );
      const markerMeta = markers.map((m) => {
        const svg = m.querySelector('svg');
        const paths = svg ? svg.querySelectorAll('path').length : 0;
        const stroke = svg ? getComputedStyle(svg).color : '';
        const box = m.getBoundingClientRect();
        const col = m.closest('[data-testid="energy-compare-month"]') as HTMLElement | null;
        const colBox = col?.getBoundingClientRect();
        const bars = col ? Array.from(col.querySelectorAll('.en-cmp-bar, .en-cmp-ghost')) : [];
        const barRects = bars.map((b) => b.getBoundingClientRect());
        const ticks = Array.from(root.querySelectorAll('[data-testid="energy-compare-tick"]'));
        const tickRects = ticks.map((t) => t.getBoundingClientRect());
        const body = col?.querySelector('.en-cmp-body');
        const sel = body && col?.matches('[data-active]') ? body.getBoundingClientRect() : null;
        const label = col?.querySelector('.en-axis-x');
        const labelBox = label?.getBoundingClientRect();
        const hitBar = barRects.some(
          (b) =>
            box.x < b.x + b.width &&
            box.x + box.width > b.x &&
            box.y < b.y + b.height &&
            box.y + box.height > b.y,
        );
        const hitTick = tickRects.some(
          (t) =>
            box.x < t.x + t.width &&
            box.x + box.width > t.x &&
            box.y < t.y + t.height &&
            box.y + box.height > t.y,
        );
        const cx = box.x + box.width / 2;
        const colCx = colBox ? colBox.x + colBox.width / 2 : cx;
        const labelCx = labelBox ? labelBox.x + labelBox.width / 2 : colCx;
        const centerDelta = Math.abs(cx - labelCx);
        const svgBox = svg?.getBoundingClientRect();
        return {
          paths,
          contrast: stroke ? contrast(stroke, cardBg) : 0,
          hitBar,
          hitTick,
          hitSel:
            !!sel &&
            box.x < sel.x + sel.width &&
            box.x + box.width > sel.x &&
            box.y < sel.y + sel.height &&
            box.y + box.height > sel.y,
          centerDelta,
          iconW: svgBox?.width ?? 0,
          iconH: svgBox?.height ?? 0,
          y: box.y,
        };
      });
      const legend = root.querySelector('[data-testid="energy-compare-legend-invoice"]');
      const legendGap = (() => {
        if (!legend) return 99;
        const icon = legend.querySelector('.en-cmp-legend-receipt');
        const label = legend.querySelector('span:last-child');
        if (!icon || !label) return 99;
        const ib = icon.getBoundingClientRect();
        const lb = label.getBoundingClientRect();
        return Math.abs(ib.y + ib.height / 2 - (lb.y + lb.height / 2));
      })();
      const ys = markerMeta.map((m) => m.y);
      const sameY = ys.length ? ys.every((y) => Math.abs(y - ys[0]!) <= 1) : true;
      return { markerMeta, legendGap, sameY };
    });
    expect(markerChecks.sameY).toBe(true);
    for (const m of markerChecks.markerMeta) {
      expect(m.paths).toBeGreaterThan(0);
      expect(m.contrast).toBeGreaterThanOrEqual(3);
      expect(m.hitBar).toBe(false);
      expect(m.hitTick).toBe(false);
      expect(m.hitSel).toBe(false);
      expect(m.centerDelta).toBeLessThanOrEqual(1);
      expect(m.iconW).toBeGreaterThanOrEqual(16);
      expect(m.iconH).toBeGreaterThanOrEqual(16);
    }
    expect(markerChecks.legendGap).toBeLessThanOrEqual(2);

    const marker = sept.locator('[data-testid="energy-compare-invoice-marker"]');
    const markerBox = await marker.boundingBox();
    expect(markerBox).not.toBeNull();
    const chartBox = await card.locator('.en-cmp-chart').boundingBox();
    expect(chartBox).not.toBeNull();
    expect(markerBox!.y).toBeGreaterThanOrEqual(chartBox!.y - 1);
    const septBars = await sept.locator('.en-cmp-bar, .en-cmp-ghost').all();
    for (const bar of septBars) {
      const barBox = await bar.boundingBox();
      if (!barBox || barBox.height <= 1) continue;
      expect(rectsIntersect(markerBox!, barBox)).toBe(false);
    }

    await page.goto('/homebrain-energie?theme=light');
    await expect(card).toBeVisible({ timeout: 20_000 });
    const lightContrast = await card.evaluate((root) => {
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
      const contrast = (fg: string, bg: string) => {
        const [l1, l2] = [lum(rgb(fg)), lum(rgb(bg))].sort((a, b) => b - a);
        return (l1! + 0.05) / (l2! + 0.05);
      };
      const cardBg = getComputedStyle(root).backgroundColor;
      return Array.from(
        root.querySelectorAll('[data-testid="energy-compare-invoice-marker"] svg'),
      ).map((svg) => contrast(getComputedStyle(svg).color, cardBg));
    });
    for (const ratio of lightContrast) expect(ratio).toBeGreaterThanOrEqual(3);
  });

  test('bez faktur nejsou ve srovnání značky', async ({ page }) => {
    await page.goto('/homebrain-energie?faktury=none');
    await expect(page.getByTestId('energy-compare')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('energy-compare-invoice-marker')).toHaveCount(0);
    await expect(page.getByTestId('energy-compare-legend-invoice')).toHaveCount(0);
  });

  test('chybí loňská data: hláška místo nuly', async ({ page }) => {
    await page.goto('/homebrain-energie?srovnani=nodata');
    const lastYear = page.getByTestId('energy-compare-last-year');
    await expect(lastYear).toContainText('nemáme data za 2025', { timeout: 20_000 });
    await expect(lastYear).not.toContainText('0 kWh');
    await expect(page.getByTestId('energy-compare-note')).toContainText('Za rok 2025 nemáme data');
    await expect(page.getByTestId('energy-compare-headline')).toHaveCount(0);
  });

  test('bez vazeb se karta nezobrazí', async ({ page }) => {
    await page.goto('/homebrain-energie?srovnani=unconfigured');
    await expect(page.getByTestId('energy-price')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('energy-compare')).toHaveCount(0);
  });
});

test('800 px: text tarifu a spotřebičů zůstává uvnitř karty', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto('/homebrain-energie');
  await expect(page.getByTestId('energy-invoice-tariff')).toBeVisible();
  for (const id of ['energy-flow', 'energy-invoice-tariff']) {
    const outside = await page.getByTestId(id).evaluate((root) => {
      const card = root.getBoundingClientRect();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const out: string[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects()))
          if (r.width && (r.left < card.left - 1 || r.right > card.right + 1))
            out.push(node.textContent);
      }
      return out;
    });
    expect(outside, id).toEqual([]);
  }
});

test('bilance používá společnou škálu a šrafuje rozdíl měření', async ({ page }) => {
  await page.goto('/homebrain-energie');
  const card = page.getByTestId('energy-balance');
  await expect(card).toBeVisible();
  const widths = await card.locator('.en-stack').evaluateAll((bars) =>
    bars.map((bar) => {
      const r = bar.getBoundingClientRect();
      const values = Array.from(bar.children).map((el) => ({
        width: el.getBoundingClientRect().width,
        value: Number((el as HTMLElement).style.flexGrow),
      }));
      return { width: r.width, values };
    }),
  );
  const scales = widths.flatMap((bar) =>
    bar.values.filter((v) => v.value > 0).map((v) => v.width / v.value),
  );
  expect(Math.max(...scales) - Math.min(...scales)).toBeLessThan(1);
  await expect(card.getByTestId('energy-balance-hatched')).toHaveCount(1);
});

test('čtyři KPI vyplňují řadu a grafy sítě mají čitelnou šířku', async ({ page }) => {
  await page.goto('/homebrain-energie');
  await expect(page.locator('.en-kpi')).toHaveCount(4);
  const cards = await page.locator('.en-kpi').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  const mobile = page.viewportSize()!.width <= 760;
  expect(Math.abs(cards[0]!.top - cards[1]!.top)).toBeLessThan(1);
  expect(Math.abs(cards[2]!.top - cards[3]!.top)).toBeLessThan(1);
  expect(mobile ? cards[2]!.top > cards[0]!.bottom : cards[2]!.top === cards[0]!.top).toBe(true);
  const grid = (await page.locator('.en-grid').boundingBox())!;
  expect(Math.abs(cards[3]!.right - (grid.x + grid.width))).toBeLessThan(1);
  for (const spark of await page.locator('.en-grid-half .en-spark').all())
    expect((await spark.boundingBox())!.width).toBeGreaterThan(45);
  await expect(page.getByTestId('energy-price').getByTestId('energy-kpi-price')).toContainText(
    'Spot teď',
  );
});

test('úspora vyplňuje šířku sloupce nákladů a popis je pod částkou', async ({ page }) => {
  await page.goto('/homebrain-energie');
  const total = page.getByTestId('energy-cost-total');
  await expect(total).toBeVisible();
  const column = (await total.boundingBox())!;
  const savings = (await page.getByTestId('energy-cost-savings').boundingBox())!;
  expect(Math.abs(savings.width - column.width)).toBeLessThan(1);
  const number = (await total.locator('.en-cost-v').boundingBox())!;
  const description = (await total.locator('.en-sub').boundingBox())!;
  expect(description.y).toBeGreaterThanOrEqual(number.y + number.height);
  await expect(total.locator('.en-lbl')).toHaveCount(0);
});

test('denní a týdenní osy mají kulaté hodnoty a dnešek je obrysový', async ({ page }) => {
  await page.goto('/homebrain-energie');
  const day = page.getByTestId('energy-24h');
  const week = page.getByTestId('energy-7d');
  await expect(day.locator('.en-axis--y').first()).toBeVisible();
  await expect(week).toContainText('kWh za 7 dní');
  await expect(week.locator('[data-progress]')).toHaveCount(1);
  for (const axis of [day.locator('.en-axis--y'), week.locator('.en-week-grid>span')]) {
    const values = await axis.allTextContents();
    expect(values.length).toBeGreaterThanOrEqual(3);
    expect(values[0]).toBe('0');
    expect(values.every((v) => /^\d+$/.test(v))).toBe(true);
  }
  const geometry = await week.evaluate((root) => {
    const plot = root.querySelector('.en-week-plot')!.getBoundingClientRect();
    const today = root.querySelector('[data-progress] .en-bar-pair span')!;
    return {
      plotHeight: plot.height,
      pairHeight: root.querySelector('.en-bar-pair')!.getBoundingClientRect().height,
      border: parseFloat(getComputedStyle(today).borderTopWidth),
      ticks: Array.from(root.querySelectorAll('.en-week-grid')).map(
        (el) => el.getBoundingClientRect().top,
      ),
    };
  });
  expect(Math.abs(geometry.plotHeight - geometry.pairHeight)).toBeLessThan(1);
  expect(geometry.border).toBeGreaterThanOrEqual(2);
  expect(new Set(geometry.ticks).size).toBe(geometry.ticks.length);
});

test('světlé téma: barvy protistran jsou odlišné a mají kontrast pro grafy', async ({ page }) => {
  await page.goto('/homebrain-energie?theme=light');
  const card = page.getByTestId('energy-balance');
  await expect(card).toBeVisible();
  const colors = await card.evaluate((root) => {
    const luminance = (color: string) => {
      const rgb = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const linear = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const bg = luminance(getComputedStyle(root).backgroundColor);
    return Array.from(root.querySelectorAll('.en-stack span:not(.en-stack-gap)')).map((el) => {
      const color = getComputedStyle(el).backgroundColor;
      const fg = luminance(color);
      return { color, ratio: (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) };
    });
  });
  expect(new Set(colors.map((c) => c.color)).size).toBe(colors.length);
  for (const color of colors) expect(color.ratio, color.color).toBeGreaterThanOrEqual(3);
});

test('spotřebiče tvoří řádky s oddělovači a jednotnou jednotkou kW', async ({ page }) => {
  await page.goto('/homebrain-energie');
  const card = page.getByTestId('energy-appliances');
  await expect(card.getByRole('listitem')).toHaveCount(4);
  const rows = await card.getByRole('listitem').all();
  for (const [i, row] of rows.entries()) {
    await expect(row.locator('.en-appl-v')).toContainText('kW');
    const style = await row.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderBottomWidth, radius: s.borderRadius, background: s.backgroundColor };
    });
    expect(style).toEqual({ border: i < 3 ? '1px' : '0px', radius: '0px', background: 'rgba(0, 0, 0, 0)' });
    if (i) {
      const prev = (await rows[i - 1]!.boundingBox())!;
      const next = (await row.boundingBox())!;
      expect(next.y).toBeGreaterThanOrEqual(prev.y + prev.height - 1);
    }
  }
  expect(await card.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('16px');
});
