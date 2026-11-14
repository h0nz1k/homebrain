import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons.js';
import { NBSP, formatQuantity, powerParts } from './units.js';

/**
 * Number in tabular figures, a non-breaking space and a lighter, smaller unit („10 %“, „8,5 kWp“).
 * Angles follow Czech typography and stay glued to the number („35°“). Power is shown as W under
 * 1 kW and kW from 1 kW (`powerParts`).
 */
export function Quantity({ value, unit = '' }: { value: number; unit?: string }) {
  const [number, shown] = unit === 'W' || unit === 'kW' ? powerParts(value, unit) : [value, unit];
  return (
    <span className="hb-quantity">
      {formatQuantity(number)}
      {shown === '°'
        ? '°'
        : shown && (
            <small>
              {NBSP}
              {shown}
            </small>
          )}
    </span>
  );
}

/**
 * Small tag after a cell label: the source of a read-only value („ze střídače“) or a state of the
 * value („odhad“). One shape for all of them (plain caption text, optional 14 px icon); `info`
 * only tints the icon. `source` tags hide in narrow rows, the lock still says it.
 */
export function CellTag({
  children,
  icon,
  tone,
  kind,
}: {
  children: ReactNode;
  icon?: IconName;
  tone?: 'info';
  kind?: 'source';
}) {
  return (
    <span className="hb-cell-tag" data-tone={tone} data-kind={kind}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export interface ListCellProps {
  label: ReactNode;
  /** One muted line under the label. */
  description?: ReactNode;
  /** Badge after the label (e.g. „odhad“). */
  badge?: ReactNode;
  value?: ReactNode;
  /** Small glyph before the value (compass, angle …), decorative. */
  visual?: ReactNode;
  /** Trailing slot of fixed width: chevron (editable) or lock chip (read-only). */
  trailing?: 'chevron' | 'lock' | 'none';
  /** Tooltip/aria text of the lock chip (where the value is changed). */
  lockLabel?: string;
  /** Short visible source next to the label of a read-only row („ze střídače“); hidden when narrow. */
  lockText?: string;
  /** Extra full-width content under the row (hint, bar …). */
  children?: ReactNode;
  muted?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
  'data-key'?: string;
}

/**
 * Settings list cell: label (+ optional description) left, value right, one fixed trailing slot so values of
 * editable (chevron) and read-only (lock) rows share the same right edge. Clickable = a button.
 */
export function ListCell({
  label,
  description,
  badge,
  value,
  visual,
  trailing = 'none',
  lockLabel,
  lockText,
  children,
  muted,
  onClick,
  ...rest
}: ListCellProps) {
  const body = (
    <>
      <span className="hb-cell-copy">
        <span className="hb-cell-label">
          {label}
          {badge}
          {trailing === 'lock' && lockText && <CellTag kind="source">{lockText}</CellTag>}
        </span>
        {description && <span className="hb-cell-desc">{description}</span>}
      </span>
      <span className="hb-cell-value">
        {visual && (
          <span className="hb-cell-visual" aria-hidden="true">
            {visual}
          </span>
        )}
        {value}
      </span>
      <span className="hb-cell-trail" data-kind={trailing}>
        {trailing === 'chevron' && <Icon name="chevron" size={18} />}
        {trailing === 'lock' && (
          <span className="hb-cell-lock" title={lockLabel} role="img" aria-label={lockLabel}>
            <Icon name="lock" size={18} />
          </span>
        )}
      </span>
    </>
  );
  return (
    <div className="hb-cell" data-muted={muted || undefined} data-key={rest['data-key']}>
      {onClick ? (
        <button
          type="button"
          className="hb-cell-main"
          onClick={onClick}
          aria-label={rest['aria-label']}
        >
          {body}
        </button>
      ) : (
        <div className="hb-cell-main">{body}</div>
      )}
      {children && <div className="hb-cell-extra">{children}</div>}
    </div>
  );
}
