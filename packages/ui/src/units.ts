/** Non-breaking space: keeps a number and its unit on one line („10 %“, „8 kW“). */
export const NBSP = ' ';

const numberFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

/** Czech number + unit joined by NBSP: `formatQuantity(8.5, 'kWp')` -> „8,5 kWp“. */
export function formatQuantity(value: number, unit = '', format = numberFormat): string {
  const text = format.format(value);
  // Angles take no space in Czech typography („35°“), every other unit a non-breaking one.
  return unit ? `${text}${unit === '°' ? '' : NBSP}${unit}` : text;
}

/** Power in one style everywhere: under 1 kW in watts („80 W“), from 1 kW in kW („5 kW“). */
export function powerParts(value: number, unit: 'W' | 'kW' = 'W'): [number, 'W' | 'kW'] {
  const watts = unit === 'kW' ? value * 1000 : value;
  return Math.abs(watts) < 1000 ? [Math.round(watts), 'W'] : [watts / 1000, 'kW'];
}

/** `formatPower(0.08, 'kW')` -> „80 W“, `formatPower(5000)` -> „5 kW“. */
export function formatPower(value: number, unit: 'W' | 'kW' = 'W'): string {
  return formatQuantity(...powerParts(value, unit));
}

// Units glued to the preceding number; longer units first so „kWh“ wins over „kW“.
const UNIT = '(?:Kč/kWh|Kč/měs\\.?|Kč|kWp|kWh|kW|Wh|W|A|V|°C|°|%|h|min|s)';
const NUMBER_UNIT = new RegExp(`(\\d) (?=${UNIT}(?![\\p{L}\\d]))`, 'gu');
const NUMBER_SIGN = /(\d) ?× ?(?=\d)/g;

/** Keeps every „number unit“ pair in free text unbreakable: „10–50 %“, „3×25 A“, „0° je jih“. */
export function nbspUnits(text: string): string {
  return (
    text
      .replace(NUMBER_SIGN, '$1×')
      // Ranges stay on one line: „10–30 %“ (word joiner around the en dash).
      .replace(/(\d)–(?=\d)/g, '$1\u2060–\u2060')
      .replace(/(\d) °(?!C)/g, '$1°')
      .replace(NUMBER_UNIT, `$1${NBSP}`)
      // An angle stays with its direction: „−90° východ“, „90° západ“.
      .replace(/(\d°) (?=\p{L})/gu, `$1${NBSP}`)
      // Czech typography: a one-letter preposition/conjunction never ends a line („k baterii“).
      .replace(/(?<=^|[\s(„\u00a0])([kvszouaiKVSZOUAI]) /gu, `$1${NBSP}`)
  );
}
