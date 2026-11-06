/** Consumables: hours left (HA roborock duration sensors) → %, days and a Czech call to action. */
export type ConsumableKind =
  'main_brush' | 'side_brush' | 'filter' | 'sensors' | 'dock_strainer' | 'dock_brush';

/** „Údržba“ thresholds in % of service life left: red at or below CRIT, amber at or below WARN. */
export const MAINT_CRIT_PCT = 10;
export const MAINT_WARN_PCT = 25;

/** Service life in hours (python-roborock *_REPLACE_TIME constants). */
export const CONSUMABLE_LIFETIME_H: Record<ConsumableKind, number> = {
  main_brush: 300,
  side_brush: 200,
  filter: 150,
  sensors: 30,
  dock_strainer: 150,
  dock_brush: 300,
};

const META: Record<ConsumableKind, { label: string; verb: 'Vyměnit' | 'Vyčistit' }> = {
  main_brush: { label: 'Hlavní kartáč', verb: 'Vyměnit' },
  side_brush: { label: 'Boční kartáč', verb: 'Vyměnit' },
  filter: { label: 'Filtr', verb: 'Vyměnit' },
  sensors: { label: 'Senzory', verb: 'Vyčistit' },
  dock_strainer: { label: 'Sítko doku', verb: 'Vyčistit' },
  dock_brush: { label: 'Kartáček doku', verb: 'Vyčistit' },
};

export interface ConsumableInfo {
  kind: ConsumableKind;
  label: string;
  hoursLeft: number;
  /** 0–100, rounded; 0 when overdue. */
  percent: number;
  /** Whole days until due at `dailyHours` of cleaning per day; 0 = now/overdue. */
  daysLeft: number;
  action: string;
  tone: 'ok' | 'warn' | 'crit';
}

export function czDays(days: number): string {
  if (days === 1) return '1 den';
  if (days >= 2 && days <= 4) return `${days} dny`;
  return `${days} dní`;
}

export function consumableInfo(
  kind: ConsumableKind,
  hoursLeft: number,
  dailyHours = 1,
): ConsumableInfo {
  const lifetime = CONSUMABLE_LIFETIME_H[kind];
  const left = Number.isFinite(hoursLeft) ? hoursLeft : 0;
  const percent = Math.max(0, Math.min(100, Math.round((left / lifetime) * 100)));
  const rate = dailyHours > 0 ? dailyHours : 1;
  const daysLeft = left <= 0 ? 0 : Math.max(1, Math.floor(left / rate));
  const { label, verb } = META[kind];
  const overdue = left <= 0;
  // Same thresholds as every „Údržba“ tile: ≤ 10 % (or overdue) red, ≤ 25 % amber.
  const tone =
    overdue || percent <= MAINT_CRIT_PCT ? 'crit' : percent <= MAINT_WARN_PCT ? 'warn' : 'ok';
  const action = overdue
    ? `${verb} teď`
    : daysLeft <= 1
      ? `${verb} zítra`
      : `${verb} za ${czDays(daysLeft)}`;
  return { kind, label, hoursLeft: left, percent, daysLeft, action, tone };
}

/** Most urgent first (lowest days, then percent). */
export function sortConsumables(items: ConsumableInfo[]): ConsumableInfo[] {
  return [...items].sort((a, b) => a.daysLeft - b.daysLeft || a.percent - b.percent);
}
