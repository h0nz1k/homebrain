import { expect, test, type Page } from '@playwright/test';

// Server (dev mock: synthetic Proxmox host with 4 VMs, `?server=` scenario).

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Server', () => {
  test('přehled: verdikt, uptime, dlaždice, disky a VM podle RAM', async ({ page }) => {
    await page.goto('/homebrain-server');
    const hero = page.getByTestId('server-hero');
    await expect(hero).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('server-headline')).toHaveText('V pořádku');
    await expect(hero).toContainText(/běží 9\sdní/);
    await expect(hero).toContainText('Proxmox (pve)');
    for (const id of ['cpu', 'ram', 'temp', 'net'])
      await expect(page.getByTestId(`server-tile-${id}`)).toBeVisible();
    await expect(page.getByTestId('server-trend-cpu')).toBeVisible();
    await expect(page.getByTestId('server-disk')).toHaveCount(3);
    const vms = page.getByTestId('server-vm');
    await expect(vms).toHaveCount(4);
    await expect(vms.first()).toContainText('home-assistant');
    await expect(vms.first()).toHaveAttribute('data-vmid', '101');
    await expect(page.getByRole('heading', { level: 1, name: 'Server' })).toHaveClass(/hb-sr-only/);
    // All four hero rings sit on one row (phone too) – no orphaned ring.
    const tops = await page
      .locator('.srv-ring')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(tops).toHaveLength(4);
    expect(new Set(tops).size).toBe(1);
    await noSidewaysScroll(page);
  });

  test('paměť nad 85 % = „Pozor“ v hero i na dlaždici', async ({ page }) => {
    await page.goto('/homebrain-server?server=warn');
    await expect(page.getByTestId('server-headline')).toHaveText(/^Pozor: paměť 87\s%$/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('server-tile-ram')).toHaveAttribute('data-tone', 'warn');
    await expect(page.getByTestId('server-hero')).toHaveAttribute('data-server-state', 'warn');
  });

  test('nedostupný server je klidný stav', async ({ page }) => {
    await page.goto('/homebrain-server?server=down');
    await expect(page.getByTestId('server-headline')).toHaveText('Server nedostupný', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('server-tile-cpu')).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('Glances API mimo provoz: VM s vysvětlením, zbytek běží', async ({ page }) => {
    await page.goto('/homebrain-server?server=apidown');
    await expect(page.getByTestId('server-vms-note')).toContainText('neodpovídá', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('server-tile-cpu')).toBeVisible();
  });

  test('VM řádky se nevejdou mimo kartu (telefon i desktop)', async ({ page }) => {
    await page.goto('/homebrain-server?theme=light');
    await expect(page.getByTestId('server-vm').first()).toBeVisible({ timeout: 20_000 });
    const spill = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="server-vms"]')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll('[data-testid="server-vm"] *'))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.right > card.right + 1 || r.left < card.left - 1)).length;
    });
    expect(spill).toBe(0);
    await noSidewaysScroll(page);
  });

  test('data Proxmoxu se vejdou na telefon i tablet', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/homebrain-server?server=proxmox-ok');
    const guests = page.getByTestId('server-proxmox-guest');
    await expect(guests).toHaveCount(5, { timeout: 20_000 });
    await expect(guests.last()).toContainText('Vypnuto');
    await expect(page.getByTestId('server-proxmox-backup')).toBeVisible();
    await noSidewaysScroll(page);
    await page.setViewportSize({ width: 800, height: 1280 });
    await noSidewaysScroll(page);
  });

  test('hostitel, hosté a detail hosta (360/800/1280, světlý i tmavý)', async ({
    page,
  }, testInfo) => {
    // Sets its own viewports: one project is enough, six layouts need more than 30 s.
    test.skip(testInfo.project.name !== 'desktop', 'viewporty si nastavuje sám');
    test.setTimeout(120_000);
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/homebrain-server?server=proxmox-ok&theme=${theme}`);
      const hero = page.getByTestId('server-hero');
      await expect(page.getByTestId('server-host-meta')).toContainText('Proxmox · pve', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('server-node-state')).toHaveText('Online');
      await expect(hero.getByTestId('server-proxmox-storage')).toHaveCount(2);
      await expect(page.getByTestId('server-host-consumers')).toContainText('web');
      await expect(page.getByTestId('server-proxmox-node')).toHaveCount(0);
      const guests = page.getByTestId('server-proxmox-guest');
      await expect(guests.first()).toContainText('web');
      for (const [width, height] of [
        [360, 800],
        [800, 1280],
        [1280, 900],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.scrollTo(0, 0));
        await noSidewaysScroll(page);
        const spill = await page.evaluate(() => {
          const rows = Array.from(
            document.querySelectorAll('[data-testid="server-proxmox-guest"]'),
          );
          return rows.flatMap((row) => {
            const box = row.getBoundingClientRect();
            return Array.from(row.querySelectorAll('*'))
              .map((el) => el.getBoundingClientRect())
              .filter((r) => r.width > 0 && (r.right > box.right + 11 || r.left < box.left - 11));
          }).length;
        });
        expect(spill).toBe(0);
        if (process.env.SERVER_SCREENSHOTS)
          await page.screenshot({
            path: `test-results/server-pve-detail/server-proxmox-${width}-${theme}.png`,
            fullPage: true,
          });
        await page.getByRole('button', { name: /^ha-vm, VM 101/ }).click();
        const sheet = page.getByTestId('server-guest-sheet');
        await expect(sheet).toBeVisible();
        await expect(sheet.getByTestId('server-guest-trend-cpu')).toBeVisible();
        await expect(sheet.getByTestId('server-guest-trend-memory')).toBeVisible();
        await noSidewaysScroll(page);
        if (process.env.SERVER_SCREENSHOTS)
          await page.screenshot({
            path: `test-results/server-pve-detail/server-guest-sheet-${width}-${theme}.png`,
          });
        await page.getByRole('button', { name: 'Zavřít' }).click();
        await expect(sheet).toHaveCount(0);
      }
    }
  });

  test('bez Glances drží hostitele data z Proxmoxu', async ({ page }) => {
    await page.goto('/homebrain-server?server=proxmox-noglances');
    await expect(page.getByTestId('server-glances-down')).toContainText('z Proxmoxu', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('server-ring-cpu')).toContainText('21');
    await expect(page.getByTestId('server-proxmox-guest')).toHaveCount(5);
    await noSidewaysScroll(page);
  });

  test('zastaralá záloha: verdikt, karta a bez vodorovného posunu (360/800/1280)', async ({
    page,
  }) => {
    await page.goto('/homebrain-server?server=proxmox-backup-stale&theme=light');
    await expect(page.getByTestId('server-headline')).toHaveText(
      /^Kritické: poslední záloha je stará 395\sdní$/,
      { timeout: 20_000 },
    );
    const card = page.getByTestId('server-proxmox-backup');
    await expect(card).toHaveAttribute('data-tone', 'crit');
    await expect(page.getByTestId('server-backup-age')).toHaveText(/^před 395\sdny$/);
    await expect(card).toContainText(/17\ss/);
    await expect(page.getByTestId('server-backup-run')).toHaveText('úspěšný');
    await expect(page.getByTestId('server-backup-stale')).toHaveText('Kritické');
    // Evidence next to the verdict: „Co s tím“ (primary, severity tone) scrolls to the card.
    const fix = page.getByTestId('server-hero-fix');
    await expect(fix).toHaveAttribute('data-tone', 'crit');
    expect((await fix.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await fix.click();
    await expect(card).toBeFocused();
    await expect(card).toBeInViewport();
    for (const [width, height] of [
      [360, 800],
      [800, 1280],
      [1280, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await noSidewaysScroll(page);
      const spill = await card.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return Array.from(el.querySelectorAll('*'))
          .map((child) => child.getBoundingClientRect())
          .filter((r) => r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)).length;
      });
      expect(spill).toBe(0);
      if (process.env.SERVER_SCREENSHOTS) {
        await page.screenshot({
          path: `test-results/server-r4/server-backup-stale-${width}.png`,
          fullPage: true,
        });
      }
    }
  });

  test('desktop: hosté vedle zálohy, stav hostů jako odznak', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/homebrain-server?server=proxmox-ok&theme=light');
    const guests = page.getByTestId('server-proxmox-guest');
    await expect(guests).toHaveCount(5, { timeout: 20_000 });
    await expect(page.getByTestId('server-guest-state')).toHaveText([
      'Běží',
      'Běží',
      'Běží',
      'Běží',
      'Vypnuto',
    ]);
    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    const backup = await box('server-proxmox-backup');
    const list = await box('server-proxmox-guests');
    const section = await box('server-proxmox');
    expect(list.width).toBeGreaterThan(section.width * 0.55);
    expect(backup.x).toBeGreaterThan(list.x + list.width - 1);
    await expect(page.getByTestId('server-hero-fix')).toHaveCount(0);
    await noSidewaysScroll(page);
    if (process.env.SERVER_SCREENSHOTS)
      await page.screenshot({ path: 'test-results/server-r4/server-ok-1280.png', fullPage: true });
  });

  test('bez senzoru zálohy jen poznámka, žádné varování', async ({ page }) => {
    await page.goto('/homebrain-server?server=proxmox-backup-missing');
    await expect(page.getByTestId('server-headline')).toHaveText('V pořádku', { timeout: 20_000 });
    await expect(page.getByTestId('server-proxmox-backup')).toContainText(
      'Údaje o zálohách nejsou k dispozici',
    );
  });
});
