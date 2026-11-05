import { expect, it } from 'vitest';
import { deriveWineSignals, temperatureRange } from './signals.js';
import { createSyntheticWines } from './mock.js';

const now = new Date('2026-10-31T09:00:00Z');
it('teplota mimo rozsah → signál notice/warning', () => {
  expect(temperatureRange(12)).toBe('ok');
  expect(temperatureRange(16.4)).toBe('soft');
  expect(temperatureRange(19)).toBe('hard');
  const s = deriveWineSignals({
    wines: [],
    temperature: { value: 19, updatedAt: now.toISOString() },
    humidity: { value: 40, updatedAt: null },
    now,
  });
  expect(s.map((x) => [x.id, x.severity])).toEqual([
    ['wine.cellar.temperature', 'warning'],
    ['wine.cellar.humidity', 'notice'],
  ]);
  expect(s[0]).toMatchObject({
    module: 'wine',
    kind: 'state',
    value: { v: '19', unit: '°C' },
    action: { href: '/wine' },
  });
  expect(
    deriveWineSignals({ wines: [], temperature: { value: 12, updatedAt: null }, now }),
  ).toEqual([]);
});
it('okno pití: seskupené signály jen pro vína skladem', () => {
  const wines = createSyntheticWines(2026);
  const s = deriveWineSignals({ wines, now });
  const ids = s.map((x) => x.id);
  expect(ids.every((id) => id.startsWith('wine.window.'))).toBe(true);
  for (const sig of s) {
    expect(sig.related!.length).toBeGreaterThan(0);
    for (const id of sig.related!)
      expect(wines.find((w) => w.id === id)!.quantity).toBeGreaterThan(0);
    expect(Date.parse(sig.valid_to)).toBeGreaterThan(Date.parse(sig.valid_from));
  }
  const open = s.find((x) => x.id === 'wine.window.open');
  if (open) expect(open.severity).toBe('info');
});
