import { expect, test } from '@playwright/test';

// Refs #82. Check painted SVG geometry, including landscape-only labels.
for (const [width, height] of [
  [844, 390],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
]) {
  for (const theme of ['dark', 'light']) {
    for (const scenario of ['heating', 'house', 'idle']) {
      test(`rendered heating geometry ${width} ${theme} ${scenario}`, async ({ page }) => {
        await page.setViewportSize({ width: width!, height: height! });
        await page.goto(`/homebrain-topeni?topeni=${scenario}&theme=${theme}`);
        await expect(page.getByTestId('heating-land-day-chart')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => {
          const root = document.querySelector('[data-testid="heating-schematic"]')!;
          const svg = root.querySelector('svg')!;
          const rendered = (node: SVGGraphicsElement) => {
            const b = node.getBBox();
            const m = node.getScreenCTM()!;
            const a = new DOMPoint(b.x, b.y).matrixTransform(m);
            const z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m);
            return {
              left: a.x,
              top: a.y,
              right: z.x,
              bottom: z.y,
              width: z.x - a.x,
              height: z.y - a.y,
            };
          };
          const visible = (node: SVGGraphicsElement) => node.getBoundingClientRect().width > 0;
          const texts = Array.from(svg.querySelectorAll('text')).filter(visible);
          const icons = Array.from(
            svg.querySelectorAll<SVGGraphicsElement>(
              '.ht-c3-tap, .ht-c3-radiator, .ht-c3-hp, .ht-c3-water-valve, [data-pump], .ht-c3-valve, image, [data-testid="heating-sch-compressor-led"]',
            ),
          ).filter(visible);
          const gap = (a: ReturnType<typeof rendered>, b: ReturnType<typeof rendered>) =>
            Math.hypot(
              Math.max(a.left - b.right, b.left - a.right, 0),
              Math.max(a.top - b.bottom, b.top - a.bottom, 0),
            );
          const overlaps: string[] = [];
          for (const [i, a] of texts.entries()) {
            for (const b of [...texts.slice(i + 1), ...icons]) {
              const p = rendered(a),
                q = rendered(b);
              if (
                Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0.1 &&
                Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0.1
              )
                overlaps.push(
                  `${a.dataset.label}/${b.dataset.label ?? b.getAttribute('class') ?? b.tagName}`,
                );
            }
          }
          const cold = texts.find((t) => t.dataset.label === 'cold-water')!;
          const coldGap = Math.min(
            ...[...texts.filter((t) => t !== cold), ...icons].map((t) =>
              gap(rendered(cold), rendered(t)),
            ),
          );
          const dash = document.querySelector('.ht-land-dash-inner')!;
          const d = dash.getBoundingClientRect();
          const cards = Array.from(dash.querySelectorAll('.ht-land-panel')).map((n) =>
            n.getBoundingClientRect(),
          );
          // Sample each explicit track interior, excluding only CSS gutters.
          const css = getComputedStyle(dash);
          const cols = css.gridTemplateColumns.split(' ').map(Number.parseFloat);
          const rows = css.gridTemplateRows.split(' ').map(Number.parseFloat);
          const holes: number[][] = [];
          let y = d.top;
          for (const rh of rows) {
            let x = d.left;
            for (const cw of cols) {
              for (const f of [0.2, 0.5, 0.8]) {
                const px = x + cw * f,
                  py = y + rh * f;
                const hit = document.elementFromPoint(px, py);
                if (py < innerHeight && !hit?.closest('.ht-land-panel'))
                  holes.push([Math.round(px - d.left), Math.round(py - d.top)]);
                if (
                  !cards.some((b) => px >= b.left && px <= b.right && py >= b.top && py <= b.bottom)
                )
                  holes.push([Math.round(px - d.left), Math.round(py - d.top)]);
              }
              x += cw + Number.parseFloat(css.columnGap);
            }
            y += rh + Number.parseFloat(css.rowGap);
          }
          const ticks = Array.from(document.querySelectorAll('.ht-chart-compact .ht-xlabs span'));
          const tickBoxes = ticks.map((t) => t.getBoundingClientRect());
          const chartCard = document
            .querySelector('[data-testid="heating-land-outdoor"]')!
            .getBoundingClientRect();
          const tickGap = Math.min(
            ...tickBoxes.slice(1).map((b, i) => b.left - tickBoxes[i]!.right),
          );
          const logo = root.querySelector('image')?.getBoundingClientRect().width ?? 0;
          const led = root
            .querySelector('[data-testid="heating-sch-compressor-led"]')!
            .getBoundingClientRect().width;
          const title = texts.find((t) => t.dataset.label === 'tank-title')!;
          const tank = root.querySelector('[data-floor="tank"]')!.getBoundingClientRect();
          const tb = rendered(title);
          const store = document.querySelector('[data-testid="heating-land-store"]')!;
          const rowValue = (parent: Element, label: string) =>
            Array.from(parent.querySelectorAll('li'))
              .find((n) => n.querySelector('span')?.textContent === label)
              ?.querySelector('b')?.textContent;
          const target = rowValue(store, 'Cíl nádrže')?.split(' ±')[0];
          const curveTarget = rowValue(
            document.querySelector('[data-testid="heating-land-outdoor"]')!,
            'Cíl nádrže (křivka)',
          );
          const stretchedChips = Array.from(
            document.querySelectorAll('.ht-land-panel .hb-chip'),
          ).filter((n) => {
            const r = document.createRange();
            r.selectNodeContents(n);
            return n.getBoundingClientRect().width - r.getBoundingClientRect().width > 60;
          }).length;
          const curve = document.querySelector('[data-testid="heating-land-outdoor"]')!;
          const out = Number.parseFloat(
            rowValue(curve, 'Teplota')!.replace(',', '.').replace('−', '-'),
          );
          const dot = curve.querySelector<SVGCircleElement>('.ht-curve-now-dot')!;
          const dotX = new DOMPoint(dot.cx.baseVal.value, dot.cy.baseVal.value).matrixTransform(
            dot.getScreenCTM()!,
          ).x;
          const first = tickBoxes[0]!,
            last = tickBoxes.at(-1)!;
          const firstX = first.left + first.width / 2,
            lastX = last.left + last.width / 2;
          const markerError = Math.abs(dotX - (firstX + ((out + 20) / 40) * (lastX - firstX)));
          const contrastIssues: string[] = [];
          if (root.closest('[data-theme="light"]')) {
            const ctx = document.createElement('canvas').getContext('2d')!;
            const lum = (color: string) => {
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillStyle = color;
              ctx.fillRect(0, 0, 1, 1);
              const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
                const c = v / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              });
              return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
            };
            for (const t of texts) {
              if (['dhw', 'tank'].includes(t.dataset.label!)) continue;
              const fg = lum(getComputedStyle(t).fill);
              const bg = lum(
                getComputedStyle(root).getPropertyValue(
                  t.dataset.label === 'collector' ? '--ht-c3-soil' : '--ht-c3-room',
                ),
              );
              const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
              if (ratio < (t.classList.contains('ht-c3-muted') ? 3 : 4.5))
                contrastIssues.push(`${t.dataset.label}: ${ratio.toFixed(2)}`);
            }
          }
          const sb = svg.getBoundingClientRect();
          return {
            overlaps,
            markerError,
            contrastIssues,
            minTextHeight: Math.min(...texts.map((t) => rendered(t).height)),
            coldGap,
            holes,
            width: sb.width,
            minText: Math.min(
              ...texts.map(
                (t) => Number.parseFloat(getComputedStyle(t).fontSize) * t.getScreenCTM()!.a,
              ),
            ),
            svgBottom: sb.bottom,
            dashBottom: d.bottom,
            panelContentOverflow: Array.from(
              dash.querySelectorAll<HTMLElement>('.ht-land-panel'),
            ).some((n) => n.scrollHeight > n.clientHeight + 1),
            columnVoid: d.bottom - sb.bottom,
            sticky: getComputedStyle(root.parentElement!).position,
            clipped: [root, root.parentElement!, document.querySelector('.ht-hero-now')!].some(
              (n) =>
                getComputedStyle(n).overflow === 'hidden' && n.scrollHeight > n.clientHeight + 1,
            ),
            logo,
            led,
            ticks: ticks.map((n) => n.textContent),
            tickGap,
            tickInset: Math.min(
              ...tickBoxes.map((b) => Math.min(b.left - chartCard.left, chartCard.right - b.right)),
            ),
            tankTitleInside:
              tb.left >= tank.left &&
              tb.right <= tank.right &&
              tb.top >= tank.top &&
              tb.bottom <= tank.bottom,
            topLabel: rowValue(store, 'Nádrž nahoře'),
            target,
            curveTarget,
            stretchedChips,
          };
        });
        expect.soft(result.markerError, 'marker at outdoor temperature').toBeLessThanOrEqual(1);
        expect.soft(result.contrastIssues, 'light label contrast').toEqual([]);
        expect
          .soft(result.minTextHeight, 'rendered text bbox height')
          .toBeGreaterThanOrEqual(height! < 600 ? 9 : 11);
        expect.soft(result.overlaps, 'all text/text and text/icon BBoxes').toEqual([]);
        expect.soft(result.coldGap, 'cold-water glyph clearance').toBeGreaterThanOrEqual(6);
        expect.soft(result.tankTitleInside, 'buffer title inside tank').toBe(true);
        expect.soft(result.holes, 'every grid track interior covered by a card').toEqual([]);
        expect
          .soft(result.minText, 'smallest rendered font')
          .toBeGreaterThanOrEqual(height! < 600 ? 9 : 11);
        expect.soft(result.clipped, 'full page contains complete scene').toBe(false);
        if (height! < 600) {
          expect.soft(result.width, 'actual SVG width').toBeGreaterThanOrEqual(width! * 0.45);
          expect.soft(result.sticky).toBe('sticky');
          await page.evaluate(() => window.scrollTo(0, 400));
          const stickyTop = await page
            .locator('.ht-now-schematic')
            .evaluate((n) => n.getBoundingClientRect().top);
          const topbarBottom = await page
            .locator('.hb-topbar')
            .evaluate((n) => n.getBoundingClientRect().bottom);
          expect
            .soft(stickyTop, 'scene remains below topbar after scrolling')
            .toBeCloseTo(topbarBottom + 4, 0);
        } else {
          expect.soft(result.svgBottom).toBeLessThanOrEqual(height!);
          expect.soft(result.dashBottom).toBeLessThanOrEqual(height!);
          expect.soft(result.panelContentOverflow, 'all content stays inside its card').toBe(false);
          expect.soft(result.columnVoid, 'underfill below schematic').toBeLessThanOrEqual(24);
          expect.soft(result.logo).toBeGreaterThanOrEqual(56);
        }
        expect.soft(result.led).toBeGreaterThanOrEqual(6);
        expect.soft(result.ticks).toEqual(['−20', '0', '+20']);
        expect.soft(result.tickGap).toBeGreaterThanOrEqual(6);
        expect.soft(result.tickInset).toBeGreaterThanOrEqual(12);
        expect.soft(result.topLabel).toBeTruthy();
        if (scenario === 'house') expect.soft(result.target).toBe(result.curveTarget);
        expect.soft(result.stretchedChips).toBe(0);
      });
    }
  }
}
