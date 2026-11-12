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
