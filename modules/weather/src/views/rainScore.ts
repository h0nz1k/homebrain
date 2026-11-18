/** Wording of the precipitation scores in „Kdo se trefuje“ (pure). */
/**
 * Verbal ETS grade (hourly rain ≥ 0,2 mm/h). Hourly ETS of NWP vs. one gauge rarely exceeds
 * 0,5, so ≥ 0,4 is already good; below 0,2 the model is barely better than chance.
 */
export function etsGrade(ets: number | null): { word: string; tone: 'good' | 'mid' | 'weak' } {
  if (ets != null && ets >= 0.4) return { word: 'dobrá', tone: 'good' };
  if (ets != null && ets >= 0.2) return { word: 'průměrná', tone: 'mid' };
  return { word: 'slabá', tone: 'weak' };
}
