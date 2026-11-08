import { expect, test, type Page } from '@playwright/test';

// Síť (dev mock: synthetic house with 7 APs and 3 switches, `?sit=` scenario, `?role=` role).

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Síť – správce', () => {
  test('přehled: hero s hlavním problémem, „Co s tím“ a tipy', async ({ page }) => {
    await page.goto('/homebrain-sit');
    const hero = page.getByTestId('network-hero');
    await expect(hero).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('network-headline')).toHaveText('Terasa vypadává');
    await expect(hero).toContainText('3 problémy · 2 tipy');
    await expect(page.getByTestId('network-problem')).toHaveCount(3);
    await expect(page.getByTestId('network-problem').first()).toContainText('Co s tím');
    await expect(page.getByTestId('network-tip')).toHaveCount(2);
    await expect(page.getByTestId('network-ap')).toHaveCount(7);
    // All APs online: the count is calm, only „1 nestabilní“ is amber.
    await expect(page.getByTestId('network-stat-aps')).toHaveAttribute('data-tone', 'ok');
    await expect(page.getByTestId('network-stat-aps')).toHaveAttribute('data-detail-tone', 'warn');
    await expect(page.getByTestId('network-house')).toContainText('\u22121. patro');
    // The title lives in the shell top bar only.
    await expect(page.getByRole('heading', { level: 1, name: 'Síť' })).toHaveClass(/hb-sr-only/);
    await noSidewaysScroll(page);
  });

  test('přehled: „Co s tím“ v hero vede na kartu, která titulek neopakuje', async ({ page }) => {
    await page.goto('/homebrain-sit');
    await expect(page.getByTestId('network-hero')).toBeVisible({ timeout: 20_000 });
    const first = page.getByTestId('network-problem').first();
    await expect(first).toHaveAttribute('data-in-hero', 'true');
    await expect(first.locator('h4')).not.toHaveText('Terasa vypadává');
    await expect(first).toContainText('Upozornění');
    await page.getByTestId('network-hero-fix').click();
    await expect(first).toBeFocused();
    await expect(first).toBeInViewport();
  });

  test('záložky: switche s pomalým portem a zařízení s hlídáním', async ({ page }) => {
    await page.goto('/homebrain-sit');
    await expect(page.getByTestId('network-hero')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('radio', { name: 'Switche' }).click();
    await expect(page.getByTestId('network-switch')).toHaveCount(3);
    await expect(page.locator('[data-testid="network-port"][data-slow]')).toHaveCount(1);
    await page.getByRole('radio', { name: 'Zařízení' }).click();
    await expect(page.getByTestId('network-device').first()).toContainText('Tablet Kuchyň');
    await page.getByRole('button', { name: 'Hlídat Notebook' }).click();
    await expect(page.getByRole('button', { name: 'Nehlídat Notebook' })).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('klidný stav a výpadek internetu', async ({ page }) => {
    await page.goto('/homebrain-sit?sit=ok');
    await expect(page.getByTestId('network-headline')).toHaveText('Síť v pořádku', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('network-no-problems')).toBeVisible();
    await page.goto('/homebrain-sit?sit=down');
    await expect(page.getByTestId('network-headline')).toHaveText('Internet nefunguje', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('network-hero')).toHaveAttribute('data-net-state', 'critical');
  });

  test('Wi-Fi pro hosty: QR a úprava jen pro správce', async ({ page }) => {
    await page.goto('/homebrain-sit');
    await expect(page.getByTestId('network-hero')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('radio', { name: 'Hosté' }).click();
    await expect(page.getByRole('img', { name: 'QR kód Wi-Fi Host demo' })).toBeVisible();
    await page.getByTestId('network-guest-edit').click();
    await page.getByLabel('Název sítě (SSID)').fill('Host nový');
    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByTestId('network-guest-ssid')).toHaveText('Host nový');
  });
});

for (const role of ['kiosk', 'adult'] as const)
  test(`Síť – ${role}: jen souhrn a QR, žádný seznam zařízení`, async ({ page }) => {
    await page.goto(`/homebrain-sit?role=${role}`);
    const summary = page.getByTestId('network-summary');
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary).toHaveAttribute('data-net-state', 'problem');
    await expect(page.getByTestId('network-headline')).toHaveText('Terasa vypadává');
    await expect(page.getByRole('img', { name: 'QR kód Wi-Fi Host demo' })).toBeVisible();
    await expect(page.getByTestId('network-hero')).toHaveCount(0);
    await expect(page.getByTestId('network-device')).toHaveCount(0);
    await expect(page.getByTestId('network-guest-edit')).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Sekce' })).toHaveCount(0);
    await noSidewaysScroll(page);
  });

test('Síť – nenastavená hostovská Wi-Fi ukáže nápovědu', async ({ page }) => {
  await page.goto('/homebrain-sit?role=kiosk&hoste=0&sit=ok');
  await expect(page.getByTestId('network-guest-hint')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('network-headline')).toHaveText('Síť v pořádku');
});

test.describe('Síť – mapa', () => {
  test('desktop: vodorovný strom, mesh, pomalá linka, předpoklad a klik na detail', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop layout');
    await page.goto('/homebrain-sit/mapa');
    const map = page.getByTestId('network-topo-desktop');
    await expect(map).toBeVisible({ timeout: 20_000 });
    const node = (id: string) =>
      page.locator(`[data-testid="network-topo-node"][data-node-id="${id}"]`);
    await expect(page.locator('[data-testid="network-topo-node"][data-kind="ap"]')).toHaveCount(5);
    await expect(page.locator('[data-testid="network-topo-node"][data-kind="switch"]')).toHaveCount(
      3,
    );
    await expect(node('gateway')).toContainText('Router');
    const link = (to: string) => page.locator(`[data-testid="network-topo-link"][data-to="${to}"]`);
    await expect(link('ap-podkrovi')).toHaveAttribute('data-type', 'mesh');
    await expect(link('ap-pracovna')).toHaveAttribute('data-tone', 'slow');
    await expect(link('sw-lite')).toHaveAttribute('data-assumed', 'true');
    await expect(
      page.getByTestId('network-topo-chip').filter({ hasText: 'p1 · 1G' }),
    ).toBeVisible();
    await expect(page.getByTestId('network-topo-summary')).toContainText('Linky 100 Mb/s 1');
    // A problem from the existing rules highlights its node.
    await expect(node('ap-terasa')).toHaveAttribute('data-severity', 'warning');
    // Mesh AP hangs below its parent in the same column.
    const parent = await node('ap-kuchyn').boundingBox();
    const mesh = await node('ap-podkrovi').boundingBox();
    expect(mesh && parent && Math.abs(mesh.x - parent.x) < 1 && mesh.y > parent.y).toBe(true);
    // The tree fills the card and no key text (e.g. router „mimo UniFi“) ends in an ellipsis.
    const fit = await page.evaluate(() => {
      const sc = document.querySelector('.net-topo-scroll') as HTMLElement;
      const r = sc.getBoundingClientRect();
      const nodes = Array.from(sc.querySelectorAll('.net-topo-node')).map((n) =>
        n.getBoundingClientRect(),
      );
      const span = Math.max(...nodes.map((n) => n.right)) - Math.min(...nodes.map((n) => n.left));
      const clipped = Array.from(sc.querySelectorAll('.net-topo-copy strong, .net-topo-copy small'))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent);
      return { fill: span / r.width, clipped };
    });
    expect(fit.clipped).toEqual([]);
    expect(fit.fill).toBeGreaterThan(0.85);
    await node('sw-flex').click();
    await expect(page.getByRole('radio', { name: 'Switche' })).toBeChecked();
    await expect(page.locator('#network-switch-sw-flex')).toBeFocused();
    await page.getByRole('radio', { name: 'Mapa' }).click();
    await node('ap-terasa').click();
    await expect(page.getByRole('radio', { name: 'Přehled' })).toBeChecked();
    await expect(page.locator('[data-testid="network-problem"]:focus')).toContainText('Co s tím');
    await noSidewaysScroll(page);
  });

  test('telefon: svislý sbalitelný strom bez ořezu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-s21', 'phone layout');
    await page.goto('/homebrain-sit/mapa');
    const tree = page.getByTestId('network-topo-phone');
    await expect(tree).toBeVisible({ timeout: 20_000 });
    await expect(tree.locator('[data-kind="ap"]')).toHaveCount(5);
    const robot = tree.locator('[data-node-id="client:c-robot"]');
    await expect(robot).toHaveCount(0);
    await page.getByRole('button', { name: 'Ukázat zařízení u Obývák' }).click();
    await expect(robot).toBeVisible();
    await expect(tree.locator('[data-node-id="more:ap-obyvak"]')).toContainText('další');
    await expect(tree.locator('li[data-type="mesh"] [data-node-id="ap-podkrovi"]')).toBeVisible();
    // Child APs come before client chips; the link meta wraps instead of being cut.
    // Kuchyň is open from the start (its problem client).
    await expect(page.getByRole('button', { name: 'Skrýt zařízení u Kuchyň' })).toBeVisible();
    const kuchyn = tree.locator('li:has(> .net-tree-row [data-node-id="ap-kuchyn"]) > ul > li');
    await expect(kuchyn.first()).toHaveAttribute('data-type', 'mesh');
    const clipped = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '.net-tree .net-topo-copy strong, .net-tree .net-topo-copy small',
        ),
      )
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    );
    expect(clipped).toEqual([]);
    await noSidewaysScroll(page);
    await robot.click();
    await expect(
      page.getByRole('radio', { name: /Zařízení|Přehled/, checked: true }),
    ).toBeVisible();
  });
});

test.describe('Síť V2 – přímé čtení UniFi (?unifi=1)', () => {
  test('desktop: zdroj HA + UniFi, přesné linky, kanály AP a signál klientů', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop layout');
    await page.goto('/homebrain-sit/mapa?unifi=1');
    await expect(page.getByTestId('network-topo-desktop')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('network-source')).toHaveText('Zdroj: HA + UniFi');
    await expect(page.getByTestId('network-source-note')).toHaveCount(0);
    await expect(page.getByTestId('network-topo-source')).toContainText('přímo z řadiče UniFi');
    await expect(
      page.getByTestId('network-topo-chip').filter({ hasText: '\u221269 dBm' }).first(),
    ).toBeVisible();
    await expect(
      page.getByTestId('network-topo-chip').filter({ hasText: 'p6' }).first(),
    ).toBeVisible();
    // Dev harness: a query string breaks SPA tab switching, so open each tab directly.
    await page.goto('/homebrain-sit?unifi=1');
    await expect(page.getByTestId('network-ap-radios').first()).toContainText('GHz', {
      timeout: 20_000,
    });
    await expect(
      page.getByTestId('network-problem').filter({ hasText: 'slabý bezdrátový spoj' }),
    ).toContainText('Co s tím');
    await page.goto('/homebrain-sit/zarizeni?unifi=1');
    await expect(
      page.locator('#network-device-c-tablet [data-testid="network-signal"]'),
    ).toHaveAttribute('data-bars', '1');
    await noSidewaysScroll(page);
  });

  test('bez účtu UniFi: zdroj HA a nápověda, kde ho nastavit', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop layout');
    await page.goto('/homebrain-sit/mapa');
    await expect(page.getByTestId('network-topo-desktop')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('network-source')).toHaveText('Zdroj: HA');
    await expect(page.getByTestId('network-source-note')).toContainText('Síť – UniFi');
    await expect(page.locator('[data-testid="network-signal"]')).toHaveCount(0);
  });

  test('nastavení ukazuje účet z integrace UniFi v HA (bez hesla)', async ({ page }) => {
    await page.goto('/homebrain-sit/hoste?unifi=1');
    await expect(page.getByTestId('network-unifi-account')).toHaveText(
      'Účet: ha (z integrace UniFi)',
      { timeout: 20_000 },
    );
    await noSidewaysScroll(page);
  });

  test('telefon: kanály a signál bez ořezu a bez vodorovného posunu', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-s21', 'phone layout');
    await page.goto('/homebrain-sit?unifi=1');
    await expect(page.getByTestId('network-ap-radios').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('network-source')).toHaveText('Zdroj: HA + UniFi');
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.net-band-label, .net-apl-flag, .net-source'))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    );
    expect(clipped).toEqual([]);
    await noSidewaysScroll(page);
    await page.goto('/homebrain-sit/mapa?unifi=1');
    const tree = page.getByTestId('network-topo-phone');
    await expect(tree).toBeVisible({ timeout: 20_000 });
    await expect(tree.locator('li[data-type="mesh"]').first()).toContainText('dBm');
    await noSidewaysScroll(page);
  });
});

test.describe('Síť – Zátěž Wi-Fi bodů (?unifi=1)', () => {
  for (const project of ['desktop', 'mobile-s21']) {
    test(`${project}: stav AP, pásma s vytížením a žádné úzké sloupce ani překryvy`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== project, `${project} layout`);
      await page.goto('/homebrain-sit?unifi=1');
      const card = page.getByTestId('network-load');
      await expect(card.getByTestId('network-ap-band').first()).toBeVisible({ timeout: 20_000 });
      // Struggling APs first, with the reason as a chip and a sentence.
      const first = card.getByTestId('network-ap-load').first();
      await expect(first).toHaveAttribute('data-ap', 'ap-obyvak');
      await expect(first.getByTestId('network-ap-flag')).toContainText('Přetížený kanál');
      const mesh = card.locator('[data-ap="ap-podkrovi"]');
      await expect(mesh.getByTestId('network-ap-flag')).toContainText(
        /Mesh: slabý signál\s\u221269/,
      );
      await expect(mesh.getByTestId('network-ap-why')).toContainText('bezdrátově');
      await expect(card.getByTestId('network-load-summary')).toHaveText(
        '3 body potřebují pozornost',
      );
      await expect(card.getByTestId('network-load-legend')).toContainText('vytížení kanálu');
      await expect(
        card.locator('[data-ap="ap-dilna"] [data-testid="network-ap-band"]'),
      ).toHaveCount(1);
      // Layout: band chips never collapse into a narrow column and nothing overlaps.
      const report = await card.evaluate((root) => {
        const rect = (el: Element) => el.getBoundingClientRect();
        const bands = Array.from(root.querySelectorAll('[data-testid="network-ap-band"]'));
        const narrow = bands.filter((b) => rect(b).width < 80).map((b) => b.textContent);
        const multiLine = bands.filter((b) => rect(b).height > 40).map((b) => b.textContent);
        const els = Array.from(
          root.querySelectorAll(
            '.net-apl-name, .net-apl-flag, .net-apl-count, .net-load-bar, .net-band, .net-apl-why, .net-apl-meta',
          ),
        );
        const hits: string[] = [];
        for (let i = 0; i < els.length; i++)
          for (let j = i + 1; j < els.length; j++) {
            const a = rect(els[i]!);
            const b = rect(els[j]!);
            if (
              a.left < b.right - 1 &&
              b.left < a.right - 1 &&
              a.top < b.bottom - 1 &&
              b.top < a.bottom - 1
            )
              hits.push(`${els[i]!.textContent} × ${els[j]!.textContent}`);
          }
        const card = rect(root);
        const spill = els
          .filter((el) => rect(el).right > card.right + 0.5 || rect(el).left < card.left - 0.5)
          .map((el) => el.textContent);
        return { narrow, multiLine, hits, spill };
      });
      expect(report).toEqual({ narrow: [], multiLine: [], hits: [], spill: [] });
      await noSidewaysScroll(page);
    });
  }
});
