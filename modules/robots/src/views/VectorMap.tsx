import {
  Component,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  clipTrail,
  segmentGuard,
  frameFor,
  polylabel,
  ringBox,
  roomRings,
  roundedLine,
  roundedPath,
  toView,
  containsPoint,
  rasterRect,
  type Frame,
  type Ring,
  type VectorMap,
} from '../map/geometry.js';
import {
  easeTravel,
  glideDuration,
  pathPoints,
  planGlide,
  pointAt,
  smoothPath,
  type Pt,
} from '../map/motion.js';
import { orderBadge, type Room } from '../rooms.js';

export type MarkerTone = 'cleaning' | 'returning' | 'error' | 'idle';

interface Props {
  map: VectorMap;
  rooms: Room[];
  selected: number[];
  onToggle: (id: number) => void;
  tone: MarkerTone;
  label: string;
  /** Short Czech problem text pinned to the robot (error state). */
  callout?: { title: string; detail?: string } | null;
  /** Signs the raster base path (`auth/sign_path`); without it the vector drawing is used. */
  resolveBase?: ((path: string) => Promise<string>) | null;
  /** `faded` (default): only the latest stretch of the route is drawn strongly. */
  trail?: 'faded' | 'full';
}

interface Placed {
  id: number;
  name: string;
  d: string;
  rings: Ring[];
  x: number;
  y: number;
  small: boolean;
}

const reduceMotion = () =>
  typeof globalThis.matchMedia === 'function' &&
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Smooth vector floor plan: tonal rooms, labels at the visual centre, gliding robot. */
export function VectorFloorPlan({
  map,
  rooms,
  selected,
  trail = 'faded',
  onToggle,
  tone,
  label,
  callout,
  resolveBase,
}: Props) {
  const frame = useMemo(() => frameFor(map), [map]);
  const rootRef = useRef<HTMLDivElement>(null);
  const theme = useThemeName(rootRef);
  const base = useRasterBase(rasterMode() ? map.raster : null, theme, resolveBase);
  // Raster mode: the bitmap is the floor plan; vector rooms become transparent hit areas.
  const raster = !!base;
  const clipId = `rv-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const unit = Math.max(frame.width, frame.height) / 100; // 1 % of the longer side
  const names = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms]);
  const zones = useMemo(() => map.no_go.map((flat) => flatToView(frame, flat)), [map, frame]);
  const placed = useMemo<Placed[]>(
    () =>
      map.rooms.map((room) => {
        const rings = roomRings(
          frame,
          raster && room.outline ? { ...room, polygons: room.outline } : room,
        );
        // No-go zones inside the room act as holes, so the label never sits on/under them.
        const holes = zones.filter((zone) => zone.every(([x, y]) => containsPoint(rings, x, y)));
        const [x, y] = polylabel([...rings, ...holes], unit / 4);
        const box = ringBox(rings[0]!);
        return {
          id: room.id,
          name: names.get(room.id) ?? '',
          // With a wall layer the fill tucks under square walls: only a hint of rounding.
          d: rings
            .map((ring) =>
              roundedPath(ring, unit * (raster ? 0.35 : map.walls.length ? 0.25 : 0.9)),
            )
            .join(''),
          rings,
          x,
          y,
          small: Math.min(box.w, box.h) < unit * 9,
        };
      }),
    [map, frame, unit, names, zones, raster],
  );
  const floor = useMemo(
    () => map.floor.map((flat) => roundedPath(flatToView(frame, flat), unit * 2)).join(''),
    [map, frame, unit],
  );
  const roomsD = useMemo(() => placed.map((room) => room.d).join(''), [placed]);
  // Walls from the raw wall layer: one stroke per wall, rounded joins. Rooms are soft fills
  // without outlines, so a wall shared by two rooms is drawn exactly once.
  const walls = useMemo(() => map.walls.map((flat) => flatToView(frame, flat)), [map, frame]);
  const wallsD = useMemo(
    () => walls.map((w) => roundedLine(w, unit * 0.8)).join(''),
    [walls, unit],
  );
  const dividersD = useMemo(
    () => map.dividers.map((flat) => roundedLine(flatToView(frame, flat), unit * 0.8)).join(''),
    [map, frame, unit],
  );
  const roomShapes = useMemo(() => placed.map((room) => room.rings), [placed]);
  const robotView = map.robot ? toView(frame, map.robot.x, map.robot.y) : null;
  const robotRoom = robotView
    ? placed.find((room) => containsPoint(room.rings, robotView[0], robotView[1]))?.id
    : undefined;
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

  return (
    <div
      ref={rootRef}
      className="rv"
      data-testid="robots-vector-map"
      data-has-selection={selected.length > 0 || undefined}
      data-trail={trail}
      data-walls={wallsD && !raster ? '' : undefined}
      data-base={raster ? (base.ready ? 'ready' : 'loading') : undefined}
      data-base-source={raster ? (map.raster?.source ?? 'map_data') : undefined}
      style={{
        aspectRatio: `${frame.width} / ${frame.height}`,
        // Portrait plans get more height, so they do not shrink to a narrow strip.
        width: `min(100%, ${Math.round(((frame.height > frame.width * 1.1 ? 720 : 560) * frame.width) / frame.height)}px)`,
      }}
    >
      <svg
        viewBox={`0 0 ${Math.round(frame.width)} ${Math.round(frame.height)}`}
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id="rv-room" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--rv-room-top)" />
            <stop offset="1" stopColor="var(--rv-room-bottom)" />
          </linearGradient>
          <linearGradient id="rv-sel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--rv-sel-a)" />
            <stop offset="1" stopColor="var(--rv-sel-b)" />
          </linearGradient>
          <radialGradient id="rv-cone" cx="0" cy="0.5" r="1" fx="0" fy="0.5">
            <stop offset="0.25" stopColor="var(--hb-ac)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--hb-ac)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rv-bot" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="var(--rv-bot-edge)" />
          </radialGradient>
        </defs>
        {raster && (
          <clipPath id={clipId}>
            <rect width={frame.width} height={frame.height} />
          </clipPath>
        )}
        {raster ? (
          base.url && (
            <image
              clipPath={`url(#${clipId})`}
              className="rv-base"
              data-testid="robots-map-base"
              href={base.url}
              {...rasterRect(frame, map.raster!)}
              preserveAspectRatio="none"
              onLoad={base.onLoad}
              onError={base.onError}
            />
          )
        ) : (
          <>
            {floor && <path className="rv-floor" d={floor} />}
            {/* Older payloads without a wall layer: the widened union of all rooms is the outline. */}
            {!wallsD && <path className="rv-walls" d={roomsD} strokeWidth={unit * 1.5} />}
            {/* Closes the small gaps between neighbouring rooms, so rooms read as one floor. */}
            <path
              className="rv-room-pad"
              d={roomsD}
              fillRule="evenodd"
              // Fills already reach the walls (backend): a hairline seam only, never past a wall.
              strokeWidth={unit * (wallsD ? 0.3 : 0.85)}
            />
          </>
        )}
        <g className="rv-rooms">
          {placed.map((room) => {
            const badge = orderBadge(selected, room.id);
            return (
              <path
                key={room.id}
                className="rv-room"
                d={room.d}
                strokeWidth={wallsD && !raster ? unit * 0.3 : undefined}
                fillRule="evenodd"
                data-testid={`robots-map-room-${room.id}`}
                data-selected={badge !== null || undefined}
                data-current={room.id === robotRoom || undefined}
                onClick={() => names.has(room.id) && onToggle(room.id)}
              />
            );
          })}
        </g>
        {raster && base.wallsUrl && (
          <image
            clipPath={`url(#${clipId})`}
            className="rv-base rv-base-walls"
            data-testid="robots-map-base-walls"
            href={base.wallsUrl}
            {...rasterRect(frame, map.raster!)}
            preserveAspectRatio="none"
            onError={base.onError}
          />
        )}
        {/* Outline and room seams are the same shared arcs (backend topology), drawn as plain
            strokes in one colour: the shell slightly heavier, seams meet it in clean T joints. */}
        {wallsD && dividersD && !raster && (
          <path className="rv-wall-line rv-seam" d={dividersD} strokeWidth={unit * 0.38} />
        )}
        {wallsD && !raster && (
          <path
            className="rv-wall-line"
            d={wallsD}
            strokeWidth={unit * 0.62}
            data-testid="robots-map-walls"
          />
        )}
        {dividersD && !wallsD && !raster && <path className="rv-divider" d={dividersD} />}
        {zones.map((zone, i) => {
          const box = ringBox(zone);
          const k = Math.min(unit * 1.3, box.w / 4, box.h / 4);
          return (
            <g key={`ng${i}`} className="rv-nogo">
              <path d={roundedPath(zone, unit * 0.8)} />
              <g transform={`translate(${box.x + box.w / 2} ${box.y + box.h / 2})`}>
                <circle r={k} />
                <line x1={-k * 0.7} y1={k * 0.7} x2={k * 0.7} y2={-k * 0.7} />
              </g>
            </g>
          );
        })}
        {map.virtual_walls.map((w, i) => {
          const [x1, y1] = toView(frame, w[0]!, w[1]!);
          const [x2, y2] = toView(frame, w[2]!, w[3]!);
          return <line key={`vw${i}`} className="rv-wall" x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        <RobotLayer
          map={map}
          frame={frame}
          unit={unit}
          tone={tone}
          rooms={roomShapes}
          walls={walls}
          wallsD={wallsD}
          roomsD={roomsD}
        />
      </svg>
      <div className="rv-labels" aria-hidden="true">
        {placed.map((room) => {
          if (!room.name) return null;
          const badge = orderBadge(selected, room.id);
          // Keep the label clear of the robot: move it below (or above) the marker.
          const dy = robotView ? room.y - robotView[1] : Infinity;
          const shift =
            robotView && Math.abs(robotView[0] - room.x) < unit * 12 && Math.abs(dy) < unit * 5
              ? (dy >= 0 ? 1 : -1) * unit * 5 - dy
              : 0;
          if (room.small && badge === null) return null;
          return (
            <span
              key={room.id}
              className="rv-label"
              data-rv-label={room.id}
              data-selected={badge !== null || undefined}
              style={{
                left: pct(room.x, frame.width),
                top: pct(room.y + shift, frame.height),
              }}
            >
              {badge !== null && <b className="rv-badge">{badge}</b>}
              {room.name}
            </span>
          );
        })}
      </div>
      {callout && robotView && (
        <div
          className="rv-callout"
          role="note"
          data-rv-obstacle=""
          data-testid="robots-map-callout"
          data-below={robotView[1] < frame.height * 0.32 || undefined}
          data-align={
            robotView[0] < frame.width * 0.25
              ? 'start'
              : robotView[0] > frame.width * 0.75
                ? 'end'
                : undefined
          }
          style={{ left: pct(robotView[0], frame.width), top: pct(robotView[1], frame.height) }}
        >
          <b>{callout.title}</b>
          {callout.detail && <span>{callout.detail}</span>}
        </div>
      )}
      <LabelCollisions deps={`${map.digest}|${selected.join(',')}|${callout?.title ?? ''}`} />
    </div>
  );
}

function flatToView(frame: Frame, flat: number[]): Ring {
  const ring: Ring = [];
  for (let i = 0; i + 1 < flat.length; i += 2) ring.push(toView(frame, flat[i]!, flat[i + 1]!));
  return ring;
}

const polyline = (pts: Pt[]) => pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ');
/** Only the recent part of the route is drawn (older lanes would criss-cross the walls). */
const TRAIL_POINTS = 48;
const COVER_POINTS = 140;
/** Hops longer than this (in % of the map's longer side) are jumps, not glides. */
const GLIDE_MAX_GAP = 12;

/** Trail + dock + robot marker. The marker glides along the newly reported path. */
function RobotLayer({
  map,
  frame,
  unit,
  tone,
  rooms,
  walls,
  wallsD,
  roomsD,
}: {
  map: VectorMap;
  frame: Frame;
  unit: number;
  tone: MarkerTone;
  rooms: Ring[][];
  walls: Ring[];
  wallsD: string;
  roomsD: string;
}) {
  const maskId = `rv-trail-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const buffer = unit * 1.2;
  /** Recent trail only, split where it would leave the rooms or cut through a wall. */
  const guard = useMemo(() => segmentGuard(rooms, walls, buffer), [rooms, walls, buffer]);
  const trailD = (pts: Pt[]) =>
    clipTrail(pts, rooms, walls, buffer)
      .map((run) => smoothPath(run))
      .join('');
  const marker = useRef<SVGGElement>(null);
  const reveal = useRef<SVGPolylineElement>(null);
  const shown = useRef<{ pt: Pt; heading: number } | null>(null);
  const lastAt = useRef<number | null>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const coverRef = useRef<SVGPathElement>(null);
  const path = useMemo(
    () => pathPoints(map.path).map(([x, y]) => toView(frame, x, y)),
    [map.path, frame],
  );
  const target: Pt | null = map.robot ? toView(frame, map.robot.x, map.robot.y) : null;
  const heading = map.robot?.a != null ? -map.robot.a : null;
  const targetKey = target ? `${target[0].toFixed(1)},${target[1].toFixed(1)}` : '';

  useLayoutEffect(() => {
    if (!target) return;
    const now = performance.now();
    const interval = lastAt.current === null ? null : now - lastAt.current;
    lastAt.current = now;
    const from = shown.current?.pt ?? null;
    const plan = reduceMotion()
      ? { track: [target], travelled: path.length }
      : // Tween only along recorded points: never through a wall or across a gap in the path.
        planGlide(from, target, path, {
          blocked: (a, b) => !guard.ok(a, b),
          maxGap: unit * GLIDE_MAX_GAP,
        });
    // Static trail = already travelled part; the rest is revealed behind the gliding marker.
    const travelled = path.slice(0, plan.travelled);
    const trail = plan.track.length > 1 ? [...travelled, plan.track[0]!] : path;
    trailRef.current?.setAttribute('d', trailD(trail.slice(-TRAIL_POINTS)));
    coverRef.current?.setAttribute('d', trailD(trail.slice(-COVER_POINTS)));
    reveal.current?.setAttribute('points', plan.track.length > 1 ? polyline(plan.track) : '');
    reveal.current?.style.setProperty('stroke-dashoffset', plan.track.length > 1 ? '1' : '0');
    const place = (pt: Pt, deg: number) => {
      shown.current = { pt, heading: deg };
      marker.current?.setAttribute(
        'transform',
        `translate(${pt[0].toFixed(1)} ${pt[1].toFixed(1)}) rotate(${deg.toFixed(1)})`,
      );
    };
    if (plan.track.length < 2) {
      place(target, heading ?? shown.current?.heading ?? 0);
      reveal.current?.style.setProperty('stroke-dashoffset', '0');
      return;
    }
    const duration = glideDuration(interval);
    let frameId = 0;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = easeTravel(t);
      const p = pointAt(plan.track, eased);
      place([p.x, p.y], p.heading ?? shown.current?.heading ?? 0);
      reveal.current?.style.setProperty('stroke-dashoffset', String(1 - eased));
      if (t < 1) frameId = requestAnimationFrame(step);
      else if (heading !== null) place(target, heading);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the pose moves
  }, [targetKey, map.digest]);

  const trail = path;
  const dock = map.dock ? toView(frame, map.dock.x, map.dock.y) : null;
  const r = unit * 2.2;
  // Parked on the station (not just driving past it while cleaning).
  const docked =
    tone !== 'cleaning' &&
    !!dock &&
    !!target &&
    Math.hypot(dock[0] - target[0], dock[1] - target[1]) < r * 1.6;
  // Behind the robot = opposite its heading (it drives off the dock forwards).
  const back = heading === null ? null : ((heading + 180) * Math.PI) / 180;
  const dockShift: Pt =
    back === null ? [r * 1.2, -r * 1.2] : [Math.cos(back) * r * 1.7, Math.sin(back) * r * 1.7];
  const dockEl = dock ? (
    <g
      className="rv-dock"
      // Docked: the robot covers the charger, so the dock becomes a small badge next to
      // the robot (always up-right in screen space) plus a charging ring around it.
      transform={
        docked
          ? `translate(${(dock[0] + dockShift[0]).toFixed(1)} ${(dock[1] + dockShift[1]).toFixed(1)}) scale(0.7)`
          : `translate(${dock[0]} ${dock[1]})`
      }
      data-testid="robots-map-dock"
      data-docked={docked || undefined}
    >
      <circle className="rv-dock-glow" r={r * 1.6} />
      <rect x={-r * 0.95} y={-r * 0.95} width={r * 1.9} height={r * 1.9} rx={r * 0.62} />
      <path
        d={`M${-r * 0.15} ${-r * 0.5}L${-r * 0.42} ${r * 0.08}H${r * 0.1}L${-r * 0.1} ${r * 0.55}L${r * 0.42} ${-r * 0.08}H${-r * 0.06}Z`}
      />
    </g>
  ) : null;
  return (
    <g className="rv-robot-layer">
      {/* Smoothing may overshoot a corner: the mask keeps every stroke inside the rooms. */}
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={frame.width}
        height={frame.height}
      >
        <path
          d={roomsD}
          fill="#fff"
          stroke="#fff"
          strokeWidth={buffer * 2}
          strokeLinejoin="round"
        />
        {/* Walls are cut out of the mask: no trail stroke ever paints over a wall. */}
        {wallsD && (
          <path
            d={wallsD}
            fill="none"
            stroke="#000"
            strokeWidth={unit * 1.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </mask>
      <g mask={`url(#${maskId})`} data-testid="robots-map-trail">
        <path
          ref={coverRef}
          className="rv-cover"
          d={trailD(trail.slice(-COVER_POINTS))}
          // Narrower than the wall cut-out in the mask: coverage never shows past a wall.
          strokeWidth={unit * 0.9}
        />
        <path ref={trailRef} className="rv-trail" d={trailD(trail.slice(-TRAIL_POINTS))} />
        <polyline
          ref={reveal}
          className="rv-trail rv-trail-recent rv-trail-reveal"
          points=""
          pathLength={1}
        />
      </g>
      {!docked && dockEl}
      {target && (
        <g
          ref={marker}
          className="rv-bot"
          data-tone={tone}
          data-docked={docked || undefined}
          data-testid="robots-map-robot"
        >
          {tone === 'cleaning' && <circle className="rv-bot-pulse" r={r * 1.7} />}
          <path
            className="rv-bot-cone"
            d={`M0 0L${r * 2.5} ${-r * 1.3}A${r * 2.8} ${r * 2.8} 0 0 1 ${r * 2.5} ${r * 1.3}Z`}
          />
          <circle className="rv-bot-halo" r={r * 1.5} />
          <circle className="rv-bot-body" r={r} />
          <circle className="rv-bot-lidar" r={r * 0.3} cx={-r * 0.12} />
          <path
            className="rv-bot-heading"
            d={`M${r * 0.98} 0L${r * 0.5} ${-r * 0.32}Q${r * 0.62} 0 ${r * 0.5} ${r * 0.32}Z`}
          />
        </g>
      )}
      {docked && dockEl}
    </g>
  );
}

/** Hide labels that collide with each other or with the robot marker (real DOM rects). */
function LabelCollisions({ deps }: { deps: string }) {
  const probe = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = probe.current?.closest('.rv');
    if (!root) return;
    const run = () => {
      const labels = Array.from(root.querySelectorAll<HTMLElement>('.rv-label'));
      labels.forEach((el) => el.removeAttribute('data-hidden'));
      const bot = root.querySelector('.rv-bot-body')?.getBoundingClientRect();
      const obstacles = Array.from(root.querySelectorAll<HTMLElement>('[data-rv-obstacle]')).map(
        (el) => el.getBoundingClientRect(),
      );
      // Selected labels win, then the order in the DOM.
      labels.sort(
        (a, b) => Number(b.hasAttribute('data-selected')) - Number(a.hasAttribute('data-selected')),
      );
      const kept: DOMRect[] = [];
      for (const el of labels) {
        const box = el.getBoundingClientRect();
        if (!box.width) continue;
        const hit = (o: DOMRect) =>
          box.left < o.right - 1 &&
          box.right > o.left + 1 &&
          box.top < o.bottom - 1 &&
          box.bottom > o.top + 1;
        if (
          kept.some(hit) ||
          obstacles.some(hit) ||
          (bot && !el.hasAttribute('data-selected') && hit(bot))
        )
          el.setAttribute('data-hidden', '');
        else kept.push(box);
      }
    };
    run();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(run) : null;
    observer?.observe(root);
    return () => observer?.disconnect();
  }, [deps]);
  return <span ref={probe} hidden />;
}

/** Feature flag: `?mapa=obrazek` or localStorage `hb.robots.map = image` forces the PNG. */
export function vectorMapEnabled(): boolean {
  try {
    if (new URLSearchParams(globalThis.location?.search ?? '').get('mapa') === 'obrazek')
      return false;
    return globalThis.localStorage?.getItem('hb.robots.map') !== 'image';
  } catch {
    return true;
  }
}

/**
 * The vector drawing (shared-arc rooms, walls and dividers from one partition) is the
 * default. `?mapa=rastr` (or localStorage `hb.robots.map = raster`) shows the recoloured
 * bitmap instead – kept only as a comparison/fallback.
 */
export function rasterMode(): boolean {
  try {
    const query = new URLSearchParams(globalThis.location?.search ?? '').get('mapa');
    if (query === 'rastr') return true;
    if (query === 'vektor') return false;
    return globalThis.localStorage?.getItem('hb.robots.map') === 'raster';
  } catch {
    return false;
  }
}

export type ThemeName = 'light' | 'dark';

/** Resolved HomeBrain theme of the element (`[data-theme]` light/dark/system). */
export function themeOf(el: Element | null): ThemeName {
  const value = el?.closest('[data-theme]')?.getAttribute('data-theme');
  if (value === 'light' || value === 'dark') return value;
  if (value === 'system' && typeof globalThis.matchMedia === 'function')
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return value === 'system' ? 'light' : 'dark';
}

function useThemeName(ref: { current: Element | null }): ThemeName {
  return useSyncExternalStore(
    (notify) => {
      // First read after mount (the ref is empty during the first render).
      queueMicrotask(notify);
      const target = ref.current?.closest('[data-theme]');
      const observer =
        target && typeof MutationObserver === 'function' ? new MutationObserver(notify) : null;
      if (target) observer?.observe(target, { attributes: true, attributeFilter: ['data-theme'] });
      const media =
        typeof globalThis.matchMedia === 'function'
          ? globalThis.matchMedia('(prefers-color-scheme: dark)')
          : null;
      media?.addEventListener?.('change', notify);
      return () => {
        observer?.disconnect();
        media?.removeEventListener?.('change', notify);
      };
    },
    () => themeOf(ref.current),
    () => 'dark',
  );
}

interface BaseState {
  url: string;
  /** Wall layer, stacked above the selection tint and the trail. */
  wallsUrl: string;
  ready: boolean;
  onLoad: () => void;
  onError: () => void;
}

/**
 * Signed URLs of the raster base + wall layers for the current theme. `null` = vector
 * mode: no raster in the payload, no signer, `?mapa=vektor`, or the PNG failed to load/sign.
 */
function useRasterBase(
  raster: VectorMap['raster'],
  theme: ThemeName,
  resolve: Props['resolveBase'],
): BaseState | null {
  const path = raster && resolve ? raster.path.replace('{theme}', theme) : null;
  const [signed, setSigned] = useState<{ path: string; url: string; walls: string } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!path || !resolve || !raster) return;
    let cancelled = false;
    const wallsPath = raster.path.replace('{theme}', `${theme}-walls`);
    Promise.all([resolve(path), resolve(wallsPath)])
      .then(([url, walls]) => !cancelled && setSigned({ path, url, walls }))
      .catch(() => !cancelled && setFailed(path));
    return () => {
      cancelled = true;
    };
  }, [path, resolve, raster, theme]);
  if (!path || failed === path) return null;
  // Keep the previous bitmap while the next theme/digest is being signed (no flash).
  if (!signed) return { url: '', wallsUrl: '', ready: false, onLoad: () => {}, onError: () => {} };
  return {
    url: signed.url,
    wallsUrl: signed.walls,
    ready: loaded === signed.url,
    onLoad: () => setLoaded(signed.url),
    onError: () => setFailed(signed.path),
  };
}

/** Any render error in the vector map falls back to the image map. */
export class VectorMapBoundary extends Component<
  { fallback: ReactNode; resetKey: string; children: ReactNode },
  { failed: boolean; key: string }
> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failed: boolean; key: string },
  ) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function useNow(ms: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}
