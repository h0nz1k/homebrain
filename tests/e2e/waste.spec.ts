import { expect, test } from '@playwright/test';

test('český přehled svozů a rozložení', async ({ page }, testInfo) => {
  // Fixtures jsou relativní k hodinám; dopoledne v den svozu (po 14:00 hero přejde dál).
  await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
  await page.goto('/homebrain-odpady');
  await expect(page.getByText('Každá nádoba má svůj den', { exact: true })).toBeVisible();
  await expect(page.getByText('Aktuální', { exact: true })).toBeVisible();
  await expect(page.getByTestId('waste-today')).toHaveCount(0);
  await expect(page.locator('.wb-hero h2')).toHaveText('Papír');
  await expect(page.getByTestId('waste-tomorrow')).toContainText('Svoz zítra:');
  await expect(page.getByTestId('waste-tomorrow')).toContainText('Plasty');
  await expect(page.getByTestId('waste-tomorrow')).toContainText('Sklo');
  const list = page.getByRole('list', { name: 'Nejbližší svozy', exact: true });
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(5);
  await expect(items.nth(0)).toContainText('Zítra');
  await expect(items.nth(1)).toContainText('Zítra');
  await expect(items.nth(2)).toContainText('3 dny');
  const dates = await list
    .locator('.wb-card-copy > time')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime')!));
  expect(dates).toEqual([...dates].sort());
  expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await testInfo.attach(`odpady-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
test('zastaralá data', async ({ page }) => {
  await page.goto('/homebrain-odpady?waste=stale');
  await expect(page.getByText('Zastaralé', { exact: true })).toBeVisible();
  await expect(page.getByText(/Data mohou být zastaralá/)).toBeVisible();
});
test('nedostupná data', async ({ page }) => {
  await page.goto('/homebrain-odpady?waste=unavailable');
  await expect(page.getByText('Nedostupné', { exact: true })).toBeVisible();
  await expect(page.getByText('Data svozu nejsou momentálně dostupná').first()).toBeVisible();
});

for (const [scenario, label] of [
  ['wcs', 'senzor stav = typ, termíny v atributech'],
  ['calendar', 'kalendář jako zdroj'],
] as const) {
  test(`alternativní zdroj: ${label} (Refs #41)`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
    await page.goto(`/homebrain-odpady?waste=${scenario}`);
    await expect(page.getByTestId('waste-today')).toHaveCount(0);
    await expect(page.locator('.wb-hero h2')).toHaveText('Papír');
    await expect(page.getByTestId('waste-tomorrow')).toContainText('Plasty');
    await expect(page.getByTestId('waste-tomorrow')).toContainText('Sklo');
    await expect(page.getByText('Neplatné datum svozu')).toHaveCount(0);
    await expect(page.getByText('Aktuální', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Nejbližší svozy', exact: true }).getByRole('listitem'),
    ).toHaveCount(3);
  });
}

// Review artifacts stay outside Git; use the same mock host and browser harness as all e2e.
for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
    { width: 800, height: 1280 },
    { width: 1440, height: 900 },
  ]) {
    test(`vzhled popelnic ${theme} ${viewport.width}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
      await page.goto(`/homebrain-odpady?theme=${theme}`);
      await expect(page.getByRole('region', { name: 'Příští svoz', exact: true })).toBeVisible();
      await expect(page.locator('.wb-fleet .wb-bin')).toHaveCount(5);
      // Měsíční kalendář listopadu 2026: 6 týdnů × 7 dní, všechny řádky stejně vysoké.
      await expect(page.locator('.wb-calendar .wb-day')).toHaveCount(42);
      await expect(page.locator('.wb-hero')).toHaveCSS('display', 'grid');
      await expect(page.locator('.wb-month-grid')).toHaveCSS('display', 'grid');
      const dayRects = await page.locator('.wb-calendar .wb-day').evaluateAll((days) =>
        days.map((day) => {
          const rect = day.getBoundingClientRect();
          return { top: Math.round(rect.top), height: Math.round(rect.height) };
        }),
      );
      expect(new Set(dayRects.slice(0, 7).map((rect) => rect.top)).size).toBe(1);
      expect(new Set(dayRects.map((rect) => rect.height)).size).toBe(1);

      await expect(page.locator('[class*="wb-animate-"]')).toHaveCount(0);
      expect(await page.locator('html').evaluate((root) => root.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      for (const card of await page.locator('.wb-fleet > li').all()) {
        const artwork = await card.locator('.wb-bin').boundingBox();
        const bounds = await card.boundingBox();
        expect(artwork!.y - bounds!.y).toBeGreaterThan(10);
      }
      for (const img of await page.locator('.wb-sprite').all()) {
        expect(
          await img.evaluate((node) => (node as HTMLImageElement).naturalWidth),
        ).toBeGreaterThan(0);
      }
      const cancelled = page.locator('.wb-day:has(time[datetime="2026-11-14"]) .wb-bin--electro');
      await expect(cancelled).toHaveAttribute('data-availability', 'cancelled');
      await expect(cancelled.locator('.wb-art')).toHaveCSS('opacity', '0.35');
      await expect(cancelled.locator('.wb-strike')).toBeVisible();
      for (const date of ['2026-11-05', '2026-11-19']) {
        await expect(
          page.locator(`.wb-day:has(time[datetime="${date}"]) .wb-bin--bio`),
        ).toBeVisible();
      }
      if (viewport.width >= 1100) {
        const container = await page.locator('.wb-fleet').boundingBox();
        const last = await page.locator('.wb-fleet > li').last().boundingBox();
        expect(last!.x + last!.width).toBeLessThanOrEqual(container!.x + container!.width);
        const rows = await page
          .locator('.wb-card-copy .wb-type')
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
        expect(new Set(rows).size).toBe(1);
      } else if (viewport.width <= 760) {
        // Telefon: svislý seznam řádků přes celou šířku, žádný vodorovný posuv ani scroll-snap.
        const fleet = page.locator('.wb-fleet');
        await expect(fleet).toHaveCSS('flex-direction', 'column');
        await expect(fleet).toHaveCSS('scroll-snap-type', 'none');
        expect(
          await fleet.evaluate((node) => node.scrollWidth - node.clientWidth),
        ).toBeLessThanOrEqual(0);
        const container = (await fleet.boundingBox())!;
        const rows = await fleet.locator(':scope > li').evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, top: rect.top, bottom: rect.bottom, width: rect.width };
          }),
        );
        for (const [index, row] of rows.entries()) {
          expect(Math.abs(row.x - container.x)).toBeLessThan(1);
          expect(Math.abs(row.width - container.width)).toBeLessThan(1);
          if (index > 0) expect(row.top).toBeGreaterThanOrEqual(rows[index - 1]!.bottom);
        }
        // Nic se neořízne: žádný text v řádcích nepřetéká svůj box.
        const overflowing = await fleet.evaluate((node) =>
          Array.from(node.querySelectorAll<HTMLElement>('.wb-card-copy *'))
            .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
            .map((el) => el.className),
        );
        expect(overflowing).toEqual([]);
      }
      const contrast = await page.locator('.wb-panel').evaluate((panel) => {
        const probe = document.createElement('span');
        panel.append(probe);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const paint = (color: string) => {
          probe.style.backgroundColor = color;
          context.fillStyle = getComputedStyle(probe).backgroundColor;
          context.fillRect(0, 0, 1, 1);
        };
        const luminance = () => {
          const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map((value) => value / 255)
            .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
          return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
        };
        paint('var(--hb-t2)');
        const text = luminance();
        const backgrounds: number[] = [];
        for (const base of ['var(--hb-bg)', 'var(--hb-s1)']) {
          paint(base);
          backgrounds.push(luminance());
        }
        for (const type of ['paper', 'glass', 'plastic']) {
          paint('var(--hb-s1)');
          paint(`color-mix(in srgb, var(--hb-waste-${type}) 9%, transparent)`);
          backgrounds.push(luminance());
          paint('var(--hb-ac-s)');
          backgrounds.push(luminance());
        }
        probe.remove();
        return Math.min(
          ...backgrounds.map((bg) => (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05)),
        );
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      await page.evaluate(() => document.fonts.ready);
      const path = `/tmp/hb-waste-review/r6/waste-${viewport.width}-${theme}.png`;
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach(`odpady-${viewport.width}-${theme}`, {
        path,
        contentType: 'image/png',
      });
    });
  }
}
test('animace dnes, večer a po svozu', async ({ page }, testInfo) => {
  // Několik full-page snímků při 2× DPR; na vytíženém runneru nestačí 30 s.
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const [scenario, state, time] of [
    ['', 'today', '2026-11-02T09:30:00Z'],
    ['bins-evening', 'evening', '2026-11-02T19:30:00Z'],
    ['bins-collected', 'empty', '2026-11-02T19:30:00Z'],
  ] as const) {
    await page.clock.setFixedTime(new Date(time));
    await page.goto(`/homebrain-odpady?waste=${scenario}&theme=dark`);
    const hero = page.getByRole('region', { name: 'Příští svoz', exact: true });
    await expect(hero.locator(`.wb-animate-${state}`)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Hold the relevant CSS state at a reviewable point; no production or HA dependency.
    await hero.evaluate(
      (node, time) =>
        node.getAnimations({ subtree: true }).forEach((animation) => {
          animation.pause();
          animation.currentTime = time;
        }),
      state === 'evening' ? 1500 : state === 'today' ? 1000 : 600,
    );
    const path = `/tmp/hb-waste-review/r6/anim-${state}.png`;
    await page.screenshot({ path, fullPage: true, animations: 'allow' });
    await testInfo.attach(`animace-${state}`, { path, contentType: 'image/png' });
  }
});

test('close-up of all eight fractions at 2x and timeline alignment', async ({ browser }) => {
  // Několik full-page snímků při 2× DPR; na vytíženém runneru nestačí 30 s.
  test.slow();
  const context = await browser.newContext({
    viewport: { width: 2300, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-11-02T19:30:00Z') });
  await page.goto('/homebrain-odpady?waste=bins-review&theme=light');
  await expect(page.locator('.wb-fleet .wb-bin')).toHaveCount(7);
  const slots = page.locator('.wb-mini-stack');
  for (const slot of await slots.all()) {
    const boxes = await slot.locator('.wb-bin').evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { bottom: r.bottom, left: r.left, right: r.right };
      }),
    );
    if (boxes.length === 2) {
      expect(Math.abs(boxes[0]!.bottom - boxes[1]!.bottom)).toBeLessThan(1);
      expect(boxes[0]!.right).toBeLessThanOrEqual(boxes[1]!.left);
      expect(boxes[1]!.left - boxes[0]!.right).toBeLessThanOrEqual(2);
      const bounds = await slot.boundingBox();
      expect(
        Math.abs((boxes[0]!.left + boxes[1]!.right) / 2 - (bounds!.x + bounds!.width / 2)),
      ).toBeLessThan(1);
    }
  }
  await expect(page.locator('.wb-day [data-availability="cancelled"]')).toHaveCount(1);
  await page.evaluate(() => {
    const gallery = document.createElement('div');
    gallery.className = 'wb-review-gallery';
    for (const bin of Array.from(
      document.querySelectorAll('.wb-hero .wb-bin, .wb-fleet .wb-bin'),
    )) {
      const cell = document.createElement('div');
      const clone = bin.cloneNode(true) as HTMLElement;
      clone.classList.remove('wb-bin--regular');
      clone.classList.add('wb-bin--hero');
      for (const image of Array.from(clone.querySelectorAll('img'))) {
        image.src = image.src.replace('-96.webp', '-220.webp');
        image.srcset = image.srcset
          .replaceAll('-96.webp', '-220.webp')
          .replaceAll('-192.webp', '-440.webp');
      }

      cell.append(clone);
      const label = document.createElement('p');
      label.textContent = bin.getAttribute('aria-label');
      cell.append(label);
      gallery.append(cell);
    }
    document.querySelector('.wb-panel')!.append(gallery);
  });
  await page.addStyleTag({
    content:
      '.wb-review-gallery { display:grid; grid-template-columns:repeat(4, 240px); gap:24px; padding:24px; width:1080px; background:var(--hb-s1); color:var(--hb-t1); } .wb-review-gallery p { text-align:center; font-size:14px; }',
  });
  await page
    .locator('.wb-review-gallery')
    .screenshot({ path: '/tmp/hb-waste-review/r6/bins-closeup.png' });
  await page
    .locator('[data-theme]')
    .first()
    .evaluate((node) => node.setAttribute('data-theme', 'dark'));
  await page
    .locator('.wb-review-gallery')
    .screenshot({ path: '/tmp/hb-waste-review/r6/bins-closeup-dark.png' });
  await context.close();
});

test('reduced motion keeps the pickup-day sprite open and suppresses CSS motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
  await page.goto('/homebrain-odpady?theme=dark');
  const bin = page.locator('.wb-hero .wb-bin--hero');
  await expect(bin.locator('.wb-sprite--open')).toHaveCSS('opacity', '1');
  await expect(bin.locator('.wb-sprite--closed')).toHaveCSS('opacity', '0');
  expect(await bin.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(
    page.locator('.wb-fleet .wb-bin--bulky').locator('xpath=..').getByRole('progressbar'),
  ).toHaveCount(0);
});

test('empty weeks keep calendar rows equal height (month grid)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-11-02T19:30:00Z') });
  await page.goto('/homebrain-odpady?waste=bins-empty-weeks');
  await expect(page.locator('.wb-calendar .wb-day')).toHaveCount(42);
  const heights = await page
    .locator('.wb-calendar .wb-day')
    .evaluateAll((days) => days.map((day) => Math.round(day.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  // Prázdné týdny nemají žádné popelnice, ale řádek se nesmí zmenšit.
  expect(await page.locator('.wb-calendar .wb-day.is-quiet').count()).toBeGreaterThan(0);
});

test('karty „Další svozy“ mají „Naposledy“ ve stejném formátu jako hero', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
  await page.goto('/homebrain-odpady');
  const format = /^Naposledy (dnes|včera|před \d+ dny · \d+\.\u00a0\d+\.)$/;
  await expect(page.locator('.wb-hero .wb-last')).toHaveText(format);
  const lines = await page
    .locator('.wb-fleet .wb-last')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '').filter(Boolean));
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) expect(line).toMatch(format);
});

test('desktop grid fits every card at its responsive breakpoints', async ({ page }) => {
  await page.goto('/homebrain-odpady');
  for (const width of [1100, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const list = page.locator('.wb-fleet');
    await expect(list).toHaveCSS('display', 'grid');
    const bounds = (await list.boundingBox())!;
    const cards = await list.locator(':scope > li').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { right: rect.right, height: rect.height };
      }),
    );
    expect(cards.at(-1)!.right).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(Math.max(...cards.map((card) => card.right))).toBeLessThanOrEqual(
      bounds.x + bounds.width,
    );
    expect(
      Math.max(...cards.map((card) => card.height)) - Math.min(...cards.map((card) => card.height)),
    ).toBeLessThan(1);
  }
});
