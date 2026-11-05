import { describe, expect, it } from 'vitest';
import type { Signal } from '@homebrain/signals';
import { createMockAdapter, mergeSignals, stateFromUrl } from './adapter.js';
import { FIXTURES } from './fixtures.js';
import { buildDayRibbonModel } from './ribbonModel.js';

describe('createMockAdapter', () => {
  it('reads fixture state from URL query', () => {
    expect(stateFromUrl('?state=b')).toBe('b');
    expect(stateFromUrl('?state=a-night')).toBe('a-night');
    expect(stateFromUrl('')).toBe('a');
    expect(stateFromUrl('?state=unknown')).toBe('a');
  });

  it('returns fixture data and notifies subscribers', () => {
    const adapter = createMockAdapter('d');
    expect(adapter.get().tomorrow).toBe('Zítra svoz: papír');
    const seen: string[] = [];
    const unsub = adapter.subscribe((data) => seen.push(data.now));
    expect(seen).toEqual([FIXTURES.d.now]);
    unsub();
  });

  it('merges optional wasteSignals by id', () => {
    const extra: Signal = {
      id: 'waste.next',
      module: 'waste',
      kind: 'deadline',
      severity: 'notice',
      relevance: 0.9,
      valid_from: '2026-10-31T12:00:00+01:00',
      valid_to: '2026-11-01T08:00:00+01:00',
      title: 'Svoz ze syntetického adaptéru',
      context: '',
      source: {
        name: 'Test',
        updated_at: '2026-10-31T10:00:00+01:00',
        stale_after_s: 120,
      },
    };
    const merged = mergeSignals(FIXTURES.a.signals, [extra]);
    expect(merged.find((s) => s.id === 'waste.next')?.title).toBe('Svoz ze syntetického adaptéru');

    const adapter = createMockAdapter('a', { wasteSignals: [extra] });
    expect(adapter.get().signals.find((s) => s.id === 'waste.next')?.severity).toBe('notice');
  });
});

describe('buildDayRibbonModel', () => {
  it('uses Prague hours and includes sunset marker', () => {
    const model = buildDayRibbonModel(FIXTURES.a);
    expect(model.startHour).toBe(6);
    expect(model.endHour).toBeGreaterThanOrEqual(18);
    expect(model.endHour).toBeLessThanOrEqual(24);
    expect(model.sunsetHour).toBeCloseTo(16.783, 2);
    expect(model.items.some((item) => item.type === 'marker' && item.kind === 'sunset')).toBe(true);
    expect(model.hourly.length).toBeGreaterThan(0);
    expect(model.hourly.every((h) => h.hour % 3 === 0)).toBe(true);
  });
});
