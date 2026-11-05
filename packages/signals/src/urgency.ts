import type { Signal } from './types.js';

const minutes = (ms: number): number => ms / 60_000;
const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));
export function eventUrgency(signal: Signal, now: Date): number {
  const start = Date.parse(signal.valid_from);
  if (now.getTime() < start) return Math.exp(-minutes(start - now.getTime()) / 60);
  return (
    1 -
    0.5 *
      Math.min(
        1,
        minutes(now.getTime() - start) / Math.max(1, minutes(Date.parse(signal.valid_to) - start)),
      )
  );
}
export function deadlineUrgency(signal: Signal, now: Date): number {
  return clamp(1 - minutes(Date.parse(signal.valid_to) - now.getTime()) / 120, 0, 1);
}
export function windowUrgency(signal: Signal, now: Date): number {
  const start = Date.parse(signal.valid_from);
  const end = Date.parse(signal.valid_to);
  if (now.getTime() < start) return Math.exp(-minutes(start - now.getTime()) / 30);
  return (
    0.3 + (0.6 * Math.max(0, minutes(end - now.getTime()))) / Math.max(1, minutes(end - start))
  );
}
export function stateUrgency(signal: Signal, now: Date): number {
  return clamp(minutes(now.getTime() - Date.parse(signal.valid_from)) / 30, 0.5, 1);
}
export function urgency(signal: Signal, now: Date): number {
  return {
    event: eventUrgency,
    deadline: deadlineUrgency,
    window: windowUrgency,
    state: stateUrgency,
  }[signal.kind](signal, now);
}
