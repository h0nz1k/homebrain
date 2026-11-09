import { expect, test, type Page } from '@playwright/test';

// Topení (dev mock: synthetic heat pump with ground collector, `?topeni=` scenario, `&rooms=`).

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function infiniteAnimations(page: Page) {
  return page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).length,
  );
}

test.describe('Topení', () => {
  test('Teď: věta, animované schéma se zemním kolektorem a čísla', async ({ page }) => {
    await page.goto('/homebrain-topeni?topeni=heating');
    await expect(page.getByTestId('heating-headline')).toContainText('nahříváme nádrž', {
      timeout: 20_000,
    });
    const sch = page.getByTestId('heating-schematic');
    await expect(sch).toHaveAttribute('data-compressor', 'on');
    await expect(sch.locator('[data-pipe-id="collector"][data-active]')).toHaveCount(1);
    await expect(page.getByTestId('heating-sch-collector')).toHaveText('Zemní kolektor');
    // SVG embeds keyframe CSS containing the internal circuit name; audit rendered copy.
    expect(await page.getByTestId('heating-view').innerText()).not.toMatch(
      /Chlazení|solanka|brine|X204|X216/i,
    );
    // The activity sentence leads the card, before secondary numbers and badges.
    const heroOrder = await page.getByTestId('heating-hero').evaluate((el) => {
      const headline = el.querySelector('[data-testid="heating-headline"]')!;
      return (
        headline.getBoundingClientRect().top <
        el.querySelector('.ht-run-meta')!.getBoundingClientRect().top
      );
    });
    expect(heroOrder).toBe(true);
    await expect(sch.locator('[data-pump="charge"]')).toHaveAttribute('data-on', '');
    await expect(sch.locator('[data-pump="primary"]')).toHaveCount(0);
    // circulation pump state is not mapped by the backend (null) → not drawn
    await expect(sch.locator('[data-pump="circulation"]')).toHaveCount(0);
    await expect(page.getByTestId('heating-backup')).toHaveCount(0);
    await expect(page.getByTestId('heating-hdo')).toHaveText('Nízký tarif');
    await expect(page.getByText(/elektrick/i)).toHaveCount(0);
    expect(await infiniteAnimations(page)).toBeGreaterThan(0);
    await noSidewaysScroll(page);
  });

  for (const scenario of ['idle', 'house', 'dhw']) {
    test(`Teď ${scenario}: neověřené údaje skryté, pohyb podle stavu`, async ({ page }) => {
      await page.goto(`/homebrain-topeni?topeni=${scenario}`);
      const sch = page.getByTestId('heating-schematic');
      await expect(sch).toHaveAttribute('data-compressor', scenario === 'dhw' ? 'on' : 'off', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('heating-sch-collector')).toHaveText('Zemní kolektor');
      await expect(page.getByText('Chlazení', { exact: true })).toHaveCount(0);
      await expect(sch.locator('[data-valve]')).toHaveAttribute(
        'data-valve',
        scenario === 'dhw' ? 'dhw' : 'tank',
      );
      if (scenario !== 'dhw') {
        await expect(sch.locator('[data-pipe-id="collector"][data-active]')).toHaveCount(0);
      }
      await expect(sch.locator('[data-pump="charge"]')).toHaveAttribute(
        'aria-label',
        `Čerpadlo nabíjení: ${scenario === 'dhw' ? 'běží' : 'stojí'}`,
      );
      await expect(sch.locator('[data-pump="house"]')).toHaveAttribute(
        'aria-label',
        `Čerpadlo topení: ${scenario === 'house' ? 'běží' : 'stojí'}`,
      );
      await noSidewaysScroll(page);
    });
  }

  test('porucha zastaví proudění; záložní topení regulace nemá, takže se nezmiňuje', async ({
    page,
  }) => {
    await page.goto('/homebrain-topeni?topeni=fault');
    await expect(page.getByTestId('heating-pill')).toContainText('Porucha', { timeout: 20_000 });
    await expect(page.getByTestId('heating-schematic')).toHaveAttribute('data-compressor', 'off');
    await expect(page.getByTestId('heating-backup')).toHaveCount(0);
    await expect(page.getByText(/záložní/i)).toHaveCount(0);
    await page.getByRole('radio', { name: /Poruchy/ }).click();
    await expect(page).toHaveURL(/\/homebrain-topeni\/poruchy/);
    await expect(page.getByTestId('heating-fault').first()).toBeVisible();
    await expect(page.getByText(/záložní/i)).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('Místnosti: referenční chodba a nejchladnější pokoj', async ({ page }) => {
    await page.goto('/homebrain-topeni/mistnosti?topeni=heating&rooms=4');
    await expect(page.getByTestId('heating-room')).toHaveCount(4, { timeout: 20_000 });
    await expect(page.getByTestId('heating-room').first()).toHaveAttribute('data-coldest', '');
    await noSidewaysScroll(page);
  });

  test('Místnosti bez čidel: reference a kompaktní návod v jedné kartě', async ({ page }) => {
    await page.goto('/homebrain-topeni/mistnosti?topeni=heating&rooms=0');
    await expect(page.getByTestId('heating-rooms-empty')).toContainText('Aqara', {
      timeout: 20_000,
    });
    const ref = page.getByTestId('heating-ref-room');
    await expect(ref).toContainText('řídí topení celého domu');
    await expect(ref).toContainText('cíl 22,5');
    await expect(ref.getByTestId('heating-rooms-empty')).toContainText(
      'Nastavení HomeBrain → Moduly → Topení',
    );
    await noSidewaysScroll(page);
  });

  test('Trendy: rozsahy, překryvy, běhy kompresoru a účinnost', async ({ page }) => {
    await page.goto('/homebrain-topeni/trendy?topeni=heating');
    await expect(page.getByTestId('heating-trend')).toBeVisible({ timeout: 20_000 });
    // run lane sits between the plot and the time labels of the same chart
    const lane = await page.getByTestId('heating-trend-chart').evaluate((el) => {
      const r = (s: string) => el.querySelector(s)!.getBoundingClientRect();
      return { plot: r('.ht-chart').bottom, runs: r('.ht-runs').top, labels: r('.ht-xlabs').top };
    });
    expect(lane.runs).toBeGreaterThanOrEqual(lane.plot - 1);
    expect(lane.labels).toBeGreaterThan(lane.runs);
    await page.getByRole('radio', { name: '10 let' }).click();
    await expect(page.getByTestId('heating-trend')).toHaveAttribute('data-range', 'all');
    await expect(page.getByTestId('heating-scatter')).toBeVisible();
    await expect(page.getByTestId('heating-efficiency')).toContainText('2018/19');
    // three point groups, each with its own legend entry and trend line
    await expect(
      page.getByTestId('heating-scatter-legend').locator('span[data-group]'),
    ).toHaveCount(3);
    await expect(page.locator('.ht-fit')).toHaveCount(3);
    await noSidewaysScroll(page);
  });

  test('Sezóny: 10 let a poznámka o druhé budově', async ({ page }) => {
    await page.goto('/homebrain-topeni/sezony?topeni=heating');
    await expect(page.getByTestId('heating-season')).toHaveCount(10, { timeout: 20_000 });
    await expect(
      page.getByText('Medián délky běhu (hodinová data, orientační)', { exact: true }),
    ).toHaveCount(10);
    await expect(page.getByTestId('heating-season-note')).toContainText(
      '2018/19: druhá budova se přestala vytápět',
    );
    await noSidewaysScroll(page);
  });

  test('Režimy: ekviterm s „teď“, programy, jen ke čtení', async ({ page }) => {
    await page.goto('/homebrain-topeni/rezimy?topeni=heating');
    await expect(page.getByTestId('heating-curve-now')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('heating-readonly')).toContainText('Jen pro čtení');
    await expect(page.getByText('Chlazení', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('heating-schedule')).not.toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('nenastaveno a zastaralá data', async ({ page }) => {
    await page.goto('/homebrain-topeni?topeni=unconfigured');
    await expect(page.getByTestId('heating-unconfigured')).toBeVisible({ timeout: 20_000 });
    await page.goto('/homebrain-topeni?topeni=stale');
    await expect(page.getByTestId('heating-stale')).toBeVisible({ timeout: 20_000 });
    expect(await infiniteAnimations(page)).toBe(0);
  });

  for (const width of [360, 390, 412]) {
    for (const [tab, ready] of [
      ['', 'heating-schematic'],
      ['/mistnosti', 'heating-rooms-empty'],
      ['/trendy', 'heating-trend-chart'],
      ['/sezony', 'heating-season'],
      ['/rezimy', 'heating-curve-now'],
      ['/poruchy', 'heating-faults-ok'],
    ] as const) {
      test(`telefon ${width} px ${tab || 'Teď'}: bez vodorovného posunu`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/homebrain-topeni${tab}?topeni=heating&rooms=0`);
        await expect(page.getByTestId(ready).first()).toBeVisible({ timeout: 20_000 });
        await noSidewaysScroll(page);
      });
    }
  }

  for (const theme of ['dark', 'light']) {
    for (const scenario of ['heating', 'dhw', 'house', 'idle']) {
      test(`C3 ${theme} ${scenario}: uzavřená hydraulika, prostor pro text a společná podlaha`, async ({
        page,
      }) => {
        await page.goto(`/homebrain-topeni?topeni=${scenario}&theme=${theme}`);
        const sch = page.getByTestId('heating-schematic');
        await expect(sch).toBeVisible({ timeout: 20_000 });
        const issues = await sch.evaluate((el) => {
          const svg = el.querySelector('svg')!;
          const errors: string[] = [];
          const box = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
          const local = (node: SVGGraphicsElement, x: number, y: number) => {
            const p = svg.createSVGPoint();
            p.x = x;
            p.y = y;
            return p.matrixTransform(svg.getCTM()!.inverse().multiply(node.getCTM()!));
          };
          const inside = (x: number, y: number) =>
            x >= 0 && x <= 342 && y >= 9 + (Math.abs(x - 172) * 75) / 176 && y <= 445;
          for (const node of Array.from(
            el.querySelectorAll<SVGGraphicsElement>(
              'text:not([data-label="collector"]), .ht-c3-tap, [data-pipe-id]:not([data-pipe-id="collector"])',
            ),
          )) {
            const b = node.getBBox();
            // Pipe bounds also cover empty corners of the bent draw pipe; sample the actual geometry.
            const paths = node.matches('[data-pipe-id]')
              ? node instanceof SVGPathElement
                ? [node]
                : Array.from(node.querySelectorAll('path'))
              : [];
            if (paths.length) {
              for (const p of paths)
                for (let n = 0; n <= 100; n++) {
                  const at = p.getPointAtLength((p.getTotalLength() * n) / 100);
                  const pt = local(p, at.x, at.y);
                  if (!inside(pt.x, pt.y))
                    errors.push(`pipe outside: ${node.getAttribute('data-pipe-id')}`);
                }
            } else
              for (const [x, y] of [
                [b.x, b.y],
                [b.x + b.width, b.y],
                [b.x, b.y + b.height],
                [b.x + b.width, b.y + b.height],
              ] as const) {
                const pt = local(node, x, y);
                if (!inside(pt.x, pt.y)) errors.push(`outside: ${node.textContent}`);
              }
          }
          const labels = Array.from(el.querySelectorAll('text'));
          for (let i = 0; i < labels.length; i++)
            for (let j = i + 1; j < labels.length; j++) {
              const a = labels[i]!.getBoundingClientRect(),
                b = labels[j]!.getBoundingClientRect();
              if (
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5
              )
                errors.push(`overlap: ${labels[i]!.textContent} / ${labels[j]!.textContent}`);
            }
          const tank = box('[data-floor="tank"]'),
            hp = box('[data-floor="hp"]'),
            pump = box('[data-floor="pump"]');
          if (Math.abs(tank.bottom - hp.bottom) > 2 || Math.abs(tank.bottom - pump.bottom) > 2)
            errors.push('floor');
          const inner = box('[data-vessel]');
          const share = inner.width / tank.width;
          if (
            share < 0.5 ||
            share > 0.7 ||
            inner.left <= tank.left ||
            inner.right >= tank.right ||
            inner.top <= tank.top ||
            inner.bottom >= tank.bottom
          )
            errors.push('inner vessel');
          const card = box('[data-vessel-card]');
          const scale = svg.getBoundingClientRect().width / 344;
          if (
            card.left - inner.left < 6 ||
            inner.right - card.right < 6 ||
            card.top - inner.top < 6 ||
            inner.bottom - card.bottom < 6
          )
            errors.push('vessel card padding');
          const vesselText = box('[data-label="dhw"]');
          if (
            vesselText.left < card.left ||
            vesselText.right > card.right ||
            vesselText.top < card.top ||
            vesselText.bottom > card.bottom
          )
            errors.push('vessel text outside card');
          const cold = el.querySelector<SVGPathElement>('[data-pipe-id="cold-water"]')!;
          const end = cold.getPointAtLength(cold.getTotalLength());
          const screenEnd = new DOMPoint(end.x, end.y).matrixTransform(cold.getScreenCTM()!);
          const tankCard = box('[data-tank-card]');
          for (let n = 0; n <= cold.getTotalLength(); n++) {
            const at = cold.getPointAtLength(n);
            const pt = new DOMPoint(at.x, at.y).matrixTransform(cold.getScreenCTM()!);
            if (
              pt.x >= tankCard.left - scale &&
              pt.x <= tankCard.right + scale &&
              pt.y >= tankCard.top - scale &&
              pt.y <= tankCard.bottom + scale
            )
              errors.push('cold inlet crosses tank card');
          }
          if (el.closest('[data-theme="light"]')) {
            const luminance = (color: string) => {
              const canvas = document.createElement('canvas').getContext('2d')!;
              canvas.fillStyle = color;
              canvas.fillRect(0, 0, 1, 1);
              const rgb = [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
                const c = v / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              });
              return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
            };
            for (const label of labels) {
              const id = label.getAttribute('data-label');
              if (!id || ['dhw', 'tank'].includes(id)) continue;
              const foreground = luminance(getComputedStyle(label).fill);
              const background = luminance(
                id === 'compressor'
                  ? '#202a30'
                  : getComputedStyle(el).getPropertyValue(
                      id === 'collector' ? '--ht-c3-soil' : '--ht-c3-room',
                    ),
              );
              if (
                (Math.max(foreground, background) + 0.05) /
                  (Math.min(foreground, background) + 0.05) <
                4.5
              )
                errors.push(`label contrast: ${id}`);
            }
          }

          if (
            screenEnd.x <= inner.left ||
            screenEnd.x >= inner.right ||
            screenEnd.y <= inner.top ||
            screenEnd.y >= inner.bottom
          )
            errors.push('cold inlet outside vessel');
          const overlaps = (a: DOMRect, b: DOMRect) =>
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
          if (overlaps(box('[data-pump="house"]'), box('.ht-c3-radiator rect')))
            errors.push('pump over radiator');
          // Sample actual strokes, including bent routes, rather than their empty bounding corners.
          for (const path of Array.from(
            el.querySelectorAll<SVGPathElement>(
              '[data-pipe-id] path, path[data-pipe-id], .ht-c3-metal-pipe',
            ),
          )) {
            const stroke = Number.parseFloat(getComputedStyle(path).strokeWidth) / 2;
            for (let n = 0; n <= path.getTotalLength(); n += 1) {
              const at = path.getPointAtLength(n);
              const pt = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM()!);
              for (const label of labels) {
                const b = label.getBoundingClientRect();
                if (
                  pt.x + stroke * scale > b.left &&
                  pt.x - stroke * scale < b.right &&
                  pt.y + stroke * scale > b.top &&
                  pt.y - stroke * scale < b.bottom
                )
                  errors.push(
                    `pipe/label: ${path.closest('[data-pipe-id]')?.getAttribute('data-pipe-id')} / ${label.getAttribute('data-label')}`,
                  );
              }
            }
          }
          const grass = box('.ht-c3-grass');
          const collector = el.querySelector<SVGPathElement>('[data-pipe-id="collector"] path')!;
          // First/last risers pass through the foundation; horizontal loops stay under grass.
          for (let n = 0; n <= 100; n++) {
            const at = collector.getPointAtLength((collector.getTotalLength() * n) / 100);
            if (at.y >= 433) {
              const pt = local(collector, at.x, at.y);
              if (pt.y <= 452) errors.push('collector above grass');
            }
          }
          if (box('[data-label="collector"]').top < grass.bottom) errors.push('collector caption');
          if (box('[data-label="mixing"]').top - box('[data-label="tap"]').bottom < 10)
            errors.push('tap/mixer gap');
          const floor = box('.ht-c3-floor');
          if (box('[data-label="hp-in"]').top - floor.bottom < 6) errors.push('floor label hp-in');
          for (const id of ['charge'])
            if (floor.top - box(`[data-label="${id}"]`).bottom < 6)
              errors.push(`floor label ${id}`);
          return [...new Set(errors)];
        });
        expect(issues).toEqual([]);
        await noSidewaysScroll(page);
      });
    }
  }

  test('C3 desktop 1280: kompaktní hero a viditelné další karty', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/homebrain-topeni?topeni=heating');
    const hero = page.getByTestId('heating-hero');
    await expect(hero).toBeVisible({ timeout: 20_000 });
    const bounds = await hero.boundingBox();
    expect(bounds!.height).toBeLessThanOrEqual(600);
    expect(bounds!.y + bounds!.height).toBeLessThan(850);
    await expect(page.locator('.ht-c3-chips')).toBeInViewport({ ratio: 1 });
    const position = await hero.evaluate((el) => ({
      copy: el.querySelector('.ht-hero-copy')!.getBoundingClientRect().top,
      scene: el.querySelector('.ht-c3')!.getBoundingClientRect().top,
      meta: el.querySelector('.ht-run-meta')!.getBoundingClientRect(),
      power: el.querySelector('.ht-run-meta b')!.getBoundingClientRect(),
    }));
    expect(Math.abs(position.copy - position.scene)).toBeLessThanOrEqual(10);
    expect(position.power.bottom).toBeLessThanOrEqual(position.meta.bottom);
  });

  test('změna nastavení omezeného pohybu zastaví i rozběhnuté částice', async ({ page }) => {
    await page.goto('/homebrain-topeni?topeni=heating');
    await expect(page.getByTestId('heating-schematic')).toBeVisible({ timeout: 20_000 });
    expect(await infiniteAnimations(page)).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => infiniteAnimations(page)).toBe(0);
    await expect(page.locator('[data-pipe-id="tank-inlet"]')).toHaveAttribute('data-active', '');
  });

  test.describe('omezený pohyb', () => {
    test.use({ reducedMotion: 'reduce' });
    test('schéma je statické – žádné nekonečné animace', async ({ page }) => {
      await page.goto('/homebrain-topeni?topeni=heating');
      await expect(page.getByTestId('heating-schematic')).toBeVisible({ timeout: 20_000 });
      expect(await infiniteAnimations(page)).toBe(0);
    });
  });
});
