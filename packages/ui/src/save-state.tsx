import { useCallback, useEffect, useRef, useState } from 'react';

/** Stav inline ukládání formuláře: „Ukládám…“ → „Uloženo ✓“ (nebo chyba s „Zkusit znovu“). */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStateProps {
  status: SaveStatus;
  onRetry?: () => void;
  savingLabel?: string;
  savedLabel?: string;
  errorLabel?: string;
  className?: string;
}

export function SaveState({
  status,
  onRetry,
  savingLabel = 'Ukládám…',
  savedLabel = 'Uloženo',
  errorLabel = 'Nepodařilo se uložit',
  className = '',
}: SaveStateProps) {
  return (
    <span
      className={`hb-save ${className}`}
      data-status={status}
      data-testid="hb-save-state"
      role="status"
      aria-live="polite"
    >
      {status === 'saving' && (
        <>
          <span className="hb-save-spinner" aria-hidden="true" />
          {savingLabel}
        </>
      )}
      {status === 'saved' && (
        <>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M5 12.5l4.2 4.2L19 7" />
          </svg>
          {savedLabel}
        </>
      )}
      {status === 'error' && (
        <>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M12 7.5v5.5M12 16.6v.1" />
          </svg>
          {errorLabel}
          {onRetry && (
            <>
              {' – '}
              <button type="button" className="hb-save-retry" onClick={onRetry}>
                zkusit znovu
              </button>
            </>
          )}
        </>
      )}
    </span>
  );
}

/**
 * Řídí `SaveState`: `run(fn)` přepne na „Ukládám…“, po úspěchu na „Uloženo“ (po `savedMs`
 * zpět na idle), při chybě na „error“ a chybu znovu vyhodí.
 */
export function useSaveState(savedMs = 2000) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      clear();
      setStatus('saving');
      try {
        const result = await fn();
        setStatus('saved');
        timer.current = setTimeout(() => setStatus('idle'), savedMs);
        return result;
      } catch (error) {
        setStatus('error');
        throw error;
      }
    },
    [savedMs],
  );
  const reset = useCallback(() => {
    clear();
    setStatus('idle');
  }, []);
  return { status, run, reset };
}
