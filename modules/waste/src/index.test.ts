import { expect, it } from 'vitest';
import { moduleManifest } from './index';

it('deklaruje modul Odpady a jeho fázi podle ADR', () => {
  expect(moduleManifest).toEqual({
    id: 'waste',
    titleCs: 'Odpady',
    icon: 'mdi:trash-can',
    phase: 1,
  });
});
