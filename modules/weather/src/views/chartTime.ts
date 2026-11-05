/**
 * Svislé čáry půlnocí a popisky osy X (0:00 / 12:00) v místním čase.
 * Kroky přes kalendářní metody `Date` (ne pevných 24 h / 12 h v ms), takže přechod
 * letního/zimního času neposune půlnoc na 23:00 nebo 1:00.
 */
export function chartTimeMarks(t0: number, t1: number) {
  const midnights: number[] = [];
  const day = new Date(t0);
  day.setHours(24, 0, 0, 0);
  for (; day.getTime() < t1; day.setDate(day.getDate() + 1)) midnights.push(day.getTime());
  const xLabels: number[] = [];
  const half = new Date(t0);
  half.setHours(Math.ceil(half.getHours() / 12) * 12, 0, 0, 0);
  for (; half.getTime() <= t1; half.setHours(half.getHours() + 12)) xLabels.push(half.getTime());
  return { midnights, xLabels };
}
