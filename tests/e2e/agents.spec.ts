import { expect, test, type Page } from '@playwright/test';

// Agenti (dev mock: `?agents=ok|warn|crit|real|stale|unconfigured|unavailable`).

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Agenti', () => {
  test('přehled ok: verdikt, kvóty řádky, sbalení, fronta, odkaz', async ({ page }) => {
    await page.goto('/homebrain-agenti');
    const hero = page.getByTestId('agents-hero');
    await expect(hero).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('agents-headline')).toHaveText('Vše v pořádku');
    await expect(hero).toHaveAttribute('data-agents-state', 'ok');
    await expect(page.getByTestId('agents-todos')).toHaveCount(0);
    await expect(page.getByTestId('agents-quota-row')).toHaveCount(3);
    await expect(page.getByTestId('agents-agents-details')).not.toHaveAttribute('open');
    await expect(page.getByTestId('agents-queue-line')).toContainText('běží');
    const link = page.getByTestId('agents-monitor-link');
    await expect(link).toHaveAttribute('href', 'https://monitor.example');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toContainText('Detail v AgentsMonitoringu');
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('agents-updated')).toHaveText(/^Aktualizováno/);
    await expect(page.getByRole('heading', { level: 1, name: 'Agenti' })).toHaveClass(/hb-sr-only/);
    await noSidewaysScroll(page);
  });

  test('upozornění/rozpor: senzor attention → warn, K řešení má critical kvótu', async ({
    page,
  }) => {
    await page.goto('/homebrain-agenti?agents=warn');
    await expect(page.getByTestId('agents-hero')).toHaveAttribute('data-agents-state', 'warn', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('agents-headline')).toHaveText(/^Běží vše · /);
    await expect(page.getByTestId('agents-todos')).toBeVisible();
    await expect(
      page
        .getByTestId('agents-todo')
        .filter({ hasText: /vyčerpáno|Poskytovatel Y/ })
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId('agents-agents-details')).toHaveAttribute('open');
    await noSidewaysScroll(page);
  });

  test('kritické: výpadek služby + agent neběží → auto-rozbalení', async ({ page }) => {
    await page.goto('/homebrain-agenti?agents=crit');
    await expect(page.getByTestId('agents-headline')).toHaveText(/^Kritické · /, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('agents-hero')).toHaveAttribute('data-agents-state', 'crit');
    await expect(page.getByTestId('agents-agents-details')).toHaveAttribute('open');
    await expect(page.getByTestId('agents-services-under')).toContainText('Brána');
    await noSidewaysScroll(page);
  });

  test('nenastaveno: návod, žádná chyba', async ({ page }) => {
    await page.goto('/homebrain-agenti?agents=unconfigured');
    const empty = page.getByTestId('agents-unconfigured');
    await expect(empty).toBeVisible({ timeout: 20_000 });
    await expect(empty).toContainText('Modul Agenti není nastavený');
    await expect(page.getByTestId('agents-error')).toHaveCount(0);
    await expect(page.getByTestId('agents-monitor-link')).toHaveCount(0);
  });

  test('nedostupné entity: sekce „nedostupné“, zbytek funguje', async ({ page }) => {
    await page.goto('/homebrain-agenti?agents=unavailable');
    await expect(page.getByTestId('agents-headline')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('agents-agents-unavailable')).toHaveText('nedostupné');
    await expect(page.getByTestId('agents-queue-unavailable')).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('layout 360/800/1440, světlý i tmavý (ok + real + crit + stale)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'viewporty si nastavuje sám');
    test.setTimeout(120_000);
    const shots = Boolean(process.env.AGENTS_SCREENSHOTS);
    for (const theme of ['light', 'dark'] as const) {
      for (const scenario of ['ok', 'real', 'crit', 'stale'] as const) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`/homebrain-agenti?agents=${scenario}&theme=${theme}`);
        await expect(page.getByTestId('agents-hero')).toBeVisible({ timeout: 20_000 });
        for (const [width, height] of [
          [360, 800],
          [390, 844],
          [800, 1280],
          [1440, 900],
        ] as const) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => window.scrollTo(0, 0));
          await noSidewaysScroll(page);
          const spill = await page.evaluate(() => {
            const root = document.querySelector('[data-testid="agents-view"]');
            if (!root) return -1;
            const box = root.getBoundingClientRect();
            return Array.from(root.querySelectorAll('*'))
              .map((el) => el.getBoundingClientRect())
              .filter((r) => r.width > 0 && (r.right > box.right + 2 || r.left < box.left - 2))
              .length;
          });
          expect(spill).toBe(0);
          if (shots) {
            await page.screenshot({
              path: `test-results/agents-redesign/agents-${scenario}-${width}-${theme}.png`,
              fullPage: true,
            });
          }
        }
      }
    }
  });
});
