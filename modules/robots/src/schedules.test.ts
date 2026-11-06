import { afterEach, describe, expect, it, vi } from 'vitest';
import { delayedStart, PRESET_START_DELAY_MS } from './presets.js';
import {
  createSchedulesDemo,
  describeDays,
  formatWhen,
  inQuiet,
  runBadge,
  scheduleWhat,
  validateSchedule,
  DEFAULT_QUIET,
  type ScheduleDraft,
} from './schedules.js';

const draft = (patch: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  name: 'Chodba',
  slot: 1,
  preset_id: null,
  settings: null,
  rooms: [],
  days: [2],
  time: '10:00',
  enabled: true,
  ...patch,
});

describe('schedules', () => {
  it('quiet hours wrap midnight like the backend', () => {
    expect(inQuiet('23:00', '22:00', '07:00')).toBe(true);
    expect(inQuiet('06:59', '22:00', '07:00')).toBe(true);
    expect(inQuiet('07:00', '22:00', '07:00')).toBe(false);
    expect(inQuiet('13:00', '12:00', '14:00')).toBe(true);
    expect(inQuiet('03:00', '08:00', '08:00')).toBe(false);
  });
  it('describes days in Czech', () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Každý den');
    expect(describeDays([2])).toBe('Každou středu');
    expect(describeDays([3])).toBe('Každý čtvrtek');
    expect(describeDays([4, 0, 1, 2, 3])).toBe('Po–Pá');
    expect(describeDays([6, 5])).toBe('Víkend');
    expect(describeDays([0, 2, 4])).toBe('Po, St, Pá');
  });
  it('validates name, days and quiet hours', () => {
    expect(validateSchedule(draft({ name: ' ' }), DEFAULT_QUIET)).toMatch(/název/);
    expect(validateSchedule(draft({ days: [] }), DEFAULT_QUIET)).toMatch(/den/);
    expect(validateSchedule(draft({ time: '22:30' }), DEFAULT_QUIET)).toMatch(/nočního klidu/);
    expect(validateSchedule(draft(), DEFAULT_QUIET)).toBeNull();
  });
  it('result badges and what-text', () => {
    const run = {
      id: 'r',
      schedule_id: 's',
      name: 'x',
      slot: 1,
      at: '2026-11-04T10:00:00+01:00',
      attempts: 3,
      manual: false,
    };
    expect(runBadge({ ...run, result: 'gave_up', reason: 'battery' })).toEqual({
      label: 'Neproběhlo · slabá baterie',
      tone: 'warn',
    });
    expect(runBadge({ ...run, result: 'error', reason: null })!.tone).toBe('crit');
    expect(runBadge(null)).toBeNull();
    expect(scheduleWhat({ preset_id: null, rooms: [1, 2], slot: 1 }, {})).toBe('2 místnosti');
    expect(scheduleWhat({ preset_id: 'abc', rooms: [], slot: 1 }, {})).toBe('Smazaná předvolba');
  });
  it('formats next run relative to now', () => {
    const now = new Date(2026, 10, 4, 8, 0);
    expect(formatWhen(new Date(2026, 10, 4, 10, 0).toISOString(), now)).toBe('dnes 10:00');
    expect(formatWhen(new Date(2026, 10, 5, 9, 30).toISOString(), now)).toBe('zítra 09:30');
  });
  it('dev mock computes next run and honours pause', () => {
    const demo = createSchedulesDemo(() => new Date(2026, 10, 4, 8, 0)); // Wednesday
    const h = demo.handlers;
    h['homebrain/robots/schedules/save']({ schedule: draft() });
    let list = h['homebrain/robots/schedules/list']();
    expect(new Date(list.schedules[0]!.next_run!).getDate()).toBe(4);
    h['homebrain/robots/schedules/pause']({ until: '2026-11-04' });
    list = h['homebrain/robots/schedules/list']();
    expect(new Date(list.schedules[0]!.next_run!).getDate()).toBe(11);
    expect(() =>
      h['homebrain/robots/schedules/save']({ schedule: draft({ time: '23:00' }) }),
    ).toThrow();
  });
});

describe('preset start undo window', () => {
  afterEach(() => vi.useRealTimers());
  it('starts only after 5 s', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    delayedStart(start);
    vi.advanceTimersByTime(PRESET_START_DELAY_MS - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
  });
  it('cancel within 5 s sends nothing; cancel after start is a no-op', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const cancel = delayedStart(start);
    vi.advanceTimersByTime(4_000);
    expect(cancel()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(start).not.toHaveBeenCalled();
    const late = delayedStart(start);
    vi.advanceTimersByTime(PRESET_START_DELAY_MS);
    expect(late()).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
