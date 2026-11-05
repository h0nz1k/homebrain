import {
  Component,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
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
import { planRoute, trimLine } from '../map/route.js';
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
  /** Hue (oklch degrees) and lightness step (0–2) of the room's tonal fill. */
  hue: number;
  step: number;
  name: string;
  d: string;
  rings: Ring[];
  x: number;
  y: number;
  small: boolean;
}

/** One cool, low-chroma family (oklch hues): neighbours differ slightly, the accent stays the only loud colour. */
export const ROOM_HUES = [250, 215, 275, 200, 240, 290, 225, 260] as const;
/** Small lightness steps so neighbouring tiles separate without colour noise. */
export const ROOM_STEPS = [0, 2, 1, 2, 0, 1, 2, 0] as const;

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
      map.rooms.map((room, index) => {
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
          hue: ROOM_HUES[index % ROOM_HUES.length]!,
          step: ROOM_STEPS[index % ROOM_STEPS.length]!,
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
  const dockView = map.dock ? toView(frame, map.dock.x, map.dock.y) : null;
  const routeFrom = robotView ?? dockView;
  const routeKey = `${selected.join(',')}|${routeFrom?.map((n) => n.toFixed(0)).join(',') ?? ''}`;
  // Planned route: robot → selected rooms in order, through the doors (dashed preview).
  const routeD = useMemo(() => {
    if (!selected.length || !routeFrom || raster || !walls.length) return '';
    const targets = selected
      .map((id) => placed.find((room) => room.id === id))
      .filter((room): room is Placed => !!room)
      .map((room): [number, number] => [room.x, room.y]);
    const cell = Math.max(unit * 1.4, Math.sqrt((frame.width * frame.height) / 12_000));
    const legs = planRoute(roomShapes, walls, routeFrom, targets, {
      cell,
      clearance: unit * 1.6,
    });
    // Legs end in the order badges (drawn on top), the first one starts at the robot's rim.
    return legs
      .map((leg, i) => trimLine(leg, i === 0 ? unit * 3 : 0, 0))
      .filter((leg) => leg.length > 1)
      .map((leg) => roundedLine(leg, unit * 2.4))
      .join('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routeKey covers selection + pose
  }, [routeKey, placed, walls, roomShapes, unit, frame, raster]);

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
        <linearGradient id={`${clipId}-tail`} gradientUnits="userSpaceOnUse" data-rv-tail="">
          <stop offset="0" stopColor="var(--rv-trail)" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="var(--rv-trail)" stopOpacity="0.75" />
          <stop offset="1" stopColor="var(--rv-trail)" stopOpacity="1" />
        </linearGradient>
        {!raster && floor && (
          <clipPath id={`${clipId}-floor`}>
            <path d={floor} />
          </clipPath>
        )}
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
        {/* Under-layer: every room widened in its own tone (clipped to the floor outline), so
            fills meet across door gaps and wall bands; selected rooms go first, so a doorway
            never shows the accent of the neighbour. */}
        {wallsD && !raster && (
          <g className="rv-rooms-under" clipPath={floor ? `url(#${clipId}-floor)` : undefined}>
            {[...placed]
              .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)))
              .map((room) => (
                <path
                  key={room.id}
                  className="rv-room-under"
                  d={room.d}
                  strokeWidth={unit * 1.6}
                  data-selected={selected.includes(room.id) || undefined}
                  style={{ '--rv-hue': room.hue, '--rv-step': room.step } as CSSProperties}
                />
              ))}
          </g>
        )}
        <g className="rv-rooms">
          {placed.map((room) => {
            const badge = orderBadge(selected, room.id);
            return (
              <path
                key={room.id}
                className="rv-room"
                d={room.d}
                style={{ '--rv-hue': room.hue, '--rv-step': room.step } as CSSProperties}
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
          <path className="rv-wall-line rv-seam" d={dividersD} strokeWidth={unit * 0.3} />
        )}
        {wallsD && !raster && (
          <path
            className="rv-wall-line"
            d={wallsD}
            strokeWidth={unit * 0.55}
            data-testid="robots-map-walls"
          />
        )}
        {dividersD && !wallsD && !raster && <path className="rv-divider" d={dividersD} />}
        {/* Selection = an accent outline on the room's side of its walls (clipped to the room,
            so it never doubles the wall line) over a light tint. */}
        {wallsD &&
          !raster &&
          placed
            .filter((room) => selected.includes(room.id))
            .map((room) => (
              <g key={`sel${room.id}`} className="rv-sel" data-testid={`robots-map-sel-${room.id}`}>
                <clipPath id={`${clipId}-sel-${room.id}`}>
                  <path d={room.d} />
                </clipPath>
                {/* The room's own walls (door gaps stay open), only their inner side. */}
                <path
                  className="rv-sel-line"
                  d={wallsD}
                  clipPath={`url(#${clipId}-sel-${room.id})`}
                  strokeWidth={unit * 1.0}
                />
              </g>
            ))}
        {routeD && (
          <path className="rv-route" d={routeD} data-rv-avoid="4" data-testid="robots-map-route" />
        )}
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
          tailId={`${clipId}-tail`}
        />
      </svg>
      <div className="rv-labels" aria-hidden="true">
        {placed.map((room) => {
          if (!room.name) return null;
          const badge = orderBadge(selected, room.id);
          return (
            <span
              key={room.id}
              className="rv-label"
              data-rv-label={room.id}
              data-selected={badge !== null || undefined}
              style={{
                ['--rv-hue' as string]: room.hue,
                ['--rv-step' as string]: room.step,
                left: pct(room.x, frame.width),
                top: pct(room.y, frame.height),
              }}
            >
              {badge !== null && <b className="rv-badge">{badge}</b>}
              <span className="rv-label-text">{room.name}</span>
            </span>
          );
        })}
      </div>
      {robotView && (
        // Where the robot ends up (it may still be gliding): labels move out of this spot.
        <span
          className="rv-bot-spot"
          data-rv-bot-spot=""
          style={{
            left: pct(robotView[0], frame.width),
            top: pct(robotView[1], frame.height),
            width: pct(unit * 6.2, frame.width),
            height: pct(unit * 6.2, frame.height),
          }}
        />
      )}
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
      <LabelCollisions
        deps={`${map.digest}|${routeKey}|${callout?.title ?? ''}|${routeD.length}`}
      />
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
const TRAIL_POINTS = 8;
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
  tailId,
}: {
  tailId: string;
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
    // Fading tail: the gradient runs from the oldest drawn point to the robot.
    const tail = trail.slice(-TRAIL_POINTS);
    const grad = trailRef.current?.ownerSVGElement?.getElementById(tailId);
    if (grad && tail.length > 1) {
      const [x1, y1] = tail[0]!;
      const [x2, y2] = target;
      const far = Math.hypot(x2 - x1, y2 - y1) < unit ? [x1 + unit, y1] : [x2, y2];
      grad.setAttribute('x1', x1.toFixed(1));
      grad.setAttribute('y1', y1.toFixed(1));
      grad.setAttribute('x2', far[0]!.toFixed(1));
      grad.setAttribute('y2', far[1]!.toFixed(1));
    }
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
  const dockAt = map.dock ? toView(frame, map.dock.x, map.dock.y) : null;
  // The charger stands against a wall: draw its badge a little inside the room, so it never
  // sits on (or bleeds over) the wall line.
  const dock = useMemo<Pt | null>(() => {
    if (!dockAt) return null;
    const home = rooms.find((rings) => containsPoint(rings, dockAt[0], dockAt[1]));
    if (!home) return dockAt;
    const [cx, cy] = polylabel(home, unit / 2);
    const dist = Math.hypot(cx - dockAt[0], cy - dockAt[1]);
    const k = dist > 0 ? Math.min(unit * 2.4, dist) / dist : 0;
    return [dockAt[0] + (cx - dockAt[0]) * k, dockAt[1] + (cy - dockAt[1]) * k];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dockAt is derived from map.dock
  }, [map.dock, rooms, frame, unit]);
  const r = unit * 2.5;
  // Parked on the station (not just driving past it while cleaning).
  const docked =
    tone !== 'cleaning' &&
    !!dock &&
    !!target &&
    Math.hypot(dockAt![0] - target[0], dockAt![1] - target[1]) < r * 1.6;
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
          // Wide enough that neighbouring lanes merge into one swept area (≈ 20 cm lanes).
          strokeWidth={unit * 1.7}
          data-rv-avoid="cover"
        />
        <path
          ref={trailRef}
          className="rv-trail rv-trail-tail"
          d={trailD(trail.slice(-TRAIL_POINTS))}
          data-rv-avoid="4"
          stroke={`url(#${tailId})`}
        />
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
            d={`M0 0L${r * 2.1} ${-r * 0.95}A${r * 2.3} ${r * 2.3} 0 0 1 ${r * 2.1} ${r * 0.95}Z`}
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

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;

/**
 * Real-DOM label layout: fit each label into its room (one line → wrapped → badge only, the
 * font size never changes), move it off the robot and the drawn routes (route preview, trail,
 * swept area) to the nearest free spot inside its room, then hide what still collides
 * (selected labels win).
 */
function LabelCollisions({ deps }: { deps: string }) {
  const probe = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = probe.current?.closest('.rv');
    if (!root) return;
    const run = () => {
      const labels = Array.from(root.querySelectorAll<HTMLElement>('.rv-label'));
      labels.forEach((el) => {
        el.removeAttribute('data-hidden');
        el.removeAttribute('data-fit');
        el.style.removeProperty('--rv-nudge');
        el.style.removeProperty('--rv-nudge-x');
        el.style.removeProperty('--rv-maxw');
        el.removeAttribute('data-flip');
      });
      const bot = root.querySelector('[data-rv-bot-spot]')?.getBoundingClientRect();
      const svg = root.querySelector('svg');
      const ctm = svg && typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
      const scale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      // Screen-space samples of everything drawn as a route, with the stroke's half width.
      const samples: { x: number; y: number; r: number }[] = [];
      if (ctm)
        for (const el of Array.from(root.querySelectorAll<SVGPathElement>('[data-rv-avoid]'))) {
          if (typeof el.getTotalLength !== 'function' || !el.getAttribute('d')) continue;
          const kind = el.getAttribute('data-rv-avoid');
          const r =
            kind === 'cover' ? (Number(el.getAttribute('stroke-width')) * scale) / 2 : Number(kind);
          const total = el.getTotalLength();
          const step = Math.max(1, 6 / scale);
          for (let len = 0; len <= total; len += step) {
            const p = el.getPointAtLength(len).matrixTransform(ctm);
            samples.push({ x: p.x, y: p.y, r: r + 2 });
          }
        }
      const inv = ctm?.inverse() ?? null;
      const insideRoom = (
        room: SVGGeometryElement | null,
        box: DOMRect,
        dx: number,
        dy: number,
      ) => {
        if (!room || !inv || typeof room.isPointInFill !== 'function') return true;
        const corners: [number, number][] = [
          [box.left + dx, box.top + dy],
          [box.right + dx, box.top + dy],
          [box.left + dx, box.bottom + dy],
          [box.right + dx, box.bottom + dy],
        ];
        return corners.every(([x, y]) =>
          room.isPointInFill(new DOMPoint(x, y).matrixTransform(inv)),
        );
      };
      const blocked = (
        box: DOMRect,
        dx: number,
        dy: number,
        ignore?: (p: { x: number; y: number }) => boolean,
      ) =>
        (bot &&
          box.left + dx < bot.right &&
          box.right + dx > bot.left &&
          box.top + dy < bot.bottom &&
          box.bottom + dy > bot.top) ||
        samples.some(
          (p) =>
            !ignore?.(p) &&
            p.x > box.left + dx - p.r &&
            p.x < box.right + dx + p.r &&
            p.y > box.top + dy - p.r &&
            p.y < box.bottom + dy + p.r,
        );
      for (const el of labels) {
        const roomEl = root.querySelector<SVGGeometryElement>(
          `[data-testid='robots-map-room-${el.dataset.rvLabel}']`,
        );
        const room = roomEl?.getBoundingClientRect();
        if (!room?.width) continue;
        // Full labels keep a comfortable margin to the walls; wrapped ones may get closer.
        const fits = (pad = 16) => {
          const box = el.getBoundingClientRect();
          return box.width <= room.width - pad && box.height <= room.height - pad * 0.75;
        };
        if (!fits()) {
          el.setAttribute('data-fit', 'compact');
          el.style.setProperty('--rv-maxw', `${Math.max(40, room.width - 10).toFixed(0)}px`);
          if (!fits(6)) {
            if (el.hasAttribute('data-selected')) el.setAttribute('data-fit', 'badge');
            else {
              el.setAttribute('data-hidden', '');
              continue;
            }
          }
        }
        const box = el.getBoundingClientRect();
        if (el.hasAttribute('data-selected')) {
          // The order badge sits on the room's anchor and is the route's waypoint: the route
          // may end there, but the name flips to the other side when the route runs under it.
          const fit = el.getAttribute('data-fit');
          const ax = fit ? box.left + box.width / 2 : box.left + 11;
          const ay = fit ? box.top + 11 : box.top + box.height / 2;
          const own = (p: { x: number; y: number }) => Math.hypot(p.x - ax, p.y - ay) < 18;
          if (!fit && (blocked(box, 0, 0, own) || box.right > room.right - 6)) {
            el.setAttribute('data-flip', '');
            const flipped = el.getBoundingClientRect();
            if (flipped.left < room.left + 6) {
              // Neither side fits: badge on the anchor, the name centred under it.
              el.removeAttribute('data-flip');
              el.setAttribute('data-fit', 'compact');
              el.style.setProperty('--rv-maxw', `${Math.max(40, room.width - 10).toFixed(0)}px`);
            } else if (blocked(flipped, 0, 0, own) && box.right <= room.right - 6)
              el.removeAttribute('data-flip');
          }
          continue;
        }
        if (!blocked(box, 0, 0)) continue;
        // Nearest free spot inside the room: rings of candidate offsets around the centre.
        const sx = box.width * 0.5 + 4;
        const sy = box.height * 0.5 + 4;
        let best: [number, number] | null = null;
        for (let k = 1; k <= 6 && !best; k++)
          for (const [ux, uy] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ] as const) {
            const dx = ux * sx * k * 0.6;
            const dy = uy * sy * k * 0.6;
            if (!blocked(box, dx, dy) && insideRoom(roomEl, box, dx, dy)) {
              best = [dx, dy];
              break;
            }
          }
        if (best) {
          el.style.setProperty('--rv-nudge-x', `${best[0].toFixed(1)}px`);
          el.style.setProperty('--rv-nudge', `${best[1].toFixed(1)}px`);
        } else if (bot && blocked(box, 0, 0) && overlaps(box, bot)) {
          // Under the robot with no free spot: hide (a route under a label is acceptable).
          el.setAttribute('data-hidden', '');
        }
      }
      const obstacles = Array.from(root.querySelectorAll<HTMLElement>('[data-rv-obstacle]')).map(
        (el) => el.getBoundingClientRect(),
      );
      // Selected labels win, then the order in the DOM.
      labels.sort(
        (a, b) => Number(b.hasAttribute('data-selected')) - Number(a.hasAttribute('data-selected')),
      );
      const kept: DOMRect[] = [];
      for (const el of labels) {
        if (el.hasAttribute('data-hidden')) continue;
        const box = el.getBoundingClientRect();
        if (!box.width) continue;
        const hit = (o: DOMRect) => overlaps(box, o);
        if (kept.some(hit) || obstacles.some(hit) || (bot && hit(bot)))
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
