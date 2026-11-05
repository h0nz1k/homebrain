import { describe, expect, it } from 'vitest';
import { localParts } from './adapter.js';
import {
  wallMinuteOfDay,
  computeCosts,
  fixedShare,
  hdoStatus,
  monthStart,
  nextMonthStart,
  ntShareOfHour,
  parseHdoSchedule,
  readTariffSettings,
  type CostHour,
  type CostInput,
  type TariffSettings,
} from './costs.js';

const TZ = 'Europe/Prague';
const HOUR = 3_600_000;
// Synthetic NT schedule: NT everywhere except VT 9–10, 12–13, 16–17, 20–21.
const ATTRS = {
  hdo_cas_od: ['00:00:00', '10:00:00', '13:00:00', '17:00:00', '21:00:00'],
  hdo_cas_do: ['09:00:00', '12:00:00', '16:00:00', '20:00:00', '23:59:00'],
};
const SCHEDULE = parseHdoSchedule(ATTRS)!;
const SETTINGS: TariffSettings = {
  priceVt: 5,
  priceNt: 4,
  fixedMonthly: 900,
  correction: 1,
  spotDistVt: 1.2,
  spotDistNt: 0.5,
  spotMarkup: 0.3,
  spotFixedMonthly: 800,
  vat: 1.21,
};
const local = (iso: string) => Date.parse(iso);
const cc = (input: CostInput) => computeCosts(input)!;

describe('HDO schedule', () => {
  it('parses NT intervals and treats 23:59 as end of day', () => {
    expect(SCHEDULE).toEqual([
      [0, 540],
      [600, 720],
      [780, 960],
      [1020, 1200],
      [1260, 1440],
    ]);
    expect(parseHdoSchedule({})).toBeNull();
    expect(parseHdoSchedule({ hdo_times_today_raw: [{ od: '22:00:00', do: '06:00:00' }] })).toEqual(
      [
        [1320, 1440],
        [0, 360],
      ],
    );
  });

  it('classifies hours by local wall time (VT 9–10, NT 10–11)', () => {
    expect(ntShareOfHour(local('2026-11-05T09:00:00+01:00'), TZ, SCHEDULE)).toBe(0);
    expect(ntShareOfHour(local('2026-11-05T10:00:00+01:00'), TZ, SCHEDULE)).toBe(1);
    // Summer time: 09:00 local is 07:00 UTC.
    expect(ntShareOfHour(local('2026-07-01T09:00:00+02:00'), TZ, SCHEDULE)).toBe(0);
    // Without a schedule everything is VT (single-rate tariff).
    expect(ntShareOfHour(local('2026-11-05T03:00:00+01:00'), TZ, null)).toBe(0);
  });

  it('reports current tariff and next change from the HDO binary sensor', () => {
    const now = local('2026-11-05T14:30:00+01:00');
    const s = hdoStatus(
      { state: 'on', attributes: { ...ATTRS, next_change: '2026-11-05T16:00:00+01:00' } },
      now,
      TZ,
      null,
    );
    expect(s).toEqual({
      tariff: 'NT',
      nextChange: local('2026-11-05T16:00:00+01:00'),
      source: 'hdo',
    });
    // Without a next_change attribute it is derived from the schedule.
    const vt = hdoStatus(
      { state: 'off', attributes: ATTRS },
      local('2026-11-05T16:20:00+01:00'),
      TZ,
      null,
    );
    expect(vt).toEqual({
      tariff: 'VT',
      nextChange: local('2026-11-05T17:00:00+01:00'),
      source: 'hdo',
    });
    expect(hdoStatus({ state: 'unavailable', attributes: {} }, now, TZ, null)).toBeNull();
  });
});

describe('calendar helpers', () => {
  it('finds local month boundaries across year end', () => {
    expect(monthStart(local('2026-12-31T23:30:00+01:00'), TZ)).toBe(
      local('2026-12-01T00:00:00+01:00'),
    );
    expect(nextMonthStart(local('2026-12-31T23:30:00+01:00'), TZ)).toBe(
      local('2027-01-01T00:00:00+01:00'),
    );
    // 1 January 00:30 local is still 31 December in UTC.
    expect(monthStart(local('2027-01-01T00:30:00+01:00'), TZ)).toBe(
      local('2027-01-01T00:00:00+01:00'),
    );
  });

  it('prorates fixed fees by elapsed time within each month', () => {
    const m = local('2026-11-01T00:00:00+01:00');
    expect(fixedShare(900, m, local('2026-12-01T00:00:00+01:00'), TZ)).toBeCloseTo(900, 6);
    expect(fixedShare(900, m, m + 15 * 24 * HOUR, TZ)).toBeCloseTo(450, 6);
    // One day of a 31-day month.
    const jan = local('2027-01-10T00:00:00+01:00');
    expect(fixedShare(930, jan, jan + 24 * HOUR, TZ)).toBeCloseTo(30, 6);
    // Spanning a month boundary: last day of January + first day of February.
    const span = fixedShare(
      900,
      local('2027-01-31T00:00:00+01:00'),
      local('2027-02-02T00:00:00+01:00'),
      TZ,
    );
    expect(span).toBeCloseTo(900 / 31 + 900 / 28, 6);
  });

  it('handles DST: the 23-hour day in March gets 23/743 of the month', () => {
    const day = local('2026-03-29T00:00:00+01:00');
    const next = local('2026-03-30T00:00:00+02:00');
    expect(next - day).toBe(23 * HOUR);
    expect(fixedShare(743, day, next, TZ)).toBeCloseTo(23, 6);
    // October has 745 hours (25-hour day).
    expect(
      fixedShare(745, local('2026-10-01T00:00:00+02:00'), local('2026-11-01T00:00:00+01:00'), TZ),
    ).toBeCloseTo(745, 6);
  });
});

describe('computeCosts', () => {
  const now = local('2026-11-05T12:00:00+01:00');
  // Two hours today (VT 9–10, NT 10–11), one hour on 1 November, one in March.
  const hours: CostHour[] = [
    { start: local('2026-03-10T03:00:00+01:00'), importKwh: 2, houseKwh: 3, spot: 2 },
    { start: local('2026-11-01T03:00:00+01:00'), importKwh: 1, houseKwh: 1, spot: null },
    { start: local('2026-11-05T09:00:00+01:00'), importKwh: 1, houseKwh: 2, spot: 3 },
    { start: local('2026-11-05T10:00:00+01:00'), importKwh: 2, houseKwh: 5, spot: 2 },
  ];

  it('prices import by VT/NT and adds prorated fixed fees', () => {
    const c = cc({ hours, settings: SETTINGS, schedule: SCHEDULE, now, timeZone: TZ });
    expect(c.day.vtKwh).toBeCloseTo(1);
    expect(c.day.ntKwh).toBeCloseTo(2);
    expect(c.day.energyCost).toBeCloseTo(1 * 5 + 2 * 4);
    // 12 h of a 30-day November.
    expect(c.day.fixedCost).toBeCloseTo((900 * 12) / (30 * 24), 6);
    expect(c.day.total).toBeCloseTo(c.day.energyCost + c.day.fixedCost);
    expect(c.month.energyCost).toBeCloseTo(13 + 4);
    // Year: fixed fees only since the first measured hour (10 March 03:00).
    const yearFixed = fixedShare(900, hours[0]!.start, now, TZ);
    expect(c.year.fixedCost).toBeCloseTo(yearFixed, 6);
    expect(c.year.from).toBe(hours[0]!.start);
    expect(c.year.energyCost).toBeCloseTo(17 + 2 * 4);
  });

  it('applies the meter correction factor to grid import only', () => {
    const c = cc({
      hours,
      settings: { ...SETTINGS, correction: 1.1 },
      schedule: SCHEDULE,
      now,
      timeZone: TZ,
    });
    expect(c.day.importKwh).toBeCloseTo(3.3);
    expect(c.day.energyCost).toBeCloseTo(13 * 1.1);
    // Savings use the inverter's own house − import balance (uncorrected).
    expect(c.day.savings).toBeCloseTo((2 - 1) * 5 + (5 - 2) * 4);
  });

  it('values PV+battery coverage at the tariff price of each hour', () => {
    const c = cc({ hours, settings: SETTINGS, schedule: SCHEDULE, now, timeZone: TZ });
    expect(c.day.coveredKwh).toBeCloseTo(4);
    expect(c.day.savings).toBeCloseTo(1 * 5 + 3 * 4);
    expect(c.year.savings).toBeCloseTo(17 + 1 * 4);
  });

  it('compares with spot incl. distribution, markup, VAT and spot fixed fees', () => {
    const c = cc({ hours, settings: SETTINGS, schedule: SCHEDULE, now, timeZone: TZ });
    const vtHour = 1 * ((3 + 0.3) * 1.21 + 1.2);
    const ntHour = 2 * ((2 + 0.3) * 1.21 + 0.5);
    expect(c.day.spot!.energyCost).toBeCloseTo(vtHour + ntHour);
    expect(c.day.spot!.fixedCost).toBeCloseTo((800 * 12) / (30 * 24), 6);
    expect(c.day.spot!.coverage).toBe(1);
    // November: the 1 November hour has no spot price → coverage 3/4 of kWh.
    expect(c.month.spot!.coverage).toBeCloseTo(3 / 4);
  });

  it('adds the live remainder of today not yet in statistics at the current tariff', () => {
    const c = cc({
      hours,
      settings: SETTINGS,
      schedule: SCHEDULE,
      now,
      timeZone: TZ,
      liveTodayImportKwh: 3.5,
      liveSpot: 4,
    });
    // now = 12:00 → VT block 12–13.
    expect(c.day.importKwh).toBeCloseTo(3.5);
    expect(c.day.energyCost).toBeCloseTo(13 + 0.5 * 5);
  });

  it('returns null spot comparison without distribution prices, and nothing without prices', () => {
    const c = cc({
      hours,
      settings: { ...SETTINGS, spotDistVt: null },
      schedule: SCHEDULE,
      now,
      timeZone: TZ,
    });
    expect(c.day.spot).toBeNull();
    expect(
      computeCosts({
        hours,
        settings: { ...SETTINGS, priceVt: null },
        schedule: SCHEDULE,
        now,
        timeZone: TZ,
      }),
    ).toBeNull();
  });

  it('counts a DST night correctly (25-hour day in October)', () => {
    const day = local('2026-10-25T00:00:00+02:00');
    const rows: CostHour[] = Array.from({ length: 25 }, (_, i) => ({
      start: day + i * HOUR,
      importKwh: 1,
      houseKwh: 1,
      spot: 1,
    }));
    const end = day + 25 * HOUR; // local midnight of 26 Oct
    const c = cc({
      hours: rows,
      settings: SETTINGS,
      schedule: SCHEDULE,
      now: end - 1,
      timeZone: TZ,
    });
    expect(c.day.importKwh).toBeCloseTo(25);
    // 4 VT hours (9, 12, 16, 20 local) despite the repeated 02:00 hour.
    expect(c.day.vtKwh).toBeCloseTo(4);
  });
});

describe('readTariffSettings', () => {
  it('reads bound numbers, defaults correction to 1 and spot fixed fees to the tariff ones', () => {
    const states: Record<string, { state: string }> = {
      'input_number.vt': { state: '4.585' },
      'input_number.nt': { state: '3,849' },
      'input_number.fix': { state: '906.13' },
      'input_number.corr': { state: 'unknown' },
    };
    const s = readTariffSettings(
      {
        energy_tariff_price_vt: 'input_number.vt',
        energy_tariff_price_nt: 'input_number.nt',
        energy_tariff_fixed_monthly: 'input_number.fix',
        energy_meter_correction: 'input_number.corr',
      },
      (id) => states[id],
    );
    expect(s).toMatchObject({
      priceVt: 4.585,
      priceNt: 3.849,
      fixedMonthly: 906.13,
      correction: 1,
      spotDistVt: null,
      spotMarkup: 0,
      spotFixedMonthly: 906.13,
      vat: 1.21,
    });
  });
});

describe('wallMinuteOfDay', () => {
  it('matches Intl wall time for every hour and half hour of a year incl. DST days', () => {
    const tz = 'Europe/Prague';
    const wall = wallMinuteOfDay(tz);
    const from = Date.UTC(2025, 11, 31, 23);
    const mismatches: number[] = [];
    for (let t = from; t < from + 366 * 86_400_000; t += 1_800_000) {
      const p = localParts(t, tz);
      if (wall(t) !== p.hour * 60 + p.minute) mismatches.push(t);
    }
    expect(mismatches).toEqual([]);
  });
});
