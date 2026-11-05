import { expect, it } from 'vitest';
import { moduleManifest } from './index';

it('deklaruje modul Energie a jeho fázi podle ADR', () => {
  expect(moduleManifest).toEqual({
    id: 'energy',
    titleCs: 'Energie',
    icon: 'mdi:lightning-bolt',
    phase: 2,
  });
});
