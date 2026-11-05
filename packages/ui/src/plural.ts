/**
 * Czech plural forms for whole counts: 1 krok, 2–4 kroky, 0 / 5+ kroků.
 * Negative counts use their absolute value; non-integers take the genitive (`many`) form.
 */
export function czPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (!Number.isInteger(abs)) return many;
  if (abs === 1) return one;
  return abs >= 2 && abs <= 4 ? few : many;
}

/** `czCount(3, 'krok', 'kroky', 'kroků')` -> „3 kroky“. */
export function czCount(n: number, one: string, few: string, many: string): string {
  return `${n} ${czPlural(n, one, few, many)}`;
}
