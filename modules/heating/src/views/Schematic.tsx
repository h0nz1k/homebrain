import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  fmtNum,
  fmtT,
  particleDuration,
  polylineKeyframes,
  polylineLength,
  tempColor,
  waterColor,
  type Pt,
  type SchematicState,
} from '../model.js';
import type { HeatingSnapshot } from '../types.js';

/** Geometry of the hydraulic picture; `wide` for cards ≥ 640 px, `tall` for phones. */
export interface SchematicLayout {
  w: number;
  h: number;
  soil: { x: number; y: number; w: number; h: number };
  /** Brine loop: HP → down → serpentine through the soil → back up to the HP. */
  brine: Pt[];
  hp: { x: number; y: number; w: number; h: number };
  comp: Pt;
  pumps: { primary: Pt; charge: Pt; house: Pt; circulation: Pt };
  charge: Pt[];
  valve: Pt;
  toTank: Pt[];
  toDhw: Pt[];
  chargeReturn: Pt[];
  tank: { x: number; y: number; w: number; h: number };
  house: { outline: Pt[]; radiators: Array<{ x: number; y: number; w: number; h: number }> };
  houseLoop: Pt[];
  dhw: Pt[];
  tap: Pt;
  labels: Record<
    'outdoor' | 'collector' | 'hp' | 'tank' | 'house' | 'dhw' | 'valve',
    { at: Pt; align: 'l' | 'c' | 'r' }
  >;
}

export const LAYOUTS: Record<'wide' | 'tall', SchematicLayout> = {
  wide: {
    w: 1000,
    h: 430,
    soil: { x: 24, y: 318, w: 540, h: 104 },
    brine: [
      [350, 292],
      [350, 346],
      [70, 346],
      [70, 364],
      [466, 364],
      [466, 382],
      [70, 382],
      [70, 400],
      [496, 400],
      [496, 306],
      [404, 306],
      [404, 292],
    ],
    hp: { x: 300, y: 150, w: 150, h: 142 },
    comp: [352, 226],
    pumps: { primary: [350, 305], charge: [478, 222], house: [690, 136], circulation: [700, 92] },
    charge: [
      [450, 222],
      [516, 222],
    ],
    valve: [516, 222],
    toTank: [
      [516, 222],
      [566, 222],
    ],
    toDhw: [
      [516, 222],
      [516, 92],
      [566, 92],
    ],
    chargeReturn: [
      [566, 276],
      [450, 276],
    ],
    tank: { x: 566, y: 48, w: 84, h: 264 },
    house: {
      // the hot-water tap sits INSIDE the house, above the radiator loop
      outline: [
        [728, 214],
        [728, 70],
        [848, 8],
        [968, 70],
        [968, 214],
      ],
      radiators: [
        { x: 762, y: 150, w: 66, h: 40 },
        { x: 856, y: 150, w: 66, h: 40 },
      ],
    },
    houseLoop: [
      [650, 136],
      [944, 136],
      [944, 202],
      [650, 202],
    ],
    dhw: [
      [646, 92],
      [752, 92],
    ],
    tap: [752, 92],
    labels: {
      outdoor: { at: [28, 6], align: 'l' },
      // above the terrain line (soil starts at y 318)
      collector: { at: [40, 258], align: 'l' },
      hp: { at: [375, 94], align: 'c' },
      tank: { at: [608, 322], align: 'c' },
      house: { at: [848, 224], align: 'c' },
      dhw: { at: [772, 80], align: 'l' },
      valve: { at: [516, 240], align: 'c' },
    },
  },
  tall: {
    w: 360,
    h: 636,
    // terrain line at y 494; the collector label sits ABOVE it (right), pipes stay below
    soil: { x: 8, y: 494, w: 344, h: 134 },
    brine: [
      [86, 440],
      [86, 532],
      [26, 532],
      [26, 552],
      [306, 552],
      [306, 572],
      [26, 572],
      [26, 592],
      [334, 592],
      [334, 514],
      [150, 514],
      [150, 440],
    ],
    hp: { x: 52, y: 336, w: 132, h: 104 },
    comp: [96, 392],
    pumps: { primary: [86, 466], charge: [26, 340], house: [168, 140], circulation: [182, 104] },
    charge: [
      [52, 380],
      [26, 380],
      [26, 270],
    ],
    valve: [26, 270],
    toTank: [
      [26, 270],
      [92, 270],
    ],
    toDhw: [
      [26, 270],
      [26, 128],
      [92, 128],
    ],
    chargeReturn: [
      [122, 300],
      [122, 336],
    ],
    tank: { x: 92, y: 74, w: 62, h: 226 },
    house: {
      // taller house: the hot-water tap now sits INSIDE it, above the radiator loop
      outline: [
        [196, 236],
        [196, 88],
        [272, 44],
        [348, 88],
        [348, 236],
      ],
      radiators: [
        { x: 210, y: 172, w: 52, h: 34 },
        { x: 280, y: 172, w: 52, h: 34 },
      ],
    },
    houseLoop: [
      [154, 140],
      [338, 140],
      [338, 222],
      [154, 222],
    ],
    // DHW leaves the top of the tank and runs into the house to the tap
    dhw: [
      [148, 104],
      [236, 104],
    ],
    tap: [236, 104],
    labels: {
      outdoor: { at: [8, 6], align: 'l' },
      collector: { at: [346, 448], align: 'r' },
      hp: { at: [194, 356], align: 'l' },
      tank: { at: [160, 304], align: 'l' },
      house: { at: [272, 244], align: 'c' },
      dhw: { at: [258, 94], align: 'l' },
      valve: { at: [36, 254], align: 'l' },
    },
  },
};

const path = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');

/** Calm moving dots along an active pipe (transform-only keyframes; hidden for reduced motion). */
function Particles({
  id,
  pts,
  speed,
  color,
}: {
  id: string;
  pts: Pt[];
  speed: number;
  color: string;
}) {
  if (speed <= 0) return null;
  const len = polylineLength(pts);
  const dur = particleDuration(len, speed);
  const n = Math.max(2, Math.round(len / 150));
  const name = `ht-k-${id}`;
  return (
    <g className="ht-particles" data-pipe={id} aria-hidden="true">
      <style>{polylineKeyframes(name, pts)}</style>
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={i}
          r={2.3}
          fill={color}
          className="ht-p"
          style={{
            animation: `${name} ${dur}s linear ${(-(dur * i) / n).toFixed(2)}s infinite`,
          }}
        />
      ))}
    </g>
  );
}

function Pipe({
  id,
  pts,
  color,
  active,
  speed = 0,
  dashed,
}: {
  id: string;
  pts: Pt[];
  color: string;
  active: boolean;
  speed?: number;
  dashed?: boolean;
}) {
  return (
    <g className="ht-pipe" data-pipe-id={id} data-active={active ? '' : undefined}>
      <path d={path(pts)} className="ht-pipe-case" />
      <path
        d={path(pts)}
        className="ht-pipe-core"
        stroke={color}
        strokeDasharray={dashed ? '2 7' : undefined}
      />
      {active && <Particles id={id} pts={pts} speed={speed} color="var(--ht-particle)" />}
    </g>
  );
}

/** Circulation pump: ring + 3-blade impeller that rotates only while the pump runs. */
function Pump({ at, on, id, label }: { at: Pt; on: boolean; id: string; label: string }) {
  return (
    <g
      transform={`translate(${at[0]} ${at[1]})`}
      className="ht-pump"
      data-pump={id}
      data-on={on ? '' : undefined}
      role="img"
      aria-label={`${label}: ${on ? 'běží' : 'stojí'}`}
    >
      <circle r={12} className="ht-pump-body" />
      <g className="ht-impeller">
        {[0, 120, 240].map((a) => (
          <path
            key={a}
            d="M0 0 C 2 -4, 6 -7, 1 -9 C -1 -6, -2 -3, 0 0Z"
            transform={`rotate(${a})`}
          />
        ))}
        <circle r={2} />
      </g>
    </g>
  );
}

function Valve({ at, to }: { at: Pt; to: 'tank' | 'dhw' }) {
  return (
    <g
      transform={`translate(${at[0]} ${at[1]})`}
      className="ht-valve"
      data-valve={to}
      role="img"
      aria-label={`Trojcestný ventil: ${to === 'dhw' ? 'teplá voda' : 'nádrž (topení)'}`}
    >
      <circle r={11} className="ht-valve-body" />
      {/* Indicator points right (tank) or up (DHW); the turn is a short transition. */}
      <g className="ht-valve-flag" style={{ transform: `rotate(${to === 'dhw' ? -90 : 0}deg)` }}>
        <path d="M-5 0 H7 M3 -4 L7 0 L3 4" />
      </g>
    </g>
  );
}

function Label({
  layout,
  pos,
  children,
  testid,
}: {
  layout: SchematicLayout;
  pos: SchematicLayout['labels'][keyof SchematicLayout['labels']];
  children: ReactNode;
  testid: string;
}) {
  const style: CSSProperties = {
    left: `${(pos.at[0] / layout.w) * 100}%`,
    top: `${(pos.at[1] / layout.h) * 100}%`,
  };
  return (
    <div className="ht-lbl" data-align={pos.align} style={style} data-testid={testid}>
      {children}
    </div>
  );
}

export function HeatingSchematic({
  snap,
  state,
}: {
  snap: HeatingSnapshot;
  state: SchematicState;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [variant, setVariant] = useState<'wide' | 'tall'>('wide');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setVariant(w < 600 ? 'tall' : 'wide');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const L = LAYOUTS[variant];
  const hp = snap.heat_pump;
  // Collector colour indicates the circuit, never an unmeasured temperature.
  const brineColor = 'var(--ht-c-out)';
  const hot = tempColor(hp.condenser_out ?? 45);
  const warm = tempColor(snap.house.supply_temp ?? 35);
  const dhwColor = 'var(--ht-c-dhw)';
  const cool = tempColor(hp.return_temp ?? 35);
  const gid = `ht-tank-${variant}`;
  const tankTop = state.tankTop;
  const tankBottom = state.tankBottom;
  const serp = useMemo(() => L.brine, [L]);
  const t = L.tank;
  const running = state.compressor === 'on';
  const houseTop = L.houseLoop[0]![1];
  const houseBottom = L.houseLoop[L.houseLoop.length - 1]![1];
  return (
    <div
      ref={ref}
      className="ht-sch"
      data-variant={variant}
      data-compressor={state.compressor}
      data-testid="heating-schematic"
      style={{ aspectRatio: `${L.w} / ${L.h}` }}
    >
      <svg
        viewBox={`0 0 ${L.w} ${L.h}`}
        role="img"
        aria-label="Schéma: zemní kolektor, tepelné čerpadlo, nádrž, dům a teplá voda"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={waterColor(tankTop)} />
            <stop
              offset="0.45"
              stopColor={waterColor(
                tankTop !== null && tankBottom !== null ? (tankTop + tankBottom) / 2 : null,
              )}
            />
            <stop offset="1" stopColor={waterColor(tankBottom)} />
          </linearGradient>
          <linearGradient id={`${gid}-soil`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ht-soil-a)" />
            <stop offset="1" stopColor="var(--ht-soil-b)" />
          </linearGradient>
          <radialGradient id={`${gid}-glow`}>
            <stop offset="0" stopColor="var(--ht-heat)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--ht-heat)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Soil with the horizontal ground collector (serpentine loops, ~1.5 m deep). */}
        <rect
          x={L.soil.x}
          y={L.soil.y}
          width={L.soil.w}
          height={L.soil.h}
          rx={18}
          fill={`url(#${gid}-soil)`}
          className="ht-soil"
        />
        <path
          d={`M${L.soil.x + 10} ${L.soil.y} H${L.soil.x + L.soil.w - 10}`}
          className="ht-grass"
        />
        <Pipe
          id="brine"
          pts={serp}
          color={brineColor}
          active={state.brine > 0}
          speed={state.brine}
        />
        <Pump at={L.pumps.primary} on={state.pumps.primary} id="primary" label="Čerpadlo primáru" />
        {/* Heat pump unit with the compressor. */}
        <g className="ht-hp">
          <rect
            x={L.hp.x}
            y={L.hp.y}
            width={L.hp.w}
            height={L.hp.h}
            rx={22}
            className="ht-hp-body"
          />
          {running && (
            <circle
              cx={L.comp[0]}
              cy={L.comp[1]}
              r={46}
              fill={`url(#${gid}-glow)`}
              className="ht-comp-glow"
            />
          )}
          <g className="ht-comp" data-on={running ? '' : undefined}>
            <g transform={`translate(${L.comp[0]} ${L.comp[1]})`}>
              <rect x={-22} y={-30} width={44} height={60} rx={14} className="ht-comp-shell" />
              <path
                d="M-10 -12 a10 10 0 1 1 0 12 M-6 -4 a5 5 0 1 1 0 8"
                className="ht-comp-scroll"
              />
            </g>
          </g>
        </g>
        <Pipe
          id="charge"
          pts={L.charge}
          color={hot}
          active={state.charge > 0}
          speed={state.charge}
        />
        <Pipe
          id="to-tank"
          pts={L.toTank}
          color={hot}
          active={state.charge > 0 && state.valve === 'tank'}
          speed={state.charge}
        />
        <Pipe
          id="to-dhw"
          pts={L.toDhw}
          color={hot}
          active={state.charge > 0 && state.valve === 'dhw'}
          speed={state.charge}
        />
        <Pipe
          id="return"
          pts={L.chargeReturn}
          color={cool}
          active={state.charge > 0}
          speed={state.charge}
        />
        <Pump at={L.pumps.charge} on={state.pumps.charge} id="charge" label="Nabíjecí čerpadlo" />
        <Valve at={L.valve} to={state.valve} />
        {/* Buffer tank: colour gradient = measured stratification (top/bottom). */}
        <g className="ht-tank">
          <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={t.w / 2.2} fill={`url(#${gid})`} />
          <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={t.w / 2.2} className="ht-tank-glass" />
          {state.backup !== 'hidden' && (
            <g
              className="ht-backup"
              data-on={state.backup === 'on' ? '' : undefined}
              data-testid="heating-backup"
            >
              <path
                d={`M${t.x + 16} ${t.y + t.h * 0.62} ${Array.from({ length: 6 }, (_, i) => `L${t.x + 16 + ((t.w - 32) * (i + 1)) / 6} ${t.y + t.h * (i % 2 ? 0.62 : 0.68)}`).join(' ')}`}
              />
            </g>
          )}
        </g>
        <Pipe
          id="house"
          pts={L.houseLoop}
          color={warm}
          active={state.house > 0}
          speed={state.house}
        />
        <Pump at={L.pumps.house} on={state.pumps.house} id="house" label="Čerpadlo topení domu" />
        <g className="ht-house">
          <path d={`${path(L.house.outline)} Z`} className="ht-house-outline" />
          {L.house.radiators.map((r, i) => (
            <g key={i} className="ht-rad" data-on={state.house > 0 ? '' : undefined}>
              <path
                d={`M${r.x + 8} ${houseTop} V${r.y} M${r.x + r.w - 8} ${r.y + r.h} V${houseBottom}`}
                className="ht-rad-pipe"
              />
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} />
              {Array.from({ length: 5 }, (_, k) => (
                <path key={k} d={`M${r.x + ((k + 1) * r.w) / 6} ${r.y + 6} V${r.y + r.h - 6}`} />
              ))}
            </g>
          ))}
        </g>
        <Pipe
          id="dhw"
          pts={L.dhw}
          color={dhwColor}
          active={state.circulation > 0}
          speed={state.circulation}
        />
        {state.circulationKnown && (
          <Pump
            at={L.pumps.circulation}
            on={state.pumps.circulation}
            id="circulation"
            label="Cirkulace teplé vody"
          />
        )}
        <g className="ht-tap" transform={`translate(${L.tap[0]} ${L.tap[1]})`}>
          <path d="M-14 0 H14 M0 0 V12 M-6 12 H6" />
          <path d="M0 18 c-4 6 -4 10 0 10 c4 0 4 -4 0 -10Z" className="ht-drop" />
        </g>
      </svg>
      <Label layout={L} pos={L.labels.collector} testid="heating-sch-collector">
        <span className="ht-lbl-k">Zemní kolektor</span>
      </Label>
      <Label layout={L} pos={L.labels.hp} testid="heating-sch-hp">
        <span className="ht-lbl-k">Tepelné čerpadlo</span>
        <b>
          {state.compressor === 'on'
            ? `běží${hp.power_w !== null ? ` · ${fmtNum(hp.power_w / 1000)} kW` : ''}`
            : state.compressor === 'prerun'
              ? 'předběh primáru'
              : 'stojí'}
        </b>
      </Label>
      <Label layout={L} pos={L.labels.tank} testid="heating-sch-tank">
        <span className="ht-lbl-k">Nádrž</span>
        <b>
          ↑ {fmtNum(tankTop)}° ↓ {fmtNum(tankBottom)}°
        </b>
      </Label>
      <Label layout={L} pos={L.labels.house} testid="heating-sch-house">
        <span className="ht-lbl-k">Radiátory</span>
        <b>{state.house > 0 ? `teče ${fmtT(snap.house.supply_temp)}` : 'okruh stojí'}</b>
      </Label>
      <Label layout={L} pos={L.labels.dhw} testid="heating-sch-dhw">
        <span className="ht-lbl-k">Teplá voda</span>
        <b>{fmtT(snap.dhw.temp)}</b>
      </Label>
      {state.backup !== 'hidden' && (
        <Label
          layout={L}
          pos={{ at: [t.x + t.w / 2, t.y + t.h * 0.74], align: 'c' }}
          testid="heating-sch-backup"
        >
          <span className="ht-lbl-warn">
            záložní topení {state.backup === 'on' ? 'hřeje' : 'připraveno'}
          </span>
        </Label>
      )}
    </div>
  );
}
