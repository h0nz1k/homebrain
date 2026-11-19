import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

// Rodina (dev mock: synthetic household „Dcera“ + „Syn“, `?role=` role, `?rodina=empty`).

async function open(page: Page, query = '') {
  await page.goto(`/homebrain-rodina${query}`);
  await expect(page.getByTestId('family')).toBeVisible({ timeout: 20_000 });
}

/**
 * DOM QA for the add-chore sheet: scrolled to the bottom, the last form control (and the
 * summary under it) sits fully above the floating footer with ≥ 12 px to spare, nothing of it
 * is covered, and the body reserves the footer's measured height (+16 px).
 */
async function expectLastControlClear(page: Page) {
  const r = await page.getByTestId('family-add-chore-sheet').evaluate(async (sheet) => {
    const body = sheet.querySelector<HTMLElement>('.hb-sheet-body')!;
    const foot = sheet.querySelector<HTMLElement>('.hb-sheet-foot')!;
    body.scrollTop = body.scrollHeight;
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const controls = Array.from(
      sheet.querySelectorAll<HTMLElement>(
        '#fam-add-chore input, #fam-add-chore button, #fam-add-chore [role="radio"]',
      ),
    ).filter((el) => el.getClientRects().length > 0);
    const last = controls.at(-1)!;
    const summary = sheet.querySelector<HTMLElement>('[data-testid="family-chore-summary-box"]')!;
    const footTop = foot.getBoundingClientRect().top;
    const bodyTop = body.getBoundingClientRect().top;
    const covered = (el: HTMLElement) => {
      const b = el.getBoundingClientRect();
      return [b.top + 2, b.bottom - 2].some((y) => {
        const hit = document.elementFromPoint(b.left + b.width / 2, y);
        return !hit || !(el === hit || el.contains(hit));
      });
    };
    const pad = parseFloat(getComputedStyle(body).paddingBottom);
    return {
      lastBottom: last.getBoundingClientRect().bottom,
      lastTop: last.getBoundingClientRect().top,
      summaryBottom: summary.getBoundingClientRect().bottom,
      footTop,
      bodyTop,
      lastCovered: covered(last),
      pad,
      footH: foot.getBoundingClientRect().height,
    };
  });
  expect(r.lastTop).toBeGreaterThanOrEqual(r.bodyTop);
  expect(r.lastBottom).toBeLessThanOrEqual(r.footTop - 12);
  expect(r.summaryBottom).toBeLessThanOrEqual(r.footTop - 12);
  expect(r.lastCovered).toBe(false);
  expect(Math.abs(r.pad - (r.footH + 16))).toBeLessThanOrEqual(1.5);
}

/** WCAG contrast of an element's text (or fill) against its composited background. */
async function contrastOf(page: Page, selector: string, prop: 'color' | 'background' = 'color') {
  return page.evaluate(
    ({ selector, prop }) => {
      const ctx = Object.assign(document.createElement('canvas'), {
        width: 1,
        height: 1,
      }).getContext('2d', { willReadFrequently: true })!;
      const rgba = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return [r!, g!, b!, a! / 255] as const;
      };
      const over = (top: readonly number[], under: readonly number[]) =>
        [0, 1, 2].map((i) => top[i]! * top[3]! + under[i]! * (1 - top[3]!));
      const bgOf = (el: Element | null): number[] => {
        const chain: (readonly number[])[] = [];
        for (let n = el; n; n = n.parentElement) {
          const c = rgba(getComputedStyle(n).backgroundColor);
          if (c[3] > 0) chain.push(c);
          if (c[3] >= 1) break;
        }
        let acc = [255, 255, 255];
        const root = rgba(getComputedStyle(document.body).backgroundColor);
        if (root[3] > 0) acc = over(root, acc);
        for (const c of chain.reverse()) acc = over(c, acc);
        return acc;
      };
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      return Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0)
        .map((el) => {
          const cs = getComputedStyle(el);
          const under = bgOf(prop === 'color' ? el : el.parentElement!.parentElement);
          const fg = over(rgba(prop === 'color' ? cs.color : cs.backgroundColor), under);
          const [a, b] = [lum(fg), lum(under)].sort((x, y) => y - x);
          return { text: el.textContent?.trim() ?? '', ratio: (a! + 0.05) / (b! + 0.05) };
        });
    },
    { selector, prop },
  );
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
      '+2\u00a0body čekají na schválení',
    );
    // The handover wait shows on its row only (not repeated in the kid header).
    await expect(page.getByTestId('family-pending-swaps')).toHaveCount(0);
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
    ).toHaveText('Splnění čeká na schválení');
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
    await expect(approval.getByTestId('family-approval-points')).toHaveText('+4 body');
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
    await expect(original.getByTestId('family-pending-pill')).toHaveText(
      'Předání čeká na schválení',
    );
    await expect(
      page
        .locator('[data-kid="syn"] [data-testid="family-chore"]')
        .filter({ hasText: 'Uklidit boty' })
        .getByTestId('family-pending-pill'),
    ).toHaveText('Splnění čeká na schválení');
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
    await page.getByRole('radio', { name: 'Dny v týdnu' }).click();
    await expect(page.getByRole('button', { name: 'Po', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Ne', exact: true })).toBeVisible();
    const summary = page.getByTestId('family-chore-summary');
    await expect(summary).toContainText('Dcera · 2\u00a0body · Po a Čt do\u00a018:00 · od\u00a0');
    await page.getByRole('radio', { name: 'Denně', exact: true }).click();
    await expect(summary).toContainText('každý den do\u00a018:00');
    await page.getByRole('radio', { name: 'Dny v týdnu' }).click();
    await page.getByTestId('family-add-chore-save').click();
    await expect(page.getByTestId('family-name-error')).toHaveText('Doplň název úkolu.');
    await expect(page.getByTestId('family-add-chore-sheet')).toBeVisible();
    await page.locator('#fam-add-chore input').first().fill('Zalít květiny');
    await expect(page.getByTestId('family-name-error')).toHaveCount(0);
    // Nothing hides behind the pinned footer once the form is scrolled to the end.
    await expectLastControlClear(page);
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
      'Tento měsíc čistě +116\u00a0bodů',
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

  test('čeština: skloněná jména, žádné „nevím“, štítky nepřelézají sloupec bodů', async ({
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
    // Distinct labels („Předání…“ / „Splnění čeká na schválení“): at most two lines, and
    // neither they nor the handover tags run under the points column (phone + tablet columns).
    for (const width of [360, 800]) {
      await page.setViewportSize({ width, height: 800 });
      const chips = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-testid="family-pending-pill"], .fam-chore-meta [data-testid="family-swap-note"]',
          ),
        ).map((el) => {
          const box = el.getBoundingClientRect();
          const pts = el.closest('.fam-chore')!.querySelector('.fam-pts')!.getBoundingClientRect();
          return { text: el.textContent, height: box.height, gap: pts.left - box.right };
        }),
      );
      expect(chips.length).toBeGreaterThan(2);
      for (const c of chips) {
        expect(c.height, c.text!).toBeLessThanOrEqual(44);
        expect(c.gap, c.text!).toBeGreaterThanOrEqual(0);
      }
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
      'Tento měsíc čistě +116\u00a0bodů',
    );
    await expect(page.getByTestId('family-points-month-earned')).toHaveText('+156 bodů');
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
    await page.getByRole('radio', { name: 'Dny v týdnu' }).click();
    for (const d of ['St', 'Pá', 'So'])
      await page.getByRole('button', { name: d, exact: true }).click();
    const tokens = page.getByTestId('family-summary-token');
    await expect(
      tokens.filter({ hasText: /^od\u00a0(dneška|zítřka|\d{1,2}\.\u00a0\d{1,2}\.)$/ }),
    ).toHaveCount(1);
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

// Owner test on rc.66: a chore due tomorrow was invisible, a second save failed with a generic
// error hidden under the sticky footer. Both must be visible without scrolling.
test.describe('Rodina – přidání úkolu', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`vytvoření: potvrzení a úkol je hned vidět (${theme})`, async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByTestId('family-add-chore').first().click();
      const sheet = page.getByTestId('family-add-chore-sheet');
      await expect(sheet.getByTestId('family-add-chore-title-who')).toHaveText(' · Dcera');
      const forKid = sheet.getByTestId('family-add-chore-for');
      await expect(forKid).toContainText('Pro:');
      await expect(forKid.locator('.fam-foot-kid b')).toHaveText(['Dcera']);
      await expect(forKid).toBeInViewport({ ratio: 1 });
      await sheet.locator('#fam-chore-name').fill('Vytřít chodbu');
      await sheet.getByRole('radio', { name: 'Jednou' }).click();
      const tomorrow = await page.evaluate(() =>
        new Date(Date.now() + 86_400_000).toLocaleDateString('cs-CZ'),
      );
      await sheet.getByTestId('family-first-date').fill(tomorrow);
      await expect(sheet.getByTestId('family-add-chore-when')).toHaveText('zítra do\u00a018:00');
      await sheet.getByTestId('family-add-chore-save').click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId('hb-toast').last()).toContainText(
        'Úkol přidán: Dcera · zítra do\u00a018:00',
      );
      const row = page
        .locator('[data-kid="dcera"] [data-testid="family-upcoming-chore"]')
        .filter({ hasText: 'Vytřít chodbu' });
      await expect(row).toHaveAttribute('data-highlight', 'true');
      await expect(row.getByTestId('family-upcoming-day')).toHaveText(/^zítra\u00a0·\u00a0/u);
      await expect(row).toContainText('18:00');
      await expect(row).toBeInViewport();
      await noSidewaysScroll(page);
    });

    test(`duplicitní název: chyba je vidět u tlačítka bez scrollu (${theme})`, async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByTestId('family-add-chore').first().click();
      const sheet = page.getByTestId('family-add-chore-sheet');
      await sheet.locator('#fam-chore-name').fill('Vyndat myčku');
      await sheet.getByTestId('family-add-chore-save').click();
      const alert = sheet.getByRole('alert');
      await expect(sheet.getByTestId('family-add-chore-error-text')).toHaveText(
        'Dcera už má úkol „Vyndat myčku“.',
      );
      await expect(alert).not.toContainText('Úkol s tímto názvem už existuje.');
      await expect(alert).toBeInViewport({ ratio: 1 });
      await expect(sheet.getByTestId('family-add-chore-save')).toBeInViewport({ ratio: 1 });
      const save = sheet.getByTestId('family-add-chore-save');
      await expect(save).toHaveText('Uložit úkol');
      // The same name would fail again: plain Save is visibly disabled, the panel leads.
      await expect(save).toHaveAttribute('aria-disabled', 'true');
      await expect(save).toHaveAttribute('data-variant', 'secondary');
      expect(Number(await save.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.7);
      await expect(sheet.getByTestId('family-add-chore-dup-wait')).toHaveText(
        'Nejdřív vyber jednu z možností výše',
      );
      await expect(sheet.getByTestId('family-add-chore-dup-wait')).toBeInViewport({ ratio: 1 });
      // Playwright refuses to click an aria-disabled button; a real click event must not save.
      await save.dispatchEvent('click');
      await expect(alert).toBeVisible();
      await expect(sheet).toBeVisible();
      await expect(alert.getByRole('button')).toHaveText([
        'Přidat další čas (vícekrát denně)',
        'Uložit jako „Vyndat myčku (2)“',
      ]);
      await expect(sheet.getByText('Změnit název')).toHaveCount(0);
      await expect(sheet.getByTestId('family-name-duplicate')).toHaveText(
        'Tento název už existuje.',
      );
      // Error sits directly above Save inside the pinned footer.
      const a = (await alert.boundingBox())!;
      const b = (await save.boundingBox())!;
      expect(a.y + a.height).toBeLessThanOrEqual(b.y);
      if ((page.viewportSize()?.width ?? 0) <= 400) expect(a.height).toBeLessThanOrEqual(124);
      await expectLastControlClear(page);
      await sheet.getByTestId('family-duplicate-rename').click();
      await expect(sheet).toHaveCount(0);
      await expect(
        page.locator('[data-testid="family-chore"], [data-testid="family-upcoming-chore"]', {
          hasText: 'Vyndat myčku (2)',
        }),
      ).toHaveCount(1);
      await noSidewaysScroll(page);
    });
  }

  test('vícekrát denně: dva časy → dva úkoly s vlastním termínem', async ({ page }) => {
    await open(page);
    await page.getByTestId('family-add-chore').first().click();
    const sheet = page.getByTestId('family-add-chore-sheet');
    await sheet.locator('#fam-chore-name').fill('Myčka horní koš');
    await sheet.getByRole('radio', { name: 'Vícekrát' }).click();
    await expect(sheet.getByTestId('family-multi-time')).toHaveCount(2);
    const tomorrow = await page.evaluate(() =>
      new Date(Date.now() + 86_400_000).toLocaleDateString('cs-CZ'),
    );
    await sheet.getByTestId('family-first-date').fill(tomorrow);
    await expect(sheet.getByTestId('family-chore-summary')).toContainText(
      'každý den 2× (12:00 a 18:00) · od\u00a0zítřka',
    );
    await sheet.getByTestId('family-add-chore-save').click();
    await expect(sheet).toHaveCount(0);
    const rows = page.locator('[data-kid="dcera"] [data-testid="family-upcoming-chore"]', {
      hasText: 'Myčka horní koš',
    });
    await expect(rows).toHaveCount(2);
    for (const [i, time] of ['12:00', '18:00'].entries()) {
      await expect(rows.nth(i).getByTestId('family-upcoming-day')).toHaveText(/^zítra\u00a0·/u);
      await expect(rows.nth(i)).toContainText(time);
    }
  });

  test('duplicita → „Přidat další čas“: časy vidět, jméno zůstane, chyba zmizí', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('family-add-chore').first().click();
    const sheet = page.getByTestId('family-add-chore-sheet');
    await sheet.locator('#fam-chore-name').fill('Vyndat myčku');
    await sheet.getByTestId('family-add-chore-save').click();
    await sheet.getByTestId('family-duplicate-multi').click();
    await expect(sheet.getByRole('alert')).toHaveCount(0);
    await expect(sheet.locator('#fam-chore-name')).toHaveValue('Vyndat myčku');
    await expect(sheet.getByRole('radio', { name: 'Vícekrát' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const times = sheet.getByTestId('family-multi-times');
    await expect(times).toHaveAttribute('data-flash', 'true');
    await expect(times.getByTestId('family-multi-time')).toHaveCount(2);
    await expect(times.getByTestId('family-multi-time').first()).toBeInViewport({ ratio: 1 });
    // No input focus ring in this state: the group itself takes focus.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('FIELDSET');
    // ✕ targets ≥ 44 px, ≥ 3:1 even when disabled at the minimum of 2, with the reason.
    for (const f of await contrastOf(page, '[data-testid="family-multi-remove"]'))
      expect(f.ratio, 'remove ✕').toBeGreaterThanOrEqual(3);
    for (const box of await times
      .getByTestId('family-multi-remove')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(times.getByTestId('family-multi-remove').first()).toBeDisabled();
    await expect(times.getByTestId('family-multi-note')).toHaveText('Aspoň 2 časy.');
    // Times panel shares the left inset of the other blocks.
    const insets = await sheet.evaluate((el) =>
      ['#fam-chore-name', '[data-testid="family-multi-times"]', '.fam-summary'].map((q) =>
        Math.round(el.querySelector(q)!.getBoundingClientRect().left),
      ),
    );
    expect(new Set(insets).size).toBe(1);
    await expect(sheet.getByText('Každé splnění má vlastní body')).toHaveCount(0);
    await expect(sheet.getByTestId('family-chore-summary')).toContainText(
      'za každé splnění (4\u00a0body denně)',
    );
    const tomorrow = await page.evaluate(() =>
      new Date(Date.now() + 86_400_000).toLocaleDateString('cs-CZ'),
    );
    await sheet.getByTestId('family-first-date').fill(tomorrow);
    await expect(sheet.getByTestId('family-add-chore-save')).toHaveAttribute(
      'data-variant',
      'primary',
    );
    await expectLastControlClear(page);
    await sheet.getByTestId('family-add-chore-save').click();
    await expect(sheet).toHaveCount(0);
    await expect(
      page.locator('[data-kid="dcera"] [data-testid="family-upcoming-chore"]', {
        hasText: /Vyndat myčku \(\d{2}:\d{2}\)/,
      }),
    ).toHaveCount(2);
  });

  test('formulář: poslední pole nikdy pod patičkou (každý stav)', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await page.getByTestId('family-add-chore').first().click();
    const sheet = page.getByTestId('family-add-chore-sheet');
    await expectLastControlClear(page); // empty, „Denně“
    await sheet.getByRole('radio', { name: 'Jednou' }).click();
    await expectLastControlClear(page);
    await sheet.getByRole('radio', { name: 'Dny v týdnu' }).click();
    await expectLastControlClear(page);
    await sheet.getByRole('radio', { name: 'Vícekrát' }).click();
    for (let i = 0; i < 4; i += 1) await sheet.getByTestId('family-multi-add').click();
    await expect(sheet.getByTestId('family-multi-time')).toHaveCount(6);
    await expectLastControlClear(page); // 6 times
    await sheet.getByTestId('family-icon-pick').click();
    await expectLastControlClear(page);
    await sheet.getByTestId('family-add-chore-save').click(); // invalid: errors inline
    await expectLastControlClear(page);
    await sheet.locator('#fam-chore-name').fill('Vyndat myčku');
    await sheet.getByRole('radio', { name: 'Denně', exact: true }).click();
    await sheet.getByTestId('family-add-chore-save').click();
    await expect(sheet.getByRole('alert')).toBeVisible();
    await expectLastControlClear(page); // duplicate panel in the footer
    // Mid-scroll the footer casts a shadow / fade over the content; at the end it does not.
    const scrollable = await sheet.locator('.hb-sheet-body').evaluate((el) => {
      el.scrollTop = 0;
      return el.scrollHeight - el.clientHeight > 2;
    });
    if (scrollable) await expect(sheet).not.toHaveAttribute('data-fam-scroll-end');
    else await expect(sheet).toHaveAttribute('data-fam-scroll-end', '');
  });

  test('Opakování: jedna řada, žádná mřížka 2×2; titulek s počtem dětí', async ({ page }) => {
    await open(page);
    await page.getByTestId('family-add-chore').first().click();
    const sheet = page.getByTestId('family-add-chore-sheet');
    const tops = await sheet
      .getByRole('radiogroup', { name: 'Opakování' })
      .getByRole('radio')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    // Every label on one line (no wrapped segment) at this width.
    const wrapped = await sheet
      .getByRole('radiogroup', { name: 'Opakování' })
      .getByRole('radio')
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            return r.getClientRects().length > 1 || el.scrollWidth > el.clientWidth + 1;
          })
          .map((el) => el.textContent),
      );
    expect(wrapped).toEqual([]);
    await expect(sheet.getByTestId('family-recurrence-hint')).toHaveText('Denně – jednou za den');
    await sheet.getByRole('radio', { name: 'Vícekrát' }).click();
    await expect(sheet.getByTestId('family-recurrence-hint')).toHaveText(
      'Vícekrát denně – každý čas zvlášť',
    );
    await sheet.getByTestId('family-who-chip').nth(1).click();
    await expect(sheet.getByTestId('family-add-chore-title-who')).toHaveText(' · 2 děti');
    const titleColor = await sheet
      .getByTestId('family-add-chore-title-who')
      .evaluate((el) => getComputedStyle(el).color);
    const accent = await sheet.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--hb-ac').trim(),
    );
    expect(titleColor).not.toBe(accent);
    await expect(sheet.getByTestId('family-points-value')).toHaveText('2body');
    await expect(sheet.locator('#fam-icon-label')).toHaveText('Ikona (nepovinná)');
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`kiosk: naplánované kompaktně pod dneškem, karta se vejde (${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, `?kiosk=1&theme=${theme}`);
      const up = page.locator('[data-kid="dcera"] [data-testid="family-upcoming"]');
      await expect(up).toHaveAttribute('data-compact', 'line');
      await expect(up).toContainText('Naplánované:');
      await expect(up.getByTestId('family-upcoming-item').first()).toHaveText(
        'Zítra: Vyndat myčku',
      );
      // Readable from across the kitchen: ≥ 18 px and ≥ 4,5:1.
      for (const f of await contrastOf(page, '.fam-upcoming-item, .fam-upcoming-more-inline'))
        expect(f.ratio, `plan line „${f.text}“`).toBeGreaterThanOrEqual(4.5);
      expect(
        parseFloat(await up.evaluate((el) => getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(18);
      // The handover wait is on its row; the kid header does not repeat it.
      await expect(page.getByTestId('family-pending-swaps')).toHaveCount(0);
      // Whole items only: every shown item fits, the rest is counted as „a N další“.
      for (const kid of ['dcera', 'syn']) {
        const line = page.locator(`[data-kid="${kid}"] [data-testid="family-upcoming"]`);
        const fit = await line.evaluate((el) => {
          const box = el.querySelector('.fam-upcoming-items')!;
          const right = box.getBoundingClientRect().right;
          const items = Array.from(el.querySelectorAll<HTMLElement>('.fam-upcoming-item'));
          const shown = items.filter((i) => !i.hasAttribute('data-hidden'));
          return {
            total: items.length,
            shown: shown.length,
            overflow: shown.some((i) => i.getBoundingClientRect().right > right + 0.5),
            more: el.querySelector('[data-testid="family-upcoming-more"]')?.textContent ?? '',
            ellipsis: getComputedStyle(box).textOverflow,
          };
        });
        expect(fit.overflow).toBe(false);
        // A 1280 px kiosk always has room for at least the nearest planned chore.
        expect(fit.shown).toBeGreaterThan(0);
        expect(fit.ellipsis).not.toBe('ellipsis');
        if (fit.shown < fit.total) expect(fit.more).toMatch(/^a \d+ další(ch)?$/);
        else expect(fit.more).toBe('');
      }
      const card = (await page.getByTestId('family-chores').boundingBox())!;
      expect(card.y + card.height).toBeLessThanOrEqual(800);
      // Today's rows of the last kid still fit inside the card (the plan line must not push
      // them out of the fixed-height kiosk card).
      const last = (await page
        .locator('[data-kid="syn"] [data-testid="family-chore"]')
        .last()
        .boundingBox())!;
      expect(last.y + last.height).toBeLessThanOrEqual(card.y + card.height);
      const line = (await page
        .locator('[data-kid="syn"] [data-testid="family-upcoming"]')
        .boundingBox())!;
      expect(line.y + line.height).toBeLessThanOrEqual(card.y + card.height);
    });
  }
});

test.describe('Rodina – seznam dětí', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`kontrast: vedlejší text ≥ 4,5:1, segmenty ≥ 3:1 (${theme})`, async ({ page }) => {
      await open(page, `?theme=${theme}`);
      const text = [
        '.fam-list-h',
        '.fam-list-h small',
        '.fam-upcoming-when',
        '.fam-upcoming-time',
        '.fam-upcoming-pts',
        '.fam-kid-h small',
        '.fam-chore-meta .fam-due',
        '.fam-chore[data-muted] .fam-chore-t b',
        '.fam-pts',
        '.fam-pts[data-out] s',
        '.fam-pts[data-out] span[aria-hidden]',
        '.fam-total-link',
        '.fam-done-sum small',
      ];
      for (const sel of text) {
        const found = await contrastOf(page, sel);
        // „Hotovo: N“ folds only on phones; every other selector exists in every layout.
        if (sel !== '.fam-done-sum small') expect(found.length, sel).toBeGreaterThan(0);
        for (const f of found) expect(f.ratio, `${sel} „${f.text}“`).toBeGreaterThanOrEqual(4.5);
      }
      for (const f of await contrastOf(page, '.fam-points strong'))
        expect(f.ratio, `points „${f.text}“`).toBeGreaterThanOrEqual(3);
      const segs = await contrastOf(page, '.fam-bar i', 'background');
      expect(segs.length).toBeGreaterThan(0);
      for (const f of segs) expect(f.ratio, 'progress segment').toBeGreaterThanOrEqual(3);
    });
  }

  test('předání: body přeškrtnuté s „→ jméno“, různé štítky čekání, ⋯ u každého aktivního', async ({
    page,
  }) => {
    await open(page);
    const out = page.locator(
      '[data-kid="dcera"] [data-testid="family-chore"][data-swap="transferred_out"]',
    );
    await expect(out.getByTestId('family-pts-out')).toContainText('→\u00a0Syn');
    await expect(out.locator('.fam-pts s')).toHaveCSS('text-decoration-line', 'line-through');
    // Same avatar fill for the same kid: handed-to avatar vs. the kid's own card avatar.
    const fill = (loc: ReturnType<Page['locator']>) =>
      loc.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(await fill(out.getByTestId('family-handed-avatar'))).toBe(
      await fill(page.locator('[data-kid="syn"] [data-testid="family-kid-avatar"]')),
    );
    await expect(
      page.locator('[data-testid="family-pending-pill"][data-pending="swap"]').first(),
    ).toHaveText('Předání čeká na schválení');
    await expect(
      page.locator('[data-testid="family-pending-pill"][data-pending="completion"]').first(),
    ).toHaveText('Splnění čeká na schválení');
    const rows = page.locator('[data-testid="family-chore"]');
    for (let i = 0; i < (await rows.count()); i += 1) {
      const row = rows.nth(i);
      const [state, swap] = await row.evaluate((el) => [
        (el as HTMLElement).dataset.state,
        (el as HTMLElement).dataset.swap,
      ]);
      const actionable =
        (state === 'todo' || state === 'overdue') &&
        swap !== 'pending_give' &&
        swap !== 'transferred_out';
      await expect(row.getByTestId('family-chore-menu')).toHaveCount(actionable ? 1 : 0);
      // Deadline first in the meta line, the points vertically centred in the row.
      const geo = await row.evaluate((el) => {
        const meta = el.querySelector('.fam-chore-meta');
        const due = el.querySelector('.fam-due');
        const pts = el.querySelector('.fam-pts')!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return {
          dueFirst: !due || meta?.firstElementChild === due,
          centre: Math.abs(pts.top + pts.height / 2 - (r.top + r.height / 2)),
        };
      });
      expect(geo.dueFirst).toBe(true);
      expect(geo.centre).toBeLessThanOrEqual(3);
    }
  });

  test('naplánované: „Dnes“ a „Naplánované“, pevný sloupec data, jeden styl data', async ({
    page,
  }) => {
    await open(page);
    const kid = page.locator('[data-kid="dcera"]');
    await expect(kid.getByTestId('family-today-h')).toHaveText('Dnes');
    await expect(kid.getByTestId('family-upcoming-h')).toContainText('Naplánované');
    const days = await kid.getByTestId('family-upcoming-day').allTextContents();
    expect(days.length).toBeGreaterThan(1);
    for (const d of days)
      expect(d).toMatch(
        /^(dnes|(zítra\u00a0·\u00a0)?(po|út|st|čt|pá|so|ne)\u00a0\d{1,2}\.\u00a0\d{1,2}\.)$/u,
      );
    await expect(kid.getByTestId('family-upcoming-h')).toHaveText(
      /^Naplánované · \d+ úkol(y|ů)?· další dny$/u,
    );
    // Upcoming titles share the left edge of today's titles.
    const lefts = await kid
      .locator('.fam-upcoming-name, [data-testid="family-chore"] .fam-chore-t > b')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1);
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

// Owner visual check of the add-chore fix (outside git): HB_FAMILY_CHORE_SHOTS=<dir>.
const choreShots = process.env.HB_FAMILY_CHORE_SHOTS;

test.describe('Rodina – přidání úkolu, snímky (lokálně)', () => {
  test.skip(!choreShots, 'nastav HB_FAMILY_CHORE_SHOTS');
  for (const theme of ['dark', 'light'] as const) {
    test(`snímky ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      const shot = (name: string, fullPage = false) =>
        page.screenshot({ path: join(choreShots!, `${name}-${theme}.png`), fullPage });
      await page.setViewportSize({ width: 360, height: 800 });
      await open(page, `?theme=${theme}`);
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator('[data-kid="dcera"] [data-testid="family-upcoming"]')
        .scrollIntoViewIfNeeded();
      await shot('phone-list-upcoming');
      await page.getByTestId('family-add-chore').first().click();
      const sheet = page.getByTestId('family-add-chore-sheet');
      await shot('phone-form-empty');
      await sheet.locator('#fam-chore-name').fill('Vyndat myčku');
      await sheet.getByTestId('family-add-chore-save').click();
      await expect(sheet.getByRole('alert')).toBeVisible();
      await shot('phone-form-duplicate');
      await sheet.getByTestId('family-duplicate-multi').click();
      await page.waitForTimeout(1900);
      await shot('phone-form-multi');
      await sheet.locator('.hb-sheet-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
      await page.waitForTimeout(200);
      await shot('phone-form-bottom');
      await sheet.locator('#fam-chore-name').fill('Myčka horní koš');
      await sheet.getByTestId('family-add-chore-save').click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId('hb-toast').last()).toBeVisible();
      await shot('phone-created-toast');

      await page.setViewportSize({ width: 800, height: 1280 });
      await open(page, `?theme=${theme}`);
      await shot('tablet-list', true);
      await page.getByTestId('family-add-chore').nth(1).click();
      await shot('tablet-form');

      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, `?kiosk=1&theme=${theme}`);
      await shot('kiosk');

      await page.setViewportSize({ width: 360, height: 800 });
      await open(page, `?role=child&theme=${theme}`);
      await page.getByTestId('family-upcoming').scrollIntoViewIfNeeded();
      await shot('phone-child');
    });
  }
});
