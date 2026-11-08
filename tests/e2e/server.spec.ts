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
});
