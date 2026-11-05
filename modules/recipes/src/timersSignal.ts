import type { ConnectionLike } from '@homebrain/ha-client';
import type { Signal } from '@homebrain/signals';
import { getRecipesApi } from './api.js';
import { sortTimers, timerView, type Timer, type TimerView } from './domain/timers.js';

export const TIMERS_PATH = '/homebrain-recepty/minutky';

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const short = (v: TimerView) =>
  v.status === 'ringing'
    ? `${v.label} hotovo`
    : v.status === 'paused'
      ? `${v.label} (pauza, zbývá ${clock(v.remainingMs)})`
      : `${v.label} za ${clock(v.remainingMs)}`;

/**
 * One compact Dnes card for all kitchen timers: the soonest (or ringing) one as the headline,
 * the others in the context line. [] when nothing runs (acknowledged/done timers are hidden).
 */
export function timerSignals(timers: Timer[], now: number): Signal[] {
  // Ringing first, then running (soonest first), paused last – a paused timer never headlines.
  const rank = { ringing: 0, running: 1, paused: 2, done: 3 } as const;
  const views = sortTimers(timers.map((t) => timerView(t, now)))
    .filter((v) => v.status !== 'done')
    .sort((a, b) => rank[a.status] - rank[b.status]);
  const [first, ...rest] = views;
  if (!first) return [];
  const ringing = first.status === 'ringing';
  // Same escalation as the airfryer signal: a live countdown is a Dnes card (notice) with
  // the big value; the last minute and a finished timer go to the hero (warning).
  const finishing = first.status === 'running' && first.remainingMs <= 60_000;
  const others = rest.length ? `Další: ${rest.map(short).join(' · ')}` : '';
  const context = ringing
    ? ['Ztište ji v Minutkách.', others].filter(Boolean).join(' ')
    : first.status === 'paused'
      ? ['Pozastaveno.', others].filter(Boolean).join(' ')
      : others || 'Běží na všech zařízeních.';
  return [
    {
      id: 'recipes.timers',
      module: 'recipes',
      group: 'recipes.timers',
      kind: 'state',
      severity: ringing || finishing ? 'warning' : 'notice',
      tone: 'neutral',
      relevance: ringing ? 0.95 : finishing ? 0.85 : 0.6,
      valid_from: new Date(now - 60_000).toISOString(),
      valid_to: new Date(now + Math.max(first.remainingMs, 0) + 15 * 60_000).toISOString(),
      title: ringing
        ? `Minutka doběhla · ${first.label}`
        : `${first.status === 'paused' ? 'Minutka v pauze' : 'Minutka'} · ${first.label}`,
      context,
      value: ringing
        ? { v: 'Hotovo', label: 'doběhla' }
        : {
            v: clock(first.remainingMs),
            label: first.status === 'paused' ? 'pauza' : 'zbývá',
            // shared countdown ring (same as the airfryer); a paused timer stays secondary
            progress: Math.max(0, Math.min(1, 1 - first.fraction)),
            ...(first.status === 'paused' ? { held: true } : {}),
          },
      action: { type: 'navigate', label: 'Minutky', href: TIMERS_PATH },
      source: { name: 'Minutky', updated_at: new Date(now).toISOString(), stale_after_s: 600 },
    },
  ];
}

export interface TimersSignalFeed {
  subscribe: (cb: (signals: Signal[]) => void) => () => void;
}

/**
 * Dnes signal source: follows the integration's timer subscription (the same list the phone,
 * the kitchen tablet and Recepty see) and refreshes the countdown once a second.
 */
export function recipesTimersTodaySignalSource(
  context?: { connection?: ConnectionLike },
  options: { clock?: () => number; tickMs?: number } = {},
): TimersSignalFeed | null {
  const api = getRecipesApi(context?.connection);
  if (!api?.timers) return null;
  const backend = api.timers;
  const { clock: now = Date.now, tickMs = 1000 } = options;
  return {
    subscribe: (cb) => {
      let timers: Timer[] = [];
      let skew = 0;
      let last = '';
      const emit = () => {
        const signals = timerSignals(timers, now() + skew);
        const key = JSON.stringify(signals.map((s) => [s.title, s.context, s.value?.v]));
        if (key !== last) {
          last = key;
          cb(signals);
        }
      };
      emit();
      // An older integration (unknown WS command) or a lost connection just means no timers on
      // Dnes; never leave an unhandled rejection behind.
      const unsub = backend
        .subscribe((snap) => {
          skew = snap.serverNow - now();
          timers = snap.timers;
          emit();
        })
        .catch(() => () => undefined);
      const id = setInterval(() => timers.length && emit(), tickMs);
      return () => {
        clearInterval(id);
        void unsub.then((u) => u()).catch(() => undefined);
      };
    },
  };
}
