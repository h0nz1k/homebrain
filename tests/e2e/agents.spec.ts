import { expect, test, type Page } from '@playwright/test';

// Agenti (dev mock: synthetic monitoring, `?agents=ok|warn|crit|unconfigured|unavailable`).

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Agenti', () => {
  test('přehled: verdikt, kvóty, agenti, služby, fronta a odkaz', async ({ page }) => {
    await page.goto('/homebrain-agenti');
    const hero = page.getByTestId('agents-hero');
    await expect(hero).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('agents-headline')).toHaveText('V pořádku');
    await expect(hero).toHaveAttribute('data-agents-state', 'ok');
    await expect(page.getByTestId('agents-quota')).toHaveCount(6);
    await expect(page.getByTestId('agents-agent')).toHaveCount(4);
    await expect(page.getByTestId('agents-agent').first()).toHaveAttribute('data-state', 'waiting');
    await expect(page.getByTestId('agents-service')).toHaveCount(3);
    await expect(page.getByTestId('agents-queue-pending')).toContainText('5');
    await expect(page.getByTestId('agents-queue-running')).toContainText('2');
    const link = page.getByTestId('agents-monitor-link');
    await expect(link).toHaveAttribute('href', 'https://monitor.example');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('agents-data-age')).toHaveText(/^Data aktuální/);
    await expect(page.getByRole('heading', { level: 1, name: 'Agenti' })).toHaveClass(/hb-sr-only/);
    await noSidewaysScroll(page);
  });

  test('upozornění/rozpor: senzor attention → warn, kvóta critical, „Co s tím“', async ({
    page,
  }) => {
    await page.goto('/homebrain-agenti?agents=warn');
    await expect(page.getByTestId('agents-hero')).toHaveAttribute('data-agents-state', 'warn', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('agents-headline')).toHaveText(
      /^Pozor: Poskytovatel Y · 5 h: vyčerpáno$/,
    );
    await expect(page.getByTestId('agents-quota').first()).toHaveAttribute(
      'data-level',
      'critical',
    );
    await expect(page.getByTestId('agents-quota-exhausted')).toBeVisible();
    await expect(page.getByTestId('agents-quota-forecast')).toBeVisible();
    await expect(page.getByTestId('agents-forecast')).toContainText('Poskytovatel X');
    await expect(page.getByTestId('agents-meta')).toContainText('2 z 4 agentů běží');
    await expect(page.getByTestId('agents-agent')).toHaveCount(4);
    const fix = page.getByTestId('agents-hero-fix');
    expect((await fix.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await fix.click();
    const quotas = page.getByTestId('agents-quotas');
    await expect(quotas).toBeFocused();
    await expect(quotas).toBeInViewport();
    await noSidewaysScroll(page);
  });

  test('kritické: výpadek služby a neaktuální data', async ({ page }) => {
    await page.goto('/homebrain-agenti?agents=crit');
    await expect(page.getByTestId('agents-headline')).toHaveText(
      'Kritické: Služba Brána: výpadek',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('agents-hero')).toHaveAttribute('data-agents-state', 'crit');
    await expect(page.getByTestId('agents-service').first()).toHaveAttribute(
      'data-level',
      'critical',
    );
    await expect(page.getByTestId('agents-data-age')).toHaveText(/^Data neaktuální od /);
    await expect(page.getByTestId('agents-footer')).toHaveAttribute('data-current', 'false');
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
    await expect(page.getByTestId('agents-quota-unavailable')).toBeVisible();
    await expect(page.getByTestId('agents-quota')).toHaveCount(6);
    await noSidewaysScroll(page);
  });

  test('layout 360/800/1440, světlý i tmavý (ok + warn + crit)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'viewporty si nastavuje sám');
    test.setTimeout(120_000);
    const shots = Boolean(process.env.AGENTS_SCREENSHOTS);
    for (const theme of ['light', 'dark'] as const) {
      for (const scenario of ['ok', 'warn', 'crit'] as const) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`/homebrain-agenti?agents=${scenario}&theme=${theme}`);
        await expect(page.getByTestId('agents-hero')).toBeVisible({ timeout: 20_000 });
        for (const [width, height] of [
          [360, 800],
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
              path: `test-results/agents-status/agents-${scenario}-${width}-${theme}.png`,
              fullPage: true,
            });
          }
        }
      }
    }
  });
});
