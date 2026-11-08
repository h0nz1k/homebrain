import { useEffect, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';

/** HomeBrain cooking states (server normalises the MEATER `cook_state` enum). */
export type CookState =
  | 'ready'
  | 'cooking'
  | 'remove'
  | 'resting'
  | 'underdone'
  | 'done'
  | 'overdone'
  | 'overcooked'
  | 'unknown';

/** One active MEATER probe (server `homebrain/cooking/subscribe`), temperatures in °C. */
export interface CookingProbe {
  id: string;
  /** Cut name from the MEATER app, else „Sonda N“. */
  name: string;
  internal: number | null;
  /** Oven (ambient) temperature. */
  ambient: number | null;
  target: number | null;
  peak: number | null;
  /** `null` while the MEATER app is still estimating. */
  remaining_s: number | null;
  elapsed_s: number | null;
  state: CookState;
  /** internal / target, 0…1 (1 once the target was reached); `null` without a target. */
  progress: number | null;
}

const LABELS: Record<CookState, string> = {
  ready: 'Čeká na start',
  cooking: 'Peče se',
  remove: 'Sundat z tepla',
  resting: 'Odpočívá',
  underdone: 'Mírně nedodělané',
  done: 'Hotovo',
  overdone: 'Mírně přepečené',
  overcooked: 'Přepečené',
  unknown: 'Probíhá',
};

/** States after the target was reached: no countdown any more. */
const AFTER_TARGET = new Set<string>(['remove', 'resting', 'done', 'overdone', 'overcooked']);

export function cookStateLabel(state: string): string {
  return LABELS[state as CookState] ?? LABELS.unknown;
}

/** Ring / accent tone per state. */
export function cookTone(state: string): 'accent' | 'warn' | 'ok' | 'crit' {
  if (state === 'remove' || state === 'underdone') return 'warn';
  if (state === 'overdone' || state === 'overcooked') return 'crit';
  if (state === 'resting' || state === 'done') return 'ok';
  return 'accent';
}

/** „Hotovo za 13 min“, „Hotovo za 1 h 05 min“, „odhaduje se…“; `null` = nothing to count down. */
export function remainingLabel(probe: Pick<CookingProbe, 'state' | 'remaining_s'>): string | null {
  if (AFTER_TARGET.has(probe.state) || probe.state === 'ready') return null;
  const s = probe.remaining_s;
  if (s === null || !Number.isFinite(s)) return 'odhaduje se…';
  if (s < 60) return 'Hotovo za chvíli';
  const min = Math.ceil(s / 60);
  if (min < 60) return `Hotovo za ${min} min`;
  return `Hotovo za ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Oven temperature label; with several probes it is the oven „u sondy“ (each probe measures its own spot). */
export function ambientLabel(value: number | null, probeCount: number): string {
  return `${probeCount > 1 ? 'Trouba u sondy' : 'Trouba'} ${formatTemp(value)}`;
}

/** Any probe waiting to be taken off the heat (the calm „Klidný den“ mood must not show then). */
export function needsRemoval(probes: Pick<CookingProbe, 'state'>[]): boolean {
  return probes.some((probe) => probe.state === 'remove');
}

export function formatTemp(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${Math.round(value)}\u00a0°C`;
}

export interface CookingSource {
  /** Calls `onProbes` with the active probes now and on every change; returns stop(). */
  subscribe(onProbes: (probes: CookingProbe[]) => void): () => void;
}

/** Live WS source; no access / older backend → empty list (the card stays hidden). */
export function createWsCookingSource(connection: ConnectionLike): CookingSource {
  return {
    subscribe(onProbes) {
      let stopped = false;
      const emit = (probes: unknown) => {
        if (!stopped) onProbes(Array.isArray(probes) ? (probes as CookingProbe[]) : []);
      };
      if (!connection.subscribeMessage) {
        emit([]);
        return () => {
          stopped = true;
        };
      }
      const unsub = connection
        .subscribeMessage<{ probes?: unknown }>(
          (msg) => emit(msg?.probes),
          { type: 'homebrain/cooking/subscribe' },
          { resubscribe: true },
        )
        .catch(() => {
          emit([]);
          return undefined;
        });
      return () => {
        stopped = true;
        void unsub.then((fn) => fn?.());
      };
    },
  };
}

export type CookingScenario = '1' | '2' | '4' | 'none';

/** Synthetic probes for dev/e2e (`?maso=1|2|4`); `2` includes one „Sundat z tepla“. */
export function createMockCookingProbes(scenario: CookingScenario): CookingProbe[] {
  const all: CookingProbe[] = [
    {
      id: 'probe1',
      name: 'Vepřová plec',
      internal: 58.6,
      ambient: 162,
      target: 63,
      peak: 58.6,
      remaining_s: 12 * 60,
      elapsed_s: 2 * 3600 + 35 * 60,
      state: 'cooking',
      progress: 0.93,
    },
    {
      id: 'probe2',
      name: 'Hovězí roštěná',
      internal: 54.2,
      ambient: 171,
      target: 54,
      peak: 54.2,
      remaining_s: 0,
      elapsed_s: 48 * 60,
      state: 'remove',
      progress: 1,
    },
    {
      id: 'probe3',
      name: 'Sonda 3',
      internal: 31.5,
      ambient: 148,
      target: 72,
      peak: 31.5,
      remaining_s: null,
      elapsed_s: 9 * 60,
      state: 'cooking',
      progress: 0.44,
    },
    {
      id: 'probe4',
      name: 'Kuřecí stehna',
      internal: 76.1,
      ambient: 34,
      target: 74,
      peak: 77.4,
      remaining_s: null,
      elapsed_s: 70 * 60,
      state: 'resting',
      progress: 1,
    },
  ];
  if (scenario === 'none') return [];
  return scenario === '4' ? all : all.slice(0, Number(scenario));
}

export function createMockCookingSource(scenario: CookingScenario): CookingSource {
  return {
    subscribe(onProbes) {
      onProbes(createMockCookingProbes(scenario));
      return () => undefined;
    },
  };
}

export type CookingSourceFactory = (connection: ConnectionLike | undefined) => CookingSource | null;
let factory: CookingSourceFactory = (connection) =>
  connection ? createWsCookingSource(connection) : null;

/** Dev/tests replace the WS source with synthetic probes. */
export function setCookingSourceFactory(next: CookingSourceFactory): void {
  factory = next;
}

/** Active MEATER probes; `[]` until the first answer and when nothing is cooking. */
export function useCooking(connection: ConnectionLike | undefined): CookingProbe[] {
  const [probes, setProbes] = useState<CookingProbe[]>([]);
  useEffect(() => {
    const source = factory(connection);
    if (!source) return;
    return source.subscribe((next) => setProbes(next));
  }, [connection]);
  return probes;
}
