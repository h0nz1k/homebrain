import { useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import { binSprites } from '../assets/bins/sprites.js';
import type { CollectionAvailability, WasteType } from '../contract.js';
import { isValidCollectionDate, WASTE_TYPE_LABELS_CS } from '../normalize.js';

/** Date-only arithmetic after converting the clock to Europe/Prague; safe across DST. */
export function collectionDays(date: string, reference: string): number {
  return Math.round((Date.parse(date) - Date.parse(reference)) / 86400000);
}
export function daysLabel(days: number | null): string {
  if (days === null) return 'Bez termínu';
  if (days === 0) return 'dnes';
  if (days === 1) return 'zítra';
  if (days === -1) return 'včera';
  if (days < 0) return `před ${-days} dny`;
  return `za ${days} ${days >= 2 && days <= 4 ? 'dny' : 'dní'}`;
}
/** Linear estimate between known collection dates, not a sensor reading. */
export function fillLevel(
  last: string | undefined,
  next: string,
  reference: string,
): number | null {
  if (!last || ![last, next, reference].every(isValidCollectionDate)) return null;
  const interval = collectionDays(next, last);
  if (interval <= 0) return null;
  return Math.max(0, Math.min(1, collectionDays(reference, last) / interval));
}
function useReducedMotion() {
  const media = useMemo(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  return useSyncExternalStore(
    (notify) => {
      media?.addEventListener('change', notify);
      return () => media?.removeEventListener('change', notify);
    },
    () => media?.matches ?? false,
    () => true,
  );
}
export interface WasteBinProps {
  type: WasteType;
  days: number | null;
  availability?: CollectionAvailability;
  size?: 'hero' | 'regular' | 'mini';
  evening?: boolean;
  collected?: boolean;
  /** Mini glyph of a collection that already happened (calendar history): muted + check. */
  done?: boolean;
}
export function WasteBin({
  type,
  days,
  availability = 'confirmed',
  size = 'regular',
  evening = false,
  collected = false,
  done = false,
}: WasteBinProps) {
  const reduced = useReducedMotion();
  const active = availability === 'confirmed' || availability === 'tentative';
  const state = !active
    ? 'idle'
    : collected
      ? 'empty'
      : days === 0
        ? 'today'
        : days === 1 && evening
          ? 'evening'
          : 'idle';
  const mini = size === 'mini';
  const motion = reduced || mini || state === 'idle' ? '' : ` wb-animate-${state}`;
  const label =
    availability === 'cancelled'
      ? 'zrušeno'
      : availability === 'unavailable'
        ? 'bez dat'
        : done
          ? `vyvezeno ${daysLabel(days)}`
          : daysLabel(days);
  const sprite = binSprites[type];
  const resolution = size === 'hero' ? 'hero' : 'card';
  return (
    <figure
      className={`wb-bin wb-bin--${size} wb-bin--${type} wb-state-${state}${motion}${!active ? ' wb-muted' : ''}${done ? ' wb-done' : ''}`}
      style={{ '--bin-color': `var(--hb-waste-${type})` } as CSSProperties}
      aria-label={`${WASTE_TYPE_LABELS_CS[type]}, ${label}${availability === 'tentative' ? ', předběžný termín' : ''}`}
      data-availability={availability}
    >
      <div className="wb-art">
        {mini ? (
          /* Independent front-view glyph: raster detail loses clarity at 24px. */
          <svg className="wb-mini-glyph" viewBox="0 0 24 30" aria-hidden="true">
            <g
              fill="var(--bin-color)"
              stroke="var(--hb-t2)"
              strokeWidth=".8"
              strokeLinejoin="round"
            >
              <path d="M5 7H19L17 26H7Z" />
              <rect x="3" y="4" width="18" height="3" rx="1" />
              <path d="M9 4V2H15V4" fill="none" />
            </g>
            <path d="M9 11V22M15 11V22" stroke="#fff" strokeOpacity=".3" />
            <path
              d="M7 26V28M17 26V28"
              stroke="var(--hb-t1)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <div className="wb-sprites">
            <img
              className="wb-sprite wb-sprite--closed"
              src={sprite.closed[resolution][0]}
              srcSet={`${sprite.closed[resolution][0]} 1x, ${sprite.closed[resolution][1]} 2x`}
              width="800"
              height="940"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            {state === 'today' && (
              <img
                className="wb-sprite wb-sprite--open"
                src={sprite.open[resolution][0]}
                srcSet={`${sprite.open[resolution][0]} 1x, ${sprite.open[resolution][1]} 2x`}
                width="800"
                height="940"
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            )}
          </div>
        )}
      </div>
      {availability === 'cancelled' && (
        <span className="wb-strike" aria-hidden="true">
          ✕
        </span>
      )}
      {done && availability !== 'cancelled' && (
        <svg className="wb-check" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="6" />
          <path d="M3.4 6.2 5.2 8l3.4-3.8" />
        </svg>
      )}
    </figure>
  );
}
