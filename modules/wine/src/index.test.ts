import { expect, it } from 'vitest';
import { moduleManifest } from './index';

it('deklaruje modul Vinotéka a jeho fázi podle ADR', () => {
  expect(moduleManifest).toEqual({
    id: 'wine',
    titleCs: 'Vinotéka',
    icon: 'mdi:glass-wine',
    phase: 3,
  });
});
