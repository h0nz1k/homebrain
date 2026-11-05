/**
 * Egg timer („Vajíčka“) – a published physical model, no third-party app code.
 *
 * Cooking time of an egg put into boiling water (C. D. H. Williams, University of Exeter,
 * „The Science of Boiling an Egg“, https://www.exeter.ac.uk/research-centres/theoretical-physics/boiling-an-egg ,
 * derivation http://newton.ex.ac.uk/teaching/CDHW/egg/CW061201-1.pdf):
 *
 *   t[min] = 0.451 · M^(2/3) · ln(0.76 · (T_egg − T_water) / (T_yolk − T_water))
 *
 * M = egg mass in grams, T_yolk = temperature of the yolk/white boundary that defines doneness.
 * plus an empirical +20 s for every egg beyond the first (the water cools more), rounded to 10 s.
 * All tunable numbers live in {@link EGG_MODEL} (one table) so they can be refitted with
 * `scripts/fit_egg_timer.py` from reference times (`tests/fixtures/egg-timer/observations.json`).
 */

export type EggKind = 'chicken' | 'quail';
export type EggSize = 'S' | 'M' | 'L' | 'XL';
export type EggDoneness = 'namekko' | 'nahnilicko' | 'natvrdo';

export interface EggInput {
  kind: EggKind;
  /** Ignored for quail eggs. */
  size: EggSize;
  /** Straight from the fridge (Chlazený: ano). */
  chilled: boolean;
  count: number;
  doneness: EggDoneness;
  /** Home elevation in metres (HA `config.elevation`); null/≤0 = not configured. */
  elevationM?: number | null;
}

export interface DonenessConstants {
  label: string;
  /** Yolk boundary temperature (°C). */
  yolkC: number;
  /** Fitted to reference times (false = placeholder, UI shows „nekalibrováno“). */
  calibrated: boolean;
}

export interface EggModel {
  /** Effective egg mass per size (g), each fitted to reference times. */
  massG: Record<EggSize, number>;
  sizeCalibrated: Record<EggSize, boolean>;
  fridgeC: number;
  roomC: number;
  /**
   * Water temperature cap. A pot at a rolling boil on a home stove sits ~1 K under the
   * theoretical boiling point; 99 °C reproduces the reference times. Higher homes boil lower.
   */
  maxWaterC: number;
  doneness: Record<EggDoneness, DonenessConstants>;
  /**
   * Extra seconds per egg beyond the first: more eggs cool the water more and the stove needs
   * longer to recover (empirical, fitted to reference times with 1 and 3 eggs).
   */
  perExtraEggS: number;
  /**
   * Quail eggs (~10 g): Williams does not fit, the reference app uses a fixed table per doneness
   * (size and count ignored). Room-temperature quail uses the same table (nekalibrováno).
   */
  quail: Record<EggDoneness, { seconds: number; calibrated: boolean }>;
  /** Final times are rounded to this step (the reference app shows whole 10 s). */
  roundToS: number;
}

export const EGG_MODEL: EggModel = {
  massG: { S: 48.1, M: 58, L: 70.9, XL: 76.9 },
  sizeCalibrated: { S: true, M: true, L: true, XL: true },
  fridgeC: 5,
  roomC: 20,
  maxWaterC: 99,
  doneness: {
    namekko: { label: 'Naměkko', yolkC: 63.2, calibrated: true },
    nahnilicko: { label: 'Nahniličko', yolkC: 68.1, calibrated: true },
    natvrdo: { label: 'Natvrdo', yolkC: 81.9, calibrated: true },
  },
  perExtraEggS: 20,
  quail: {
    namekko: { seconds: 140, calibrated: true },
    nahnilicko: { seconds: 180, calibrated: true },
    // Not measured yet: extrapolated (+60 s), UI shows „nekalibrováno“.
    natvrdo: { seconds: 240, calibrated: false },
  },
  roundToS: 10,
};

export const EGG_SIZES: readonly EggSize[] = ['S', 'M', 'L', 'XL'];
export const EGG_DONENESS: readonly EggDoneness[] = ['namekko', 'nahnilicko', 'natvrdo'];

/**
 * Boiling point of water at an elevation: ISA barometric pressure
 * p = p0·(1 − 2.25577e-5·h)^5.25588 and Clausius–Clapeyron with L = 40.66 kJ/mol.
 * ≈ 100 − h/300 °C for homes below 1 500 m.
 */
export function boilingPointC(elevationM: number): number {
  const h = Math.max(0, Math.min(elevationM, 8000));
  const ratio = Math.pow(1 - 2.25577e-5 * h, 5.25588);
  const invT = 1 / 373.15 - (8.314 / 40660) * Math.log(ratio);
  return 1 / invT - 273.15;
}

/** Williams' formula in minutes (0 when the yolk is already at the target). */
export function williamsMinutes(
  massG: number,
  eggC: number,
  waterC: number,
  yolkC: number,
): number {
  if (yolkC >= waterC || eggC >= yolkC) return 0;
  const arg = (0.76 * (eggC - waterC)) / (yolkC - waterC);
  return arg <= 1 ? 0 : 0.451 * Math.pow(massG, 2 / 3) * Math.log(arg);
}

export interface EggResult {
  seconds: number;
  massG: number | null;
  eggC: number;
  waterC: number;
  yolkC: number | null;
  /** Seconds added for the eggs beyond the first. */
  countExtraS: number;
  calibrated: boolean;
  /** Short Czech lines for the UI („Jak počítáme“). */
  explanation: string[];
}

const fmtC = (v: number) => `${v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}\u00a0°C`;
const fmtG = (v: number) => `${Math.round(v)}\u00a0g`;

export function computeEggTime(input: EggInput, m: EggModel = EGG_MODEL): EggResult {
  const count = Math.max(1, Math.round(input.count));
  const eggC = input.chilled ? m.fridgeC : m.roomC;
  const boil = input.elevationM && input.elevationM > 0 ? boilingPointC(input.elevationM) : 100;
  const waterC = Math.min(m.maxWaterC, boil);
  const where =
    input.elevationM && input.elevationM > 0
      ? `voda ${fmtC(waterC)} (var v ${Math.round(input.elevationM)} m n. m.)`
      : `voda ${fmtC(waterC)}`;
  if (input.kind === 'quail') {
    const row = m.quail[input.doneness];
    return {
      seconds: row.seconds,
      massG: null,
      eggC,
      waterC,
      yolkC: null,
      countExtraS: 0,
      calibrated: input.chilled && row.calibrated,
      explanation: [
        `Křepelčí vejce (~10 g) se prohřeje skoro hned: pevný čas podle stupně (${m.doneness[input.doneness].label.toLowerCase()}).`,
        'Velikost ani počet vajec čas nemění.',
      ],
    };
  }
  const massG = m.massG[input.size];
  const done = m.doneness[input.doneness];
  const countExtraS = m.perExtraEggS * (count - 1);
  const base = williamsMinutes(massG, eggC, waterC, done.yolkC) * 60;
  const step = Math.max(1, m.roundToS);
  const seconds = Math.max(60, Math.round((base + countExtraS) / step) * step);
  const explanation = [
    `Vejce ${input.size} ≈ ${fmtG(massG)}, ${input.chilled ? `z lednice ${fmtC(eggC)}` : `pokojová ${fmtC(eggC)}`}, ${where}.`,
    `${done.label}: hranice žloutku má dosáhnout ${fmtC(done.yolkC)}.`,
    'Williamsův vzorec: t = 0,451 · M^(2/3) · ln(0,76 · (T vejce − T vody) / (T žloutku − T vody)).',
  ];
  if (countExtraS)
    explanation.push(
      `Každé další vejce ochladí vodu: +${m.perExtraEggS}\u00a0s (${count}\u00a0ks).`,
    );
  return {
    seconds,
    massG,
    eggC,
    waterC,
    yolkC: done.yolkC,
    countExtraS,
    calibrated: done.calibrated && m.sizeCalibrated[input.size],
    explanation,
  };
}

/** Timer name, e.g. „Vejce M naměkko (2 ks)“ / „Křepelčí vejce (12 ks)“. */
export function eggTimerLabel(input: EggInput, m: EggModel = EGG_MODEL): string {
  const count = Math.max(1, Math.round(input.count));
  if (input.kind === 'quail') return `Křepelčí vejce (${count} ks)`;
  return `Vejce ${input.size} ${m.doneness[input.doneness].label.toLowerCase()} (${count} ks)`;
}

/** m:ss */
export function formatEggTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
