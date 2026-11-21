import { describe, expect, it } from 'vitest';
import {
  cyclingModel,
  fishWaterRows,
  manualSeasonNote,
  poolRows,
  settingsRows,
  solarDayModel,
} from './insights.js';
import { buildMockSnapshot } from './mock.js';

const NOW = Date.UTC(2026, 0, 14, 10);
const snap = (scenario: Parameters<typeof buildMockSnapshot>[0] = 'heating') =>
  buildMockSnapshot(scenario, 0, NOW);

describe('settingsRows', () => {
  it('shows curve mode, constant/min water and the winter limit', () => {
    const rows = settingsRows(snap());
    expect(rows.map((r) => r.id)).toEqual([
      'curve-mode',
      'constant-target',
      'min-water',
      'winter-limit',
    ]);
    expect(rows[0]!.value).toBe('podle ekvitermní křivky');
    // the constant target exists but is idle while the curve rules
    expect(rows[1]).toMatchObject({ idle: true, value: '50\u202f°C' });
    expect(rows[3]!.value).toBe('venku pod 12\u202f°C');
  });

  it('constant mode makes the constant target the active one', () => {
    const s = snap();
    s.curve.weather_comp = false;
    const rows = settingsRows(s);
    expect(rows[0]!.value).toBe('konstantní');
    expect(rows[1]!.idle).toBe(false);
  });

  it('hides every unmapped value (no placeholders)', () => {
    const s = snap();
    s.curve.weather_comp = null;
    s.curve.constant_target = null;
    s.curve.min_water = null;
    s.mode.winter_limit = null;
    delete s.mode.summer_limit; // older backend
    expect(settingsRows(s)).toEqual([]);
    s.mode.summer_limit = 16;
    expect(settingsRows(s).map((r) => r.value)).toEqual(['venku nad 16\u202f°C']);
  });
});

describe('manualSeasonNote', () => {
  it('explains manual winter in plain Czech, silent in automatic mode', () => {
    const s = snap();
    expect(manualSeasonNote(s)).toBeNull();
    s.mode.auto_season = false;
    expect(manualSeasonNote(s)).toContain('Zima je zapnutá ručně');
    expect(manualSeasonNote(s)).toContain('mez zimy 12\u202f°C se nepoužívá');
    s.mode.season = 'summer';
    expect(manualSeasonNote(s)).toContain('Léto je zapnuté ručně');
    s.mode.auto_season = null;
    expect(manualSeasonNote(s)).toBeNull();
  });
});

describe('cyclingModel', () => {
  it('ok day vs short cycling', () => {
    const ok = cyclingModel(snap('heating'))!;
    expect(ok.tone).toBe('ok');
    expect(ok.rows[0]!.value).toBe('5\u00a0startů · Ø 41\u00a0min');
    const warn = cyclingModel(snap('dhw'))!;
    expect(warn.tone).toBe('warn');
    expect(warn.verdict).toContain('víc než 30 startů');
    expect(warn.rows.map((r) => r.label)).toEqual(['Dnes', 'Včera']);
  });
  it('null when the compressor is not mapped or the backend is older', () => {
    const s = snap();
    s.heat_pump.cycling = null;
    expect(cyclingModel(s)).toBeNull();
    delete s.heat_pump.cycling;
    expect(cyclingModel(s)).toBeNull();
  });
});

describe('solarDayModel', () => {
  it('today + yesterday rows; zero shown in words', () => {
    const m = solarDayModel(snap('solar'))!;
    expect(m.today.map((r) => r.label)).toEqual([
      'Čerpadlo běželo',
      'Nejvyšší teplota kolektoru',
      'Stagnace (přehřátý, čerpadlo stojí)',
    ]);
    expect(m.today[2]!.value).toBe('žádná');
    expect(m.yesterday[2]!.value).toBe('35\u00a0min');
  });
  it('hides unmapped parts and the whole card without solar', () => {
    const s = snap('solar');
    s.extras.solar!.today = { pump_h: null, max_temp: 40, stagnation_min: null };
    s.extras.solar!.yesterday = null;
    expect(solarDayModel(s)).toEqual({
      today: [{ id: 'today-max', label: 'Nejvyšší teplota kolektoru', value: '40\u202f°C' }],
      yesterday: [],
    });
    expect(solarDayModel(buildMockSnapshot('heating', 0, NOW, 'none'))).toBeNull();
  });
});

describe('pool and fish rows', () => {
  it('lists mapped pool settings and fish water', () => {
    expect(poolRows(snap()).map((r) => r.id)).toEqual([
      'filter-enabled',
      'filter-program',
      'filter-pump',
      'heating-enabled',
      'auto',
      'target',
    ]);
    expect(fishWaterRows(snap()).map((r) => r.value)).toEqual([
      '17,6\u202f°C',
      '18,0\u202f°C ± 1,0\u202f°C',
      'zapnutý · teď nehřeje',
    ]);
  });
  it('older payloads (no new keys) give no rows', () => {
    const s = snap();
    s.extras.pool = { temp: 27.9, heating_pump: null, filter_pump: null };
    s.extras.fish = { temp: 8, target: 8, hysteresis: 0.2, heating_on: true, valve_open: false };
    expect(poolRows(s)).toEqual([]);
    expect(fishWaterRows(s)).toEqual([]);
    expect(poolRows(buildMockSnapshot('heating', 0, NOW, 'none'))).toEqual([]);
  });
});
