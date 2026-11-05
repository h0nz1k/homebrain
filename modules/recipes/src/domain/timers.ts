/**
 * Concurrent cooking timers (pure store + subscribe for useSyncExternalStore).
 *
 * With a `backend` (the integration's `homebrain/recipes/timers/*` WS API) the server owns the
 * list: it persists the timers in recipes.db, fires the expiry event/notification and pushes
 * every change to all devices. Local mutations are applied optimistically and replaced by the
 * next server snapshot. Without a backend (tests, offline) timers live in localStorage.
 */
export interface Timer {
  id: string;
  label: string;
  stepIndex: number | null;
  /** Optional for persisted timers created before recipe scoping. */
  recipeId?: string;
  durationMs: number;
  /** Wall-clock end while running; null when paused. */
  endsAt: number | null;
  /** Remaining time while paused. */
  pausedRemainingMs: number | null;
  /** Alarm acknowledged (muted) by the user. */
  acknowledged: boolean;
}
export type TimerStatus = 'running' | 'paused' | 'ringing' | 'done';
export interface TimerView extends Timer {
  remainingMs: number;
  /** Remaining fraction 1 → 0 (rings show what is left). */
  fraction: number;
  status: TimerStatus;
}

export interface TimerSnapshot {
  timers: Timer[];
  /** Server wall clock (ms) when the snapshot was sent – corrects device clock skew. */
  serverNow: number;
}
export type TimerOp = 'pause' | 'resume' | 'add_time' | 'ack';
export interface TimerBackend {
  subscribe(callback: (snapshot: TimerSnapshot) => void): Promise<() => void>;
  start(request: {
    label: string;
    seconds: number;
    recipeId?: string;
    stepIndex?: number | null;
  }): Promise<unknown>;
  update(id: string, op: TimerOp, seconds?: number): Promise<unknown>;
  cancel(id: string): Promise<unknown>;
}

export interface TimerStoreOptions {
  now?: () => number;
  /** Server-side timers (shared by every device); localStorage is not used then. */
  backend?: TimerBackend | null;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  storageKey?: string;
  onAlarm?: (timer: TimerView) => void;
}

export function timerView(timer: Timer, now: number): TimerView {
  const remainingMs =
    timer.endsAt !== null ? Math.max(0, timer.endsAt - now) : (timer.pausedRemainingMs ?? 0);
  const finished = remainingMs <= 0;
  const status: TimerStatus = finished
    ? timer.acknowledged
      ? 'done'
      : 'ringing'
    : timer.endsAt === null
      ? 'paused'
      : 'running';
  return {
    ...timer,
    remainingMs,
    fraction: timer.durationMs ? remainingMs / timer.durationMs : 0,
    status,
  };
}

/** Ringing first, then soonest. */
export function sortTimers(views: TimerView[]): TimerView[] {
  const rank = (v: TimerView) => (v.status === 'ringing' ? 0 : v.status === 'done' ? 2 : 1);
  return [...views].sort((a, b) => rank(a) - rank(b) || a.remainingMs - b.remainingMs);
}

export function createTimerStore(options: TimerStoreOptions = {}) {
  const clock = options.now ?? (() => Date.now());
  const backend = options.backend ?? null;
  const storage = backend ? null : options.storage;
  /** server clock − device clock */
  let skew = 0;
  const now = () => clock() + skew;
  const key = options.storageKey ?? 'hb-recipes-timers';
  let timers: Timer[] = [];
  const sync = (job: Promise<unknown> | undefined) => void job?.catch(() => undefined);
  try {
    const raw = storage?.getItem(key);
    if (raw) timers = (JSON.parse(raw) as Timer[]).filter((t) => typeof t.id === 'string');
  } catch {
    timers = [];
  }
  const listeners = new Set<() => void>();
  const alarmed = new Set(timers.filter((t) => t.acknowledged).map((t) => t.id));
  let snapshot: TimerView[] = [];
  let seq = 0;

  function emit() {
    snapshot = sortTimers(timers.map((t) => timerView(t, now())));
    try {
      storage?.setItem(key, JSON.stringify(timers));
    } catch {
      // storage full / private mode: timers still work for this page
    }
    listeners.forEach((l) => l());
  }

  function update(id: string, fn: (t: Timer) => Timer) {
    timers = timers.map((t) => (t.id === id ? fn(t) : t));
    emit();
  }

  emit();
  if (backend) {
    sync(
      backend.subscribe((snap) => {
        skew = snap.serverNow - clock();
        timers = snap.timers.filter((t) => typeof t.id === 'string');
        for (const t of timers) if (t.acknowledged) alarmed.add(t.id);
        emit();
      }),
    );
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    add(
      label: string,
      seconds: number,
      stepIndex: number | null = null,
      recipeId?: string,
    ): string {
      seq += 1;
      const id = `t${now().toString(36)}${seq}`;
      const durationMs = Math.max(1, Math.round(seconds)) * 1000;
      timers = [
        ...timers,
        {
          id,
          label,
          stepIndex,
          recipeId,
          durationMs,
          endsAt: now() + durationMs,
          pausedRemainingMs: null,
          acknowledged: false,
        },
      ];
      emit();
      sync(backend?.start({ label, seconds: durationMs / 1000, recipeId, stepIndex }));
      return id;
    },
    pause(id: string) {
      sync(backend?.update(id, 'pause'));
      update(id, (t) =>
        t.endsAt === null
          ? t
          : { ...t, pausedRemainingMs: Math.max(0, t.endsAt - now()), endsAt: null },
      );
    },
    resume(id: string) {
      sync(backend?.update(id, 'resume'));
      update(id, (t) =>
        t.endsAt !== null
          ? t
          : { ...t, endsAt: now() + (t.pausedRemainingMs ?? 0), pausedRemainingMs: null },
      );
    },
    addTime(id: string, seconds: number) {
      sync(backend?.update(id, 'add_time', seconds));
      update(id, (t) => {
        alarmed.delete(id);
        const base = t.endsAt !== null ? Math.max(t.endsAt, now()) : null;
        return base !== null
          ? {
              ...t,
              endsAt: base + seconds * 1000,
              durationMs: t.durationMs + seconds * 1000,
              acknowledged: false,
            }
          : {
              ...t,
              pausedRemainingMs: (t.pausedRemainingMs ?? 0) + seconds * 1000,
              acknowledged: false,
            };
      });
    },
    acknowledge(id: string) {
      sync(backend?.update(id, 'ack'));
      update(id, (t) => ({ ...t, acknowledged: true }));
    },
    remove(id: string) {
      sync(backend?.cancel(id));
      timers = timers.filter((t) => t.id !== id);
      alarmed.delete(id);
      emit();
    },
    clear() {
      timers.forEach((t) => sync(backend?.cancel(t.id)));
      timers = [];
      alarmed.clear();
      emit();
    },
    /** Call every ~250 ms: refreshes the snapshot and fires each alarm once. */
    tick() {
      emit();
      for (const view of snapshot) {
        if (view.status === 'ringing' && !alarmed.has(view.id)) {
          alarmed.add(view.id);
          options.onAlarm?.(view);
        }
      }
    },
  };
}
export type TimerStore = ReturnType<typeof createTimerStore>;
