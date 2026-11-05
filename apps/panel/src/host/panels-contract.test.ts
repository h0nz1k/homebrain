import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { MODULE_PANEL_PATHS, panelUrl } from '@homebrain/ha-client';

// Single source: custom_components/homebrain/panels.json (read by const.py and generated
// into packages/ha-client/src/panels.generated.ts by scripts/gen-panels.mjs).
const root = join(import.meta.dirname, '../../../..');
type Panel = { url_path: string; module: string };
const panels = JSON.parse(
  readFileSync(join(root, 'custom_components/homebrain/panels.json'), 'utf8'),
) as { modules: Panel[]; settings: Panel; kiosk: { url_path: string } };
const registered = new Set([...panels.modules, panels.settings].map((p) => p.url_path));

it('keeps Přístup tabs inside the Přístup panel', () => {
  expect(panelUrl('/access/test')).toBe('/homebrain-pristup/test');
  expect(panelUrl('/access')).toBe('/homebrain-pristup');
});

it('maps every panel the integration registers to the same url path', () => {
  for (const panel of panels.modules) expect(MODULE_PANEL_PATHS[panel.module]).toBe(panel.url_path);
  expect(MODULE_PANEL_PATHS.settings).toBe(panels.settings.url_path);
});

it('only links to panels the integration registers', () => {
  for (const [id, path] of Object.entries(MODULE_PANEL_PATHS))
    expect(registered.has(path.split('/')[0]!), `${id} -> ${path}`).toBe(true);
});

it('routes every frontend module into a registered panel', () => {
  const ids = readdirSync(join(root, 'modules'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  expect(ids.length).toBeGreaterThan(5);
  for (const id of ids) {
    const top = panelUrl(`/${id}/x`).split('/')[1]!;
    expect(registered.has(top), `${id} -> ${panelUrl(`/${id}/x`)}`).toBe(true);
  }
});

it('has the generated frontend panel table in sync with panels.json', () => {
  expect(() =>
    execFileSync(process.execPath, [join(root, 'scripts/gen-panels.mjs'), '--check'], {
      stdio: 'pipe',
    }),
  ).not.toThrow();
});
