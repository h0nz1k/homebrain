/*
 * Temperatures and cell balance of the inverter and the battery (pure, no React).
 *
 * Thresholds are ORIENTATIONAL (orientační) – they are not read from the device:
 * - Battery (LFP, GoodWe Lynx Home F HV datasheet): charging allowed 0 < T ≤ 50 °C, discharging
 *   −20 < T ≤ 50 °C. Below ~10 °C the BMS limits the charge current (typical LFP behaviour), at
 *   ≤ 0 °C charging stops. Above 40 °C we warn (ageing speeds up), at ≥ 50 °C the BMS stops.
 * - Inverter (GoodWe ET datasheet: operating ambient −35…+60 °C with power derating at high
 *   ambient): the radiator (heat sink) runs hotter than the air. 60 °C = notice (hot), 70 °C =
 *   warn (derating likely). No public radiator limit – orientational values.
 * - Cell voltage spread (max − min cell, LFP): ≤ 30 mV well balanced, ≤ 80 mV fine, above that
 *   the BMS should balance (mainly meaningful near full charge, at mid SoC LFP is flat).
 * 'Inverter Temperature (Module)' on GoodWe ET always reads 0 → never bind it.
 */

/** `muted`: device out of operation (e.g. inverter fault) – a temperature colour would mislead. */
export type ThermalTone = 'ok' | 'cold' | 'notice' | 'warn' | 'crit' | 'muted';

export const BATTERY_TEMP_C = {
  /** ≤ 0 °C: charging stops (Lynx Home F: charge 0 < T ≤ 50 °C). */
  chargeStop: 0,
  /** < 10 °C: BMS limits the charge current (typical LFP). */
  chargeSlow: 10,
  /** > 40 °C: faster ageing, warn. */
  warn: 40,
  /** ≥ 50 °C: outside the operating range, BMS stops. */
  stop: 50,
} as const;

export const INVERTER_RADIATOR_C = {
  /** ≥ 60 °C: hot, notice. */
  notice: 60,
  /** ≥ 70 °C: power derating likely. */
  warn: 70,
} as const;

export const CELL_SPREAD_MV = {
  /** ≤ 30 mV: well balanced. */
  good: 30,
  /** ≤ 80 mV: fine; above it the BMS should balance. */
  fine: 80,
} as const;

export interface ThermalState {
  tone: ThermalTone;
  /** Short Czech state ("v normě", "chladno – pomalé nabíjení", …). */
  label: string;
}

/** Plausible sensor range; outside it the sensor is broken (e.g. a constant 0 on the module). */
export const plausibleTemp = (c: number | null): c is number =>
  c !== null && Number.isFinite(c) && c > -40 && c < 110;

export function batteryTempState(c: number): ThermalState {
  if (c <= BATTERY_TEMP_C.chargeStop) return { tone: 'crit', label: 'mráz – nenabíjí se' };
  if (c < BATTERY_TEMP_C.chargeSlow) return { tone: 'cold', label: 'chladno – pomalé nabíjení' };
  if (c >= BATTERY_TEMP_C.stop) return { tone: 'crit', label: 'přehřátá – BMS odpojí' };
  if (c > BATTERY_TEMP_C.warn) return { tone: 'warn', label: 'horká – rychleji stárne' };
  return { tone: 'ok', label: 'v normě' };
}

export function inverterTempState(c: number): ThermalState {
  if (c >= INVERTER_RADIATOR_C.warn) return { tone: 'warn', label: 'horký – může omezit výkon' };
  if (c >= INVERTER_RADIATOR_C.notice) return { tone: 'notice', label: 'teplý' };
  return { tone: 'ok', label: 'v normě' };
}

export interface CellSpread {
  /** max − min (mV for voltage, °C for temperature). */
  spread: number;
  tone: ThermalTone;
  /** Czech explanation for the detail sheet. */
  note: string;
}

/** Cell voltage spread from max/min cell voltage (V) → mV + balance verdict. */
export function cellVoltageSpread(maxV: number | null, minV: number | null): CellSpread | null {
  if (maxV === null || minV === null || !(maxV >= minV) || maxV <= 0) return null;
  const mv = Math.round((maxV - minV) * 1000);
  if (mv <= CELL_SPREAD_MV.good)
    return { spread: mv, tone: 'ok', note: 'Články jsou dobře vyvážené.' };
  if (mv <= CELL_SPREAD_MV.fine)
    return {
      spread: mv,
      tone: 'ok',
      note: 'Mírný rozdíl mezi články, běžné – BMS vyrovnává hlavně při plném nabití.',
    };
  return {
    spread: mv,
    tone: 'notice',
    note: 'Větší rozdíl mezi články – BMS by měla vyrovnat při nabití na 100 %; pokud trvá, nechte baterii zkontrolovat.',
  };
}

/** Cell temperature spread (°C); > 5 °C means uneven cooling or a weak module. */
export function cellTempSpread(maxC: number | null, minC: number | null): CellSpread | null {
  if (!plausibleTemp(maxC) || !plausibleTemp(minC) || maxC < minC) return null;
  const d = Math.round((maxC - minC) * 10) / 10;
  return d <= 5
    ? { spread: d, tone: 'ok', note: 'Teplota článků je rovnoměrná.' }
    : {
        spread: d,
        tone: 'notice',
        note: 'Články mají nestejnou teplotu – zkontrolujte větrání baterie.',
      };
}

/** Min / max / last of a sample series (sparkline caption). */
export function seriesRange(values: number[]): { min: number; max: number } | null {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}
