import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

// Rodina (dev mock: synthetic household „Dcera“ + „Syn“, `?role=` role, `?rodina=empty`).

async function open(page: Page, query = '') {
  await page.goto(`/homebrain-rodina${query}`);
  await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Rodina', () => {
  test('rodič: dnešek, 7 dní, povinnosti obou dětí a nákup', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('family-today')).toContainText('Dnes v rodině');
    // The running/next event is highlighted once, not repeated in the list.
    const listed =
      (await page.getByTestId('family-event').count()) +
      (await page.getByTestId('family-next').count());
    expect(listed).toBe(4);
    await expect(page.getByTestId('family-day')).toHaveCount(7);
    await expect(page.getByTestId('family-kid')).toHaveCount(2);
    await expect(page.getByTestId('family-total').first()).toContainText('128');
    await expect(page.getByTestId('family-pending-points').first()).toHaveText(
      '+2\u00a0b. čeká na schválení',
    );
    await expect(page.getByTestId('family-pending-swaps').first()).toHaveText(
      'Předání čeká na schválení',
    );
    await expect(page.getByTestId('family-shop-item')).toHaveCount(6);
    await noSidewaysScroll(page);
  });

  test('rodič schválí povinnost, odškrtne a přidá nákup', async ({ page }) => {
    await open(page);
    const claimed = page.locator('[data-testid="family-chore"][data-state="claimed"]');
    await expect(claimed).toHaveCount(1);
    await page.getByTestId('family-approve').first().click();
    await expect(page.locator('[data-testid="family-chore"][data-state="claimed"]')).toHaveCount(0);
    await page.getByTestId('family-shop-input').fill('Chleba');
    await page.getByTestId('family-shop-add').click();
    await expect(page.getByTestId('family-shopping')).toContainText('Chleba');
    await expect(page.getByTestId('family-shop-input')).toHaveValue('');
    const first = page.getByTestId('family-shop-item').first();
    await first.getByTestId('family-shop-toggle').click();
    await expect(page.locator('[data-testid="family-shop-item"][data-done]')).toHaveCount(3);
  });

  test('dítě: jen vlastní povinnosti, bez schvalování a detailů událostí', async ({ page }) => {
    await open(page, '?role=child');
    await expect(page.getByTestId('family-kid')).toHaveCount(1);
    await expect(page.getByTestId('family-chores')).toContainText('Moje povinnosti');
    await expect(page.getByTestId('family-approve')).toHaveCount(0);
    await expect(page.getByTestId('family-event-detail')).toHaveCount(0);
    const todo = page.locator('[data-testid="family-chore"][data-state="todo"]').first();
    await todo.getByTestId('family-chore-check').click();
    await expect(page.locator('[data-testid="family-chore"][data-state="claimed"]')).toHaveCount(2);
  });

  test('kuchyňský tablet: tři sloupce bez scrollu, dítě odškrtne povinnost', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '?kiosk=1');
    await expect(page.getByTestId('family')).toHaveAttribute('data-kiosk', 'true');
    await expect(page.getByTestId('family-approve')).toHaveCount(0);
    await expect(page.getByTestId('family-clock')).toBeVisible();
    await expect(page.getByTestId('family-add-chore')).toHaveCount(0);
    await expect(page.getByTestId('family-total')).toHaveCount(0);
    await expect(page.getByTestId('family-chore-menu')).toHaveCount(0);
    await expect(page.getByTestId('family-day')).toHaveCount(7);
    await expect(
      page.locator('[data-testid="family-pending-pill"][data-pending="completion"]'),
    ).toHaveText(/Čeká na schválení$/);
    // The chores card fits the 800 px kiosk: bottom edge (with its padding) inside the viewport.
    const card = await page.getByTestId('family-chores').boundingBox();
    expect(card!.y + card!.height).toBeLessThanOrEqual(800);
    await expect(page.getByTestId('family-done-summary').first()).toContainText('Hotovo: 2');
    // Balanced columns: every column's last card ends on the same line.
    const bottoms = await Promise.all(
      ['family-week', 'family-chores', 'family-shopping'].map(async (id) => {
        const b = (await page.getByTestId(id).boundingBox())!;
        return Math.round(b.y + b.height);
      }),
    );
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(2);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(800);
    const check = await page.getByTestId('family-chore-check').first().boundingBox();
    expect(check!.width).toBeGreaterThanOrEqual(48);
    const box = await page.getByTestId('family-shop-toggle').first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    await noSidewaysScroll(page);
  });

  test('mobil: nákup hned pod dneškem, před povinnostmi', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    const top = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
    expect(await top('family-shopping')).toBeLessThan(await top('family-chores'));
    expect(await top('family-today')).toBeLessThan(await top('family-shopping'));
    await noSidewaysScroll(page);
  });

  test('rodič: přidá úkol, otevře přehled bodů a schválí předání', async ({ page }) => {
    await open(page);
    await page.getByTestId('family-add-chore').first().click();
    await expect(page.getByTestId('family-add-chore-sheet')).toBeVisible();
    await page.locator('#fam-add-chore input').first().fill('Vytřít chodbu');
    await page.getByTestId('family-add-chore-save').click();
    await page.getByTestId('family-swap-approve').first().click();
    await expect(page.getByText('Převzato od Dcery').first()).toBeVisible();
    await page.getByTestId('family-total').first().click();
    await expect(page.getByTestId('family-points-sheet')).toBeVisible();
  });

  test('předání: žádající, úkol, příjemce a čekající stav před rozhodnutím', async ({ page }) => {
    await open(page);
    const approval = page.locator('.fam-approval[data-kind="swap"]');
    await expect(approval).toContainText('Žádá Dcera');
    await expect(approval).toContainText('Vyluxovat pokoj');
    await expect(approval.getByTestId('family-approval-points')).toHaveText('+4 b.');
    await expect(approval).toContainText('Syn');
    const original = page
      .locator('[data-kid="dcera"] [data-testid="family-chore"]')
      .filter({ hasText: 'Vyluxovat pokoj' });
    await expect(original).toHaveAttribute('data-swap', 'pending_give');
    await expect(original).not.toHaveAttribute('data-muted');
    await expect(original.getByTestId('family-pending-pill')).toHaveAttribute(
      'data-pending',
      'swap',
    );
    await expect(original.getByTestId('family-pending-pill')).toHaveText(/Čeká na schválení$/);
    await expect(
      page
        .locator('[data-kid="syn"] [data-testid="family-chore"]')
        .filter({ hasText: 'Uklidit boty' })
        .getByTestId('family-pending-pill'),
    ).toHaveAttribute('data-pending', 'completion');
    await approval.getByTestId('family-swap-approve').click();
    await expect(original).toHaveAttribute('data-swap', 'transferred_out');
    await expect(original.getByTestId('family-swap-note')).toHaveText('Předáno Synovi · jen dnes');
    await expect(
      page
        .locator('[data-kid="syn"] [data-testid="family-chore"]')
        .filter({ hasText: 'Vyluxovat pokoj' }),
    ).toContainText('Převzato od Dcery · jen dnes');
    await expect(approval).toHaveCount(0);
  });

  test('vybrané dny a živé shrnutí nového úkolu', async ({ page }) => {
    await open(page);
    await page.getByTestId('family-add-chore').first().click();
    // No error before the user touched the name; it appears inline after a submit attempt.
    await expect(page.getByTestId('family-name-error')).toHaveCount(0);
    await expect(page.getByTestId('family-icon-pick')).toHaveText(/Vybrat/);
    await page.getByRole('radio', { name: 'Vybrané dny' }).click();
    await expect(page.getByRole('button', { name: 'Po', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Ne', exact: true })).toBeVisible();
    const summary = page.getByTestId('family-chore-summary');
    await expect(summary).toContainText('Dcera · 2\u00a0b. · Po a Čt do\u00a018:00 · od\u00a0');
    await page.getByRole('radio', { name: 'Denně' }).click();
    await expect(summary).toContainText('každý den do\u00a018:00');
    await page.getByRole('radio', { name: 'Vybrané dny' }).click();
    await page.getByTestId('family-add-chore-save').click();
    await expect(page.getByTestId('family-name-error')).toHaveText('Doplň název úkolu.');
    await expect(page.getByTestId('family-add-chore-sheet')).toBeVisible();
    await page.locator('#fam-add-chore input').first().fill('Zalít květiny');
    await expect(page.getByTestId('family-name-error')).toHaveCount(0);
    // Nothing hides behind the pinned footer once the form is scrolled to the end.
    const sheet = page.getByTestId('family-add-chore-sheet');
    await sheet.locator('.hb-sheet-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
    const footTop = (await sheet.locator('.hb-sheet-foot').boundingBox())!.y;
    const fields = sheet.locator('#fam-add-chore input, [data-testid="family-chore-summary-box"]');
    for (let i = 0; i < (await fields.count()); i += 1) {
      const box = (await fields.nth(i).boundingBox())!;
      if (box.y > 0) expect(box.y + box.height).toBeLessThanOrEqual(footTop + 0.5);
    }
  });

  test('body: graf je vidět po otevření na telefonu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await page.getByTestId('family-total').first().click();
    await expect(page.getByTestId('family-points-chart')).toBeVisible();
    const chart = await page.getByTestId('family-points-chart').boundingBox();
    expect(chart!.y).toBeGreaterThan(0);
    expect(chart!.y + chart!.height).toBeLessThan(844);
    await expect(page.getByTestId('family-points-month')).toHaveText(
      'Tento měsíc čistě +116\u00a0b.',
    );
    await expect(page.getByTestId('family-points-sheet')).not.toContainText('k dispozici ·');
  });

  test('jedna barva osoby: přítomnost i povinnosti', async ({ page }) => {
    await open(page);
    const presence = await page
      .locator('[data-testid="presence-person"]', { hasText: 'Syn' })
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--hb-presence-c').trim());
    const chores = await page
      .locator('[data-kid="syn"]')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--fam-kid').trim());
    expect(presence).toBe('#0d9488');
    expect(chores).toBe(presence);
  });

  test('dítě: bez ⋯ u hotových a čekajících úkolů, vidí, kdo se dívá', async ({ page }) => {
    await open(page, '?role=child');
    await expect(page.getByTestId('family-viewer')).toHaveText(/Syn/);
    for (const state of ['done', 'claimed']) {
      await expect(
        page.locator(`[data-testid="family-chore"][data-state="${state}"]`).first(),
      ).toBeVisible();
      await expect(
        page.locator(
          `[data-testid="family-chore"][data-state="${state}"] [data-testid="family-chore-menu"]`,
        ),
      ).toHaveCount(0);
    }
    const menu = page.getByTestId('family-chore-menu').first();
    const box = await menu.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('čeština: skloněná jména, žádné „nevím“, krátké čekající štítky na jednom řádku', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    const text = await page.getByTestId('family').innerText();
    expect(text).not.toContain('nevím');
    expect(text).not.toMatch(/Předáno: (Syn|Dcera)|Převzato od: (Syn|Dcera)/);
    expect(text).toContain('Předáno Synovi');
    const pills = page.getByTestId('family-pending-pill');
    expect(await pills.count()).toBeGreaterThan(0);
    for (let i = 0; i < (await pills.count()); i += 1) {
      const box = (await pills.nth(i).boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(30);
    }
    await expect(page.locator('.fam-free').first()).toHaveText('Nic v plánu');
  });

  test('barvy: děti mají vlastní barvu, odlišnou od kategorií kalendáře', async ({ page }) => {
    await open(page);
    const hex = await page.evaluate(() => {
      const v = (el: Element | null) =>
        el ? getComputedStyle(el).getPropertyValue('--fam-kid').trim() : '';
      const src = Array.from(document.querySelectorAll('[data-testid="family-legend"] > span')).map(
        (el) => getComputedStyle(el).getPropertyValue('--fam-src').trim(),
      );
      return {
        kids: ['dcera', 'syn'].map((k) => v(document.querySelector(`[data-kid="${k}"]`))),
        src,
      };
    });
    const lab = (h: string) => {
      const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const [r, g, b] = c.map((x) => (x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92));
      const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      const X = f((r! * 0.4124 + g! * 0.3576 + b! * 0.1805) / 0.95047);
      const Y = f(r! * 0.2126 + g! * 0.7152 + b! * 0.0722);
      const Z = f((r! * 0.0193 + g! * 0.1192 + b! * 0.9505) / 1.08883);
      return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
    };
    const dE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]!));
    expect(hex.src).toHaveLength(2);
    expect(dE(hex.kids[0]!, hex.kids[1]!)).toBeGreaterThanOrEqual(20);
    for (const kid of hex.kids)
      for (const src of hex.src) expect(dE(kid, src)).toBeGreaterThanOrEqual(20);
    // Grandparents (presence only) stay clearly apart from the kids too.
    const deda = await page
      .locator('[data-testid="presence-person"]', { hasText: 'Děda' })
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--hb-presence-c').trim());
    for (const kid of hex.kids) expect(dE(kid, deda)).toBeGreaterThanOrEqual(20);
  });

  for (const [label, query] of [
    ['rodič', ''],
    ['dítě', '?role=child'],
    ['kiosk', '?kiosk=1'],
  ] as const) {
    test(`kalendář (${label}): tečka = kategorie, nikdy barva osoby; čepice za názvem`, async ({
      page,
    }) => {
      await page.setViewportSize(
        query === '?kiosk=1' ? { width: 1280, height: 800 } : { width: 360, height: 800 },
      );
      await open(page, query);
      const res = await page.evaluate(() => {
        const probe = document.createElement('i');
        document.body.append(probe);
        const rgb = (c: string) => ((probe.style.color = c), getComputedStyle(probe).color);
        const cats = Array.from(
          document.querySelectorAll('[data-testid="family-legend"] > span'),
        ).map((el) => rgb(getComputedStyle(el).getPropertyValue('--fam-src').trim()));
        const members = [
          ...Array.from(document.querySelectorAll('[data-kid], .fam-avatar')).map((el) =>
            getComputedStyle(el).getPropertyValue('--fam-kid').trim(),
          ),
          ...Array.from(document.querySelectorAll('[data-testid="presence-person"]')).map((el) =>
            getComputedStyle(el).getPropertyValue('--hb-presence-c').trim(),
          ),
        ]
          .filter(Boolean)
          .map(rgb);
        const dots = Array.from(
          document.querySelectorAll('[data-testid="family-week-event"] > i'),
        ).map((el) => getComputedStyle(el).backgroundColor);
        const caps = Array.from(document.querySelectorAll('[data-testid="family-school-cap"]')).map(
          (el) => el.parentElement?.tagName,
        );
        probe.remove();
        return { cats, members: [...new Set(members)], dots, caps };
      });
      expect(res.cats).toHaveLength(2);
      expect(res.members.length).toBeGreaterThan(1);
      expect(res.dots.length).toBeGreaterThan(5);
      for (const dot of res.dots) {
        expect(res.cats).toContain(dot);
        expect(res.members).not.toContain(dot);
      }
      // The school cap sits inline in the title, never pinned to the right edge.
      expect(res.caps.length).toBeGreaterThan(0);
      for (const tag of res.caps) expect(tag).toBe('EM');
    });
  }

  for (const query of ['', '?role=child', '?kiosk=1']) {
    test(`čeká na rodiče: jedna (jantarová) barva pro všechny čekající stavy ${query}`, async ({
      page,
    }) => {
      await open(page, query);
      const res = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[data-status="pending"]'));
        return {
          kinds: els.map((el) => el.getAttribute('data-testid') ?? el.tagName),
          colors: els.map((el) =>
            el.tagName === 'I' ? getComputedStyle(el).backgroundColor : getComputedStyle(el).color,
          ),
          done: Array.from(document.querySelectorAll('[data-testid="family-swap-note"]')).map(
            (el) => getComputedStyle(el).color,
          ),
        };
      });
      expect(res.kinds).toEqual(expect.arrayContaining(['family-pending-pill', 'I']));
      if (!query) expect(res.kinds).toEqual(expect.arrayContaining(['family-pending-swaps']));
      expect(new Set(res.colors).size).toBe(1);
      // Completed handover tags keep the blue accent, distinct from „needs a parent“.
      for (const c of res.done) expect(c).not.toBe(res.colors[0]);
    });
  }

  test('body: hlavička čistě a dlaždice získáno sedí s rozpisem (získáno − utraceno)', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('family-total').first().click();
    await expect(page.getByTestId('family-points-month')).toHaveText(
      'Tento měsíc čistě +116\u00a0b.',
    );
    await expect(page.getByTestId('family-points-month-earned')).toHaveText('+156 b.');
    const sum = async (id: string) =>
      (await page.getByTestId(id).locator('strong').allInnerTexts())
        .map((t) => Number(t.replace(/[^\d]/g, '')))
        .reduce((a, b) => a + b, 0);
    expect(await sum('family-points-earned')).toBe(156);
    expect((await sum('family-points-earned')) - (await sum('family-points-spent'))).toBe(116);
  });

  for (const [label, query, width] of [
    ['dítě 360', '?role=child', 360],
    ['rodič 360', '', 360],
    ['rodič 1280', '', 1280],
    ['kiosk 1280', '?kiosk=1', 1280],
  ] as const) {
    test(`řádky úkolů (${label}): sloupec bodů končí na stejném místě`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, query);
      const lists = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.fam-chores')).map((ul) =>
          Array.from(ul.querySelectorAll(':scope > li .fam-pts')).map(
            (el) => el.getBoundingClientRect().right,
          ),
        ),
      );
      expect(lists.length).toBeGreaterThan(0);
      for (const rights of lists) {
        expect(rights.length).toBeGreaterThan(1);
        expect(Math.max(...rights) - Math.min(...rights)).toBeLessThanOrEqual(1);
      }
    });
  }

  test('datum v souhrnu nového úkolu se nezalomí (360 px)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    await page.getByTestId('family-add-chore').first().click();
    await page.getByRole('radio', { name: 'Vybrané dny' }).click();
    for (const d of ['St', 'Pá', 'So'])
      await page.getByRole('button', { name: d, exact: true }).click();
    const tokens = page.getByTestId('family-summary-token');
    await expect(tokens.filter({ hasText: /^od\u00a0\d{1,2}\.\u00a0\d{1,2}\.$/ })).toHaveCount(1);
    for (let i = 0; i < (await tokens.count()); i += 1) {
      const rects = await tokens.nth(i).evaluate((el) => el.getClientRects().length);
      expect(rects).toBe(1);
    }
  });

  test('nic nenastaveno: neutrální text, žádná chyba', async ({ page }) => {
    await open(page, '?role=adult&rodina=empty');
    await expect(page.getByTestId('family-no-calendar')).toContainText('zatím není nastaven');
    await expect(page.getByTestId('family-chores')).toHaveCount(0);
  });
});

const evidenceDir = process.env.HB_FAMILY_SCREENSHOT_DIR;
const evidenceSizes = [
  { width: 360, height: 800, label: '360x800' },
  { width: 800, height: 1280, label: '800x1280' },
  { width: 1440, height: 900, label: '1440x900' },
] as const;

test.describe('Rodina – vizuální důkaz (lokálně)', () => {
  test.skip(!evidenceDir, 'nastav HB_FAMILY_SCREENSHOT_DIR');

  for (const size of evidenceSizes) {
    test(`snímek ${size.label}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await open(page);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: join(evidenceDir!, `family-overview-${size.label}.png`),
        fullPage: true,
      });
      await page.getByTestId('family-total').first().click();
      await expect(page.getByTestId('family-points-sheet')).toBeVisible();
      await page.screenshot({
        path: join(evidenceDir!, `family-points-${size.label}.png`),
        fullPage: true,
      });
    });
  }
});
