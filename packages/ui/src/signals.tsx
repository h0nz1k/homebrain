import { useId } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import type { Severity } from './components.js';
import { ProgressRing } from './progress-ring.js';

/** Semantic tones (#64): one palette for chips, statuses and severity across modules. */
export type Tone = 'ok' | 'warn' | 'severe' | 'crit' | 'accent' | 'neutral';
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
  /** `soft` = tonal tint (default), `solid` = filled badge for the one thing that must pop. */
  variant?: 'soft' | 'solid';
  /** `sm` = dense contexts (diagram labels, timer cards): smaller padding, same type scale. */
  size?: 'md' | 'sm';
}
export function Pill({
  tone = 'neutral',
  dot,
  icon,
  variant = 'soft',
  size = 'md',
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={`hb-pill ${className}`}
      data-tone={tone}
      data-variant={variant}
      data-size={size === 'sm' ? 'sm' : undefined}
    >
      {dot && <span className="hb-dot" aria-hidden="true" />}
      {icon && (
        <span className="hb-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
export interface ChipProps extends BadgeProps {
  /** Selectable chip (filters, multi-select settings): renders a `<button aria-pressed>`. */
  pressed?: boolean;
  /** Called on click of a selectable chip. */
  onPress?: () => void;
  /** Same click, with the next pressed state (convenience for boolean toggles). */
  onPressedChange?: (pressed: boolean) => void;
  disabled?: boolean;
  /** Round badge before the label of a pressed chip (e.g. order number). */
  badge?: ReactNode;
  badgeLabel?: string;
  /** Pressed look: `solid` accent fill (default) or `soft` – the shared selection language
   * (accent tint + ring + ink) used with SegmentedControl tone="accent" and map selections. */
  look?: 'solid' | 'soft';
}
export function Chip({
  className = '',
  pressed,
  onPress,
  onPressedChange,
  disabled,
  badge = null,
  badgeLabel,
  look = 'solid',
  children,
  ...props
}: ChipProps) {
  if (pressed === undefined) {
    return (
      <Pill {...props} className={`hb-chip ${className}`}>
        {children}
      </Pill>
    );
  }
  // Badge-only props (dot/variant/size) do not apply to the selectable form. A non-neutral
  // `tone` tints the toggle (e.g. amber „Údržba“ when a part is due) in both pressed states.
  const { icon, tone } = props;
  const rest: Record<string, unknown> = { ...props };
  for (const key of ['tone', 'dot', 'icon', 'variant', 'size']) delete rest[key];
  return (
    <button
      {...(rest as HTMLAttributes<HTMLButtonElement>)}
      type="button"
      className={`hb-chip ${className}`}
      data-toggle=""
      data-tone={tone && tone !== 'neutral' ? tone : undefined}
      data-look={look === 'soft' ? 'soft' : undefined}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => {
        onPress?.();
        onPressedChange?.(!pressed);
      }}
    >
      {badge !== null && badge !== undefined && (
        <span className="hb-chip-badge" aria-label={badgeLabel}>
          {badge}
        </span>
      )}
      {icon && (
        <span className="hb-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
export interface TileProps extends HTMLAttributes<HTMLElement> {
  tone?: Tone;
  icon?: ReactNode;
  label: ReactNode;
  /** Secondary line (e.g. „před 8 měsíci“). */
  detail?: ReactNode;
  /** Status / call to action line in the tile tone (e.g. „✓ zapsáno“, „Přidat“). */
  status?: ReactNode;
  /** Empty slot: outlined, no fill (missing value the user can add). */
  empty?: boolean;
  /** Whole tile is one tap target (renders a `<button>`). */
  onPress?: () => void;
  disabled?: boolean;
}
/** Status tile for a grid of equal slots (credentials, rooms, bottles): icon, label, one status line.
 * With `onPress` the whole tile is the tap target (≥ 64 px), so rows of small buttons are not needed. */
export function Tile({
  tone = 'neutral',
  icon,
  label,
  detail,
  status,
  empty,
  onPress,
  disabled,
  className = '',
  ...props
}: TileProps) {
  const body = (
    <>
      {icon && (
        <span className="hb-tile-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="hb-tile-label">{label}</span>
      {status !== undefined && status !== null && <span className="hb-tile-status">{status}</span>}
      {detail !== undefined && detail !== null && (
        <small className="hb-tile-detail">{detail}</small>
      )}
    </>
  );
  const common = {
    ...props,
    className: `hb-tile ${className}`,
    'data-tone': tone,
    'data-empty': empty ? '' : undefined,
  };
  return onPress ? (
    <button
      {...(common as HTMLAttributes<HTMLButtonElement>)}
      type="button"
      disabled={disabled}
      onClick={onPress}
    >
      {body}
    </button>
  ) : (
    <div {...(common as HTMLAttributes<HTMLDivElement>)}>{body}</div>
  );
}

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  area?: boolean;
  className?: string;
}
export function Sparkline({
  values,
  width = 120,
  height = 32,
  area = false,
  className = '',
}: SparklineProps) {
  const finite = values.filter(Number.isFinite);
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 0;
  const w = Math.max(1, width),
    h = Math.max(2, height);
  const points = finite
    .map(
      (v, i) =>
        `${finite.length === 1 ? w / 2 : (i * w) / (finite.length - 1)},${h - 1 - (max === min ? 0.5 : (v - min) / (max - min)) * (h - 2)}`,
    )
    .join(' ');
  return (
    <svg
      className={`hb-sparkline ${className}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {area && finite.length > 0 && (
        <polygon points={`0,${h} ${points} ${w},${h}`} fill="currentColor" opacity=".12" />
      )}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export interface StatusRowProps {
  label: ReactNode;
  value: ReactNode;
  tone?: Tone;
  time?: string;
  /** Leading glyph (tinted by tone) – live feeds, device health. */
  icon?: ReactNode;
  /** Secondary line under the label. */
  detail?: ReactNode;
  /** Trailing actions (buttons) – replaces `time` visually when both are set. */
  action?: ReactNode;
  'data-testid'?: string;
}
export function StatusRow({
  label,
  value,
  tone = 'neutral',
  time,
  icon,
  detail,
  action,
  ...rest
}: StatusRowProps) {
  const rich = Boolean(icon || detail || action);
  return (
    <div
      className="hb-status-row"
      data-tone={tone}
      data-rich={rich || undefined}
      data-testid={rest['data-testid']}
    >
      {icon && (
        <span className="hb-status-row-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {rich ? (
        <span className="hb-status-row-copy">
          <span className="hb-status-row-label">{label}</span>
          {detail && <small>{detail}</small>}
        </span>
      ) : (
        <span>{label}</span>
      )}
      {value !== undefined && value !== null && value !== '' && <strong>{value}</strong>}
      {action ? (
        <span className="hb-status-row-action">{action}</span>
      ) : (
        time && <time>{time}</time>
      )}
    </div>
  );
}
export interface SignalCardProps {
  id: string;
  severity: Severity;
  title: string;
  context?: string;
  value?: { v: ReactNode; unit?: string; label?: string; progress?: number; held?: boolean };
  icon?: ReactNode;
  actionLabel?: string;
  actionDisabledReason?: string;
  onAction?: () => void;
  stale?: boolean;
  alsoCount?: number;
  compact?: boolean;
  enterIndex?: number;
}
const severityLabels: Record<Severity, string> = {
  critical: 'Kritické',
  warning: 'Upozornění',
  notice: 'Oznámení',
  info: 'Informace',
  calm: 'V klidu',
};
function Signal({
  id,
  severity,
  title,
  context,
  value,
  icon,
  actionLabel,
  actionDisabledReason,
  onAction,
  stale,
  alsoCount,
  compact,
  enterIndex = 0,
  variant,
}: SignalCardProps & { variant?: HeroSignalProps['variant'] }) {
  const descriptionId = useId();
  const Heading = variant ? 'h2' : 'h3';
  return (
    <article
      className={`hb-card hb-signal${variant ? ' hb-hero' : ''}${compact ? ' hb-signal-compact' : ''}`}
      data-testid={variant ? 'hero-signal' : 'signal-card'}
      data-id={id}
      data-severity={severity}
      data-variant={variant ?? 'glass'}
      data-stale={stale || undefined}
      style={{ '--hb-enter-index': Math.max(0, enterIndex) } as CSSProperties}
    >
      {icon && (
        <span className="hb-signal-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="hb-signal-copy">
        <span className="hb-signal-severity">
          {severityLabels[severity]}
          {stale && ' · Zastaralé údaje'}
        </span>
        <Heading>{title}</Heading>
        {context && <p className="hb-signal-context">{context}</p>}
        {!!alsoCount && <span className="hb-signal-also">Další související: {alsoCount}</span>}
      </div>
      {value && (
        <div
          className="hb-signal-value"
          data-ring={value.progress !== undefined ? '' : undefined}
          data-held={value.held || undefined}
        >
          {value.progress !== undefined && (
            <ProgressRing
              value={value.progress}
              size={value.held ? 28 : variant === 'mobile' ? 40 : variant ? 56 : 40}
              tone={value.held ? 'muted' : 'accent'}
              held={value.held}
              data-testid="signal-ring"
            />
          )}
          <span className="hb-signal-value-t">
            {value.label && <span>{value.label}</span>}
            <strong>
              {value.v}
              <small>{value.unit}</small>
            </strong>
          </span>
        </div>
      )}
      {actionLabel && (
        <div className="hb-signal-action">
          <button
            type="button"
            onClick={onAction}
            disabled={!!actionDisabledReason || !onAction}
            aria-disabled={!!actionDisabledReason || !onAction}
            aria-describedby={actionDisabledReason ? descriptionId : undefined}
          >
            {actionLabel}
          </button>
          {actionDisabledReason && <span id={descriptionId}>{actionDisabledReason}</span>}
        </div>
      )}
    </article>
  );
}
export function SignalCard(props: SignalCardProps) {
  return <Signal key={props.id} {...props} />;
}
export interface HeroSignalProps extends SignalCardProps {
  variant: 'kiosk' | 'desktop' | 'mobile';
}
export function HeroSignal(props: HeroSignalProps) {
  return <Signal key={props.id} {...props} />;
}
