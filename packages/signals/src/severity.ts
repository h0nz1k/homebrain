import type { Severity } from './types.js';
export function chmuWarningSeverity(level: 'yellow' | 'orange' | 'red' | 'purple'): Severity {
  return ({ yellow: 'notice', orange: 'warning', red: 'critical', purple: 'critical' } as const)[
    level
  ];
}
export function haDataSeverity({
  connected,
  ageS,
  staleAfterS = 120,
}: {
  connected: boolean;
  ageS: number;
  staleAfterS?: number;
}): Severity {
  if (!connected || ageS > 3600) return 'critical';
  return ageS > staleAfterS ? 'warning' : 'calm';
}
export function rainNowcastSeverity(
  mmPerH: number,
  { hail = false, chmuWarning = false }: { hail?: boolean; chmuWarning?: boolean } = {},
): Severity {
  if (mmPerH > 4 || hail) return chmuWarning ? 'critical' : 'warning';
  return mmPerH >= 1 ? 'warning' : 'notice';
}
export function windGustSeverity(kmh: number): Severity {
  if (kmh > 90) return 'critical';
  if (kmh >= 70) return 'warning';
  return kmh >= 50 ? 'notice' : 'info';
}
