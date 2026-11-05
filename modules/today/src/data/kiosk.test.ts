import { describe, expect, it } from 'vitest';
import { rank, type Signal } from '@homebrain/signals';
import {
  dataFreshness,
  filterSignalsForScreen,
  filterTodayDataForScreen,
  formatAge,
  isWithinNight,
  kioskLayoutFor,
  parseNightHours,
  pixelShift,
  visibleSignalModules,
} from './kiosk.js';
import { computeScene } from './scene.js';
import { fixtureFor } from './fixtures.js';
import { isNightDimHour } from './time.js';

const signal = (id: string, module: Signal['module'], severity: Signal['severity'] = 'warning') =>
  ({
    id,
    module,
    severity,
    kind: 'event',
    relevance: 0.8,
    valid_from: '2026-10-31T08:00:00+01:00',
    valid_to: '2026-10-31T20:00:00+01:00',
    title: id,
    context: '',
    source: { name: 'test', updated_at: '2026-10-31T10:39:00+01:00', stale_after_s: 3600 },
  }) as Signal;

const mixed = [
  signal('rain', 'weather'),
  signal('meds', 'health', 'critical'),
  signal('cellar', 'wine'),
  signal('dishwasher', 'energy', 'notice'),
  signal('plastics', 'waste', 'notice'),
  signal('backup', 'system'),
  signal('dinner', 'calendar', 'info'),
];

describe('role-safe Dnes signals', () => {
  it('kiosk layout never shows health, wine or system data – even for the owner', () => {
    for (const role of ['owner', 'adult', 'kiosk', undefined] as const) {
      const ids = filterSignalsForScreen(mixed, role, true).map((s) => s.id);
      expect(ids).toEqual(['rain', 'dishwasher', 'plastics', 'dinner']);
    }
  });
  it('kiosk ranking cannot be taken over by a hidden critical health signal', () => {
    const now = new Date('2026-10-31T10:40:00+01:00');
    const result = rank(filterSignalsForScreen(mixed, 'owner', true), now, {
      layout: 'kiosk',
      haConnected: true,
    });
    expect(result.all.some((s) => s.module === 'health')).toBe(false);
    expect(result.hero?.id).not.toBe('meds');
    expect(result.cards.length).toBeLessThanOrEqual(3);
  });
  it('owner on the desktop keeps every module; child and guest are restricted', () => {
    expect(filterSignalsForScreen(mixed, 'owner', false)).toHaveLength(mixed.length);
    expect(filterSignalsForScreen(mixed, 'child', false).map((s) => s.module)).toEqual([
      'weather',
      'waste',
      'calendar',
    ]);
    expect(filterSignalsForScreen(mixed, 'guest', false)).toEqual([]);
    expect(visibleSignalModules('kiosk', false).has('health')).toBe(false);
  });
  it('drops ribbon entries describing hidden signals (no health label on the wall)', () => {
    const data = fixtureFor('b');
    const meds = data.ribbon.filter((item) => item.signalId?.startsWith('health.'));
    expect(meds.length).toBeGreaterThan(0);
    const kiosk = filterTodayDataForScreen(data, 'owner', true);
    expect(kiosk.ribbon.some((item) => item.signalId?.startsWith('health.'))).toBe(false);
    expect(kiosk.signals.some((s) => s.module === 'health')).toBe(false);
    expect(filterTodayDataForScreen(data, 'owner', false).ribbon).toHaveLength(data.ribbon.length);
  });
  it('kiosk role forces the kiosk layout, the URL alone does not change the role', () => {
    expect(kioskLayoutFor('kiosk', false)).toBe(true);
    expect(kioskLayoutFor('owner', true)).toBe(true);
    expect(kioskLayoutFor('owner', false)).toBe(false);
    expect(kioskLayoutFor(undefined, false)).toBe(false);
  });
});

describe('night mode', () => {
  it('parses configurable night hours from the tablet URL', () => {
    expect(parseNightHours('')).toEqual({ start: 22, end: 6 });
    expect(parseNightHours('?night=23:30-6')).toEqual({ start: 23.5, end: 6 });
    expect(parseNightHours('?night=1-5')).toEqual({ start: 1, end: 5 });
    expect(parseNightHours('?night=off')).toBeNull();
    expect(parseNightHours('?night=nonsense')).toEqual({ start: 22, end: 6 });
    expect(parseNightHours('?night=25-6')).toEqual({ start: 22, end: 6 });
  });
  it('handles windows across midnight and within one day', () => {
    const late = { start: 22, end: 6 };
    expect(isWithinNight(23, late)).toBe(true);
    expect(isWithinNight(5.9, late)).toBe(true);
    expect(isWithinNight(6, late)).toBe(false);
    expect(isWithinNight(12, late)).toBe(false);
    expect(isWithinNight(3, { start: 1, end: 5 })).toBe(true);
    expect(isWithinNight(23, { start: 1, end: 5 })).toBe(false);
    expect(isWithinNight(23, null)).toBe(false);
  });
  it('dims the scene by the configured hours and wakes up for critical', () => {
    const night = fixtureFor('a-night');
    expect(isNightDimHour(night.now)).toBe(true);
    expect(computeScene(night, night.now).nightDim).toBe(true);
    expect(computeScene(night, night.now, null).nightDim).toBe(false);
    expect(computeScene(night, night.now, { start: 23.5, end: 6 }).nightDim).toBe(false);
    const critical = { ...night, signals: [signal('storm', 'weather', 'critical')] };
    expect(computeScene(critical, critical.now).nightDim).toBe(false);
  });
});

describe('kiosk layout state', () => {
  it('marks stale and offline data', () => {
    const now = '2026-10-31T10:40:00+01:00';
    expect(
      dataFreshness({ now, ha: { connected: true, updatedAt: '2026-10-31T10:39:20+01:00' } }),
    ).toEqual({ state: 'fresh', ageS: 40 });
    expect(
      dataFreshness({ now, ha: { connected: true, updatedAt: '2026-10-31T10:25:00+01:00' } }).state,
    ).toBe('stale');
    expect(dataFreshness({ now, ha: { connected: false, updatedAt: '' } })).toEqual({
      state: 'offline',
      ageS: Infinity,
    });
    expect(formatAge(900)).toBe('před 15 min');
    expect(formatAge(3 * 3600 + 120)).toBe('před 3 h 2 min');
    expect(formatAge(Infinity)).toBe('neznámo kdy');
  });
  it('shifts pixels within ±2 px and cycles through 9 positions', () => {
    const seen = new Set<string>();
    for (let step = 0; step < 18; step++) {
      const [x, y] = pixelShift(step);
      expect(Math.abs(x)).toBeLessThanOrEqual(2);
      expect(Math.abs(y)).toBeLessThanOrEqual(2);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(9);
    expect(pixelShift(9)).toEqual(pixelShift(0));
  });
});
