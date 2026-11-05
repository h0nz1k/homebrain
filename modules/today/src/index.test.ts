import { expect, it } from 'vitest';
import { moduleManifest } from './index';

it('deklaruje modul Dnes a jeho fázi podle ADR', () => {
  expect(moduleManifest).toEqual({
    id: 'today',
    titleCs: 'Dnes',
    icon: 'mdi:view-dashboard',
    phase: 1,
  });
});
