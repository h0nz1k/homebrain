import { describe, expect, it } from 'vitest';
import { buildMockSnapshot, withMixerFault } from '../mock.js';
import type { HeatingSnapshot } from '../types.js';
import { MIXER_FAULT_KEY, fsT, fullState } from './fullState.js';
import { FULL_GEOMETRY as G } from './geometry.gen.js';

const NOW = Date.parse('2026-01-12T10:00:00Z');
const snap = (s: Parameters<typeof buildMockSnapshot>[0] = 'heating') =>
  buildMockSnapshot(s, 0, NOW);
const cooling = (base: HeatingSnapshot): HeatingSnapshot => ({
  ...base,
  mode: { ...base.mode, cooling: true },
  pumps: { ...base.pumps, heating: true },
  house: { ...base.house, mixing_valve_pct: 40 },
});

describe('full schematic live state', () => {
  it('gives every one of the 55 frozen pipes a state', () => {
    const st = fullState(snap());
    expect(G.pipes).toHaveLength(55);
    for (const p of G.pipes) expect(st.pipes[p.id], p.id).toBeDefined();
    expect(Object.keys(st.pipes).sort()).toEqual(G.pipes.map((p) => p.id).sort());
  });

  it('heating the tank: charge loop + collector flow, house pump stands, TUV leg closed', () => {
    const st = fullState(snap('heating'));
    expect(st.compressor).toBe('on');
    expect(st.pipes.hp_to_valve).toBe('flow');
    expect(st.pipes.valve_to_akn).toBe('flow');
    expect(st.pipes.valve_to_tuv).toBe('closed');
    expect(st.pipes.hp_to_jbr).toBe('flow');
    expect(st.pipes.mix_to_tut).toBe('still');
    expect(st.dhwValve).toBe('B');
  });

  it('compressor off + unmapped pre-run: collector loop is still (filled), not "no data"', () => {
    const st = fullState(snap('idle'));
    expect(st.compressor).toBe('off');
    expect(st.pipes.hp_to_jbr).toBe('still');
    expect(st.pipes.jbr_to_ground).toBe('still');
  });

  it('DHW: changeover to A, TUV leg flows, tank leg closed', () => {
    const st = fullState(snap('dhw'));
    expect(st.pipes.valve_to_tuv).toBe('flow');
    expect(st.pipes.valve_to_akn).toBe('closed');
    expect(st.pipes.tank_mid_to_vret).toBe('flow');
    expect(st.pipes.tank_bot_to_vret).toBe('still');
  });

  it('default live data: no mixing-valve fault, position unknown = neutral, never a fault', () => {
    const st = fullState(snap('heating'));
    expect(st.mixer.fault).toBeNull();
    expect(st.mixer.pct).toBeNull();
    expect(st.mixer.path).toBe('unknown');
  });

  it('no name heuristic: a fault only counts under the explicit mixing_valve key', () => {
    const base = snap('house');
    const named = {
      ...base,
      faults: {
        ...base.faults,
        active: [{ key: 'f_09', label: 'Směšovací ventil – porucha', since: null }],
      },
    };
    expect(fullState(named).mixer.fault).toBeNull();
    const st = fullState(withMixerFault(base, NOW));
    expect(st.mixer.fault?.key).toBe(MIXER_FAULT_KEY);
    // the fault does not invent a position: 72 % in the house scenario → mixing
    expect(st.mixer.path).toBe('mix');
  });

  it('mixer fully on A: B leg closed (grey), no bypass flow', () => {
    const base = snap('house');
    const st = fullState({ ...base, house: { ...base.house, mixing_valve_pct: 100 } });
    expect(st.mixer.path).toBe('A');
    expect(st.pipes.tank_to_mix).toBe('flow');
    expect(st.pipes.jbyp_to_mix).toBe('closed');
    expect(st.pipes.jmix_to_vcool).toBe('still');
  });

  it('passive cooling (cooling valve A) routes the bypass through the exchanger', () => {
    const st = fullState(cooling(snap('house')));
    expect(st.coolValve.path).toBe('A');
    expect(st.pipes.vcool_to_hx).toBe('flow');
    expect(st.pipes.hx_to_jbyp).toBe('flow');
    expect(st.pipes.vcool_to_jbyp).toBe('closed');
    expect(st.pipes.chlad_to_hx).toBe('flow');
    expect(st.mixer.path).toBe('mix');
  });

  it('cooling unknown/off: the cooling branch stays normally idle (dimmed, no chevrons)', () => {
    const st = fullState(snap('house'));
    expect(st.coolValve.path).toBe('unknown');
    for (const id of ['jbs_to_chlad', 'chlad_to_hx', 'hx_to_jbr', 'vcool_to_hx', 'hx_to_jbyp']) {
      expect(st.pipes[id]).toBe('idle');
    }
  });

  it('stale / unreachable data never shows flow, readings stay real numbers or –', () => {
    for (const s of ['stale', 'unconfigured'] as const) {
      const st = fullState(snap(s));
      expect(Object.values(st.pipes)).not.toContain('flow');
      expect(st.compressor).toBe('unknown');
    }
    const st = fullState(snap('heating'));
    // collector temperatures are unmapped in the mock → null, rendered as '–'
    expect(st.readings.hp_coll_in).toBeNull();
    expect(st.readings.hp_coll_out).toBeNull();
    expect(st.readings.hp_t_out).toMatch(/°C$/u);
  });

  it('fish water stays out of service (owner fact); the pump has no signal but stays neutral', () => {
    const st = fullState(snap('heating'));
    expect(st.pipes.vrybw_to_water).toBe('off');
    expect(st.pumps.pump_ryb).toBeNull();
  });

  it('rybárna: valve open = tempering active, but its pump has no signal → no flow drawn', () => {
    const st = fullState(snap('heating'));
    expect(st.fish).toMatchObject({ active: true, label: 'topí' });
    for (const id of ['jsup_to_ryb', 'pryb_to_js', 'js_to_lower', 'vryb_to_upper', 'jrybr_to_jret'])
      expect(st.pipes[id], id).toBe('unknown');
  });

  it('rybárna: valve closed with heating enabled and warm enough = idle, filled, not "no data"', () => {
    const st = fullState(snap('idle'));
    expect(st.fish).toMatchObject({ active: false, label: 'netopí – teplo stačí' });
    expect(st.pipes.pryb_to_js).toBe('still');
    expect(st.pipes.vryb_to_upper).toBe('closed');
    expect(
      Object.entries(st.pipes).filter(([k, v]) => /ryb|js|jr/u.test(k) && v === 'unknown'),
    ).toEqual([]);
  });

  it('rybárna: tempering switched off without a valve signal = still', () => {
    const base = snap('idle');
    const st = fullState({
      ...base,
      extras: {
        ...base.extras,
        fish: { ...base.extras.fish!, heating_on: false, valve_open: null },
      },
    });
    expect(st.fish).toMatchObject({ active: false, label: 'vytápění vypnuto' });
    expect(st.pipes.pryb_to_js).toBe('still');
  });

  it('temperatures: NBSP before °C and a real minus sign', () => {
    expect(fsT(4)).toBe('4,0\u00a0°C');
    expect(fsT(-1.8)).toBe('\u22121,8\u00a0°C');
    expect(fsT(null)).toBeNull();
    expect(fullState(snap('heating')).readings.outdoor).toBe('\u22121,8\u00a0°C');
  });

  describe('flow only where the pump driving the circuit is known to run', () => {
    const ROUTES: Record<string, string[]> = {
      house: [
        'tank_to_mix',
        'mix_to_tut',
        'tut_to_jsup',
        'jsup_to_rad',
        'rad_to_jret',
        'jret_to_pump',
        'pump_to_jmix',
        'jmix_to_tank',
        'jmix_to_vcool',
        'vcool_to_jbyp',
        'vcool_to_hx',
        'hx_to_jbyp',
        'jbyp_to_mix',
      ],
      charge: ['hp_to_valve', 'valve_to_akn', 'tank_bot_to_vret', 'vret_to_sek', 'sek_to_hp'],
      collector: ['hp_to_jbr', 'jbr_to_ground', 'ground_to_jbs', 'jbs_to_pbr', 'pbr_to_hp'],
      cooling: ['jbs_to_chlad', 'chlad_to_hx', 'hx_to_jbr'],
      solar: ['solar_to_tank', 'tank_to_psol', 'psol_to_solar'],
      pool: ['tank_to_ppool', 'ppool_to_bottom', 'bottom_to_tank'],
      filtration: [
        'pool_to_pfilt',
        'filt_to_filter',
        'filter_to_ph',
        'ph_to_sal',
        'sal_to_acid',
        'acid_to_pool',
      ],
      fish: G.pipes.map((p) => p.id).filter((id) => /ryb|^js|^jr|lower|upper/u.test(id)),
    };
    const flows = (s: HeatingSnapshot, c: string) =>
      ROUTES[c]!.filter((id) => fullState(s).pipes[id] === 'flow');
    const base = snap('heating');
    const ex = base.extras;
    const set = (c: string, on: boolean): HeatingSnapshot => {
      const hp = { ...base.heat_pump, compressor_on: on, primary_prerun: on };
      switch (c) {
        case 'house':
          return {
            ...base,
            pumps: { ...base.pumps, heating: on },
            house: { ...base.house, mixing_valve_pct: 50 },
          };
        case 'charge':
          return { ...base, pumps: { ...base.pumps, secondary: on } };
        case 'collector':
          return { ...base, heat_pump: hp, mode: { ...base.mode, cooling: false } };
        case 'cooling':
          return { ...base, mode: { ...base.mode, cooling: on } };
        case 'solar':
          return { ...base, extras: { ...ex, solar: { ...ex.solar!, pump: on } } };
        case 'pool':
          return { ...base, extras: { ...ex, pool: { ...ex.pool!, heating_pump: on } } };
        case 'filtration':
          return { ...base, extras: { ...ex, pool: { ...ex.pool!, filter_pump: on } } };
        default:
          return {
            ...base,
            extras: { ...ex, fish: { ...ex.fish!, heating_on: on, valve_open: on } },
          };
      }
    };

    it('covers every pipe that can ever flow', () => {
      const listed = new Set(Object.values(ROUTES).flat());
      const never = [
        'tank_to_tap',
        'cold_to_tank',
        'js2_to_vwater',
        'vrybw_to_water',
        'water_to_jr2',
      ];
      const missing = G.pipes
        .map((p) => p.id)
        .filter((id) => !listed.has(id) && !never.includes(id));
      // charge circuit DHW legs are covered by the changeover tests above
      expect(missing.sort()).toEqual(['tank_mid_to_vret', 'valve_to_tuv']);
    });

    it.each(Object.keys(ROUTES).filter((c) => c !== 'fish'))(
      '%s: pump stands → filled, still, no flow; pump runs → flow',
      (c) => {
        expect(flows(set(c, false), c), `${c} off`).toEqual([]);
        expect(flows(set(c, true), c).length, `${c} on`).toBeGreaterThan(0);
        const off = fullState(set(c, false));
        expect(
          ROUTES[c]!.filter((id) => !['still', 'closed', 'idle'].includes(off.pipes[id]!)),
          `${c} off style`,
        ).toEqual([]);
      },
    );

    it('house: "Čerpadlo topení" stojí → whole heating loop incl. the fish branch shows no flow', () => {
      const s = set('house', false);
      const st = fullState(s);
      expect(st.pumps.pump_ut).toBe(false);
      expect(flows(s, 'house')).toEqual([]);
      expect(flows(s, 'fish')).toEqual([]);
      expect(st.pipes.mix_to_tut).toBe('still');
      expect(st.pipes.jrybr_to_jret).not.toBe('flow');
    });

    it('fish: its circulator has no signal → never drawn as flowing (still when no demand)', () => {
      expect(flows(set('fish', true), 'fish')).toEqual([]);
      expect(flows(set('fish', false), 'fish')).toEqual([]);
      const off = fullState(set('fish', false));
      expect(
        ROUTES.fish!.filter((id) => !['still', 'closed', 'off'].includes(off.pipes[id]!)),
      ).toEqual([]);
    });

    it('cooling active + compressor off: the ground loop flows through the cooling pump only', () => {
      const s = { ...set('collector', false), mode: { ...base.mode, cooling: true } };
      const st = fullState(s);
      expect(st.pipes.hp_to_jbr).toBe('still');
      expect(st.pipes.jbr_to_ground).toBe('flow');
      expect(st.pipes.jbs_to_chlad).toBe('flow');
    });
  });
});
