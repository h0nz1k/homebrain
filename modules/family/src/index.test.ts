import { expect, it } from 'vitest';
import { moduleManifest } from './index';

it('deklaruje modul Rodina a jeho fázi podle ADR', () => {
  expect(moduleManifest).toEqual({
    id: 'family',
    titleCs: 'Rodina',
    icon: 'mdi:account-group',
    phase: 4,
  });
});
