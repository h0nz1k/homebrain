import { describe, expect, it } from 'vitest';
import { buildMockSnapshot } from './mock.js';
import { clockNotes, sameEveryDay, setbackHint, weekRows } from './programs.js';
import type { HeatingSchedule, HeatingWeekSlot } from './types.js';

const slot = (start: string, minutes: number, end: string): HeatingWeekSlot => ({
  start,
  end,
  minutes,
  plc_start: start,
  plc_end: end,
});

function sched(days: HeatingWeekSlot[][], format: HeatingSchedule['format'] = 'start_end') {
  return {
    key: 'setback',
    label: 'Útlum',
    format,
    slots: [],
    week: days.map((slots, i) => ({ day: i + 1, slots })),
  } satisfies HeatingSchedule;
}

const empty = (): HeatingWeekSlot[][] => Array.from({ length: 7 }, () => []);

describe('weekRows', () => {
  it('draws a slot past midnight into the next row (Sunday wraps to Monday)', () => {
    const days = empty();
    days[0] = [slot('22:30', 420, '05:30')];
    days[6] = [slot('23:00', 120, '01:00')];
    const rows = weekRows(sched(days), 2)!;
    expect(rows.map((r) => r.short)).toEqual(['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']);
    expect(rows[0]!.segments).toEqual([
      { from: 0, to: 60, carried: true },
      { from: 1350, to: 1440, carried: false },
    ]);
    expect(rows[1]!.segments).toEqual([{ from: 0, to: 330, carried: true }]);
    expect(rows[1]!.today).toBe(true);
    expect(rows[0]!.texts).toEqual(['22:30–05:30']);
    expect(rows[1]!.texts).toEqual([]); // the carried part is not a slot of Tuesday
  });

  it('duration programs say start + run time', () => {
    const days = empty();
    days[2] = [slot('11:00', 90, '12:30'), slot('18:00', 45, '18:45')];
    const rows = weekRows(sched(days, 'start_duration'), 1)!;
    expect(rows[2]!.texts).toEqual(['11:00 · 1\u00a0h 30\u00a0min', '18:00 · 45\u00a0min']);
  });

  it('collapses identical days and ignores older payloads without a week', () => {
    const same = Array.from({ length: 7 }, () => [slot('05:00', 1020, '22:00')]);
    expect(sameEveryDay(weekRows(sched(same), 1)!)).toBe(true);
    const days = empty();
    days[5] = [slot('08:00', 60, '09:00')];
    expect(sameEveryDay(weekRows(sched(days), 1)!)).toBe(false);
    expect(weekRows({ key: 'x', label: 'x', slots: [['05:00', '06:00']] }, 1)).toBeNull();
  });
});

describe('clockNotes', () => {
  const base = { plc_utc_offset_minutes: 60, local_shift_min: 0, plc_time: '10:03', drift_min: 1 };
  it('stays quiet in winter time with a small drift', () => {
    expect(clockNotes(base)).toEqual({ shift: null, drift: null });
    expect(clockNotes(undefined)).toEqual({ shift: null, drift: null });
  });
  it('explains the summer-time shift', () => {
    expect(clockNotes({ ...base, local_shift_min: 60 }).shift).toContain('o 1\u00a0hodinu dřív');
  });
  it('explains a drift above 2 minutes, fast and slow', () => {
    expect(clockNotes({ ...base, drift_min: 3 }).drift).toContain('o 3\u00a0minuty napřed');
    expect(clockNotes({ ...base, drift_min: 3 }).drift).toContain('ukazují 10:03');
    expect(clockNotes({ ...base, drift_min: -6 }).drift).toContain('o 6\u00a0minut pozadu');
    expect(clockNotes({ ...base, drift_min: 2 }).drift).toBeNull();
    expect(clockNotes({ ...base, drift_min: null, plc_time: null }).drift).toBeNull();
  });
});

describe('setbackHint', () => {
  const snap = () => buildMockSnapshot('heating', 0, Date.UTC(2026, 0, 14, 10));
  it('says a 0 °C setback saves nothing', () => {
    const s = snap();
    s.house.setback_drop = 0;
    expect(setbackHint(s)).toContain('nic neušetří');
    s.mode.setback_active = true;
    expect(setbackHint(s)).toMatch(/^Útlum právě běží/);
  });
  it('is silent for a real drop or an unmapped drop', () => {
    const s = snap();
    s.house.setback_drop = 2;
    expect(setbackHint(s)).toBeNull();
    s.house.setback_drop = null;
    s.house.setback_drop_alt = null;
    expect(setbackHint(s)).toBeNull();
    s.house.setback_drop = 0;
    s.house.setback_drop_alt = 3; // the other register drops: not "saves nothing"
    expect(setbackHint(s)).toBeNull();
  });
});

describe('mock weekly programs', () => {
  it('ship a full week for every schedule and a duration-format pool program', () => {
    const s = buildMockSnapshot('heating', 0, Date.UTC(2026, 6, 15, 10));
    expect(s.schedules.every((x) => x.week?.length === 7)).toBe(true);
    const pool = s.schedules.find((x) => x.key === 'pool_filter')!;
    expect(pool.format).toBe('start_duration');
    expect(s.clock?.drift_min).toBe(3);
  });
});
