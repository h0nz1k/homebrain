import type { ButtonHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from 'react';
import type { DataQuality } from '@homebrain/contracts';
export type Severity = 'critical' | 'warning' | 'notice' | 'info' | 'calm';
export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: 'solid' | 'glass';
  tone?: Severity;
}
export function Card({
  as: Tag = 'section',
  variant = 'solid',
  tone,
  children,
  className = '',
  ...props
}: CardProps) {
  return (
    <Tag {...props} data-variant={variant} data-severity={tone} className={`hb-card ${className}`}>
      {children}
    </Tag>
  );
}
export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="hb-stat">
      <span>{label}</span>
      <strong>
        {value} {unit}
      </strong>
    </div>
  );
}
const qualityLabels: Record<DataQuality, string> = {
  ok: 'Aktuální',
  stale: 'Zastaralé',
  unavailable: 'Nedostupné',
  invalid_unit: 'Chybná jednotka',
  unverified_polarity: 'Neověřená polarita',
};
export function StatusBadge({ quality }: { quality: DataQuality }) {
  return (
    <span className="hb-status" data-quality={quality}>
      {qualityLabels[quality]}
    </span>
  );
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="hb-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export type ButtonVariant = 'secondary' | 'primary' | 'strong' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` = the one main action of a card, `secondary` = tonal default,
   * `strong` = high-contrast secondary (CTA in alerts), `ghost` = quiet (cancel),
   * `danger` = destructive action (Smazat).
   */
  variant?: ButtonVariant;
  /** `sm` = dense rows (36 px), `md` = 44 px touch target, `lg` = 52 px hero CTA. */
  size?: 'sm' | 'md' | 'lg';
  /** Full width of the parent. */
  block?: boolean;
  /** Leading icon; a Button with an icon and no children renders as a round icon button. */
  icon?: ReactNode;
  /** Pending action: spinner instead of the icon, `aria-busy`, clicks blocked. */
  loading?: boolean;
}
/** Shared pill button with HomeBrain tokens (replaces per-module .x-btn copies). */
export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  loading,
  disabled,
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const lead = loading ? <span className="hb-btn-spinner" /> : icon;
  return (
    <button
      {...props}
      type={type}
      className={`hb-btn ${className}`}
      data-variant={variant}
      data-size={size}
      data-block={block ? '' : undefined}
      data-icon-only={children === undefined || children === null ? 'true' : undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {lead && (
        <span className="hb-icon" aria-hidden="true">
          {lead}
        </span>
      )}
      {children}
    </button>
  );
}

export interface BreakdownItem {
  key: string;
  label: ReactNode;
  /** Secondary line, e.g. "12,4 kWh × 4,59 Kč". */
  detail?: ReactNode;
  value: ReactNode;
  /** Numeric share for the optional proportion bar (same unit for all items). */
  amount?: number;
  /** Bar segment colour (CSS colour or var); the bar renders when any item has one. */
  color?: string;
}
/**
 * Itemised amounts (label + detail on the left, value right-aligned) with an optional total row.
 * Hairline separators, no inner boxes – use inside a Card.
 */
export function Breakdown({
  items,
  total,
  label,
  className = '',
}: {
  items: BreakdownItem[];
  total?: { label: ReactNode; value: ReactNode };
  label: string;
  className?: string;
}) {
  return (
    <dl className={`hb-breakdown ${className}`.trim()} aria-label={label}>
      {items.some((item) => item.color) && (
        <div className="hb-breakdown-bar" aria-hidden="true">
          {items
            .filter((item) => item.color && (item.amount ?? 0) > 0)
            .map((item) => (
              <span
                key={item.key}
                style={{ flexGrow: item.amount, background: item.color }}
                data-key={item.key}
              />
            ))}
        </div>
      )}
      {items.map((item) => (
        <div className="hb-breakdown-row" key={item.key} data-key={item.key}>
          <dt>
            <span>
              {item.color && (
                <i
                  className="hb-breakdown-dot"
                  style={{ background: item.color }}
                  aria-hidden="true"
                />
              )}
              {item.label}
            </span>
            {item.detail !== undefined && <small>{item.detail}</small>}
          </dt>
          <dd>{item.value}</dd>
        </div>
      ))}
      {total && (
        <div className="hb-breakdown-row hb-breakdown-total">
          <dt>
            <span>{total.label}</span>
          </dt>
          <dd>{total.value}</dd>
        </div>
      )}
    </dl>
  );
}
