import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './components.js';
import { Sheet } from './controls.js';

export interface ErrorStateProps {
  /** Short headline; default „Nepodařilo se načíst“. */
  title?: string;
  /** Explanation / what the user can do. */
  children?: ReactNode;
  /** Shows a „Zkusit znovu“ button. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Inline variant for cards and lists (no illustration, smaller padding). */
  compact?: boolean;
  'data-testid'?: string;
}
/** Load / action failure with an optional retry (replaces module `*-error` paragraphs). */
export function ErrorState({
  title = 'Nepodařilo se načíst',
  children,
  onRetry,
  retryLabel = 'Zkusit znovu',
  compact,
  ...rest
}: ErrorStateProps) {
  return (
    <div
      className="hb-error-state"
      role="alert"
      data-compact={compact ? '' : undefined}
      data-testid={rest['data-testid']}
    >
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export interface SkeletonProps {
  /** Number of text placeholder lines (default 3). */
  lines?: number;
  /** `text` = lines only, `card` = media block + lines, `block` = one block of `height`. */
  variant?: 'text' | 'card' | 'block';
  /** Screen-reader text; default „Načítám…“. */
  label?: string;
  /** Block height for `block`/`card` (CSS length). */
  height?: string;
  'data-testid'?: string;
}
/** Loading placeholder that keeps the layout of the content that is coming. */
export function Skeleton({
  lines = 3,
  variant = 'text',
  label = 'Načítám…',
  height,
  ...rest
}: SkeletonProps) {
  const count = variant === 'block' ? 0 : Math.max(0, lines);
  return (
    <div
      className="hb-skeleton"
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-variant={variant}
      data-testid={rest['data-testid']}
    >
      <span className="hb-visually-hidden">{label}</span>
      {variant !== 'text' ? (
        <span
          className="hb-skeleton-block"
          aria-hidden="true"
          style={height ? { height } : undefined}
        />
      ) : null}
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="hb-skeleton-line" aria-hidden="true" />
      ))}
    </div>
  );
}

export interface ConfirmDialogProps {
  title: ReactNode;
  /** Consequence of the action (aria-describedby). */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive action: red button and the safe „Zpět“ gets the initial focus. */
  danger?: boolean;
  /**
   * Runs once (double clicks ignored). Resolves → dialog closes. A thrown error keeps the dialog
   * open with an inline error; returning `false` or `{ ok: false }` keeps it open silently
   * (e.g. `runMutation` already showed a toast).
   */
  onConfirm: () => unknown;
  onClose: () => void;
  /** Inline text when onConfirm throws. */
  errorText?: string;
  'data-testid'?: string;
  confirmTestId?: string;
}
const keepsOpen = (value: unknown) =>
  value === false ||
  (typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false);

/** Accessible confirm dialog (alertdialog, focus trap, Esc, focus return, no double submit). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Zpět',
  danger,
  onConfirm,
  onClose,
  errorText = 'Nepodařilo se to dokončit. Zkuste to znovu.',
  confirmTestId,
  ...rest
}: ConfirmDialogProps) {
  const bodyId = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  const confirm = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    let close = false;
    try {
      close = !keepsOpen(await onConfirm());
    } catch {
      setFailed(true);
    }
    running.current = false;
    setBusy(false);
    if (close) onClose();
  };
  return (
    <Sheet
      variant="alert"
      title={title}
      onClose={() => !running.current && onClose()}
      describedBy={children ? bodyId : undefined}
      data-testid={rest['data-testid']}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} data-autofocus={danger ? '' : undefined}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            data-testid={confirmTestId}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ? <div id={bodyId}>{children}</div> : null}
      {failed ? (
        <p className="hb-confirm-error" role="alert">
          {errorText}
        </p>
      ) : null}
    </Sheet>
  );
}
