import { expect, it } from 'vitest';
import { moduleManifest } from './index';

it('deklaruje modul Zdraví a jeho fázi podle ADR', () => {
  expect(moduleManifest).toEqual({
    id: 'health',
    titleCs: 'Zdraví',
    icon: 'mdi:heart-pulse',
    phase: 3,
  });
});
