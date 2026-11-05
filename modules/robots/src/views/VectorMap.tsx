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
import { findDoors, planDoorRoute, planRoute, trimLine } from '../map/route.js';
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
  finish: 'tile' | 'wood';
}

/**
 * One muted palette (oklch hues, low chroma in both themes): every room gets its own soft
 * colour like in the Roborock/Dreame apps; consecutive ids differ by ≥ 45° so neighbours separate.
 */
export const ROOM_HUES = [250, 195, 285, 165, 228, 310, 180, 265] as const;
/** Small lightness steps on top of the hue, so two similar hues still separate. */
export const ROOM_STEPS = [0, 1, 1, 2, 0, 1, 2, 0] as const;
/** Floor finish hint: tiles for wet rooms, planks elsewhere (texture only, very low contrast). */
export function roomFinish(name: string): 'tile' | 'wood' {
  return /koupel|wc|záchod|toalet|kuchy|prádel|technick|spíž|sprch|bath|kitchen|laundry/i.test(name)
    ? 'tile'
    : 'wood';
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
          finish: roomFinish(names.get(room.id) ?? ''),
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
  const rawRobot = map.robot ? toView(frame, map.robot.x, map.robot.y) : null;
  const dockView = map.dock ? toView(frame, map.dock.x, map.dock.y) : null;
  const botR = unit * 2.8;
  // The charger stands against its wall; a parked robot sits on its plate, inside the room.
  const dockGeo = useMemo(
    () => (dockView ? dockPose(dockView, walls, roomShapes, botR, unit * 0.42) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dockView is derived from map.dock
    [map.dock, walls, roomShapes, botR, unit, frame],
  );
  // Parked on the station (not just driving past it while cleaning).
  const docked =
    tone !== 'cleaning' &&
    !!dockGeo &&
    !!rawRobot &&
    Math.hypot(dockView![0] - rawRobot[0], dockView![1] - rawRobot[1]) < botR * 1.6;
  const robotView = docked ? dockGeo!.robot : rawRobot;
  const robotRoom = robotView
    ? placed.find((room) => containsPoint(room.rings, robotView[0], robotView[1]))?.id
    : undefined;
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
  const routeFrom = robotView ?? dockGeo?.robot ?? dockView;
  const routeKey = `${selected.join(',')}|${routeFrom?.map((n) => n.toFixed(0)).join(',') ?? ''}`;
  // Doors = gaps in the wall layer (door graph); the planned route only changes rooms there.
  const doors = useMemo(
    () => findDoors(roomShapes, walls, { minWidth: 550, maxWidth: 1500, joint: 60 }),
    [roomShapes, walls],
  );
  // Planned route: robot → selected rooms in order. Orthogonal legs over the door graph
  // (perpendicular through every door centre, never across a wall); the coarse grid A* is
  // only a fallback for open-plan seams without doors. Each leg stops inside its room short
  // of the order badge; direction chevrons keep clear of the badges too.
  const route = useMemo(() => {
    const none = {
      d: '',
      arrows: [] as [number, number, number][],
      stops: [] as Pt[],
      runs: [] as Pt[][],
      kind: null as 'doors' | 'grid' | null,
    };
    if (!selected.length || !routeFrom || raster || !walls.length) return none;
    const rooms = selected
      .map((id) => placed.find((room) => room.id === id))
      .filter((room): room is Placed => !!room);
    const badges = rooms.map((room): Pt => [room.x, room.y]);
    const viaDoors = planDoorRoute(
      roomShapes,
      walls,
      doors,
      routeFrom,
      rooms.map((room) => placed.indexOf(room)),
      {
        clearance: unit * 0.9,
        approach: unit * 1.8,
        depth: unit * 6,
        avoid: badges,
        avoidRadius: unit * 4.2,
      },
    );
    let legs: Pt[][];
    let joined: { runs: Pt[][]; stops: Pt[] };
    if (viaDoors) {
      legs = viaDoors;
      joined = joinLegs(legs, [], unit * 4);
    } else {
      const cell = Math.max(unit * 1.4, Math.sqrt((frame.width * frame.height) / 12_000));
      legs = planRoute(roomShapes, walls, routeFrom, badges, { cell, clearance: unit * 1.6 });
      if (!legs.length) return none;
      joined = joinLegs(
        legs,
        rooms.map((room) => room.rings),
        unit * 4,
      );
    }
    const { runs, stops } = joined;
    const first = runs[0] ? trimLine(runs[0], unit * 3.4, 0) : [];
    const all = [first, ...runs.slice(1)].filter((run) => run.length > 1);
    if (!all.length) return none;
    return {
      d: all.map((run) => roundedLine(run, unit * 1.6)).join(''),
      // Chevrons along each run (not on stops or badges), one arrowhead at each run end.
      arrows: all.flatMap((run) => [
        ...arrowsAlong(run, unit * 12, unit * 5, [...stops, ...badges], unit * 4),
        endArrow(run),
      ]),
      stops,
      runs: all,
      kind: viaDoors ? ('doors' as const) : ('grid' as const),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routeKey covers selection + pose
  }, [routeKey, placed, walls, doors, roomShapes, unit, frame, raster]);
  const routeD = route.d;

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
          {/* Floor finish hints: planks and tiles, one hairline colour at very low contrast. */}
          <pattern
            id={`${clipId}-wood`}
            patternUnits="userSpaceOnUse"
            width={unit * 30}
            height={unit * 3.2}
          >
            <path
              className="rv-grain"
              d={`M0 0H${unit * 30}M0 ${unit * 1.6}H${unit * 30}M${unit * 7} 0V${unit * 1.6}M${unit * 22} ${unit * 1.6}V${unit * 3.2}`}
              strokeWidth={unit * 0.1}
            />
          </pattern>
          <pattern
            id={`${clipId}-tile`}
            patternUnits="userSpaceOnUse"
            width={unit * 5}
            height={unit * 5}
          >
            <path
              className="rv-grain"
              d={`M0 0H${unit * 5}M0 0V${unit * 5}`}
              strokeWidth={unit * 0.1}
            />
          </pattern>
          <linearGradient id={`${clipId}-light`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor="var(--rv-light)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--rv-light)" stopOpacity="0" />
          </linearGradient>
          <filter id={`${clipId}-soft`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={unit * 0.9} />
          </filter>
          <filter id={`${clipId}-lift`} x="-10%" y="-10%" width="120%" height="125%">
            <feGaussianBlur stdDeviation={unit * 1.6} />
          </filter>
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
            {/* Soft lift: the whole plan casts one blurred shadow onto the panel. */}
            {wallsD && (
              <path
                className="rv-lift"
                d={floor || roomsD}
                transform={`translate(0 ${unit * 0.9})`}
                filter={`url(#${clipId}-lift)`}
              />
            )}
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
        {wallsD && !raster && (
          <g className="rv-depth" clipPath={floor ? `url(#${clipId}-floor)` : undefined}>
            {placed.map((room) => (
              <path
                key={room.id}
                className="rv-texture"
                d={room.d}
                fill={`url(#${clipId}-${room.finish})`}
                data-finish={room.finish}
              />
            ))}
            <path className="rv-light" d={roomsD} fill={`url(#${clipId}-light)`} />
            {/* Inner depth: a blurred band along every wall, so rooms read as soft recessed tiles. */}
            <path
              className="rv-wall-shadow"
              d={wallsD}
              strokeWidth={unit * 1.5}
              filter={`url(#${clipId}-soft)`}
            />
          </g>
        )}
        {/* Outline and room seams are the same shared arcs (backend topology), drawn as plain
            strokes in one colour: the shell slightly heavier, seams meet it in clean T joints. */}
        {wallsD && dividersD && !raster && (
          <path className="rv-wall-line rv-seam" d={dividersD} strokeWidth={unit * 0.24} />
        )}
        {wallsD && !raster && (
          <path
            className="rv-wall-line"
            d={wallsD}
            strokeWidth={unit * 0.42}
            data-testid="robots-map-walls"
          />
        )}
        {dividersD && !wallsD && !raster && <path className="rv-divider" d={dividersD} />}
        {/* Selection = the room's own colour, stronger, plus an accent outline on the INNER side
            of its walls (stroke clipped to the room), so the wall line keeps its look; the
            outline opens exactly at the door gaps (mask), like the walls do. */}
        {wallsD && !raster && selected.length > 0 && (
          <defs>
            <mask id={`${clipId}-doors`} maskUnits="userSpaceOnUse">
              <rect width={frame.width} height={frame.height} fill="#fff" />
              {doors.map((door, i) => (
                <line
                  key={i}
                  x1={door.a[0]}
                  y1={door.a[1]}
                  x2={door.b[0]}
                  y2={door.b[1]}
                  stroke="#000"
                  strokeWidth={unit * 2.4}
                />
              ))}
            </mask>
            {placed
              .filter((room) => selected.includes(room.id))
              .map((room) => (
                <clipPath key={room.id} id={`${clipId}-sel-${room.id}`}>
                  <path d={room.d} />
                </clipPath>
              ))}
          </defs>
        )}
        {wallsD &&
          !raster &&
          placed
            .filter((room) => selected.includes(room.id))
            .map((room) => (
              <g
                key={`sel${room.id}`}
                className="rv-sel"
                data-testid={`robots-map-sel-${room.id}`}
                mask={`url(#${clipId}-doors)`}
              >
                <path
                  className="rv-sel-line"
                  d={room.d}
                  strokeWidth={unit * 1.3}
                  clipPath={`url(#${clipId}-sel-${room.id})`}
                />
              </g>
            ))}
        {routeD && (
          <g className="rv-route-layer">
            <path className="rv-route-casing" d={routeD} />
            <path
              className="rv-route"
              d={routeD}
              data-rv-avoid="4"
              data-rv-pts={ptsAttr(route.runs)}
              data-route={route.kind ?? undefined}
              data-testid="robots-map-route"
            />
            {route.arrows.map(([x, y, deg], i) => (
              <path
                key={`ar${i}`}
                className="rv-route-arrow"
                data-testid="robots-map-route-arrow"
                transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})`}
                d={`M${-unit * 0.7} ${-unit * 0.95}L${unit * 0.55} 0L${-unit * 0.7} ${unit * 0.95}`}
              />
            ))}
          </g>
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
          dockGeo={dockGeo}
          docked={docked}
          r={botR}
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

/** Polyline vertices for the label-collision pass (`x,y x,y|x,y …`, view units). */
function ptsAttr(runs: [number, number][][]): string {
  return runs
    .map((run) => run.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' '))
    .join('|');
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
  dockGeo,
  docked,
  r,
}: {
  tailId: string;
  dockGeo: DockGeo | null;
  docked: boolean;
  r: number;
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
  // Parked: the marker sits on the dock plate facing into the room (pose from the dock geometry).
  const target: Pt | null =
    docked && dockGeo ? dockGeo.robot : map.robot ? toView(frame, map.robot.x, map.robot.y) : null;
  const heading = docked && dockGeo ? dockGeo.angle : map.robot?.a != null ? -map.robot.a : null;
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
  // Dedicated charger glyph: tower against the wall + a plate the robot parks on.
  const dockEl = dockGeo ? (
    <g
      className="rv-dock"
      transform={`translate(${dockGeo.station[0].toFixed(1)} ${dockGeo.station[1].toFixed(1)}) rotate(${dockGeo.angle.toFixed(1)})`}
      data-testid="robots-map-dock"
      data-docked={docked || undefined}
    >
      <rect
        className="rv-dock-plate"
        x={-r * 0.45}
        y={-r * 1.2}
        width={r * 2.6}
        height={r * 2.4}
        rx={r * 0.7}
      />
      <rect
        className="rv-dock-body"
        x={-r * 0.5}
        y={-r * 1.15}
        width={r * 0.95}
        height={r * 2.3}
        rx={r * 0.34}
      />
      <g transform={`rotate(${(-dockGeo.angle).toFixed(1)})`}>
        <path
          className="rv-dock-bolt"
          d={`M${r * 0.08} ${-r * 0.5}L${-r * 0.24} ${r * 0.06}H${r * 0.02}L${-r * 0.08} ${r * 0.5}L${r * 0.24} ${-r * 0.06}H${-r * 0.02}Z`}
        />
      </g>
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
          data-rv-pts={ptsAttr([trail.slice(-COVER_POINTS)])}
        />
        <path
          ref={trailRef}
          className="rv-trail rv-trail-tail"
          d={trailD(trail.slice(-TRAIL_POINTS))}
          data-rv-avoid="4"
          data-rv-pts={ptsAttr([trail.slice(-TRAIL_POINTS)])}
          stroke={`url(#${tailId})`}
        />
        <polyline
          ref={reveal}
          className="rv-trail rv-trail-recent rv-trail-reveal"
          points=""
          pathLength={1}
        />
      </g>
      {dockEl}
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
          <path
            className="rv-bot-bumper"
            d={`M${r * 0.42} ${-r * 0.82}A${r * 0.93} ${r * 0.93} 0 0 1 ${r * 0.42} ${r * 0.82}`}
            strokeWidth={r * 0.16}
          />
          <circle className="rv-bot-lidar" r={r * 0.36} cx={-r * 0.18} />
          <path
            className="rv-bot-heading"
            d={`M${r * 0.98} 0L${r * 0.5} ${-r * 0.32}Q${r * 0.62} 0 ${r * 0.5} ${r * 0.32}Z`}
          />
        </g>
      )}
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
          if (!el.getAttribute('data-rv-pts')) continue;
          const kind = el.getAttribute('data-rv-avoid');
          const r =
            kind === 'cover' ? (Number(el.getAttribute('stroke-width')) * scale) / 2 : Number(kind);
          // Sample the polyline vertices in JS (the element carries them): getPointAtLength
          // on long smoothed trails is O(length) per call and froze the main thread for
          // seconds on every selection change (desktop e2e 'not stable' timeouts).
          const step = Math.max(1, 6 / scale);
          for (const run of (el.getAttribute('data-rv-pts') ?? '').split('|')) {
            const pts = run
              .split(' ')
              .filter(Boolean)
              .map((xy) => xy.split(',').map(Number) as [number, number]);
            for (let i = 0; i < pts.length; i++) {
              const [bx, by] = pts[i]!;
              const [ax, ay] = pts[i - 1] ?? pts[i]!;
              const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
              for (let k = i ? 1 : 0; k <= n; k++) {
                const t = k / n;
                const p = new DOMPoint(ax + (bx - ax) * t, ay + (by - ay) * t).matrixTransform(ctm);
                samples.push({ x: p.x, y: p.y, r: r + 2 });
              }
            }
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
  const wallsPath = raster && resolve ? raster.path.replace('{theme}', `${theme}-walls`) : null;
  const [signed, setSigned] = useState<{ path: string; url: string; walls: string } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Keyed on the path STRINGS: every map poll brings a new `raster` object, and re-signing
  // then (HA returns a fresh signature each time) swapped the href, so the base fell back
  // to 'loading' and re-downloaded the PNG on every poll.
  useEffect(() => {
    if (!path || !wallsPath || !resolve) return;
    let cancelled = false;
    Promise.all([resolve(path), resolve(wallsPath)])
      .then(([url, walls]) => !cancelled && setSigned({ path, url, walls }))
      .catch(() => !cancelled && setFailed(path));
    return () => {
      cancelled = true;
    };
  }, [path, wallsPath, resolve]);
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

export interface DockGeo {
  /** Wall point the charger stands against. */
  foot: Pt;
  /** Centre of the charger tower. */
  station: Pt;
  /** Where a parked robot sits (on the dock plate, inside the room). */
  robot: Pt;
  /** Direction into the room (degrees, SVG). */
  angle: number;
}

/** Charger pose from the reported dock point: snap to the nearest wall, face into the room. */
export function dockPose(
  at: Pt,
  walls: Ring[],
  rooms: Ring[][],
  r: number,
  wallWidth: number,
): DockGeo | null {
  let best = Infinity;
  let foot: Pt = at;
  for (const wall of walls)
    for (let i = 1; i < wall.length; i++) {
      const [ax, ay] = wall[i - 1]!;
      const [bx, by] = wall[i]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - ay) * dy) / len)) : 0;
      const p: Pt = [ax + dx * t, ay + dy * t];
      const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
      if (d < best) {
        best = d;
        foot = p;
      }
    }
  let nx = at[0] - foot[0];
  let ny = at[1] - foot[1];
  if (best > r * 4 || Math.hypot(nx, ny) < 1e-6) {
    // Free-standing dock (no wall close by): face the room's visual centre.
    const home = rooms.find((rings) => containsPoint(rings, at[0], at[1]));
    if (!home) return null;
    const [cx, cy] = polylabel(home, r / 4);
    foot = at;
    nx = cx - at[0];
    ny = cy - at[1];
  }
  const n = Math.hypot(nx, ny) || 1;
  nx /= n;
  ny /= n;
  const base = wallWidth / 2 + r * 0.22;
  return {
    foot,
    station: [foot[0] + nx * (base + r * 0.5), foot[1] + ny * (base + r * 0.5)],
    robot: [foot[0] + nx * (base + r * 1.3 + r), foot[1] + ny * (base + r * 1.3 + r)],
    angle: (Math.atan2(ny, nx) * 180) / Math.PI,
  };
}

const densify = (pts: Pt[], step: number): Pt[] => {
  const out: Pt[] = pts.length ? [pts[0]!] : [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
};

/**
 * Joins route legs into one line. Each leg stops `depth` inside its target room instead of the
 * room centre, and the next leg leaves from there (straight when no wall is in the way), so the
 * line never doubles back on itself inside a room.
 */
export function joinLegs(
  legs: Pt[][],
  targets: Ring[][],
  depth: number,
): { runs: Pt[][]; stops: Pt[] } {
  const step = depth / 6;
  const near = depth * 0.3;
  const drawn: Pt[][] = [];
  const stops: Pt[] = [];
  const nearDrawn = (p: Pt) => drawn.some((run) => distToLine(p, run) < near);
  legs.forEach((leg, i) => {
    let line = densify(leg, step);
    if (i > 0) {
      // The robot drives back along the part it already took: draw only the new branch,
      // starting where it leaves the drawn route (or where it leaves the previous room).
      const prev = targets[i - 1];
      let k = prev ? line.findIndex((p) => !containsPoint(prev, p[0], p[1])) : 0;
      if (k < 0) k = 0;
      const onRoute = line.findIndex((p, j) => j >= k && nearDrawn(p));
      if (onRoute >= 0) {
        let off = line.findIndex((p, j) => j > onRoute && !nearDrawn(p));
        if (off < 0) off = line.length - 1;
        k = Math.max(0, off - 2);
      }
      line = line.slice(k);
    }
    const room = targets[i];
    let end = line.length - 1;
    if (room) {
      const enter = line.findIndex((p) => containsPoint(room, p[0], p[1]));
      if (enter >= 0) end = Math.min(line.length - 1, enter + 6);
    }
    const run = simplifyLine(line.slice(0, end + 1), step * 0.35);
    if (run.length > 1) {
      drawn.push(run);
      stops.push(run[run.length - 1]!);
    }
  });
  return { runs: drawn, stops };
}

function distToLine(p: Pt, line: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!;
    const [bx, by] = line[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p[0] - ax - dx * t, p[1] - ay - dy * t));
  }
  return best;
}

/** Drops nearly collinear points (keeps rounding radii sensible after densify). */
function simplifyLine(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = [true, ...pts.slice(1, -1).map(() => false), true];
  const rdp = (a: number, b: number) => {
    let max = 0;
    let idx = -1;
    const [ax, ay] = pts[a]!;
    const [bx, by] = pts[b]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]!;
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = true;
      rdp(a, idx);
      rdp(idx, b);
    }
  };
  rdp(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}

/** Direction chevrons every `gap` along the line, away from its ends and from the stops. */
export function arrowsAlong(
  pts: Pt[],
  gap: number,
  start: number,
  stops: Pt[],
  keepOut: number,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  let next = start;
  let walked = 0;
  for (let i = 1; i < pts.length && next < total - keepOut; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const len = Math.hypot(bx - ax, by - ay);
    while (next <= walked + len && next < total - keepOut) {
      const t = (next - walked) / (len || 1);
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      // Not on a corner fillet (the line bends there) and not on a stop marker.
      const nearCorner =
        Math.min(next - walked, walked + len - next) < keepOut * 0.9 && len > keepOut * 2;
      if (!nearCorner && stops.every(([sx, sy]) => Math.hypot(sx - x, sy - y) > keepOut))
        out.push([x, y, (Math.atan2(by - ay, bx - ax) * 180) / Math.PI]);
      next += nearCorner ? keepOut * 0.5 : gap;
    }
    walked += len;
  }
  return out;
}

function endArrow(run: Pt[]): [number, number, number] {
  const [x, y] = run[run.length - 1]!;
  const [px, py] = run[run.length - 2]!;
  return [x, y, (Math.atan2(y - py, x - px) * 180) / Math.PI];
}
