import { expect, it } from 'vitest';
import { NOW, signal } from './__fixtures__/helpers.js';
import { ageSeconds, isStale } from './stale.js';
import { rank } from './rank.js';

it('uses a strict stale boundary and elapsed seconds', () => {
  const s = signal({
    source: { name: 'Test', updated_at: '2026-11-01T11:58:00Z', stale_after_s: 120 },
  });
  expect(ageSeconds(s, NOW)).toBe(120);
  expect(isStale(s, NOW)).toBe(false);
  expect(isStale(s, new Date(NOW.getTime() + 1))).toBe(true);
  expect(ageSeconds(s, new Date('2026-11-01T11:58:00.500Z'))).toBe(0.5);
});
it('marks stale data without changing severity, score, or position', () => {
  const service = {
    type: 'service',
    label: 'Spustit',
    service: 'script.turn_on',
    target: 'energy.washer_start',
    confirm: false,
  } as const;
  const signals = [
    signal({ id: 'a', severity: 'warning', action: service }),
    signal({ id: 'b', severity: 'notice' }),
  ];
  const allowlist = [{ service: service.service, target: service.target, confirm: false }];
  const fresh = rank(signals, NOW, { allowlist });
  const staleInput = signals.map((s) => ({
    ...s,
    source: { ...s.source, updated_at: '2026-11-01T11:46:00Z' },
  }));
  const stale = rank(staleInput, NOW, { allowlist });
  expect(stale.all.map((s) => [s.id, s.severity, s.p])).toEqual(
    fresh.all.map((s) => [s.id, s.severity, s.p]),
  );
  expect(stale.hero).toMatchObject({
    stale: true,
    ageS: 840,
    actionState: { enabled: false, reason: 'Data jsou zastaralá' },
  });
});
