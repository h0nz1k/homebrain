import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 15_000 });
async function open(page: Page, query = '') {
  await page.goto(`/homebrain-kuchyn?kitchen=radio${query}`);
  await expect(page.getByTestId('kitchen-view')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rádio Ráno', exact: true })).toBeVisible();
}
async function geometry(page: Page) {
  const errors = await page.locator('.kn').evaluate((root) => {
    const problems: string[] = [];
    const viewport = { width: innerWidth, height: innerHeight };
    const area = root.querySelector('.kn-content')!.getBoundingClientRect();
    const visible = (r: DOMRect) =>
      r.width &&
      r.height &&
      r.top >= 0 &&
      r.bottom <= viewport.height &&
      r.left >= 0 &&
      r.right <= viewport.width;
    if (
      document.documentElement.scrollWidth > innerWidth ||
      document.documentElement.scrollHeight > innerHeight + 1
    )
      problems.push('document overflow');
    const controls = Array.from(
      root.querySelectorAll<HTMLElement>('button,input[type="range"]'),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        visible(r) && (!el.closest('.kn-content') || (r.top >= area.top && r.bottom <= area.bottom))
      );
    });
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      const compactHead = el.closest('.kn-section-head')?.querySelector('[data-size="sm"]') === el;
      if (!compactHead && (r.width < 55.5 || r.height < 55.5))
        problems.push(`target ${el.textContent}: ${r.width}×${r.height}`);
      if (compactHead && (r.width < 48 || r.height < 32))
        problems.push(`target ${el.textContent}: ${r.width}×${r.height}`);
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (top && !el.contains(top) && top !== el) problems.push(`occluded ${el.textContent}`);
    }
    for (let i = 0; i < controls.length; i++)
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]!,
          b = controls[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const x = a.getBoundingClientRect(),
          y = b.getBoundingClientRect();
        if (
          Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
          Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1
        )
          problems.push(`overlap ${a.textContent}/${b.textContent}`);
      }
    const textRects: { node: Node; rect: DOMRect }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim()) continue;
      const el = node.parentElement!;
      if (el.closest('style,[aria-hidden="true"],.hb-visually-hidden')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (
          !visible(r) ||
          (el.closest('.kn-content') && (r.top < area.top || r.bottom > area.bottom))
        )
          continue;
        textRects.push({ node, rect: r });
        const label16 = [
          'Kuchyň',
          'Stačí klepnout a hraje',
          'Další rádia',
          'YT Music',
          'otevře aplikaci',
          'Hlasitost',
          'nabíjení omezeno',
        ];
        const raw = node.textContent?.trim() ?? '';
        if (raw.length < 4 && el.closest('.kn-timers')) continue;
        const need16 = label16.some((bit) => raw.includes(bit)) || el.closest('.kn-clock span');
        if (need16 && Number.parseFloat(style.fontSize) < 16)
          problems.push(`small label ${raw}: ${style.fontSize}`);
        if (!need16 && Number.parseFloat(style.fontSize) < 14)
          problems.push(`small text ${node.textContent}`);
        const parent = el.getBoundingClientRect();
        if (
          r.right > parent.right + 2 &&
          style.textOverflow !== 'ellipsis' &&
          !el.closest('.kn[data-tab="cooking"]')
        )
          problems.push(`clipped text ${node.textContent}`);
      }
    }
    for (let i = 0; i < textRects.length; i++)
      for (let j = i + 1; j < textRects.length; j++) {
        const a = textRects[i]!,
          b = textRects[j]!;
        if (a.node === b.node) continue;
        if (
          Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 1 &&
          Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 1
        )
          problems.push(`text overlap ${a.node.textContent}/${b.node.textContent}`);
      }
    return problems;
  });
  expect(errors).toEqual([]);
}
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 800, height: 1280 },
])
  for (const theme of ['dark', 'light']) {
    test(`Kuchyň ${viewport.width}×${viewport.height} ${theme}: Hudba, Vaření a geometrie`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page, `&theme=${theme}`);
      await geometry(page);
      const scrollSlack = viewport.width === 1280 && viewport.height === 800 ? 280 : 1;
      await expect
        .poll(() => page.locator('.kn-content').evaluate((el) => el.scrollHeight - el.clientHeight))
        .toBeLessThanOrEqual(scrollSlack);
      await expect(page.locator('.kn-clock time')).toHaveCSS('font-size', '40px');
      expect(
        await page
          .locator('.kn-playlists .kn-art')
          .evaluateAll((els) => els.every((el) => el.getBoundingClientRect().width >= 100)),
      ).toBe(true);
      await page.getByRole('button', { name: 'Rádio Ráno', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { __hbKitchenLog: unknown[] }).__hbKitchenLog),
        )
        .toContainEqual(
          expect.objectContaining({
            type: 'homebrain/kitchen/play',
            media_id: 'demo://radio/0',
            media_type: 'radio',
          }),
        );
      await page.getByRole('button', { name: 'Vše ›', exact: true }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Další výběr' })).toHaveCount(0);
      await page.getByLabel('Poskytovatel', { exact: true }).selectOption('demo_ytm_b');
      await expect(page.getByRole('button', { name: 'Další výběr' })).toBeVisible();
      await page.getByRole('button', { name: 'Zavřít', exact: true }).click();
      await page.getByRole('radio', { name: 'Vaření', exact: true }).click();
      await expect(page.getByTestId('kitchen-recipes')).toBeVisible();
      await geometry(page);
      await page.getByRole('button', { name: '+ Minutka', exact: true }).click();
      await expect(page.getByTestId('kitchen-quick')).toBeVisible();
      await page.getByTestId('kitchen-preset-5').click();
      await page.getByRole('button', { name: 'Zavřít', exact: true }).click();
      await expect(page.getByTestId('kitchen-timers-card')).toContainText('Minutka 5 min');
    });
  }

test('settings are admin only and save persists a selected player', async ({ page }) => {
  await open(page);
  await page.getByTestId('kitchen-settings-open').click();
  await expect(page.getByTestId('kitchen-settings')).toBeVisible();
  await page.getByLabel('Výstup · přehrávač Music Assistantu').selectOption('');
  await page.getByRole('button', { name: 'Uložit nastavení', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.kn-notice')).toContainText('Vyberte přehrávač');
  await open(page, '&session=kiosk');
  await expect(page.getByTestId('kitchen-settings-open')).toHaveCount(0);
  await open(page, '&session=adult');
  await expect(page.getByTestId('kitchen-settings-open')).toHaveCount(0);
});

test('unconfigured and unavailable player states disable play; MA outage is explicit', async ({
  page,
}) => {
  for (const state of ['no-player', 'unavailable-player', 'unavailable']) {
    await page.goto(`/homebrain-kuchyn?kitchen=${state}`);
    await expect(page.getByTestId('kitchen-view')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rádio Ráno', exact: true })).toBeDisabled();
    await expect(page.locator('.kn-notice')).toContainText(
      state === 'unavailable' ? 'Music Assistant není dostupný' : 'Vyberte přehrávač',
    );
  }
});

test('active cooking goes above recipes and rest creates a shared timer; fryer start confirms', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, '&cooking=active');
  await page.getByRole('radio', { name: 'Vaření', exact: true }).click();
  await expect(page.getByTestId('recipes-fryer-live')).toBeVisible();
  await geometry(page);
  await expect
    .poll(() =>
      page.locator('.kn-cook-slot').evaluateAll((elements) => elements.map((el) => el.className)),
    )
    .toEqual([
      'kn-cook-slot kn-slot-fryer',
      'kn-cook-slot kn-slot-meater',
      'kn-cook-slot kn-slot-timers',
      'kn-cook-slot kn-slot-recipes',
    ]);
  await page.getByRole('button', { name: 'Spustit odpočinek 10 min', exact: true }).click();
  await expect(page.getByTestId('kitchen-timers-card')).toContainText(
    /Odpočinek · Hovězí roštěná · \d+ min/,
  );
  await page.goto('/homebrain-kuchyn?kitchen=idle');
  await page.getByRole('radio', { name: 'Vaření', exact: true }).click();
  await page.getByRole('button', { name: 'Otevřít fritézu', exact: true }).click();
  await page.getByTestId('fryer-start').click();
  await expect(page.getByTestId('fryer-start-dialog')).toBeVisible();
  const log = await page.evaluate(
    () => (window as unknown as { __hbRecipesLog: { kind: string }[] }).__hbRecipesLog,
  );
  expect(log.some((x) => x.kind === 'fryer_start')).toBe(false);
});

test.describe('kiosk 1280×800 polish', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach((_, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'landscape kiosk');
  });

test('cooking active compact cards and recipes above player', async ({ page }) => {
  await open(page, '&cooking=active&theme=dark');
  await page.getByRole('radio', { name: 'Vaření', exact: true }).click();
  const report = await page.evaluate(() => {
    const bar = document.querySelector('.kn-player')!.getBoundingClientRect();
    const barTop = bar.top;
    const heading = document.querySelector('[data-testid="kitchen-recipes"] h2')!;
    const firstRecipe = document.querySelector('.kn-recipe-grid button')!;
    const h = heading.getBoundingClientRect();
    const r = firstRecipe.getBoundingClientRect();
    const cards = Array.from(
      document.querySelectorAll('.kn-cooking-active .kn-cook-slot:not(.kn-slot-recipes) .kn-card'),
    );
    const tall = cards
      .map((el) => Math.round(el.getBoundingClientRect().height))
      .filter((ht) => ht > 360);
    const badTimerText = Array.from(
      document.querySelectorAll('.kn-timers .rc-tcard .hb-btn'),
    ).some((btn) =>
      Array.from(btn.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && /[‖◉▢]/.test(n.textContent ?? ''),
      ),
    );
    const badOutput = Array.from(document.querySelector('.kn-output')!.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && /[‖◉▢]/.test(n.textContent ?? ''),
    );
    return {
      headingBottom: h.bottom,
      recipeMid: r.top + r.height / 2,
      barTop,
      tall,
      badGlyphs: badTimerText || badOutput,
    };
  });
  expect(report.headingBottom).toBeLessThan(report.barTop - 8);
  expect(report.recipeMid).toBeLessThan(report.barTop - 8);
  expect(report.tall).toEqual([]);
  expect(report.badGlyphs).toBe(false);
});

test('Hudba labels, Máma row, and Vše alignment', async ({ page }) => {
  await open(page, '&theme=dark');
  const report = await page.evaluate(() => {
    const bar = document.querySelector('.kn-player')!.getBoundingClientRect();
    const px = (el: Element | null) =>
      el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0;
    const sizes: Record<string, number> = {
      'nabíjení omezeno': px(document.querySelector('.kn-battery small')),
      'Hlasitost · 38 %': px(document.querySelector('.kn-volume label')),
      'Další rádia': px(document.querySelector('.kn-more > span')),
      'YT Music': px(document.querySelector('.kn-person .kn-section-head small')),
    };
    const mamaSection = Array.from(document.querySelectorAll('.kn-person')).find((el) =>
      el.textContent?.includes('Máma'),
    );
    const mamaBottom = mamaSection?.getBoundingClientRect().bottom ?? 0;
    const dalsi = document.querySelector('.kn-more > span');
    const dalsiLine = dalsi
      ? getComputedStyle(dalsi).whiteSpace.includes('nowrap') &&
        (dalsi.getBoundingClientRect().height <= 22)
      : false;
    const vse = document.querySelector('.kn-person .hb-btn[data-size="sm"]')!;
    const head = vse.closest('.kn-section-head')!;
    const aligned =
      Math.abs(vse.getBoundingClientRect().right - head.getBoundingClientRect().right) < 3;
    const mamaCovers = mamaSection
      ? Array.from(mamaSection.querySelectorAll('.kn-art')).some(
          (node) => (node as Element).getBoundingClientRect().bottom >= bar.top - 1,
        )
      : false;
    const mamaOk = mamaBottom > 0 && mamaBottom < bar.top && !mamaCovers;
    return { sizes, dalsiLine, aligned, mamaOk, mamaBottom, barTop: bar.top };
  });
  for (const bit of ['nabíjení omezeno', 'Hlasitost · 38 %', 'Další rádia', 'YT Music']) {
    expect(report.sizes[bit] ?? 0).toBeGreaterThanOrEqual(16);
  }
  expect(report.dalsiLine).toBe(true);
  expect(report.aligned).toBe(true);
  expect(report.mamaOk).toBe(true);
});

});

// The kiosk's recipe entry must stay in HomeBrain, including the destination panel's role gate.

test('kiosk opens a recipe from Vaření', async ({ page }) => {
  await open(page, '&session=kiosk');
  await page.getByRole('radio', { name: 'Vaření', exact: true }).click();
  await page.getByRole('button', { name: /Svíčková na smetaně/ }).click();
  await expect(page).toHaveURL(/homebrain-recepty\//);
  await expect(page.getByTestId('recipes-view')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Svíčková na smetaně', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('ha-default-dashboard')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTestId('kitchen-view')).toBeVisible();
});
