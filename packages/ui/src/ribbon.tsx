import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Tone } from './signals.js';

export interface RibbonItem {
  id: string;
  kind: 'cheap' | 'rain' | 'waste' | 'event' | 'sun';
  from: number;
  to?: number;
  label: string;
  tone?: Tone;
  /** Marker only: the same event is already shown as a visible signal card. */
  hideLabel?: boolean;
}
/** Coordinates are normalized (0–1), independent of the visible hour range. */
export interface RibbonLabelInput {
  id: string;
  label: string;
  x: number;
  priority?: number;
  /** 'start' = label begins at the event (bands); 'center' = label centred on a point event. */
  anchor?: 'start' | 'center';
}
export interface RibbonLabelOptions {
  /** Max px a label may be pushed away from its anchor; beyond that it is shortened or dropped. */
  maxOffset?: number;
}
export interface RibbonLabelLayout extends RibbonLabelInput {
  left: number;
  width: number;
  text: string;
}
/** Short form of a label: text before the first comma / dot separator / dash ("Déšť od 8:00, pak…" → "Déšť od 8:00"). */
export function shortRibbonLabel(label: string): string {
  return label.split(/,\s|\s·\s|\s–\s/)[0]!.trim();
}

/**
 * Higher priority wins; output uses pixels, with an eight-pixel label gap.
 * Never ellipsizes: first shortens labels (lowest priority first), then drops the lowest priority label.
 */
export function layoutRibbonLabels(
  items: readonly RibbonLabelInput[],
  widthPx: number,
  measure: (text: string) => number,
  { maxOffset = Infinity }: RibbonLabelOptions = {},
): RibbonLabelLayout[] {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return [];
  const gap = 8;
  const ideal = (item: RibbonLabelInput, width: number) =>
    Math.min(
      widthPx - width,
      Math.max(0, item.x * widthPx - (item.anchor === 'center' ? width / 2 : 0)),
    );
  const candidates = items
    .filter((item) => Number.isFinite(item.x) && item.label.trim())
    .map((item, order) => ({ ...item, order }));
  while (candidates.length) {
    const texts = new Map(candidates.map((item) => [item.id, item.label]));
    const byPriority = [...candidates].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0) || b.order - a.order,
    );
    const place = () => {
      let edge = 0;
      return [...candidates]
        .sort((a, b) => a.x - b.x || a.order - b.order)
        .map((item) => {
          const text = texts.get(item.id)!;
          const width = measure(text);
          const left = Math.max(edge, ideal(item, width));
          edge = left + width + gap;
          return { ...item, width, left, text };
        });
    };
    const fits = (placed: RibbonLabelLayout[]) =>
      placed.every(
        (item) =>
          item.left >= 0 &&
          item.left + item.width <= widthPx + 0.5 &&
          item.left - ideal(item, item.width) <= maxOffset + 0.5,
      );
    let placed = place();
    if (fits(placed)) return placed;
    for (const item of byPriority) {
      const short = shortRibbonLabel(item.label);
      if (short === item.label || !short) continue;
      texts.set(item.id, short);
      placed = place();
      if (fits(placed)) return placed;
    }
    candidates.splice(candidates.indexOf(byPriority[0]!), 1);
  }
  return [];
}
/** Minimum px between point-marker centres (2–4 px wide markers plus a visible gap). */
const MARKER_SPACING = 8;
/**
 * Point markers closer than {@link MARKER_SPACING} (e.g. a calendar event and the waste reminder
 * both at 18:00) are spread symmetrically around their cluster's centre. Returns px offsets by id;
 * markers that do not collide are absent.
 */
export function spreadPointMarkers(markers: ReadonlyArray<{ id: string; x: number }>) {
  const offsets = new Map<string, number>();
  const sorted = markers.filter((m) => Number.isFinite(m.x)).sort((a, b) => a.x - b.x);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.x - sorted[j - 1]!.x < MARKER_SPACING) j++;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      const centre = group.reduce((sum, m) => sum + m.x, 0) / group.length;
      group.forEach((m, k) => {
        const target = centre + (k - (group.length - 1) / 2) * MARKER_SPACING;
        offsets.set(m.id, Math.round((target - m.x) * 10) / 10);
      });
    }
    i = j;
  }
  return offsets;
}
export interface DayRibbonProps {
  start: number;
  end: number;
  now: number;
  sunrise: number;
  sunset: number;
  items: RibbonItem[];
  hourly?: Array<{ h: number; tempC: number; icon?: ReactNode }>;
  slim?: boolean;
}
const priorities: Record<RibbonItem['kind'], number> = {
  waste: 4,
  event: 2,
  rain: 3,
  cheap: 1,
  sun: 0,
};
const temperatures = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
export function DayRibbon({
  start,
  end,
  now,
  sunrise,
  sunset,
  items,
  hourly = [],
  slim = false,
}: DayRibbonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [letterWidth, setLetterWidth] = useState(8);
  const [hourlyInset, setHourlyInset] = useState(48);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    setLetterWidth(
      parseFloat(getComputedStyle(element).getPropertyValue('--ribbon-label-size') || '14') * 0.56,
    );
    const measureHourly = () => {
      const widest = Math.max(
        0,
        ...Array.from(element.querySelectorAll<HTMLElement>('.hb-ribbon-hourly')).map(
          (item) => item.getBoundingClientRect().width,
        ),
      );
      setHourlyInset(Math.max(24, Math.ceil(widest / 2)));
    };
    measureHourly();
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) measureHourly();
    });
    const observer = new ResizeObserver((entries) => {
      measureHourly();
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const position = (h: number) => Math.min(100, Math.max(0, ((h - start) / (end - start)) * 100));
  const visible = items.filter(
    (item) => Number.isFinite(item.from) && (item.to ?? item.from) >= start && item.from <= end,
  );
  const labels = layoutRibbonLabels(
    visible
      .filter((item) => item.kind !== 'sun' && !item.hideLabel)
      .map((item) => ({
        id: item.id,
        label: item.label,
        x: position(item.from) / 100,
        priority: priorities[item.kind],
        // Point markers (events, waste reminder) centre their label; bands start at their begin.
        anchor:
          item.kind === 'event' || item.to === undefined ? ('center' as const) : ('start' as const),
      })),
    width,
    (text) => Array.from(text).length * letterWidth,
    // Wide ribbons keep labels next to their event; narrow (mobile) ones may slide further.
    { maxOffset: width >= 600 ? 48 : Infinity },
  );
  const stops: [number, string][] = [
    [sunrise - 0.7, '#0E1628'],
    [sunrise, '#5E4150'],
    [sunrise + 1.4, '#3A6890'],
    [sunset - 1.4, '#3A6890'],
    [sunset, '#6A3E36'],
    [sunset + 0.8, '#0E1628'],
  ];
  const gradient = `linear-gradient(90deg, ${stops
    .sort((a, b) => a[0] - b[0])
    .map(([h, c]) => `${c} ${position(h)}%`)
    .join(', ')})`;
  const ticks: number[] = [];
  for (let h = Math.ceil(start / 3) * 3; h <= end; h += 3) ticks.push(h);
  const px = (h: number) => (position(h) / 100) * width;
  const isPoint = (item: RibbonItem) => item.kind === 'event' || item.to === undefined;
  // Point markers and hairline bands (e.g. a 15-min waste reminder) are spread apart when they
  // share a time; wider bands (rain, cheap power) stay where they are.
  const nudges = spreadPointMarkers(
    visible
      .filter((item) => isPoint(item) || px(item.to!) - px(item.from) < MARKER_SPACING)
      .map((item) => ({
        id: item.id,
        x: isPoint(item) ? px(item.from) : (px(item.from) + px(item.to!)) / 2,
      })),
  );
  return (
    <section
      className={`hb-ribbon${slim ? ' hb-ribbon-slim' : ''}`}
      aria-label="Průběh dne"
      data-testid="day-ribbon"
      style={{ paddingInline: hourlyInset }}
    >
      <div className="hb-ribbon-inner" ref={ref}>
        <div className="hb-ribbon-labels">
          {labels.map((label) => (
            <span
              key={label.id}
              className="hb-ribbon-label"
              data-testid="ribbon-label"
              data-id={label.id}
              title={label.label}
              style={{
                left: `${(label.left / width) * 100}%`,
                width: `${(label.width / width) * 100}%`,
              }}
            >
              {label.text}
            </span>
          ))}
        </div>
        <div className="hb-ribbon-track" style={{ background: gradient }} />
        <div className="hb-ribbon-past" style={{ width: `${position(now)}%` }} />
        {visible.map((item) => (
          <span
            key={item.id}
            className={`hb-ribbon-item hb-ribbon-${item.kind}`}
            data-testid="ribbon-marker"
            data-id={item.id}
            data-label-hidden={item.hideLabel || undefined}
            data-tone={item.tone}
            title={item.label}
            style={
              item.kind === 'event' || item.to === undefined
                ? // Point events: the marker is centred on its time, like its label;
                  // markers at (nearly) the same time are spread apart so both stay visible.
                  {
                    left: `${position(item.from)}%`,
                    transform: nudges.get(item.id)
                      ? `translateX(calc(-50% + ${nudges.get(item.id)}px))`
                      : 'translateX(-50%)',
                  }
                : {
                    left: `${position(item.from)}%`,
                    width: `${Math.max(0, position(item.to) - position(item.from))}%`,
                    ...(nudges.get(item.id)
                      ? { transform: `translateX(${nudges.get(item.id)}px)` }
                      : {}),
                  }
            }
          />
        ))}
        {sunrise >= start && sunrise <= end && (
          <span
            className="hb-ribbon-item hb-ribbon-sun hb-ribbon-sunrise"
            data-testid="ribbon-sunrise"
            title="Východ slunce"
            style={{ left: `${position(sunrise)}%` }}
          />
        )}
        <span className="hb-ribbon-now" style={{ left: `${position(now)}%` }} />
        <span
          className="hb-ribbon-tick hb-ribbon-current"
          style={{ left: `${position(now)}%`, transform: 'translateX(-50%)' }}
        >
          {Math.floor(now)}:
          {Math.round((now % 1) * 60)
            .toString()
            .padStart(2, '0')}
        </span>
        {ticks.map((h) => (
          <span
            key={h}
            className="hb-ribbon-tick"
            data-testid="ribbon-tick"
            data-hour={h}
            style={{
              left: `${position(h)}%`,
              transform: 'translateX(-50%)',
              visibility:
                (Math.abs(position(h) - position(now)) / 100) * width < 48 ? 'hidden' : undefined,
            }}
          >
            {h}:00
          </span>
        ))}
        {!slim &&
          hourly
            .filter((hour) => ticks.includes(hour.h))
            .map((hour) => (
              <span
                key={hour.h}
                className="hb-ribbon-hourly"
                data-testid="ribbon-hourly"
                data-hour={hour.h}
                data-past={hour.h < Math.floor(now) ? 'true' : undefined}
                style={{ left: `${position(hour.h)}%`, transform: 'translateX(-50%)' }}
              >
                {hour.icon && <span aria-hidden="true">{hour.icon}</span>}
                {temperatures.format(hour.tempC)} °C
              </span>
            ))}
      </div>
    </section>
  );
}
