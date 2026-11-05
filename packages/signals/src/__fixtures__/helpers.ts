import type { RankedSignal, Signal } from '../types.js';

export const NOW = new Date('2026-11-01T12:00:00Z');
export function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'synthetic',
    module: 'system',
    kind: 'state',
    severity: 'notice',
    relevance: 0.5,
    valid_from: '2026-11-01T11:30:00Z',
    valid_to: '2026-11-01T13:00:00Z',
    title: 'Syntetický signál',
    context: '',
    source: { name: 'Testovací zdroj', updated_at: NOW.toISOString(), stale_after_s: 120 },
    ...overrides,
  };
}
export function ranked(overrides: Partial<RankedSignal> = {}): RankedSignal {
  return {
    ...signal(),
    u: 1,
    p: 0.8,
    also: [],
    stale: false,
    ageS: 0,
    actionState: undefined,
    ...overrides,
  };
}
