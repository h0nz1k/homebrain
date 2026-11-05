import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// The real library bundle must keep assets external and resolve them relative to the
// versioned HA static prefix. All responses are local files or synthetic fixtures.
test('bundled waste sprites resolve under the versioned HA static prefix (Refs #77)', async ({
  page,
}) => {
  const prefix = '/homebrain_static/review-r5/';
  const requested: string[] = [];
  await page.route(`**${prefix}**`, async (route) => {
    const file = new URL(route.request().url()).pathname.slice(prefix.length);
    if (file === 'review.html') {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="cs"><body><script type="module">
        import './homebrain-panel.js';
        import { createFakeHass } from './testing.js';
        const now = new Date().toISOString();
        const event = { id: 'synthetic-paper', waste_type: 'paper', display_name: 'Papír', collection_date: '2026-11-02', availability: 'confirmed', visual_token: 'waste.paper', source_updated_at: now };
        const panel = document.createElement('homebrain-panel');
        panel.panel = { config: { module: 'waste' } };
        panel.hass = createFakeHass({ 'sensor.demo_waste_dataset': { entity_id: 'sensor.demo_waste_dataset', state: 'ready', last_updated: now, attributes: { waste_dashboard: { schema_version: 1, generated_at: now, source_status: 'available', source_updated_at: now, events: [event], notices: [] } } } });
        document.body.append(panel);
      </script></body></html>`,
      });
    } else {
      const source =
        file === 'testing.js'
          ? new URL('../../packages/testing/dist/index.js', import.meta.url)
          : new URL(`../../apps/panel/dist/${file}`, import.meta.url);
      requested.push(file);
      await route.fulfill({
        body: await readFile(source),
        contentType: file.endsWith('.webp')
          ? 'image/webp'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.woff2')
              ? 'font/woff2'
              : 'application/javascript',
      });
    }
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-02T08:30:00Z') });
  await page.goto(`${prefix}review.html`);
  const open = page.locator('.wb-hero .wb-sprite--open');
  await expect(open).toBeVisible();
  const source = await open.getAttribute('src');
  expect(source).toMatch(/\/homebrain_static\/review-r5\/assets\/bin-papir-open-220-[\w-]+\.webp$/);
  expect(await open.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(220);
  expect(requested.some((file) => /^assets\/bin-papir-open-220-[\w-]+\.webp$/.test(file))).toBe(
    true,
  );
});
