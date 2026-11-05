import { describe, expect, it } from 'vitest';
import { mergeGroups } from '@homebrain/signals';
import { adaptHealthEntities } from './adapter';
import { createHealthDemo, type HealthScenario } from './fixtures';
import { canSeeHealth, healthSignals, isKioskLocation, type HealthAudience } from './signals';

const SAT = Date.parse('2026-10-31T10:00:00+01:00');
const SUN = Date.parse('2026-11-01T09:00:00+01:00');
const WED = Date.parse('2026-10-28T10:00:00+01:00');

function modelFor(scenario: HealthScenario, now = SAT) {
  const demo = createHealthDemo(now, scenario);
  return adaptHealthEntities({ bindings: demo.bindings, getState: (id) => demo.states[id], now });
}

describe('healthSignals – soukromí', () => {
  it.each<HealthAudience | undefined>(['kiosk', 'guest', 'child', 'adult', undefined])(
    'publikum %s nedostane žádný zdravotní signál',
    (audience) => {
      expect(healthSignals(modelFor('risk'), { audience })).toEqual([]);
      expect(canSeeHealth(audience)).toBe(false);
    },
  );
  it('kiosk layout se pozná stejně jako v shellu', () => {
    expect(isKioskLocation('/today', '?kiosk=1')).toBe(true);
    expect(isKioskLocation('/kiosk/today', '')).toBe(true);
    expect(isKioskLocation('/health', '?kiosk=0')).toBe(false);
  });
});

describe('healthSignals – vlastník', () => {
  it('minimum v ohrožení pozdě v týdnu + streak ve stejné skupině', () => {
    const signals = healthSignals(modelFor('risk'), { audience: 'owner' });
    expect(signals.map((s) => [s.id.split('.').slice(0, 3).join('.'), s.severity])).toEqual([
      ['health.week.at_risk', 'warning'],
      ['health.streak.at_risk', 'notice'],
    ]);
    expect(signals[0]).toMatchObject({
      module: 'health',
      kind: 'deadline',
      title: 'Dnes silový trénink',
      value: { v: '1 / 3' },
      action: { type: 'navigate', href: '/health' },
      valid_to: '2026-11-01T23:00:00.000Z',
    });
    expect(signals[1]!.title).toBe('Streak 2 týdny v ohrožení');
    const merged = mergeGroups(signals);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.also).toHaveLength(1);
  });

  it('jeden trénink a dva dny: jen upozornění, streak mimo ohrožení', () => {
    const signals = healthSignals(modelFor('week'), { audience: 'owner' });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ severity: 'notice', title: 'Silové minimum se blíží' });
  });

  it('minimum už nevyjde: info + konec streaku, bez poplachu', () => {
    const signals = healthSignals(modelFor('risk', SUN), { audience: 'owner' });
    expect(signals.map((s) => s.severity)).toEqual(['info', 'info']);
    expect(signals[1]!.title).toBe('Streak 2 týdny tento týden skončí');
  });

  it.each<[HealthScenario, number]>([
    ['week', WED],
    ['met', SAT],
    ['empty', SAT],
    ['missing', SAT],
    ['stale', SAT],
    ['unavailable', SAT],
    ['error', SAT],
  ])('scénář %s je tichý', (scenario, now) => {
    expect(healthSignals(modelFor(scenario, now), { audience: 'owner' })).toEqual([]);
  });

  it('chybějící spánek (partial) signály neblokuje', () => {
    expect(healthSignals(modelFor('partial'), { audience: 'owner' })).toHaveLength(1);
  });
});
