import { describe, expect, it } from 'vitest';
import { timetableRow } from '@homebrain/ha-client';
import { mockTimetable, mockTimetableSettings } from './timetableMock.js';

const kids = [
  { id: 'dcera', name: 'Ema', grade: 5 },
  { id: 'syn', name: 'Kuba', grade: 4 },
];

describe('mock rozvrhu', () => {
  it('čtvrtek večer: Ema má zítra Tv, Dnes ukáže co s sebou', () => {
    // Same clock as the Dnes fixture `state=d` (Thursday 20:45).
    const now = new Date('2026-11-05T20:45:00+01:00');
    const snapshot = mockTimetable(mockTimetableSettings('full', now), kids, now, 'adult');
    expect(snapshot.children.map((child) => timetableRow(child, now))).toEqual([
      { when: 'tomorrow', name: 'Ema', text: '7:30–12:05', bring: 'cvičky a úbor (Tv)' },
      { when: 'tomorrow', name: 'Kuba', text: '7:30–12:05', bring: '' },
    ]);
  });
});
