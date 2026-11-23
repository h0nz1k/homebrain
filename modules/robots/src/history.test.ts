import { describe, expect, it } from 'vitest';
import {
  cleanedLabel,
  demoHistory,
  durationLabel,
  lastCleanedAt,
  liveRoomId,
  parseHistory,
  recentRuns,
  runWhen,
  staleLabels,
} from './history.js';

// 2026-11-23 10:00 Prague (UTC+1).
const NOW = new Date('2026-11-23T09:00:00Z');

describe('cleanedLabel (Europe/Prague)', () => {
  it('today, yesterday, days ago, never', () => {
    expect(cleanedLabel('2026-11-23T08:40:00Z', NOW)).toBe('Uklizeno dnes 9:40');
    expect(cleanedLabel('2026-11-22T17:05:00Z', NOW)).toBe('Uklizeno včera 18:05');
    expect(cleanedLabel('2026-11-20T10:00:00Z', NOW)).toBe('Uklizeno před 3 dny');
    expect(cleanedLabel(null, NOW)).toBe('Zatím neuklizeno');
    expect(cleanedLabel('nesmysl', NOW)).toBe('Zatím neuklizeno');
  });
  it('uses the Prague calendar day, not UTC', () => {
    // 23:30 UTC on the 22nd = 00:30 Prague on the 23rd → today.
    expect(cleanedLabel('2026-11-22T23:30:00Z', NOW)).toBe('Uklizeno dnes 0:30');
  });
});

describe('history parsing and lookup', () => {
  const history = parseHistory({
    robots: {
      '1': {
        last_cleaned: [
          { id: 2, name: 'Kuchyně', at: '2026-11-23T08:40:00Z' },
          { id: null, name: 'Jídelna', at: '2026-11-21T08:00:00Z' },
          { bad: true },
        ],
        runs: [
          {
            id: 'a',
            slot: 1,
            start: '2026-11-23T08:00:00Z',
            end: '2026-11-23T08:40:00Z',
            duration_s: 2400,
            area_m2: 30,
            rooms: [{ id: 2, name: 'Kuchyně', dwell_s: 600 }],
            source: 'homebrain',
          },
          { id: 'x' },
        ],
        active: null,
      },
    },
  });
  it('drops invalid entries', () => {
    expect(history['1']!.runs).toHaveLength(1);
    expect(history['1']!.last_cleaned).toHaveLength(2);
    expect(parseHistory(null)).toEqual({});
  });
  it('matches by segment id, else by name of id-less records', () => {
    expect(lastCleanedAt(history['1'], { id: 2, name: 'Kuchyně' })).toBe('2026-11-23T08:40:00Z');
    expect(lastCleanedAt(history['1'], { id: 3, name: 'Jídelna' })).toBe('2026-11-21T08:00:00Z');
    expect(lastCleanedAt(history['1'], { id: 9, name: 'WC' })).toBeNull();
    expect(lastCleanedAt(null, { id: 2, name: 'Kuchyně' })).toBeNull();
  });
  it('recent runs over all robots, newest first', () => {
    const runs = recentRuns(demoHistory(NOW.getTime()), 3);
    expect(runs.map((r) => r.id)).toEqual(['r1a', 'r2a', 'r1b']);
  });
});

describe('formatting', () => {
  it('run time and duration', () => {
    expect(runWhen('2026-11-23T08:40:00Z', NOW)).toBe('Dnes 9:40');
    expect(runWhen('2026-11-22T08:40:00Z', NOW)).toBe('Včera 9:40');
    expect(runWhen('2026-11-19T08:40:00Z', NOW)).toMatch(/19\. ?11\. 9:40$/);
    expect(durationLabel(2520)).toBe('42 min');
    expect(durationLabel(3900)).toBe('1 h 5 min');
    expect(durationLabel(10)).toBe('1 min');
  });
});

describe('live room', () => {
  const rooms = [
    { id: 1, name: 'Obývací pokoj' },
    { id: 2, name: 'Kuchyně' },
  ];
  it('sensor first, pose as fallback, unknown → null', () => {
    expect(liveRoomId(rooms, 'Kuchyně', 1)).toBe(2);
    expect(liveRoomId(rooms, 'Sklep', 1)).toBe(1);
    expect(liveRoomId(rooms, null, null)).toBeNull();
    expect(liveRoomId(rooms, null, 42)).toBeNull();
  });
});

describe('data age', () => {
  const now = Date.parse('2026-11-23T09:00:00Z');
  it('only while active and over the thresholds', () => {
    const input = {
      active: true,
      stateAt: '2026-11-23T08:58:00Z',
      mapAt: '2026-11-23T08:56:00Z',
      hasMap: true,
    };
    expect(staleLabels(input, now)).toEqual({ map: 'Mapa před 4 min', state: 'Stav před 2 min' });
    expect(staleLabels({ ...input, active: false }, now)).toEqual({ map: null, state: null });
    expect(
      staleLabels(
        { ...input, stateAt: '2026-11-23T08:59:00Z', mapAt: '2026-11-23T08:59:00Z' },
        now,
      ),
    ).toEqual({ map: null, state: null });
    expect(staleLabels({ ...input, hasMap: false }, now)).toEqual({
      map: null,
      state: 'Stav před 2 min',
    });
  });
});
