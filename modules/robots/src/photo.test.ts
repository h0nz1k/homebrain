import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consumableInfo } from './consumables.js';
import { describeError } from './errors.js';
import {
  anyPartLow,
  errorHotspot,
  maintenanceDots,
  parsePhotoManifest,
  photoBase,
  photoSlug,
  photoView,
} from './photo.js';

const moduleDir = join(import.meta.dirname, '..');
const example = JSON.parse(readFileSync(join(moduleDir, 'photo-manifest.example.json'), 'utf8'));

describe('photo manifest', () => {
  it('parses the synthetic example and rejects broken manifests', () => {
    const manifest = parsePhotoManifest(example);
    expect(manifest?.images.bottom).toBe('bottom.webp');
    expect(manifest?.bottom.mops).toHaveLength(2);
    expect(parsePhotoManifest({ ...example, schema: 2 })).toBeNull();
    expect(
      parsePhotoManifest({ ...example, images: { dock: '../x.webp', bottom: 'b.webp' } }),
    ).toBeNull();
    expect(parsePhotoManifest(null)).toBeNull();
  });

  it('JSON schema lists the same top-level keys', () => {
    const schema = JSON.parse(readFileSync(join(moduleDir, 'photo-manifest.schema.json'), 'utf8'));
    expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(example).sort());
  });

  it('finds the photo folder from the robot name or the image option', () => {
    expect(photoSlug('Bobík')).toBe('bobik');
    expect(photoSlug('Robot 2 – Patro')).toBe('robot-2-patro');
    expect(photoBase({ name: 'Bobík', image: '' })).toBe('/local/homebrain/robots/bobik/');
    expect(photoBase({ name: 'X', image: '/local/my/' })).toBe('/local/my/');
    expect(photoBase({ name: 'X', image: '/local/my/manifest.json' })).toBe('/local/my/');
    expect(photoBase({ name: 'X', image: '/local/robot.png' })).toBeNull();
  });
});

describe('photo view', () => {
  const manifest = parsePhotoManifest(example)!;
  const brushJam = describeError('robot', 'main_brush_jammed')!;
  it('maps states to dock / cleaning / error / maintenance', () => {
    expect(photoView('docked', null, false)).toBe('dock');
    expect(photoView('charging', null, false)).toBe('dock');
    expect(photoView('cleaning', null, false)).toBe('cleaning');
    expect(photoView('returning', null, false)).toBe('cleaning');
    expect(photoView('paused', null, false)).toBe('parked');
    expect(photoView('error', brushJam, false)).toBe('error');
    expect(photoView('error', brushJam, true)).toBe('maintenance');
  });

  it('puts the error hotspot on the faulty part', () => {
    expect(errorHotspot(manifest, brushJam)).toEqual({ layer: 'bottom', at: [50, 46] });
    expect(errorHotspot(manifest, { ...brushJam, part: 'body' })).toBeNull();
    expect(errorHotspot(manifest, { ...brushJam, source: 'dock', part: 'dock' })?.layer).toBe(
      'dock',
    );
  });

  it('marks parts under 25 % amber', () => {
    const parts = [
      consumableInfo('main_brush', 280),
      consumableInfo('side_brush', 30),
      consumableInfo('filter', 100),
    ];
    const dots = maintenanceDots(manifest, parts);
    expect(dots.map((d) => [d.kind, d.low])).toEqual([
      ['main_brush', false],
      ['side_brush', true],
    ]);
    expect(anyPartLow(parts)).toBe(true);
    expect(anyPartLow(parts.slice(0, 1))).toBe(false);
  });
});

it('no photos or other images are committed in the robots module (public repo)', () => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist') continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(webp|png|jpe?g|gif|avif)$/i.test(name)) found.push(relative(moduleDir, path));
    }
  };
  walk(moduleDir);
  expect(found.filter((path) => !path.startsWith('test-fixtures/synthetic/'))).toEqual([]);
});
