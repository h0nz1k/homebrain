import { expect, it } from 'vitest';
import { moduleManifest } from './index';

it('deklaruje modul Počasí a jeho fázi podle ADR', () => {
  expect(moduleManifest).toEqual({
    id: 'weather',
    titleCs: 'Počasí',
    icon: 'mdi:weather-partly-cloudy',
    phase: 1,
  });
});
