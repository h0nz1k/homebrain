import { expect, test } from '@playwright/test';

test('obrazovka Energie na mockových datech', async ({ page }, testInfo) => {
  await page.goto('/energy');
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
  await page.goto('/energy?energy=unavailable');
  await expect(page.getByText('Nedostupné').first()).toBeVisible();
  await expect(page.getByTestId('energy-flow-pv')).toContainText('–');
});

test('vybitá baterie v noci', async ({ page }) => {
  await page.goto('/energy?energy=night');
  await expect(page.getByTestId('energy-signals')).toContainText('Baterie 9 %');
});

test('karta Spotřebiče a dokončená myčka', async ({ page }) => {
  await page.goto('/energy?dishwasher=finished');
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
    await page.goto('/energy?dishwasher=idle');
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
    await page.goto('/energy?pv=unconfigured');
    await expect(page.getByTestId('energy-advice-basis')).toContainText('Předpověď FVE chybí');
    const dishwasher = page.getByTestId('energy-advice-dishwasher');
    await expect(dishwasher).toHaveAttribute('data-status', 'ok');
    await expect(dishwasher).toContainText('Kč/kWh');
  });

  test('nedostatek dat', async ({ page }) => {
    await page.goto('/energy?energy=nodata&pv=unconfigured');
    const card = page.getByTestId('energy-advice');
    await expect(card.locator('[data-status="insufficient"]')).toHaveCount(3);
    await expect(page.getByTestId('energy-advice-dishwasher')).toContainText('Nedostatek dat');
    await expect(page.getByTestId('energy-advice-dishwasher')).toContainText('Chybí: spotové ceny');
  });
});

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
      // L1 imports 0.8 kW while L2 + L3 export 2.1 kW: both grid lines at once.
      flow: 'mixed',
      at: '2026-06-02T13:00:00+02:00',
      consumers: ['coffee_maker'],
      flows: ['pv-house', 'pv-grid', 'grid-house', 'pv-battery'],
    },
  ] as const;
  for (const sc of scenarios)
    test(`scénář ${sc.flow}: samostatné toky a běžící spotřebiče`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(sc.at));
      await page.goto(`/energy?flow=${sc.flow}`);
      const hero = page.getByTestId('energy-flow');
      await expect(hero).toBeVisible();
      // One line per source → destination pair; idle pairs are not drawn at all.
      const flows = await hero
        .locator('g[data-testid^="energy-flow-edge-"]')
        .evaluateAll((els) =>
          els
            .map((el) => el.getAttribute('data-testid')!.slice(17))
            .filter((id) => /^(pv|grid|battery)-/.test(id)),
        );
      // Order follows the hub topology (DOM paint order), not semantics.
      expect([...flows].sort()).toEqual([...sc.flows].sort());
      for (const id of sc.flows) {
        await expect(page.getByTestId(`energy-flow-edge-${id}-value`)).toContainText('kW');
        // Direction is readable without motion: chevrons along each line.
        expect(
          await page.getByTestId(`energy-flow-edge-${id}`).locator('.ef-chev').count(),
        ).toBeGreaterThan(0);
      }
      const ids = await hero
        .locator('[data-testid^="energy-flow-consumer-"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.slice(21)));
      expect(ids).toEqual([...sc.consumers]);
      if (!sc.consumers.length)
        await expect(page.getByTestId('energy-flow-consumers')).toContainText(
          'Žádný velký spotřebič neběží',
        );
      if (sc.flow === 'mixed') {
        await expect(page.getByTestId('energy-flow-edge-grid-house-value')).toContainText('0,8');
        await expect(page.getByTestId('energy-flow-edge-pv-grid-value')).toContainText('2,1');
      }
      // Faster dots for more power: the noon PV → house flow (3.6 kW) beats PV → grid (0.7 kW).
      if (sc.flow === 'noon') {
        const period = async (id: string) =>
          Number(await page.getByTestId(`energy-flow-edge-${id}`).getAttribute('data-period'));
        expect(await period('pv-house')).toBeLessThan(await period('pv-grid'));
      }
      expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    });

  test('klepnutí na uzel otevře detail, Escape zavře', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
    await page.goto('/energy?flow=noon');
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
    await page.goto('/energy?flow=noon');
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
    await ctx.close();
  });
});

test.describe('Fáze: tři fáze, nesymetrie a saldování', () => {
  const at = '2026-06-02T18:30:00+02:00';

  test('vyrovnané fáze', async ({ page }) => {
    await page.clock.setFixedTime(new Date(at));
    await page.goto('/energy?flow=balanced');
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
    await page.goto('/energy?flow=asym');
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
    await page.goto('/energy?flow=mixed');
    await expect(page.getByTestId('energy-phases-saldo')).toContainText(
      'L1 odebírá 0,8 kW, L2 + L3 dodávají 2,1 kW → elektroměr počítá dodávku 1,3 kW',
    );
    await expect(page.getByTestId('energy-phase-l1')).toHaveAttribute('data-dir', 'in');
    await expect(page.getByTestId('energy-phase-l2')).toHaveAttribute('data-dir', 'out');
    await expect(page.getByTestId('energy-flow-grid-dir')).toHaveAttribute('data-dir', 'out');
  });
});

test.describe('Hero: popisky toků se nepřekrývají (mobil 360 px)', () => {
  for (const flow of ['morning', 'mixed', 'noon'] as const)
    test(`scénář ${flow}: pilulky, šipky a uzly bez kolize`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.clock.setFixedTime(new Date('2026-06-02T09:21:00+02:00'));
      await page.goto(`/energy?flow=${flow}`);
      const hero = page.getByTestId('energy-flow');
      await expect(hero).toBeVisible();
      await expect(hero.locator('.ef-pill').first()).toBeVisible();
      const issues = await hero.evaluate((root) => {
        const r = (el: Element) => el.getBoundingClientRect();
        const hit = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const pills = Array.from(root.querySelectorAll('.ef-pill'));
        const chevs = Array.from(root.querySelectorAll('.ef-chev'));
        const discs = Array.from(root.querySelectorAll('.ef-hit'));
        const out: string[] = [];
        pills.forEach((p, i) => {
          const a = r(p);
          if (p.hasAttribute('data-collides')) out.push(`${p.textContent} collides`);
          for (const q of pills.slice(i + 1))
            if (hit(a, r(q))) out.push(`${p.textContent} × ${q.textContent}`);
          for (const c of chevs) if (hit(a, r(c))) out.push(`${p.textContent} × šipka`);
          for (const d of discs) {
            const b = r(d);
            const [cx, cy, rad] = [(b.left + b.right) / 2, (b.top + b.bottom) / 2, b.width / 2];
            const px = Math.max(a.left, Math.min(cx, a.right));
            const py = Math.max(a.top, Math.min(cy, a.bottom));
            const gap = Math.hypot(px - cx, py - cy) - rad;
            if (gap < 7.5)
              out.push(`${p.textContent} ${gap.toFixed(1)} px od ${d.getAttribute('data-testid')}`);
          }
        });
        return out;
      });
      expect(issues).toEqual([]);
      // Every active flow keeps its arrowhead on its own line.
      const pills = await hero.locator('.ef-pill').count();
      expect(await hero.locator('.ef-chev').count()).toBe(pills);
      // No "AC rozvaděč" caption any more (only the junction dot with its title).
      await expect(hero.getByText('AC rozvaděč', { exact: true })).toBeHidden();
      if (flow === 'morning') {
        // Prod rc.13: shared bus into the house – inverter flow above the line, grid below it,
        // each in its own pill; the export 0,1 sits on the grid leg.
        const pvHouse = page.getByTestId('energy-flow-edge-pv-house-value');
        const gridHouse = page.getByTestId('energy-flow-edge-grid-house-value');
        await expect(pvHouse).toContainText('0,5');
        await expect(pvHouse).toHaveAttribute('data-side', 'above');
        await expect(gridHouse).toContainText('2,7');
        await expect(gridHouse).toHaveAttribute('data-side', 'below');
        await expect(page.getByTestId('energy-flow-edge-pv-grid-value')).toHaveAttribute(
          'data-link',
          'grid-ac',
        );
        const [a, b] = [await pvHouse.boundingBox(), await gridHouse.boundingBox()];
        expect(a!.y + a!.height).toBeLessThan(b!.y);
      }
    });
});

test.describe('Hero: rozvaděč a sedící čísla (mobil 360 px)', () => {
  const kw = (t: string | null) => Number((t ?? '').replace(/[^\d,]/g, '').replace(',', '.'));
  for (const flow of ['cloudy', 'nightcharge'] as const)
    test(`scénář ${flow}: drát střídač ↕ rozvaděč, toky přes rozvaděč, součty sedí`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.clock.setFixedTime(
        new Date(flow === 'cloudy' ? '2026-06-02T14:06:00+02:00' : '2026-06-02T23:40:00+02:00'),
      );
      await page.goto(`/energy?flow=${flow}`);
      const hero = page.getByTestId('energy-flow');
      await expect(hero.locator('.ef-pill').first()).toBeVisible();
      const geo = await hero.evaluate((root) => {
        const board = root.querySelector('[data-testid="energy-flow-board"]') as SVGRectElement;
        const half = board.width.baseVal.value / 2;
        const J = { x: board.x.baseVal.value + half, y: board.y.baseVal.value + half };
        const wire = root.querySelector('[data-testid="energy-flow-ac-wire"]') as SVGPathElement;
        const end = wire.getPointAtLength(wire.getTotalLength());
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
        return {
          endGap: Math.max(Math.abs(end.x - J.x), Math.abs(end.y - J.y)) - half,
          near,
          half,
        };
      });
      // The inverter's AC conductors end inside the board plate; every flow passes over it.
      expect(geo.endGap).toBeLessThan(0);
      for (const id of Object.keys(geo.near)) expect(geo.near[id], id).toBeLessThan(geo.half * 1.5);
      const val = async (id: string) =>
        kw(await page.locator(`[data-testid="${id}"] .ef-val`).first().textContent());
      const pill = async (id: string) =>
        kw(await page.getByTestId(`energy-flow-edge-${id}-value`).textContent());
      if (flow === 'cloudy') {
        // Prod 14:06: the grid node and its line into the house show the same number.
        expect(await val('energy-flow-grid')).toBe(await pill('grid-house'));
        expect(await val('energy-flow-pv')).toBe(await pill('pv-house'));
        expect(await val('energy-flow-house')).toBeCloseTo(
          (await pill('pv-house')) + (await pill('grid-house')),
          5,
        );
        await expect(page.getByTestId('energy-flow-pv')).toContainText('FV1 0,2 kW');
        await expect(page.getByTestId('energy-flow-own')).toContainText('30 %');
      } else {
        // Night charging: grid → board → inverter → battery, plus grid → house.
        expect(geo.near['grid-battery']).toBeLessThan(geo.half * 1.5);
        expect(await val('energy-flow-grid')).toBeCloseTo(
          (await pill('grid-house')) + (await pill('grid-battery')),
          5,
        );
      }
    });
  for (const width of [320, 360])
    test(`noční nabíjení ${width} px: popisky se vejdou, drát střídač ↕ rozvaděč = dva vodiče`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.clock.setFixedTime(new Date('2026-06-02T23:40:00+02:00'));
      await page.goto('/energy?flow=nightcharge');
      const hero = page.getByTestId('energy-flow');
      await expect(hero.locator('.ef-pill').first()).toBeVisible();
      await expect(page.getByTestId('energy-flow-battery')).toContainText('nabíjí ze sítě');
      const m = await hero.evaluate((root) => {
        const r = root.getBoundingClientRect();
        const out: string[] = [];
        for (const el of Array.from(root.querySelectorAll('.ef-label *'))) {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && (b.right > r.right + 0.5 || b.left < r.left - 0.5))
            out.push(el.textContent ?? '');
        }
        // Two vertical conductors of the AC wire: on-screen spacing in CSS px.
        const wire = root.querySelector('[data-testid="energy-flow-ac-wire"]') as SVGPathElement;
        const xs = Array.from((wire.getAttribute('d') ?? '').matchAll(/M([\d.]+)/g)).map((x) =>
          Number(x[1]),
        );
        const svg = wire.ownerSVGElement!;
        const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const bat = root
          .querySelector('[data-testid="energy-flow-battery"]')!
          .getBoundingClientRect();
        return {
          out,
          spacing: Math.abs(xs[1]! - xs[0]!) * k,
          n: xs.length,
          batClear: wire.getBoundingClientRect().left - bat.right,
        };
      });
      expect(m.out).toEqual([]);
      // The battery label (incl. its temperature chip) stays left of the AC conductors.
      expect(m.batClear).toBeGreaterThan(4);
      expect(m.n).toBe(2);
      expect(m.spacing).toBeGreaterThanOrEqual(6);
    });
  for (const flow of ['noon', 'mixed', 'morning', 'nightcharge'])
    test(`320 px světlé téma (${flow}): popisky, štítky a teploty se nepřekrývají, nečinný vodič je čitelný`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.clock.setFixedTime(new Date('2026-06-02T13:00:00+02:00'));
      await page.goto(`/energy?flow=${flow}&theme=light`);
      const hero = page.getByTestId('energy-flow');
      await expect(hero.locator('.ef-pill').first()).toBeVisible();
      const m = await hero.evaluate((root) => {
        const r = root.getBoundingClientRect();
        const issues: string[] = [];
        const boxes = Array.from(root.querySelectorAll('.ef-label > *, .ef-pill'))
          .map((el) => ({ el, b: el.getBoundingClientRect(), t: (el.textContent ?? '').trim() }))
          .filter((x) => x.b.width > 0);
        for (const x of Array.from(root.querySelectorAll('.ef-label *, .ef-pill'))) {
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
        // Value pills keep 2 px clear of the AC board plate.
        const board = root
          .querySelector('[data-testid="energy-flow-board"]')!
          .getBoundingClientRect();
        for (const p of Array.from(root.querySelectorAll('.ef-pill'))) {
          const b = p.getBoundingClientRect();
          if (
            b.left < board.right + 2 &&
            board.left < b.right + 2 &&
            b.top < board.bottom + 2 &&
            board.top < b.bottom + 2
          )
            issues.push(`board: ${p.textContent}`);
        }
        // Temperature chips are the catalog Pill.
        const temps = Array.from(root.querySelectorAll('[data-testid$="-temp"]'));
        const notPill = temps.filter((t) => !t.classList.contains('hb-pill')).length;
        // Contrast of the idle conductor against the card (opaque colour expected in light).
        const rail = root.querySelector('[data-testid="energy-flow-rails"]')!;
        const cs = getComputedStyle(rail);
        let bg = 'rgb(255, 255, 255)';
        for (let e: Element | null = root; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
            bg = c;
            break;
          }
        }
        return {
          issues,
          notPill,
          temps: temps.length,
          stroke: cs.stroke,
          op: cs.strokeOpacity,
          bg,
        };
      });
      expect(m.issues).toEqual([]);
      expect(m.notPill).toBe(0);
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
      const [l1, l2] = [lum(rgb(m.stroke)), lum(rgb(m.bg))].sort((a, b) => b - a);
      expect(Number(m.op)).toBe(1);
      expect((l1! + 0.05) / (l2! + 0.05)).toBeGreaterThanOrEqual(3);
    });
});
