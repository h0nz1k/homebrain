/**
 * Stable error codes of `homebrain/family/chore/create` (backend `ws_swap.CREATE_ERRORS`)
 * mapped to Czech messages. Unknown codes fall back to the generic text.
 */
export type CreateChoreErrorCode =
  | 'duplicate_name'
  | 'not_configured'
  | 'invalid_input'
  | 'timeout'
  | 'network'
  | 'unauthorized'
  | 'service_failed';

export const CREATE_CHORE_TIMEOUT_MS = 15_000;

export const CREATE_CHORE_ERRORS: Record<CreateChoreErrorCode, string> = {
  duplicate_name: 'Úkol s tímto názvem už existuje.',
  not_configured: 'Úkoly nejsou nastavené: v Home Assistantu chybí ChoreOps.',
  invalid_input: 'Údaje úkolu nejsou platné. Zkontroluj název, čas a komu úkol patří.',
  timeout:
    'Home Assistant neodpověděl do 15 s. Zkontroluj, jestli se úkol neuložil, a zkus to znovu.',
  network: 'Spojení s Home Assistantem se přerušilo. Zkus to znovu.',
  unauthorized: 'Úkoly může přidávat jen rodič.',
  service_failed: 'Úkol se nepodařilo uložit. Zkus to znovu.',
};

export class TimeoutError extends Error {
  readonly code = 'timeout';
  constructor() {
    super('timeout');
  }
}

/** Rejects with `TimeoutError` when `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms = CREATE_CHORE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e as Error);
      },
    );
  });
}

/**
 * Error code of a failed WS call. home-assistant-js-websocket rejects with `{ code, message }`
 * (string codes from `send_error`) or with a numeric code when the socket dropped
 * (ERR_CONNECTION_LOST = 3).
 */
export function createChoreErrorCode(err: unknown): CreateChoreErrorCode {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code in CREATE_CHORE_ERRORS) return code as CreateChoreErrorCode;
  if (typeof code === 'number' || err instanceof TypeError) return 'network';
  return 'service_failed';
}

/** „Myčka (2)“ → „Myčka (3)“; „Myčka“ → „Myčka (2)“ (still within the 80-char limit). */
export function nextDistinctName(name: string, max = 80): string {
  const m = /^(.*?)\s*\((\d+)\)$/u.exec(name.trim());
  const base = (m ? m[1]! : name.trim()).trim();
  const suffix = ` (${m ? Number(m[2]) + 1 : 2})`;
  return `${base.slice(0, max - suffix.length).trimEnd()}${suffix}`;
}
