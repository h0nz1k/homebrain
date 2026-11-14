// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { consumableInfo } from '../consumables.js';
import { parsePhotoManifest } from '../photo.js';
import { RobotPhoto } from './RobotPhoto.js';

afterEach(cleanup);
const example: unknown = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../photo-manifest.example.json'), 'utf8'),
);

it('vibrating plate shows only its own part of the bottom photo', () => {
  const manifest = parsePhotoManifest(example)!;
  manifest.bottom.mops = [];
  manifest.bottom.plate = [10, 60, 90, 100];
  const { container } = render(
    <RobotPhoto
      base="/local/homebrain/robots/synthetic/"
      manifest={manifest}
      name="Robot"
      view="cleaning"
      error={null}
      parts={[]}
      partsLow={false}
      maintenance={false}
      onMaintenance={() => {}}
      onFail={() => {}}
    />,
  );
  const wrap = container.querySelector<HTMLElement>('.rbp-plate-wrap')!;
  expect(wrap.style.top).toBe('60%');
  expect(wrap.style.height).toBe('40%');
  // The crop fills the wrapper (no second placement inside it) …
  const crop = wrap.querySelector<HTMLElement>('.rbp-crop')!;
  expect(crop.style.top).toBe('');
  // … and the photo is scaled/offset so the wrapper shows exactly the plate rectangle.
  const img = crop.querySelector('img')!;
  expect(img.style.width).toBe('125%');
  expect(img.style.height).toBe('250%');
  expect(img.style.left).toBe('-12.5%');
  expect(img.style.top).toBe('-150%');
});

it('uses the measured brush pivot, exposes maintenance controls and handles a missing sprite', () => {
  const manifest = parsePhotoManifest(example)!;
  manifest.bottom.sideBrush = { box: [10, 20, 40], centre: [20, 50], dir: -1 };
  const onFail = vi.fn();
  const onMaintenance = vi.fn();
  const { container } = render(
    <RobotPhoto
      base="/local/homebrain/robots/synthetic/"
      manifest={manifest}
      name="Robot"
      view="cleaning"
      error={null}
      parts={[consumableInfo('main_brush', 30)]}
      partsLow
      maintenance={false}
      onMaintenance={onMaintenance}
      onFail={onFail}
    />,
  );
  const brush = container.querySelector<HTMLElement>('.rbp-brush')!;
  expect(brush.style.transformOrigin).toBe('25% 75%');
  expect(brush.dataset.rbpDir).toBe('-1');
  expect(screen.getByRole('group').getAttribute('aria-label')).toContain('Robot');
  fireEvent.click(screen.getByRole('button', { name: 'Údržba' }));
  expect(onMaintenance).toHaveBeenCalledWith(true);
  fireEvent.error(brush.querySelector('img')!);
  expect(onFail).toHaveBeenCalledOnce();
});
