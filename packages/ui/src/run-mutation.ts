import { toastStore as defaultStore, type ToastStore } from './toast.js';

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface MutationOptions<T> {
  /** Toast while running (omit for fast writes – the button's own busy state is enough). */
  pending?: string;
  /** Toast after success; omit for silent success. */
  success?: string | ((value: T) => string);
  /** Error toast text; default „Akci se nepodařilo dokončit“. */
  error?: string | ((error: unknown) => string);
  /** Error toast gets a „Zkusit znovu“ action (default true). */
  retry?: boolean;
  /** Same key while pending = the running promise is returned, nothing runs twice. */
  key?: string;
  onSuccess?: (value: T) => void;
  onError?: (error: unknown) => void;
  /** Test seam; defaults to the panel-wide toast queue. */
  store?: ToastStore;
}

const DEFAULT_ERROR = 'Akci se nepodařilo dokončit';
const inFlight = new Map<string, Promise<MutationResult<unknown>>>();
let seq = 0;

/**
 * One place for WS writes (architecture review §11.6): pending → success/error toast,
 * retry from the error toast, and no double submit for the same `key`. Never rejects.
 */
export function runMutation<T>(
  fn: () => Promise<T> | T,
  options: MutationOptions<T> = {},
): Promise<MutationResult<T>> {
  const { key } = options;
  if (key !== undefined) {
    const running = inFlight.get(key);
    if (running) return running as Promise<MutationResult<T>>;
  }
  const store = options.store ?? defaultStore;
  const toastId = `hb-mutation-${key ?? ++seq}`;
  if (options.pending) store.show('info', options.pending, { id: toastId, duration: 0 });
  const promise = (async (): Promise<MutationResult<T>> => {
    try {
      const value = await fn();
      if (options.success) {
        const text =
          typeof options.success === 'function' ? options.success(value) : options.success;
        store.show('success', text, { id: toastId });
      } else if (options.pending) store.dismiss(toastId);
      options.onSuccess?.(value);
      return { ok: true, value };
    } catch (error) {
      const text =
        typeof options.error === 'function'
          ? options.error(error)
          : (options.error ?? DEFAULT_ERROR);
      store.show('error', text, {
        id: toastId,
        action:
          options.retry === false
            ? undefined
            : { label: 'Zkusit znovu', onAction: () => void runMutation(fn, options) },
      });
      options.onError?.(error);
      return { ok: false, error };
    } finally {
      if (key !== undefined) inFlight.delete(key);
    }
  })();
  if (key !== undefined) inFlight.set(key, promise as Promise<MutationResult<unknown>>);
  return promise;
}

/** True while a mutation with this key runs (for disabling buttons outside the dialog). */
export function isMutationPending(key: string): boolean {
  return inFlight.has(key);
}
