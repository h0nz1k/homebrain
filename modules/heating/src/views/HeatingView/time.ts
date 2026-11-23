import { fmtDuration } from '../../model.js';

export const nowMs = () => Date.now();
export function ago(iso: string | null): string {
  if (!iso) return 'neznámo kdy';
  const s = Math.max(0, (nowMs() - Date.parse(iso)) / 1000);
  if (s < 60) return `před ${Math.round(s)}\u00a0s`;
  return `před ${fmtDuration(s / 60)}`;
}
