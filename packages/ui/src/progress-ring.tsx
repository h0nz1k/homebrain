import type { CSSProperties, ReactNode } from 'react';

export type ProgressRingTone = 'accent' | 'ok' | 'warn' | 'crit' | 'muted';

export interface ProgressRingProps {
  /** Share already done, 0…1 (a countdown passes elapsed / total). */
  value: number;
  /** Outer size in px (default 56). */
  size?: number;
  /** Stroke width in px (default ≈ 8 % of the size, at least 4). */
  thickness?: number;
  /** Arc colour; `accent` follows `--hb-ring-ink` so a module can tint it. */
  tone?: ProgressRingTone;
  /** The countdown is stopped (drawer out, paused): muted arc, dashed track. */
  held?: boolean;
  /** Centre content (time, icon). */
  children?: ReactNode;
  /** Accessible description; without it the ring is decorative. */
  label?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Progress / countdown ring shared by live device cards (airfryer, kitchen timers) and the
 * Dnes signal value. SVG only draws the track + arc; text stays HTML so it keeps real px sizes.
 */
export function ProgressRing({
  value,
  size = 56,
  thickness,
  tone = 'accent',
  held,
  children,
  label,
  className,
  ...rest
}: ProgressRingProps) {
  const frac = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const stroke = thickness ?? Math.max(4, Math.round(size * 0.08));
  // viewBox 0..100: keep the stroke inside the box at any size
  const sw = (stroke / size) * 100;
  const r = 50 - sw / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className={`hb-ring${className ? ` ${className}` : ''}`}
      data-tone={tone === 'accent' ? undefined : tone}
      data-held={held || undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      data-testid={rest['data-testid']}
      data-value={frac.toFixed(3)}
      style={{ '--hb-ring-size': `${size}px` } as CSSProperties}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <g transform="rotate(-90 50 50)">
          <circle className="hb-ring-track" cx="50" cy="50" r={r} strokeWidth={sw} />
          {frac > 0 && (
            <circle
              className="hb-ring-arc"
              cx="50"
              cy="50"
              r={r}
              strokeWidth={sw}
              strokeDasharray={c}
              strokeDashoffset={c * (1 - frac)}
            />
          )}
        </g>
      </svg>
      {children !== undefined && children !== null && <span className="hb-ring-c">{children}</span>}
    </span>
  );
}
