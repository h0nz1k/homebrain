import type { Signal } from './types.js';
export function ageSeconds(signal: Signal, now: Date): number {
  return (now.getTime() - Date.parse(signal.source.updated_at)) / 1000;
}
export function isStale(signal: Signal, now: Date): boolean {
  return ageSeconds(signal, now) > signal.source.stale_after_s;
}
