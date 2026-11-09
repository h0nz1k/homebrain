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
    await expect(page.getByTestId('heating-headline')).toContainText('nahřívá nádrž', {
      timeout: 20_000,
    });
    const sch = page.getByTestId('heating-schematic');
    await expect(sch).toHaveAttribute('data-compressor', 'on');
    await expect(sch.locator('[data-pipe="brine"]')).toHaveCount(1);
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
        el.querySelector('.ht-big')!.getBoundingClientRect().top
      );
    });
    expect(heroOrder).toBe(true);
    await expect(sch.locator('[data-pump="primary"]')).toHaveAttribute('data-on', '');
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
        await expect(sch.locator('[data-pump="primary"]')).not.toHaveAttribute('data-on', '');
        await expect(sch.locator('[data-pipe="brine"]')).toHaveCount(0);
      }
      const pumps = await sch.locator('[data-pump]').evaluateAll((elements) =>
        elements.map((pump) => ({
          on: pump.hasAttribute('data-on'),
          spinning: getComputedStyle(pump.querySelector('.ht-impeller')!).animationName !== 'none',
        })),
      );
      for (const pump of pumps) expect(pump.spinning).toBe(pump.on);
      const properties = await sch.evaluate((el) =>
        Array.from(
          new Set(
            el
              .getAnimations({ subtree: true })
              .flatMap((a) =>
                a.effect instanceof KeyframeEffect
                  ? a.effect.getKeyframes().flatMap((frame) => Object.keys(frame))
                  : [],
              ),
          ),
        ),
      );
      expect(
        properties.filter(
          (p) =>
            !['offset', 'computedOffset', 'easing', 'composite', 'transform', 'opacity'].includes(
              p,
            ),
        ),
      ).toEqual([]);
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

  for (const width of [360, 390]) {
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

  test('telefon: kohoutek teplé vody je v domě, popisek kolektoru nad terénem', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=heating');
    const sch = page.getByTestId('heating-schematic');
    await expect(sch).toHaveAttribute('data-variant', 'tall', { timeout: 20_000 });
    const g = await sch.evaluate((el) => {
      const r = (s: string) => el.querySelector(s)!.getBoundingClientRect();
      return {
        tap: r('.ht-tap'),
        house: r('.ht-house-outline'),
        grass: r('.ht-grass'),
        label: r('[data-testid="heating-sch-collector"]'),
      };
    });
    expect(g.tap.left).toBeGreaterThan(g.house.left);
    expect(g.tap.right).toBeLessThan(g.house.right);
    expect(g.tap.top).toBeGreaterThan(g.house.top);
    expect(g.tap.bottom).toBeLessThan(g.house.bottom);
    expect(g.label.bottom).toBeLessThanOrEqual(g.grass.top);
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
