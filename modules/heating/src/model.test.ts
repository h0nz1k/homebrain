import { describe, expect, it } from 'vitest';
import { normalizeHistory } from './api.js';
import {
  HEATING_BREAK_TS,
  activityModel,
  curveAt,
  downsample,
  efficiencyModel,
  fmtNum,
  fmtSeasonEnergy,
  fmtT,
  niceTicks,
  particleDuration,
  polylineKeyframes,
  roomsModel,
  schematicState,
  seasonsModel,
  tempColor,
  timeTicks,
} from './model.js';
import {
  HEATING_SCENARIOS,
  buildMockHistory,
  buildMockSeasons,
  buildMockSnapshot,
} from './mock.js';
import type { HistoryPoint } from './types.js';

const NOW = Date.parse('2026-01-14T09:00:00Z');
const snap = (s: Parameters<typeof buildMockSnapshot>[0], rooms = 4) =>
  buildMockSnapshot(s, rooms, NOW);
const text = (m: ReturnType<typeof activityModel>) => m.headline.join('') + ' ' + m.detail;

describe('formatting', () => {
  it('uses Czech decimal comma, real minus and NBSP thousands', () => {
    expect(fmtNum(-2.94)).toBe('\u22122,9');
    expect(fmtNum(1888, 0)).toBe('1\u00a0888');
    expect(fmtT(22.55)).toBe('22,6\u00a0°C');
    expect(fmtT(null)).toBe('–');
    expect(fmtNum(-0.01)).toBe('0,0');
  });
});

describe('activityModel – plain Czech sentence', () => {
  it('heating the tank names the tank, its temperature and how long the compressor runs', () => {
    const m = activityModel(snap('heating'), NOW);
    expect(m.state).toBe('heating');
    expect(m.headline[1]).toBe('nahřívá nádrž');
    expect(text(m)).toContain('dole má 41,7\u00a0°C');
    expect(m.pill).toBe('Kompresor běží 27\u00a0min');
    expect(text(m)).toContain('Do radiátorů teče 37,8\u00a0°C');
  });
  it('DHW heating explains the 3-way valve', () => {
    const m = activityModel(snap('dhw'), NOW);
    expect(m.headline[1]).toBe('ohřívá teplou vodu');
    expect(m.detail).toContain('Trojcestný ventil');
    expect(m.detail).toContain('referenční místnost');
  });
  it('idle and primary pre-run never talk about an electric heater', () => {
    const s = snap('idle');
    s.heat_pump.primary_prerun = true;
    const m = activityModel(s, NOW);
    expect(m.headline[1]).toBe('odpočívá');
    expect(text(m)).toContain('čerpadlo primáru');
    expect(text(m).toLowerCase()).not.toMatch(/elektro|topná tyč|kotel/);
  });
  it('fault is critical and tells to call service, not reset', () => {
    const m = activityModel(snap('fault'), NOW);
    expect(m.tone).toBe('crit');
    expect(text(m)).toContain('nízký tlak sání');
    expect(m.detail).toContain('Neresetujte');
  });
  it('unconfigured and unreachable are calm explanations', () => {
    expect(activityModel(snap('unconfigured'), NOW).state).toBe('unconfigured');
    const s = snap('idle');
    s.source = 'unreachable';
    expect(activityModel(s, NOW).headline[1]).toBe('neodpovídá');
  });
});

describe('schematicState', () => {
  it('maps running compressor to brine + charge flow and spinning pumps', () => {
    const st = schematicState(snap('heating'));
    expect(st.compressor).toBe('on');
    expect(st.brine).toBeGreaterThan(0.5);
    expect(st.charge).toBe(st.brine);
    expect(st.house).toBeGreaterThan(0);
    expect(st.valve).toBe('tank');
    expect(st.pumps).toMatchObject({ primary: true, charge: true, house: true });
    expect(st.backup).toBe('hidden');
    expect(st.hdo).toBe('low');
  });
  it('DHW flips the valve; idle is still', () => {
    expect(schematicState(snap('dhw')).valve).toBe('dhw');
    const idle = schematicState(snap('idle'));
    expect(idle.compressor).toBe('off');
    expect(idle.brine).toBe(0);
    expect(idle.charge).toBe(0);
    expect(idle.pumps.primary).toBe(false);
  });
  it('primary pre-run moves brine slowly but is never the backup heater', () => {
    const s = snap('idle');
    s.heat_pump.primary_prerun = true;
    s.backup_heater.on = true; // logger bit pulses with the pre-run
    const st = schematicState(s);
    expect(st.compressor).toBe('prerun');
    expect(st.brine).toBeCloseTo(0.35);
    expect(st.backup).toBe('hidden');
  });
  it('never draws a backup heater the regulation does not have (available = false)', () => {
    const s = snap('fault');
    s.backup_heater.on = true;
    expect(schematicState(s).backup).toBe('hidden');
    expect(text(activityModel(s, NOW))).not.toMatch(/záložní/i);
  });
  it('hides the circulation pump while its state is not mapped (null)', () => {
    const s = snap('heating');
    expect(s.pumps.circulation).toBeNull();
    expect(schematicState(s).circulationKnown).toBe(false);
    s.pumps.circulation = true;
    expect(schematicState(s).circulationKnown).toBe(true);
    expect(schematicState(s).circulation).toBeGreaterThan(0);
  });
  it('shows an available backup heater only on a fault', () => {
    const f = snap('fault');
    f.backup_heater = { on: true, available: true };
    expect(schematicState(f).backup).toBe('on');
    const h = snap('heating');
    h.backup_heater = { on: false, available: true };
    expect(schematicState(h).backup).toBe('hidden');
  });
  it('stale data stops every animation', () => {
    const st = schematicState(snap('stale'));
    expect([st.brine, st.charge, st.house, st.circulation]).toEqual([0, 0, 0, 0]);
  });
  it('temperature colour runs from blue (cold) to orange (warm)', () => {
    const hue = (c: string) => Number(c.match(/ ([\d.]+)\)$/)![1]);
    expect(hue(tempColor(0))).toBeGreaterThan(200);
    expect(hue(tempColor(48))).toBeLessThan(60);
  });
  it('particles are calm and keyframes move along the polyline with transform only', () => {
    expect(particleDuration(400, 1)).toBeGreaterThanOrEqual(2);
    expect(particleDuration(400, 0)).toBe(0);
    expect(particleDuration(400, 0.4)).toBeGreaterThan(particleDuration(400, 1));
    const kf = polylineKeyframes('p', [
      [0, 0],
      [30, 0],
      [30, 10],
    ]);
    expect(kf).toContain('0.00%{transform:translate(0px,0px)}');
    expect(kf).toContain('75.00%{transform:translate(30px,0px)}');
    expect(kf).toContain('100.00%{transform:translate(30px,10px)}');
    expect(kf).not.toMatch(/offset|left|top/);
  });
});

describe('charts', () => {
  it('downsample keeps bucket extremes and the exact last point', () => {
    const pts: HistoryPoint[] = Array.from({ length: 1000 }, (_, i) => [
      i,
      i % 10,
      (i % 10) - 1,
      (i % 10) + (i === 500 ? 50 : 1),
    ]);
    const d = downsample(pts, 100);
    expect(d).toHaveLength(100);
    expect(d.at(-1)).toEqual(pts.at(-1));
    expect(Math.max(...d.map((p) => p[3]))).toBe(50);
    expect(downsample(pts.slice(0, 50), 100)).toHaveLength(50);
  });
  it('niceTicks covers the domain with round steps', () => {
    expect(niceTicks(-4.6, 2.9, 4)).toEqual([-6, -4, -2, 0, 2, 4]);
    expect(niceTicks(38, 48, 3)).toEqual([35, 40, 45, 50]);
  });
  it('mock history: day has runs, 10 years has daily runtime, no annotations (like backend)', () => {
    const day = buildMockHistory('day', ['tank_bottom'], NOW);
    expect(day.resolution).toBe('5min');
    expect(day.runs.length).toBeGreaterThan(1);
    expect(buildMockHistory('month', ['tank_bottom'], NOW).runs).toEqual([]);
    const all = buildMockHistory('all', ['outdoor_temp', 'compressor_runtime_h'], NOW);
    expect(all.series[1]!.points.length).toBeGreaterThan(3600);
    expect(all.annotations).toEqual([]);
  });
  it('normalizeHistory: counters keep the change, null means are gaps, unknown keys dropped', () => {
    const h = normalizeHistory(
      {
        range: 'week',
        resolution: 'hour',
        series: [
          {
            key: 'compressor_runtime_h',
            unit: 'h',
            points: [
              [1, 0.5, null, null],
              [2, null, null, null],
            ],
          },
          {
            key: 'tank_bottom',
            unit: '°C',
            points: [
              [1, 41.2, 40.1, 42],
              [2, null, null, null],
              [3, 40, null, null],
            ],
          },
          { key: 'heat_pump_discharge_temp', unit: '°C', points: [[1, 70, 69, 71]] },
        ],
        runs: [[1, 2]],
        annotations: [],
      },
      ['compressor_runtime_h', 'tank_bottom'],
    );
    expect(h.series.map((s) => s.key)).toEqual(['compressor_runtime_h', 'tank_bottom']);
    expect(h.series[0]!.points).toEqual([[1, 0.5, 0.5, 0.5]]);
    expect(h.series[1]!.points).toEqual([
      [1, 41.2, 40.1, 42],
      [3, 40, 40, 40],
    ]);
  });
});

describe('time axis', () => {
  it('uses round calendar ticks for every range', () => {
    const t0 = new Date(2026, 0, 13, 10, 17).getTime();
    const day = timeTicks(t0, t0 + 24 * 3_600_000);
    expect(day.unit).toBe('day');
    expect(day.ticks.map((t) => new Date(t).getHours())).toEqual([12, 18, 0, 6]);
    const week = timeTicks(t0, t0 + 7 * 86_400_000);
    expect(week.ticks).toHaveLength(7);
    expect(new Date(week.ticks[0]!).getHours()).toBe(0);
    const years = timeTicks(new Date(2016, 6, 1).getTime(), new Date(2026, 0, 1).getTime());
    expect(years.ticks.map((t) => new Date(t).getFullYear())).toEqual([
      2018, 2020, 2022, 2024, 2026,
    ]);
  });
});

describe('rooms', () => {
  it('sorts coldest first and explains the reference-room thermostat', () => {
    const s = snap('dhw'); // circuit off, reference room at target
    s.house.ref_temp = 22.6;
    const m = roomsModel(s);
    expect(m.rows.map((r) => r.name)).toEqual(['Pracovna', 'Ložnice', 'Obývák', 'Kuchyň']);
    expect(m.coldest?.delta).toBe(-1.2);
    expect(m.insight).toContain('okruh domu stojí');
    expect(m.insight).toContain('naplno');
  });
  it('no rooms = no insight', () => {
    const m = roomsModel(snap('heating', 0));
    expect(m.rows).toEqual([]);
    expect(m.insight).toBeNull();
  });
  it('throttle hint when most TRVs are nearly closed while the compressor runs', () => {
    const s = snap('heating');
    s.rooms = s.rooms.map((r) => (r.valve_pct === null ? r : { ...r, valve_pct: 10 }));
    expect(roomsModel(s).throttle).toMatch(/3 z 3\shlavic/);
  });
});

describe('seasons', () => {
  it('newest first, change vs previous, approximate energy marker, frontend 2018/19 note', () => {
    const { cards } = seasonsModel(buildMockSeasons(NOW));
    expect(cards).toHaveLength(10);
    expect(cards[0]!.season).toBe('2025/26');
    expect(cards[0]!.partial).toBe(true);
    const s1819 = cards.find((c) => c.season === '2018/19')!;
    expect(s1819.note).toContain('budova');
    expect(s1819.vsPrev!).toBeLessThan(-0.4);
    expect(fmtSeasonEnergy(cards[1]!)).toMatch(/^≈\u00a0\d+,\d\u00a0MWh$/);
  });
});

describe('efficiency scatter', () => {
  it('groups heating days around the break and explains the drop', () => {
    const h = buildMockHistory('all', ['outdoor_temp', 'compressor_runtime_h'], NOW);
    const m = efficiencyModel(h.series[0]!.points, h.series[1]!.points, NOW, HEATING_BREAK_TS, 500);
    expect(m.points.length).toBeLessThanOrEqual(520);
    expect(new Set(m.points.map((p) => p.group))).toEqual(new Set(['before', 'after', 'current']));
    expect(m.at0.before!).toBeGreaterThan(m.at0.after! * 2);
    expect(m.insight).toMatch(/^Od sezóny 2018\/19 běží kompresor .* o \d+\u00a0% kratší dobu/);
    expect(m.legend.map((l) => l.group)).toEqual(['before', 'after', 'current']);
    expect(m.legend[1]!.label).toMatch(/^2018\/19\u2009–\u2009\d{4}\/\d{2}$/);
    expect(m.legend[2]!.label).toBe('letos 2025/26');
    expect(m.fits.before!.y0).toBeGreaterThan(m.fits.after!.y0);
  });
  it('no data = no insight', () => {
    expect(efficiencyModel([], [], NOW, null).insight).toBeNull();
  });
});

describe('curve', () => {
  it('interpolates and clamps', () => {
    const pts: Array<[number, number]> = [
      [-15, 50],
      [-5, 44],
      [5, 37],
      [15, 30],
    ];
    expect(curveAt(pts, -1.8)).toBeCloseTo(41.76, 2);
    expect(curveAt(pts, -30)).toBe(50);
    expect(curveAt(pts, 30)).toBe(30);
    expect(curveAt([], 0)).toBeNull();
  });
});

describe('unmapped dev measurements', () => {
  it.each(HEATING_SCENARIOS)('%s never invents collector temperatures or cooling', (scenario) => {
    const s = snap(scenario);
    expect(s.heat_pump).toMatchObject({
      brine_in: null,
      brine_out: null,
      primary_prerun: null,
      discharge_temp: null,
      discharge_bar: null,
      suction_temp: null,
      suction_bar: null,
    });
    expect(s.mode.cooling).toBeNull();
    expect(s.pumps.circulation).toBeNull();
    expect(s.backup_heater.available).toBe(false);
    expect(activityModel(s, NOW).state).not.toBe('cooling');
  });
  it('house circuit can heat from the tank while the compressor rests', () => {
    const s = snap('house');
    expect(s.activity).toBe('house_circuit');
    expect(activityModel(s, NOW).state).toBe('house');
    expect(schematicState(s)).toMatchObject({
      compressor: 'off',
      brine: 0,
      pumps: { primary: false, house: true },
    });
  });
});
