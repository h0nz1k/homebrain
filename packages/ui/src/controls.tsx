import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Shared interactive controls. Until now every module kept its own copy (wine-btn, rc-btn,
 * wine-seg, wx-seg, wine-sheet …); new modules use these, old ones migrate gradually.
 */

/* Button lives in components.tsx (canonical shared Button, #114). */

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'children'
> {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name (visible label lives next to the switch). */
  label: string;
  tone?: 'accent' | 'warn' | 'ok';
}
export function Switch({
  checked,
  onChange,
  label,
  tone = 'accent',
  className = '',
  ...props
}: SwitchProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-tone={tone}
      className={`hb-switch ${className}`}
      onClick={() => onChange(!checked)}
    />
  );
}

export interface SegmentedControlProps<T extends string = string> {
  label: string;
  value: T | null;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  className?: string;
  /** Keep the label for screen readers only (tabs, compact toolbars). */
  hideLabel?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
}
/** Single choice from 2–5 short options (radiogroup with a sliding thumb look). */
export function SegmentedControl<T extends string = string>({
  label,
  value,
  options,
  onChange,
  className = '',
  hideLabel,
  disabled,
  size = 'md',
}: SegmentedControlProps<T>) {
  return (
    <div className={`hb-seg-wrap ${className}`} data-size={size}>
      <span className={hideLabel ? 'hb-visually-hidden' : 'hb-seg-label'}>{label}</span>
      <div className="hb-seg" role="radiogroup" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            disabled={disabled}
            onClick={() => key !== value && onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface SheetProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Right side of the header (status pill …). */
  aside?: ReactNode;
  footer?: ReactNode;
  /** `dialog` = bottom sheet / centred panel, `alert` = small confirm dialog. */
  variant?: 'dialog' | 'alert';
  width?: 'md' | 'lg';
  /** Scrim click closes (default true for alert, false for dialog – avoids losing a flow). */
  dismissOnScrim?: boolean;
  'data-testid'?: string;
}
/** Modal sheet: phone = bottom sheet, tablet = centred panel. Esc closes; focus moves inside. */
export function Sheet({
  title,
  onClose,
  children,
  aside,
  footer,
  variant = 'dialog',
  width = 'md',
  dismissOnScrim,
  ...rest
}: SheetProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      '[autofocus], input, button[data-variant="primary"]',
    );
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  const scrimCloses = dismissOnScrim ?? variant === 'alert';
  return (
    <div
      className="hb-scrim"
      role="presentation"
      onClick={(e) => scrimCloses && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="hb-sheet"
        data-variant={variant}
        data-width={width}
        role={variant === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={rest['data-testid']}
      >
        <header className="hb-sheet-head">
          <h2 id={titleId}>{title}</h2>
          {aside}
        </header>
        <div className="hb-sheet-body">{children}</div>
        {footer && <footer className="hb-sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export type StepState = 'todo' | 'active' | 'done' | 'skipped' | 'error';
export interface StepperProps {
  steps: ReadonlyArray<{ key: string; title: string; detail?: ReactNode; state: StepState }>;
  label?: string;
  /** Small inline variant for progress inside a status surface (LiveStatus `steps`). */
  compact?: boolean;
}
/** Horizontal progress of a multi-step flow (wizard). Collapses to numbers on phones. */
export function Stepper({ steps, label = 'Postup', compact }: StepperProps) {
  const list = (
    <ol className="hb-stepper" data-compact={compact ? '' : undefined} aria-label={label}>
      {steps.map((s, i) => (
        <li
          key={s.key}
          className="hb-step"
          data-state={s.state}
          data-testid={`hb-step-${s.key}`}
          aria-current={s.state === 'active' ? 'step' : undefined}
        >
          <span className="hb-step-n" aria-hidden="true">
            {s.state === 'done' ? '✓' : s.state === 'error' ? '!' : i + 1}
          </span>
          <span className="hb-step-t">
            {s.title}
            {s.detail && <small>{s.detail}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
  if (!compact) return list;
  // compact = connected segment track; phones show one 'Krok 3 z 5 · Snímám' caption instead of labels
  const at = steps.findIndex((s) => s.state === 'active' || s.state === 'error');
  const cur = steps[at];
  return (
    <div className="hb-steptrack">
      {list}
      {cur && (
        <small className="hb-steptrack-sum" aria-hidden="true">
          Krok {at + 1} z {steps.length} · {cur.title}
          {cur.state === 'error' ? ' – nepovedlo se' : ''}
        </small>
      )}
    </div>
  );
}

export interface LiveStatusProps {
  /** `warn` = finished without success but coachable (try again), `error` = fault. */
  state: 'idle' | 'busy' | 'ok' | 'warn' | 'error';
  title: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  /** Buttons rendered inside the status surface; they wrap onto their own row on phones. */
  actions?: ReactNode;
  /**
   * Countdown ring instead of the spinner: `remaining` of `total` seconds (fractional values
   * animate smoothly; the ring shows whole seconds).
   */
  countdown?: { remaining: number; total: number };
  /** Compact step indicator under the text (e.g. Připraveno → Vidím → Snímám → Hotovo). */
  steps?: StepperProps['steps'];
  'data-testid'?: string;
}
const RING_R = 23;
const RING_C = 2 * Math.PI * RING_R;
/**
 * Big live status of an ongoing hardware action (scanning, pairing …): spinner ring while busy
 * (or a countdown ring), tone + icon when finished. Announced politely to screen readers.
 */
export function LiveStatus({
  state,
  title,
  children,
  icon,
  actions,
  countdown,
  steps,
  ...rest
}: LiveStatusProps) {
  const frac = countdown
    ? Math.min(1, Math.max(0, countdown.remaining / Math.max(1, countdown.total)))
    : 0;
  const secs = countdown ? Math.ceil(Math.max(0, countdown.remaining) - 0.05) : 0;
  return (
    <div
      className="hb-live"
      data-state={state}
      data-countdown={countdown ? '' : undefined}
      role="status"
      aria-live="polite"
      data-testid={rest['data-testid']}
    >
      <span className="hb-live-ring" aria-hidden={countdown ? undefined : 'true'}>
        {countdown ? (
          <>
            <svg className="hb-live-count" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r={RING_R} className="hb-live-track" />
              <circle
                cx="26"
                cy="26"
                r={RING_R}
                className="hb-live-arc"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - frac)}
              />
            </svg>
            <span
              className="hb-live-secs"
              data-testid="hb-live-secs"
              aria-label={`zbývá ${secs} s`}
            >
              {secs}
            </span>
          </>
        ) : (
          (icon ?? (state === 'ok' ? '✓' : state === 'error' ? '✕' : state === 'warn' ? '!' : ''))
        )}
      </span>
      <div className="hb-live-copy">
        <strong>{title}</strong>
        {children && <div>{children}</div>}
        {steps && <Stepper steps={steps} compact label="Průběh" />}
        {actions && <span className="hb-live-actions">{actions}</span>}
      </div>
    </div>
  );
}
