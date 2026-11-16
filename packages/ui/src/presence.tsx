import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** „Kdo je doma“: one chip per household member with a green (doma) / neutral (pryč, neznámo) dot. */

export type PresenceStatus = 'home' | 'away' | 'unknown';

export interface PresencePerson {
  id: string;
  name: string;
  /** Avatar colour token from the server (`blue`, `teal`, …); unknown tokens fall back. */
  color: string;
  status: PresenceStatus;
}

export const PRESENCE_COLORS = [
  'blue',
  'teal',
  'purple',
  'pink',
  'amber',
  'orange',
  'indigo',
  'slate',
] as const;

/** Hex value per colour token – the one per-person colour source (avatars, progress, chips). */
export const PRESENCE_HEX: Record<(typeof PRESENCE_COLORS)[number], string> = {
  blue: '#3b82f6',
  teal: '#0d9488',
  purple: '#8b5cf6',
  // Fuchsia, not rose: avatar hues must not read as the red 'pryč' ring.
  pink: '#c026d3',
  amber: '#d97706',
  orange: '#ea580c',
  indigo: '#6366f1',
  slate: '#64748b',
};

/** Hex colour for a server colour token; unknown tokens fall back to slate. */
export function presenceHex(token: string | null | undefined): string {
  return PRESENCE_HEX[token as keyof typeof PRESENCE_HEX] ?? PRESENCE_HEX.slate;
}

const LABEL: Record<PresenceStatus, string> = { home: 'doma', away: 'pryč', unknown: 'neznámo' };

export function presenceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]!.toLocaleUpperCase('cs'))
    .join('');
}

/** Narrowest readable chip per size; below `STACK` the name and status stack in two lines. */
const MIN_CHIP = { md: 148, lg: 200 } as const;
const STACK_BELOW = { md: 176, lg: 0 } as const;
const GAP = { md: 8, lg: 14 } as const;

/**
 * Balanced equal-width grid: all chips in one row if they fit, otherwise the fewest rows with
 * equal columns (6 → 6, 3+3, 2+2+2) – never a ragged 4+2.
 */
export function presenceColumns(count: number, width: number, size: 'md' | 'lg' = 'md'): number {
  if (count <= 0) return 1;
  for (let rows = 1; rows <= count; rows += 1) {
    const cols = Math.ceil(count / rows);
    if (cols * MIN_CHIP[size] + (cols - 1) * GAP[size] <= width) return cols;
  }
  return 1;
}

export interface PresenceStripProps {
  people: readonly PresencePerson[] | null | undefined;
  /** `md` = compact chips (Dnes, Rodina), `lg` = readable from across the room (kiosk). */
  size?: 'md' | 'lg';
  className?: string;
  /** `grid` = balanced equal-width chips (6 → one row, 3+3 or 2+2+2); default free wrap. */
  layout?: 'wrap' | 'grid';
}

/**
 * Renders nothing without people. Status is colour + text + aria label (never colour alone).
 * Deliberately minimal: no places, times or ETA – only doma / pryč / neznámo.
 */
export function PresenceStrip({
  people,
  size = 'md',
  className,
  layout = 'wrap',
}: PresenceStripProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [grid, setGrid] = useState<{ cols: number; stack: boolean } | null>(null);
  const count = people?.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (layout !== 'grid' || !el || !count || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const width = el.clientWidth;
      if (!width) return;
      const cols = presenceColumns(count, width, size);
      const chip = (width - (cols - 1) * GAP[size]) / cols;
      setGrid((prev) => {
        const stack = chip < STACK_BELOW[size];
        return prev?.cols === cols && prev.stack === stack ? prev : { cols, stack };
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count, size, layout]);
  if (!people?.length) return null;
  return (
    <div
      className={`hb-presence${className ? ` ${className}` : ''}`}
      data-size={size}
      data-testid="presence"
    >
      <ul
        ref={listRef}
        className="hb-presence-list"
        aria-label="Kdo je doma"
        data-cols={grid?.cols}
        data-stack={grid?.stack || undefined}
        style={
          grid
            ? ({ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` } as CSSProperties)
            : undefined
        }
      >
        {people.map((person) => {
          const status: PresenceStatus = LABEL[person.status] ? person.status : 'unknown';
          const color = (PRESENCE_COLORS as readonly string[]).includes(person.color)
            ? person.color
            : 'slate';
          return (
            <li
              key={person.id}
              className="hb-presence-person"
              data-status={status}
              data-color={color}
              style={{ '--hb-presence-c': presenceHex(color) } as CSSProperties}
              data-testid="presence-person"
              aria-label={`${person.name}: ${LABEL[status]}`}
            >
              <span className="hb-presence-avatar" aria-hidden="true">
                {presenceInitials(person.name)}
              </span>
              <span className="hb-presence-text" aria-hidden="true">
                <span className="hb-presence-name">{person.name}</span>
                <span className="hb-presence-state">{LABEL[status]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
