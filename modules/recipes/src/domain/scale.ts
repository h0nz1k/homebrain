/** Servings scaling + Czech number formatting (pure). */
import { czCount, czPlural } from '@homebrain/ui';

import type { Ingredient } from '../types.js';

const FRACTIONS: Array<[number, string]> = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];
/** Units where cooks think in fractions (½ lžičky, 1 ½ hrnku). */
const FRACTION_UNITS = new Set(['lžíce', 'lžička', 'hrnek', 'špetka', 'l', 'hrst']);

/** 1.5 -> „1,5“, 0.333 -> „0,33“, 12.4 -> „12“. */
export function formatNumber(value: number): string {
  const digits = value >= 10 ? 0 : value >= 1 ? 1 : 2;
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toLocaleString('cs-CZ', { maximumFractionDigits: digits }).replace(/\u00a0/g, ' ');
}

function asFraction(value: number): string | null {
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  if (rest < 0.05) return whole > 0 ? String(whole) : null;
  for (const [frac, glyph] of FRACTIONS) {
    if (Math.abs(rest - frac) < 0.04) return whole > 0 ? `${whole} ${glyph}` : glyph;
  }
  return null;
}

export interface QtyText {
  qty: string;
  unit: string;
}

/** Display quantity: countables round to whole pieces, g ≥ 1000 → kg, ml ≥ 1000 → l. */
export function formatQuantity(
  qty: number | null,
  unit: string | null,
  countable = false,
): QtyText | null {
  if (qty === null || !Number.isFinite(qty)) return null;
  let value = qty;
  let u = unit ?? '';
  if (u === 'g' && value >= 1000) [value, u] = [value / 1000, 'kg'];
  else if (u === 'ml' && value >= 1000) [value, u] = [value / 1000, 'l'];
  else if (u === 'dkg' && value >= 100) [value, u] = [value / 100, 'kg'];
  if (countable) {
    const pieces = value < 1 ? Math.round(value * 2) / 2 : Math.round(value);
    return { qty: pieces === 0.5 ? '½' : String(Math.max(pieces, 0.5)), unit: u };
  }
  if (FRACTION_UNITS.has(u) || u === '') {
    const frac = asFraction(value);
    if (frac) return { qty: frac, unit: u };
  }
  return { qty: formatNumber(value), unit: u };
}

export interface ScaledIngredient extends Ingredient {
  qtyText: string | null;
  changed: boolean;
}

export function scaleIngredients(
  items: Ingredient[],
  baseServings: number | null,
  servings: number,
): ScaledIngredient[] {
  const factor = baseServings && baseServings > 0 ? servings / baseServings : 1;
  return items.map((item) => {
    const qty = item.qty === null ? null : item.qty * factor;
    const qtyMax = item.qtyMax == null ? null : item.qtyMax * factor;
    const main = formatQuantity(qty, item.unit, item.countable);
    let qtyText: string | null = null;
    if (main) {
      const max = formatQuantity(qtyMax, item.unit, item.countable);
      qtyText = [max && max.qty !== main.qty ? `${main.qty}–${max.qty}` : main.qty, main.unit]
        .filter(Boolean)
        .join(' ');
    } else if (item.unit) {
      qtyText = item.unit;
    }
    return { ...item, qtyText, changed: factor !== 1 && item.qty !== null };
  });
}

/** 1 porce, 2–4 porce, 5+ porcí. */
export const porce = (n: number): string => czCount(n, 'porce', 'porce', 'porcí');
/** 1 krok, 2–4 kroky, 5+ kroků. */
export const kroky = (n: number): string => czCount(n, 'krok', 'kroky', 'kroků');
/** Word only, for stat tiles that show the number separately. */
export const krokyWord = (n: number): string => czPlural(n, 'krok', 'kroky', 'kroků');
/** 1 surovina, 2–4 suroviny, 5+ surovin. */
export const suroviny = (n: number): string => czCount(n, 'surovina', 'suroviny', 'surovin');
/** 1 minuta, 2–4 minuty, 5+ minut. */
export const minuty = (n: number): string => czCount(n, 'minuta', 'minuty', 'minut');

/** 5400 -> „1 h 30 min“, 1200 -> „20 min“, 45 -> „45 s“. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Countdown clock: 65 -> „1:05“, 3725 -> „1:02:05“. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
