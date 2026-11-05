import { useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Jednotný systém oznámení HomeBrainu (toast / snackbar).
 *
 * - `toast.success|error|info|undo(...)` lze volat odkudkoli (i mimo React) – fronta žije
 *   v modulovém úložišti a vykresluje ji jediný `<Toaster />`, který montuje shell.
 * - Max. 3 viditelná oznámení, nejstarší se při čtvrtém zavře.
 * - Stejné `id` nahradí existující oznámení (např. opakované „Hodnocení uloženo“).
 * - Automatické zavření: 4 s (chyby a „Vrátit“ 6 s), pauza při najetí myší / fokusu.
 * - Oznámení se čtou čtečkám přes trvale přítomné live regiony: běžná `polite`, chyby
 *   `assertive`. Regiony záměrně nemají role status/alert – stránka (a testy modulů) tak
 *   nemají navíc prázdné `alert` prvky.
 */
export type ToastKind = 'success' | 'error' | 'info' | 'undo';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  /** Stejné id nahradí existující oznámení místo přidání dalšího. */
  id?: string;
  description?: string;
  /** Doba v ms do automatického zavření; 0 = nezavírat automaticky. */
  duration?: number;
  action?: ToastAction;
}

export interface ToastRecord {
  id: string;
  kind: ToastKind;
  message: string;
  description?: string;
  action?: ToastAction;
  duration: number;
  /** Zvyšuje se při nahrazení stejným id – restartuje ukazatel průběhu. */
  version: number;
  state: 'open' | 'closing';
  paused: boolean;
}

export interface ToastSnapshot {
  toasts: readonly ToastRecord[];
  polite: { text: string; n: number };
  assertive: { text: string; n: number };
}

export const TOAST_MAX_VISIBLE = 3;
export const TOAST_DURATION_MS = 4000;
export const TOAST_LONG_DURATION_MS = 6000;
/** Délka výstupní animace; po ní se oznámení odstraní z DOM. */
export const TOAST_EXIT_MS = 200;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

function defaultDuration(kind: ToastKind): number {
  return kind === 'error' || kind === 'undo' ? TOAST_LONG_DURATION_MS : TOAST_DURATION_MS;
}

export function createToastStore() {
  let snapshot: ToastSnapshot = {
    toasts: [],
    polite: { text: '', n: 0 },
    assertive: { text: '', n: 0 },
  };
  const listeners = new Set<() => void>();
  const timers = new Map<string, Timer>();
  const exits = new Map<string, ReturnType<typeof setTimeout>>();
  let seq = 0;

  const emit = (next: Partial<ToastSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };
  const patch = (id: string, change: Partial<ToastRecord>) =>
    emit({ toasts: snapshot.toasts.map((t) => (t.id === id ? { ...t, ...change } : t)) });

  const clearTimer = (id: string) => {
    const timer = timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timers.delete(id);
  };
  const arm = (id: string, ms: number) => {
    clearTimer(id);
    if (ms <= 0) return;
    timers.set(id, {
      handle: setTimeout(() => dismiss(id), ms),
      remaining: ms,
      startedAt: Date.now(),
    });
  };

  function dismiss(id?: string) {
    const targets = snapshot.toasts.filter(
      (t) => t.state === 'open' && (id === undefined || t.id === id),
    );
    if (!targets.length) return;
    for (const t of targets) {
      clearTimer(t.id);
      exits.set(
        t.id,
        setTimeout(() => {
          exits.delete(t.id);
          emit({ toasts: snapshot.toasts.filter((x) => x.id !== t.id) });
        }, TOAST_EXIT_MS),
      );
    }
    const ids = new Set(targets.map((t) => t.id));
    emit({
      toasts: snapshot.toasts.map((t) =>
        ids.has(t.id) ? { ...t, state: 'closing' as const, paused: false } : t,
      ),
    });
  }

  function show(kind: ToastKind, message: string, options: ToastOptions = {}): string {
    const id = options.id ?? `t${++seq}`;
    const duration = options.duration ?? defaultDuration(kind);
    const announce =
      kind === 'error'
        ? { assertive: { text: message, n: snapshot.assertive.n + 1 } }
        : { polite: { text: message, n: snapshot.polite.n + 1 } };
    const exit = exits.get(id);
    if (exit) {
      clearTimeout(exit);
      exits.delete(id);
    }
    const existing = snapshot.toasts.find((t) => t.id === id);
    const record: ToastRecord = {
      id,
      kind,
      message,
      ...(options.description !== undefined && { description: options.description }),
      ...(options.action && { action: options.action }),
      duration,
      version: (existing?.version ?? 0) + 1,
      state: 'open',
      paused: false,
    };
    const toasts = existing
      ? snapshot.toasts.map((t) => (t.id === id ? record : t))
      : [...snapshot.toasts, record];
    emit({ toasts, ...announce });
    arm(id, duration);
    const open = snapshot.toasts.filter((t) => t.state === 'open');
    if (open.length > TOAST_MAX_VISIBLE)
      open.slice(0, open.length - TOAST_MAX_VISIBLE).forEach((t) => dismiss(t.id));
    return id;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    show,
    dismiss,
    /** Pozastaví odpočet (hover / fokus). */
    pause(id: string) {
      const timer = timers.get(id);
      const t = snapshot.toasts.find((x) => x.id === id);
      if (!timer?.handle || !t || t.paused) return;
      clearTimeout(timer.handle);
      timers.set(id, {
        handle: null,
        remaining: Math.max(0, timer.remaining - (Date.now() - timer.startedAt)),
        startedAt: 0,
      });
      patch(id, { paused: true });
    },
    resume(id: string) {
      const timer = timers.get(id);
      const t = snapshot.toasts.find((x) => x.id === id);
      if (!timer || timer.handle || !t?.paused) return;
      arm(id, Math.max(400, timer.remaining));
      patch(id, { paused: false });
    },
    /** Pro testy: okamžitě vše vyčistí. */
    reset() {
      timers.forEach((t) => t.handle && clearTimeout(t.handle));
      exits.forEach((handle) => clearTimeout(handle));
      timers.clear();
      exits.clear();
      emit({ toasts: [], polite: { text: '', n: 0 }, assertive: { text: '', n: 0 } });
    },
  };
}

export type ToastStore = ReturnType<typeof createToastStore>;

/** Sdílená fronta celého panelu (modul `@homebrain/ui` je v bundlu jen jednou). */
export const toastStore: ToastStore = createToastStore();

type ToastFn = ((message: string, options?: ToastOptions) => string) & {
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  /** Oznámení s akcí „Vrátit“ a ukazatelem zbývajícího času. */
  undo: (
    message: string,
    onUndo: () => void,
    options?: Omit<ToastOptions, 'action'> & { actionLabel?: string },
  ) => string;
  dismiss: (id?: string) => void;
};

function bindToast(store: ToastStore): ToastFn {
  const fn = ((message: string, options?: ToastOptions) =>
    store.show('info', message, options)) as ToastFn;
  fn.success = (message, options) => store.show('success', message, options);
  fn.error = (message, options) => store.show('error', message, options);
  fn.info = (message, options) => store.show('info', message, options);
  fn.undo = (message, onUndo, options = {}) => {
    const { actionLabel = 'Vrátit', ...rest } = options;
    return store.show('undo', message, {
      ...rest,
      action: { label: actionLabel, onAction: onUndo },
    });
  };
  fn.dismiss = (id) => store.dismiss(id);
  return fn;
}

export const toast: ToastFn = bindToast(toastStore);

/** Hook varianta pro komponenty; vrací stejné API jako `toast`. */
export function useToast(): ToastFn {
  return toast;
}

const icons: Record<ToastKind, ReactNode> = {
  success: <path d="M5 12.5l4.2 4.2L19 7" />,
  error: (
    <>
      <path d="M12 6.5v6.5" />
      <path d="M12 17.5v.1" />
    </>
  ),
  info: (
    <>
      <path d="M12 11v6.5" />
      <path d="M12 6.5v.1" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7L5 11l4 4" />
      <path d="M5.5 11H14a5 5 0 010 10h-2" />
    </>
  ),
};

export interface ToastCardProps {
  kind: ToastKind;
  message: string;
  description?: string;
  action?: ToastAction;
  /** Ms – délka ukazatele průběhu u `undo`. */
  duration?: number;
  paused?: boolean;
  closing?: boolean;
  /** Statický náhled v katalogu (bez animací, průběh zastavený v polovině). */
  preview?: boolean;
  onDismiss?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

/** Vizuál jednoho oznámení – používá ho `<Toaster />` i katalog. */
export function ToastCard({
  kind,
  message,
  description,
  action,
  duration = TOAST_LONG_DURATION_MS,
  paused,
  closing,
  preview,
  onDismiss,
  onPause,
  onResume,
}: ToastCardProps) {
  return (
    <div
      className="hb-toast"
      data-kind={kind}
      data-state={closing ? 'closing' : 'open'}
      data-paused={paused || undefined}
      data-preview={preview || undefined}
      data-desc={description ? '' : undefined}
      data-testid="hb-toast"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
      style={{ '--hb-toast-d': `${duration}ms` } as CSSProperties}
    >
      <span className="hb-toast-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="13" height="13" focusable="false">
          {icons[kind]}
        </svg>
      </span>
      <div className="hb-toast-body">
        <p className="hb-toast-msg">{message}</p>
        {description && <p className="hb-toast-desc">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          className="hb-toast-action"
          onClick={() => {
            action.onAction();
            onDismiss?.();
          }}
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        className="hb-toast-close"
        aria-label="Zavřít oznámení"
        onClick={onDismiss}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
      {kind === 'undo' && duration > 0 && (
        <span className="hb-toast-track" aria-hidden="true">
          <span className="hb-toast-progress" />
        </span>
      )}
    </div>
  );
}

/** Jediné místo vykreslení oznámení; montuje ho shell (a testy modulů). */
export function Toaster({ store = toastStore }: { store?: ToastStore }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <div className="hb-toaster">
      {snap.toasts.length > 0 && (
        <section className="hb-toast-stack" aria-label="Oznámení">
          <ol>
            {snap.toasts.map((t) => (
              <li key={`${t.id}:${t.version}`}>
                <ToastCard
                  kind={t.kind}
                  message={t.message}
                  {...(t.description !== undefined && { description: t.description })}
                  {...(t.action && { action: t.action })}
                  duration={t.duration}
                  paused={t.paused}
                  closing={t.state === 'closing'}
                  onDismiss={() => store.dismiss(t.id)}
                  onPause={() => store.pause(t.id)}
                  onResume={() => store.resume(t.id)}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="hb-sr-only" data-hb-live="polite" aria-live="polite" aria-atomic="true">
        {snap.polite.text && <span key={snap.polite.n}>{snap.polite.text}</span>}
      </div>
      <div className="hb-sr-only" data-hb-live="assertive" aria-live="assertive" aria-atomic="true">
        {snap.assertive.text && <span key={snap.assertive.n}>{snap.assertive.text}</span>}
      </div>
    </div>
  );
}
