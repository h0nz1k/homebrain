import { expect, test, type Page } from '@playwright/test';

// Topení 2b (dev mock, synthetic data): regulation settings, weekly programs with the PLC
// clock, pool / fish room, compressor short cycling, daily solar summary, attic in portrait.

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Topení 2b', () => {
  test('Režimy: nastavení regulace, týdenní útlum s nápovědou, hodiny regulace', async ({
    page,
  }) => {
    await page.goto('/homebrain-topeni/rezimy?topeni=heating');
    const settings = page.getByTestId('heating-settings-card');
    await expect(settings).toBeVisible({ timeout: 20_000 });
    await expect(settings).toContainText('podle ekvitermní křivky');
    await expect(settings).toContainText('Minimální teplota topné vody');
    await expect(settings).toContainText('venku pod 12');
    await expect(settings).not.toContainText('Mez léta'); // not mapped → hidden
    await expect(page.getByTestId('heating-manual-season')).toHaveCount(0);

    const setback = page.locator('[data-testid="heating-week-program"][data-key="setback"]');
    await expect(setback.getByTestId('heating-week-row')).toHaveCount(7);
    await expect(setback.getByTestId('heating-setback-hint')).toContainText('nic neušetří');
    // same every day → one "Denně" row
    const dhw = page.locator('[data-testid="heating-week-program"][data-key="dhw"]');
    await expect(dhw.getByTestId('heating-week-row')).toHaveCount(1);
    await expect(page.getByTestId('heating-clock-drift')).toContainText('o 3\u00a0minuty napřed');
    await noSidewaysScroll(page);
  });

  test('Režimy: ruční zima vysvětlená česky', async ({ page }) => {
    await page.goto('/homebrain-topeni/rezimy?topeni=house');
    await expect(page.getByTestId('heating-manual-season')).toContainText('Zima je zapnutá ručně', {
      timeout: 20_000,
    });
  });

  test('Režimy: bazén – filtrace jako start + doba běhu, rybárna – voda', async ({ page }) => {
    await page.goto('/homebrain-topeni/rezimy?topeni=heating');
    const card = page.getByTestId('heating-pool-fish-card');
    await expect(card).toBeVisible({ timeout: 20_000 });
    const program = card.locator('[data-testid="heating-week-program"][data-key="pool_filter"]');
    await expect(program).toHaveAttribute('data-format', 'start_duration');
    await expect(program.getByTestId('heating-week-row').first()).toContainText(
      '11:00 · 1\u00a0h 30\u00a0min',
    );
    await expect(card.getByTestId('heating-fish-water')).toContainText('Ohřev vody');
    // pool programs are not repeated in the general programs card
    await expect(
      page
        .getByTestId('heating-programs-card')
        .locator('[data-testid="heating-week-program"][data-key="pool_filter"]'),
    ).toHaveCount(0);
  });

  test('Režimy bez dalších okruhů: karta bazénu skrytá', async ({ page }) => {
    await page.goto('/homebrain-topeni/rezimy?topeni=heating&extras=none');
    await expect(page.getByTestId('heating-settings-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('heating-pool-fish-card')).toHaveCount(0);
  });

  test('Trendy: spínání kompresoru a solární souhrn bez kWh', async ({ page }) => {
    await page.goto('/homebrain-topeni/trendy?topeni=dhw');
    const cyc = page.getByTestId('heating-cycling-card');
    await expect(cyc).toBeVisible({ timeout: 20_000 });
    await expect(cyc).toHaveAttribute('data-tone', 'warn');
    await expect(page.getByTestId('heating-cycling-pill')).toHaveText('Často spíná');
    await expect(page.getByTestId('heating-solar-day-card')).toContainText('Nejvyšší teplota');
    await expect(page.getByTestId('heating-solar-no-kwh')).toContainText('COP');

    await page.goto('/homebrain-topeni/trendy?topeni=heating&extras=none');
    await expect(page.getByTestId('heating-cycling-pill')).toHaveText('V pořádku', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('heating-solar-day-card')).toHaveCount(0);
  });

  test('Teď na výšku: teplota půdy i v portrétu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/homebrain-topeni?topeni=heating');
    await expect(page.getByTestId('heating-attic-portrait')).toHaveText(/Půda · 19,6/, {
      timeout: 20_000,
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('heating-attic-portrait')).toBeHidden();
  });

  // Screenshots for the PR (synthetic mock data only), desktop project only.
  for (const theme of ['dark', 'light'] as const) {
    for (const [device, width, height] of [
      ['phone', 360, 800],
      ['tablet', 800, 1280],
      ['desktop', 1440, 900],
    ] as const) {
      test(`snímky 2b ${theme} ${device}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'screenshots once');
        await page.setViewportSize({ width, height });
        const dir = `test-results/heating-2b`;
        await page.goto(`/homebrain-topeni/rezimy?topeni=house&theme=${theme}`);
        await expect(page.getByTestId('heating-settings-card')).toBeVisible({ timeout: 20_000 });
        await page.evaluate(() => document.fonts.ready);
        await page
          .getByTestId('heating-settings-card')
          .screenshot({ path: `${dir}/settings-${theme}-${device}.png` });
        await page
          .getByTestId('heating-programs-card')
          .screenshot({ path: `${dir}/programs-${theme}-${device}.png` });
        await page
          .getByTestId('heating-pool-fish-card')
          .screenshot({ path: `${dir}/pool-fish-${theme}-${device}.png` });
        await noSidewaysScroll(page);

        await page.goto(`/homebrain-topeni/trendy?topeni=dhw&theme=${theme}`);
        await expect(page.getByTestId('heating-daily')).toBeVisible({ timeout: 20_000 });
        await page
          .getByTestId('heating-daily')
          .screenshot({ path: `${dir}/daily-${theme}-${device}.png` });
        await noSidewaysScroll(page);

        if (device === 'phone') {
          await page.goto(`/homebrain-topeni?topeni=heating&theme=${theme}`);
          await expect(page.getByTestId('heating-attic-portrait')).toBeVisible({
            timeout: 20_000,
          });
          await page
            .getByTestId('heating-hero')
            .screenshot({ path: `${dir}/attic-portrait-${theme}-${device}.png` });
        }
      });
    }
  }
});
