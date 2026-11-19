import { fmtNum } from '../model.js';
import { fishHeatChip, type CircuitTone } from '../sideCircuits.js';
import type { HeatingFault, HeatingSnapshot } from '../types.js';

/**
 * Live state of the full schematic (pure). Every value comes from the snapshot; a missing value is
 * `unknown` / '–', never a made-up number.
 *
 * - `flow`: water moves (colour + direction chevrons, optional motion)
 * - `still`: pipe is filled but its pump stands or its branch is not selected (colour, no chevrons)
 * - `idle`: normally inactive branch (passive cooling) – circuit colour, dashed (the only dash)
 * - `closed`: leg of a closed valve port – neutral grey, solid, no chevrons
 * - `off`: out of service (owner fact) – dotted grey
 * - `unknown`: no data for the pump / valve that drives it – colour faded, solid, no chevrons
 */
export type PipeState = 'flow' | 'still' | 'idle' | 'closed' | 'off' | 'unknown';
export type Tri = boolean | null;
export type CompressorState = 'on' | 'off' | 'unknown';
/** Open path of the house mixing valve: A = from the tank, B = bypass, mix = both, unknown. */
export type MixPath = 'A' | 'B' | 'mix' | 'unknown';

export interface FullState {
  live: boolean;
  compressor: CompressorState;
  pipes: Record<string, PipeState>;
  pumps: Record<string, Tri>;
  mixer: { path: MixPath; pct: number | null; fault: HeatingFault | null };
  coolValve: { path: 'A' | 'B' | 'unknown'; cooling: Tri };
  /** Rybárna tempering (valve to heating + heating-enabled flag + temperature vs target). */
  fish: { active: Tri; label: string; tone: CircuitTone } | null;
  pool: { temp: string | null; heating: Tri; filter: Tri } | null;
  /** Changeover TČ → TUV (A, up) / → nádrž (B, down). */
  dhwValve: 'A' | 'B' | 'unknown';
  fishValve: Tri;
  readings: Record<string, string | null>;
}

/**
 * Fault key of the house mixing valve. The regulation exposes no such lamp today (the monitored
 * lamps are pressures, temperatures, supply and sensor faults), so this only fires once the owner
 * maps a lamp under exactly this key – never from a name guess.
 */
export const MIXER_FAULT_KEY = 'mixing_valve';

/** Fault of the house mixing valve, if a lamp is mapped under `MIXER_FAULT_KEY` and active. */
export function mixerFault(snap: HeatingSnapshot): HeatingFault | null {
  return snap.faults.active.find((f) => f.key === MIXER_FAULT_KEY) ?? null;
}

function mixPath(snap: HeatingSnapshot): MixPath {
  const pct = snap.house.mixing_valve_pct;
  if (pct === null) return 'unknown';
  if (pct >= 99) return 'A';
  if (pct <= 1) return 'B';
  return 'mix';
}

const run = (on: Tri): PipeState => (on === null ? 'unknown' : on ? 'flow' : 'still');
/** Leg behind a valve port: selected → follows the pump, not selected → closed. */
const leg = (selected: Tri, on: Tri): PipeState =>
  selected === null ? 'unknown' : selected ? run(on) : 'closed';

/** `4,0 °C` / `−1,8 °C`: NBSP before the unit, real minus sign (fmtNum). */
export const fsT = (v: number | null | undefined): string | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : `${fmtNum(v, 1)}\u00a0°C`;
const t = fsT;

export function fullState(snap: HeatingSnapshot): FullState {
  const live = snap.source === 'ok' && !snap.stale;
  const hp = snap.heat_pump;
  const L = (v: Tri): Tri => (live ? v : null);
  const compressorOn = L(hp.compressor_on);
  const compressor: CompressorState =
    compressorOn === null ? 'unknown' : compressorOn ? 'on' : 'off';
  const cooling = L(snap.mode.cooling);
  const fault = mixerFault(snap);
  const path = mixPath(snap);
  const mixA: Tri = path === 'unknown' ? null : path !== 'B';
  const mixB: Tri = path === 'unknown' ? null : path !== 'A';
  const charge = L(snap.pumps.secondary ?? hp.compressor_on);
  const toDhw = L(snap.dhw.valve_to_dhw);
  // Pre-run is often unmapped (null): then the compressor alone decides.
  const collector = L(
    hp.compressor_on === true || hp.primary_prerun === true
      ? true
      : hp.compressor_on === false
        ? false
        : null,
  );
  const house = L(snap.pumps.heating);
  const solar = snap.extras.solar ? L(snap.extras.solar.pump) : null;
  const pool = snap.extras.pool;
  const poolHeat = pool ? L(pool.heating_pump) : null;
  const poolFilter = pool ? L(pool.filter_pump) : null;
  const fish = snap.extras.fish;
  // The fish-house circulator has no signal of its own (its glyph stays neutral); the circuit
  // follows the valve to heating: open = water moves, closed = filled and still. Without a valve
  // signal only "tempering switched off" is certain.
  const fishValve = fish ? L(fish.valve_open) : null;
  const fishRun: Tri =
    fishValve !== null ? fishValve : fish && live && fish.heating_on === false ? false : null;
  const fishPump: Tri = null;
  const notDhw: Tri = toDhw === null ? null : !toDhw;
  const bypassOn: Tri = house === null || mixB === null ? null : house && mixB;
  const coolPath = cooling === null ? 'unknown' : cooling ? 'A' : 'B';

  const pipes: Record<string, PipeState> = {
    // heat pump ↔ tank (charging pump + DHW changeover, return from the matching tank zone)
    hp_to_valve: run(charge),
    vret_to_sek: run(charge),
    sek_to_hp: run(charge),
    valve_to_tuv: leg(toDhw, charge),
    valve_to_akn: leg(notDhw, charge),
    tank_mid_to_vret: toDhw === null ? 'unknown' : toDhw ? run(charge) : 'still',
    tank_bot_to_vret: toDhw === null ? 'unknown' : toDhw ? 'still' : run(charge),
    // ground collector: two pipes, through the TČ evaporator or the cooling exchanger
    hp_to_jbr: run(collector),
    pbr_to_hp: run(collector),
    jbs_to_pbr: run(collector),
    jbr_to_ground: run(cooling === true ? true : collector),
    ground_to_jbs: run(cooling === true ? true : collector),
    jbs_to_chlad: cooling ? 'flow' : 'idle',
    chlad_to_hx: cooling ? 'flow' : 'idle',
    hx_to_jbr: cooling ? 'flow' : 'idle',
    // house circuit through the mixing valve
    tank_to_mix: leg(mixA, house),
    mix_to_tut: run(house),
    tut_to_jsup: run(house),
    jsup_to_rad: run(house),
    rad_to_jret: run(house),
    jret_to_pump: run(house),
    pump_to_jmix: run(house),
    jmix_to_tank: mixA === false ? 'still' : run(house),
    // bypass B of the mixing valve, optionally through the cooling exchanger (cooling valve A)
    jmix_to_vcool: mixB === false ? 'still' : run(bypassOn),
    vcool_to_jbyp: coolPath === 'A' ? 'closed' : mixB === false ? 'still' : run(bypassOn),
    vcool_to_hx: cooling ? (mixB === false ? 'still' : run(bypassOn)) : 'idle',
    hx_to_jbyp: cooling ? (mixB === false ? 'still' : run(bypassOn)) : 'idle',
    jbyp_to_mix: mixB === false ? 'closed' : run(bypassOn),
    // fish house (own circulator, no state signal yet)
    jsup_to_ryb: run(fishRun),
    pryb_to_js: run(fishRun),
    js_to_lower: run(fishRun),
    lower_to_jr: run(fishRun),
    js_to_js2: run(fishRun),
    js2_to_vheat: run(fishRun),
    vryb_to_upper: leg(fishValve, fishRun),
    upper_to_jr2: fishValve === false ? 'still' : run(fishRun),
    jr2_to_jr: run(fishRun),
    jrybr_to_jret: run(fishRun),
    js2_to_vwater: 'off',
    vrybw_to_water: 'off',
    water_to_jr2: 'off',
    // solar
    solar_to_tank: run(solar),
    tank_to_psol: run(solar),
    psol_to_solar: run(solar),
    // domestic water: no draw signal → filled, no direction
    tank_to_tap: 'still',
    cold_to_tank: 'still',
    // pool floor heating straight from the tank (no exchanger, ?3) + filtration
    tank_to_ppool: run(poolHeat),
    ppool_to_bottom: run(poolHeat),
    bottom_to_tank: run(poolHeat),
    pool_to_pfilt: run(poolFilter),
    filt_to_filter: run(poolFilter),
    filter_to_ph: run(poolFilter),
    ph_to_sal: run(poolFilter),
    sal_to_acid: run(poolFilter),
    acid_to_pool: run(poolFilter),
  };

  const fishT = fish ? t(fish.temp) : null;
  const fishTarget = fish?.target ?? null;
  const fishChip = fish && live ? fishHeatChip(fish) : null;
  const readings: Record<string, string | null> = {
    hp_t_out: t(hp.condenser_out),
    hp_t_in: t(hp.return_temp),
    hp_coll_in: t(hp.collector_in),
    hp_coll_out: t(hp.collector_out),
    t_ut: t(snap.house.supply_temp),
    chip_attic: t(snap.house.attic_temp),
    chip_floor1: t(snap.house.ref_temp),
    chip_fish:
      fishT === null && fishTarget === null
        ? null
        : `${fishT ?? '–'} · cíl ${fsT(fishTarget) ?? '–'}`,
    tank_high: t(snap.tank.top),
    tank_low: t(snap.tank.bottom),
    tank_dhw: t(snap.dhw.temp),
    solar_temp: snap.extras.solar ? t(snap.extras.solar.temp) : null,
    pool_temp: pool ? t(pool.temp) : null,
    fish_t: fishT,
    fish_target: fsT(fishTarget),
    mixer_pct:
      snap.house.mixing_valve_pct === null
        ? null
        : `${fmtNum(snap.house.mixing_valve_pct, 0)}\u00a0%`,
    outdoor: t(snap.outdoor.temp),
  };

  return {
    live,
    compressor,
    pipes,
    pumps: {
      pump_sek: charge,
      pump_coll: collector,
      pump_chlad: cooling,
      pump_ut: house,
      pump_ryb: fishPump,
      pump_solar: solar,
      pump_pool: poolHeat,
      pump_filt: poolFilter,
    },
    mixer: { path, pct: snap.house.mixing_valve_pct, fault },
    coolValve: { path: coolPath, cooling },
    fish: fish
      ? {
          active: fishRun,
          label: fishChip && fishChip.label !== '—' ? fishChip.label : 'stav –',
          tone: fishChip?.tone ?? 'neutral',
        }
      : null,
    pool: pool ? { temp: t(pool.temp), heating: poolHeat, filter: poolFilter } : null,
    dhwValve: toDhw === null ? 'unknown' : toDhw ? 'A' : 'B',
    fishValve,
    readings,
  };
}

/** Routes whose chevrons are drawn (only where water is known to move). */
export function flowing(state: FullState, route: string): boolean {
  return state.pipes[route] === 'flow';
}
