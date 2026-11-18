import { Fragment, useId, useState, type ReactNode } from 'react';
import { HEATING_LOGO_ROOT, useHeatingLogoManifest } from '../logo.js';
import type { HeatingSnapshot } from '../types.js';
import { logoFile, usePageTheme } from '../views/Schematic.js';
import { fullState, type FullState, type PipeState } from './fullState.js';
import { FULL_GEOMETRY as G } from './geometry.gen.js';
import {
  Aquarium,
  Chevron,
  Dehumidifier,
  Ek,
  Fan,
  FaultIcon,
  Filter,
  Phe,
  PoolEnclosure,
  Pump,
  RadiatorPair,
  Salinator,
  Sensor,
  Solar,
  TankInner,
  TankShell,
  Terminal,
  Treatment,
  ValveBody,
} from './glyphs.js';
import type { GeoLabel } from './types.js';

export const FULL_CANVAS = { w: G.canvas[0]!, h: G.canvas[1]! };

/** Payload field behind each readout / device (service view shows the PLC address of the map). */
const SERVICE_FIELD: Record<string, string> = {
  hp_t_out: 'heat_pump.condenser_out',
  hp_t_in: 'heat_pump.return_temp',
  hp_coll_in: 'heat_pump.collector_in',
  hp_coll_out: 'heat_pump.collector_out',
  t_ut: 'house.supply_temp',
  chip_attic: 'house.attic_temp',
  chip_floor1: 'house.ref_temp',
  chip_fish: 'extras.fish_temp',
  tank_high: 'tank.top',
  tank_low: 'tank.bottom',
  solar_temp: 'extras.solar_temp',
  pool_temp: 'extras.pool_temp',
  pump_ut: 'pumps.heating',
  pump_sek: 'pumps.secondary',
  pump_solar: 'extras.solar_pump',
  pump_pool: 'extras.pool_heating_pump',
  pump_filt: 'extras.pool_filter_pump',
  valve_dhw: 'dhw.valve_to_dhw',
  valve_ryb_heat: 'extras.fish_valve_open',
};
const SERVICE_PLACE: Record<string, 'inline' | 'above'> = {
  hp_t_in: 'inline',
  hp_t_out: 'inline',
  pump_pool: 'inline',
  pool_temp: 'above',
};

const PUMP_NAMES: Record<string, string> = {
  pump_ryb: 'Čerpadlo rybárna',
  pump_ut: 'Čerpadlo topení',
  pump_chlad: 'Čerpadlo chlazení',
  pump_coll: 'Čerpadlo kolektoru',
  pump_sek: 'Nabíjení nádrže',
  pump_solar: 'Čerpadlo solár',
  pump_pool: 'Ohřev bazénu',
  pump_filt: 'Čerpadlo filtrace',
};

const HALO: Record<string, string> = {
  none: 'none',
  concrete2: 'var(--fs-concrete2)',
  tech: 'var(--fs-tech)',
  room: 'var(--fs-room)',
  soil2: 'var(--fs-soil2)',
  bg: 'var(--fs-bg)',
  soil: 'var(--fs-soil)',
};

const pipeCls = (colour: string, state: PipeState) => `fs-pipe fs-c-${colour} fs-s-${state}`;

function Text({
  l,
  k,
  children,
  extraClass,
}: {
  l: GeoLabel;
  k: string;
  children?: ReactNode;
  extraClass?: string;
}) {
  const halo = HALO[l.halo] ?? 'none';
  const noStroke = l.card || l.styles.includes('w') || l.ink === 'tank';
  return (
    <>
      {l.lines.map((line, i) => {
        const st = l.styles[i] ?? l.styles.at(-1) ?? 's';
        const tank =
          l.ink === 'tank' || l.of === 'tank_dhw' || l.of === 'tank_solar_coil' || l.of === 'ek';
        return (
          <text
            key={i}
            x={l.x}
            y={l.y + i * l.lh}
            fontSize={l.font}
            textAnchor={l.anchor}
            className={`fs-t fs-t-${st}${tank ? ' fs-tank-detail' : ''}${extraClass ? ` ${extraClass}` : ''}`}
            stroke={noStroke ? 'none' : halo}
            strokeWidth={noStroke ? 0 : 4}
            data-label={i === 0 ? k : undefined}
          >
            {line}
            {i === 0 && children}
          </text>
        );
      })}
    </>
  );
}

function Reading({ value }: { value: string | null | undefined }) {
  return value ? (
    <tspan className="fs-val" data-reading="">
      {'\u00a0\u00a0'}
      {value}
    </tspan>
  ) : (
    <tspan className="fs-nodata" data-reading="none">
      {'\u00a0\u00a0–'}
    </tspan>
  );
}

/** Open path through a valve body (light channel with a dark keyline). */
function Channel({ d, ticks = false }: { d: string; ticks?: boolean }) {
  return (
    <g data-open-path="">
      <path d={d} className="fs-open-channel-key" />
      <path d={d} className="fs-open-channel" />
      {ticks &&
        [-7, 7].map((dx) => (
          <path
            key={dx}
            d={`M${dx + 2.6} -3.2L${dx - 2.6} 0L${dx + 2.6} 3.2Z`}
            className="fs-open-tick"
          />
        ))}
    </g>
  );
}

/** House mixing valve: open path A↔AB / B↔AB, fault ring + badge on the body. */
function MixingValve({ st }: { st: FullState }) {
  const [x, y] = G.glyphs.valveMix.c as [number, number];
  const { path, fault } = st.mixer;
  const closed = path === 'A' ? ['d'] : path === 'B' ? ['r'] : [];
  return (
    <g
      data-glyph="valve_mix"
      data-path={path}
      data-fault={fault ? '' : undefined}
      className="fs-lift"
    >
      <g transform={`translate(${x} ${y}) scale(1.32)`}>
        <ValveBody
          ports={['l', 'r', 'd']}
          act="u"
          closed={closed}
          bar={path === 'unknown' || path === 'mix'}
        />
      </g>
      <g transform={`translate(${x} ${y})`}>
        {path === 'A' && (
          <>
            <path d="M-7 21H7" className="fs-closed-bar-key" />
            <path d="M-7 21H7" className="fs-closed-bar" />
            <Channel d="M-17 0H17" ticks />
          </>
        )}
        {path === 'B' && (
          <>
            <path d="M21 -7V7" className="fs-closed-bar-key" />
            <path d="M21 -7V7" className="fs-closed-bar" />
            <Channel d="M-17 0H0V17" />
          </>
        )}
        {fault && (
          <g data-fault-glyph="valve_mix">
            <circle r="17.5" className="fs-valve-fault-key" />
            <circle r="17.5" className="fs-valve-fault" />
            <FaultIcon x={12} y={13} s={0.97} />
          </g>
        )}
      </g>
    </g>
  );
}

function ThreeWay({
  id,
  path,
  map,
}: {
  id: 'valve_dhw' | 'valve_cool';
  path: 'A' | 'B' | 'unknown';
  /** port direction of AB, A and B */
  map: { AB: string; A: string; B: string };
}) {
  const v = G.glyphs.valves[id]!;
  const [x, y] = v.c as [number, number];
  const seg = (dir: string) => ({ l: 'H-13', r: 'H13', u: 'V-13', d: 'V13' })[dir as 'l'] ?? '';
  const start = { l: 'M-13 0H0', r: 'M13 0H0', u: 'M0 -13V0', d: 'M0 13V0' }[map.AB as 'l'];
  const closed = path === 'A' ? [map.B] : path === 'B' ? [map.A] : [];
  return (
    <g
      data-glyph={id}
      data-path={path}
      className={`fs-lift${id === 'valve_cool' && path !== 'A' ? ' fs-idle-glyph-soft' : ''}`}
      transform={`translate(${x} ${y})`}
    >
      <ValveBody ports={v.ports} act={v.act} closed={closed} bar={path === 'unknown'} />
      {path !== 'unknown' && <Channel d={`${start}${seg(path === 'A' ? map.A : map.B)}`} />}
    </g>
  );
}

function ZoneValve({ id, open }: { id: string; open: boolean | null }) {
  const v = G.glyphs.valves[id]!;
  const [x, y] = v.c as [number, number];
  return (
    <g data-glyph={id} className="fs-lift" transform={`translate(${x} ${y})`}>
      <ValveBody
        ports={v.ports}
        act={v.act}
        closed={open === false ? ['r'] : []}
        bar={open !== true}
      />
      {open === true && <Channel d="M-13 0H13" />}
    </g>
  );
}

/**
 * Heat pump = the production Toky component (`.ht-c3-hp`, cabinet 66 × 88, rx 9, LED top-left,
 * logo 72 % wide, cut-away ⅓ of the height with plates + compressor) scaled into the p3i box.
 */
function HeatPump({
  st,
  logoHref,
  onLogoError,
}: {
  st: FullState;
  logoHref: string | null;
  onLogoError: () => void;
}) {
  const [bx, by, bw] = G.glyphs.hp as [number, number, number];
  const s = bw / 66;
  const X = (v: number) => bx + (v - 8) * s;
  const Yp = (v: number) => by + (v - 243) * s;
  const c = st.compressor;
  const label =
    c === 'on' ? 'kompresor běží' : c === 'off' ? 'kompresor stojí' : 'stav kompresoru neznámý';
  const cx = X(31) + (21 * s) / 2;
  const cy = Yp(294) + (24 * s) / 2;
  return (
    <g
      className="fs-hp"
      data-node="hp"
      data-compressor={c}
      role="img"
      aria-label={`Tepelné čerpadlo: ${label}`}
      data-testid="heating-full-hp"
    >
      <path
        d={`M${X(17)} ${Yp(331)}V${Yp(335.5)}M${X(63)} ${Yp(331)}V${Yp(335.5)}`}
        className="fs-hp-foot"
        style={{ strokeWidth: 5 * s }}
      />
      <rect
        x={X(8)}
        y={Yp(243)}
        width={66 * s}
        height={88 * s}
        rx={9 * s}
        className="fs-hp-cabinet"
      />
      {logoHref ? (
        <image
          href={logoHref}
          x={X(8 + (66 - 66 * 0.72) / 2)}
          y={Yp(258)}
          width={66 * 0.72 * s}
          height={26 * s}
          preserveAspectRatio="xMidYMid meet"
          onError={onLogoError}
          data-testid="heating-full-hp-logo"
        />
      ) : (
        <text
          x={X(16)}
          y={Yp(274)}
          fontSize={15 * s}
          className="fs-t fs-t-T"
          data-testid="heating-full-hp-mark"
        >
          TČ
        </text>
      )}
      <circle
        cx={X(20)}
        cy={Yp(252)}
        r={4.5 * s}
        className={`fs-hp-led fs-hp-led-${c}`}
        data-testid="heating-full-hp-led"
        data-pulse={c === 'on' ? '' : undefined}
      >
        <title>{label}</title>
      </circle>
      <rect
        x={X(16)}
        y={Yp(290)}
        width={49 * s}
        height={29 * s}
        rx={4 * s}
        className="fs-hp-cutaway"
      />
      <path
        d={`M${X(22)} ${Yp(296)}V${Yp(315)}M${X(57)} ${Yp(296)}V${Yp(315)}`}
        className="fs-hp-plates"
        style={{ strokeWidth: 4 * s }}
      />
      <g className={`fs-comp fs-comp-${c}`} data-compressor-body={c}>
        {c === 'on' && (
          <ellipse
            cx={cx}
            cy={cy}
            rx={21 * s * 0.95}
            ry={24 * s * 0.78}
            className="fs-comp-halo"
            fill="url(#fs-comp-halo)"
          />
        )}
        <rect
          x={X(31)}
          y={Yp(294)}
          width={21 * s}
          height={24 * s}
          rx={8 * s}
          className="fs-comp-body"
        />
        {c !== 'unknown' && (
          <path d={`M${X(31) + 7} ${Yp(294) + 5}H${X(52) - 7}`} className="fs-comp-shine" />
        )}
      </g>
    </g>
  );
}

function Architecture() {
  const R = G.regions;
  const A = G.arch;
  const b = G.boxes;
  const W = G.canvas[0]!;
  const gr = A.grade;
  const [gx, gy, gw, gh] = b.ground as [number, number, number, number];
  const pit = R.pit as [number, number, number, number];
  const pool = b.pool as [number, number, number, number];
  const ch = R.channel as [number, number, number, number];
  const soilBottom = ch[1] + ch[3] + 18;
  const mid = ch[1] + ch[3] / 2;
  const duct = `M${A.shaftX} ${A.floor}L${A.shaftX} ${mid - 6}Q${A.shaftX} ${mid} ${A.shaftX + 6} ${mid}L${pool[0] + 1} ${mid}`;
  const soilRect = (r: number[], pad: number) => (
    <>
      <rect
        x={r[0]! - pad}
        y={r[1]}
        width={r[2]! + 2 * pad}
        height={r[3]! + pad}
        className="fs-soil"
      />
      <rect
        x={r[0]! - pad}
        y={r[1]}
        width={r[2]! + 2 * pad}
        height={r[3]! + pad}
        fill="url(#fs-soilhatch)"
      />
    </>
  );
  const fp = b.floor_pool as [number, number, number, number];
  const [px, py, pw, ph] = pool;
  const waterTop = py + 16;
  const lw = 84;
  const lx = pit[0] + pit[2] / 2 - lw / 2 - 50;
  const [dx, dy, dw, dh] = b.dehumidifier as [number, number, number, number];
  return (
    <g data-layer="architecture">
      <rect x="24" y={gr} width={W - 48} height={soilBottom - gr} className="fs-soil" />
      <rect x="24" y={gr} width={A.houseL - 24} height="15" className="fs-soil" />
      {soilRect([gx, gy, gw, gh], 0)}
      <rect x={gx + gw} y={gy} width={A.houseL - gx - gw} height={gh} className="fs-soil" />
      <rect
        x={A.houseL}
        y={A.floor}
        width={A.houseR - A.houseL}
        height={A.foundation - A.floor}
        className="fs-concrete2"
      />
      {soilRect(pit, 12)}
      {soilRect(pool, 12)}
      {(['soil', 'wall', 'fill', 'hatch', 'air'] as const).map((layer) => (
        <path key={layer} d={duct} className={`fs-duct-${layer}`} />
      ))}
      <path d={`M24 ${gr}H${W - 24}`} className="fs-grass" />
      {(['rybarna', 'attic', 'storey1'] as const).map((k) => {
        const [x, y, w, h] = R[k] as [number, number, number, number];
        return <rect key={k} x={x} y={y} width={w} height={h} className="fs-room" />;
      })}
      {(() => {
        const [x, y, w, h] = R.tech as [number, number, number, number];
        return <rect x={x} y={y} width={w} height={h} className="fs-techroom" />;
      })()}
      <rect
        x={A.houseL}
        y={A.stand}
        width={A.houseR - A.houseL}
        height={A.floor - A.stand}
        className="fs-slab"
      />
      <rect x={pit[0]} y={pit[1]} width={pit[2]} height={pit[3]} className="fs-pitwall" />
      <rect x={lx} y={gr} width={lw} height="7" rx="2" className="fs-lid" />
      <path d={`M${pit[0] + 6} ${A.grating + 1}H${pit[0] + pit[2] - 6}`} className="fs-grating" />
      <path d={`M${dx - 3} ${dy + dh}H${dx + dw + 3}`} className="fs-grating" />
      <rect x={px} y={py} width={pw} height={ph} className="fs-concrete2" />
      <rect
        x={px + 6}
        y={waterTop}
        width={pw - 12}
        height={fp[1] - 6 - waterTop}
        fill="url(#fs-poolw)"
      />
      <path d={`M${px + 6} ${waterTop}H${px + pw - 6}`} className="fs-surface" />
      <rect
        x={px + 6}
        y={fp[1] - 6}
        width={pw - 12}
        height={py + ph - fp[1]}
        className="fs-screed"
      />
      <path d={`M${px} ${py - 4}V${py + ph}H${px + pw}V${py - 4}`} className="fs-basin" />
      <PoolEnclosure x={px} width={pw} rail={gr - 4} />
      {G.regionEdges.map((e, i) => {
        const [x1, y1, x2, y2, k] = e as [number, number, number, number, string];
        if (k === 'pit' || k === 'channel') return null;
        return (
          <path
            key={i}
            d={`M${x1} ${y1}L${x2} ${y2}`}
            className={k === 'slab' || k === 'floor' ? 'fs-slabline' : 'fs-wallband'}
          />
        );
      })}
      {(() => {
        const [x, y, w, h] = G.legend.box as [number, number, number, number];
        return (
          <>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx="12"
              className="fs-legend-panel"
              data-legend-panel=""
            />
            {G.legend.seams.map((yy) => (
              <path key={yy} d={`M${x + 16} ${yy}h${w - 32}`} className="fs-partition-seam" />
            ))}
          </>
        );
      })()}
    </g>
  );
}

function LegendSample({ item }: { item: (typeof G.legend.items)[number] }) {
  const [[x1, y], [x2]] = item.sample as [[number, number], [number, number]];
  const m = (x1 + x2) / 2;
  const st = item.style;
  if (item.circuit) {
    return (
      <path
        d={`M${x1} ${y}H${x2}`}
        className={`${pipeCls(item.circuit, st === 'dashed' ? 'idle' : 'flow')} fs-swatch`}
      />
    );
  }
  switch (st) {
    case 'dash_note':
      return (
        <>
          <path d={`M${x1} ${y}H${m}`} className="fs-pipe fs-swatch fs-neutral-pipe" />
          <path
            d={`M${m + 4} ${y}H${x2}`}
            className="fs-pipe fs-swatch fs-s-idle fs-neutral-pipe"
          />
        </>
      );
    case 'cooling_coll':
      return <path d={`M${x1} ${y}H${x2}`} className="fs-pipe fs-swatch fs-c-coll fs-s-idle" />;
    case 'hp':
      return (
        <g
          transform={`translate(${m} ${y}) scale(.6)`}
          className="fs-comp fs-comp-on"
          data-legend-symbol="compressor"
        >
          <ellipse rx="30" ry="31" className="fs-comp-halo" fill="url(#fs-comp-halo)" />
          <rect x="-19.5" y="-23.5" width="39" height="47" rx="17" className="fs-comp-body" />
        </g>
      );
    case 'offline':
      return <path d={`M${x1} ${y}H${x2}`} className="fs-pipe fs-s-off" />;
    case 'chevron':
      return (
        <>
          <path d={`M${x1} ${y}H${x2}`} className="fs-pipe fs-c-heat_return" />
          <Chevron x={m} y={y} />
        </>
      );
    case 'mark':
      return (
        <>
          <path d={`M${m} ${y - 11}V${y + 11}`} className="fs-wallband" />
          <path d={`M${x1} ${y}H${x2}`} className="fs-pipe fs-c-heat_return" />
          <rect x={m - 4} y={y - 8} width="8" height="16" rx="2.5" className="fs-sleeve" />
        </>
      );
    case 'hop':
      return (
        <>
          <path d={`M${m} ${y - 12}V${y + 12}`} className="fs-pipe fs-c-heat_return" />
          <path
            d={`M${m - 8} ${y}A8 8 0 0 1 ${m + 8} ${y}`}
            className="fs-halo"
            stroke="var(--fs-bg)"
          />
          <path
            d={`M${x1} ${y}H${m - 8}A8 8 0 0 1 ${m + 8} ${y}H${x2}`}
            className="fs-pipe fs-c-coll"
          />
        </>
      );
    case 'badge':
      return (
        <>
          <rect x={m - 8} y={y - 8} width="16" height="16" rx="3" className="fs-badge-derived" />
          <text x={m} y={y + 5.2} fontSize="15" textAnchor="middle" className="fs-t fs-t-derived">
            ?
          </text>
        </>
      );
    case 'pill':
      return (
        <>
          <rect x={x1 - 4} y={y - 11} width={x2 - x1 + 8} height="22" rx="11" className="fs-pill" />
          <FaultIcon x={m} y={y + 0.5} s={0.9} />
        </>
      );
    case 'open_valve':
      return (
        <g transform={`translate(${m} ${y - 3}) scale(.5)`} data-legend-symbol="open_valve">
          <path d="M-40 0H40" className="fs-pipe fs-neutral-pipe" />
          <path d="M0 0V30" className="fs-pipe fs-s-closed" />
          <ValveBody ports={['l', 'r', 'd']} act="u" closed={['d']} bar={false} />
          <Channel d="M-17 0H17" />
          <path d="M-7 16H7" className="fs-closed-bar-key" />
          <path d="M-7 16H7" className="fs-closed-bar" />
        </g>
      );
    case 'ek':
      return <path d={`M${x1} ${y - 4}H${x2 - 5}a4 4 0 0 1 0 8H${x1}`} className="fs-ek-rod" />;
    case 'pump':
      return (
        <g transform={`translate(${m} ${y}) scale(.6)`}>
          <circle r="15" className="fs-metal fs-ring" />
          <circle r="10.5" className="fs-motor" />
          <path d="M-4.6 -6.2L7.2 0L-4.6 6.2Z" className="fs-tri" />
        </g>
      );
    case 'sensor':
      return <Sensor c={[m, y]} />;
    case 'hx':
      return (
        <g transform={`translate(${m} ${y}) scale(.24)`} data-legend-symbol="hx">
          <Phe r={[-33, -45, 66, 90]} />
        </g>
      );
    case 'valve':
      return (
        <g transform={`translate(${m} ${y + 5}) scale(.55)`}>
          <ValveBody ports={['l', 'r']} act="u" />
        </g>
      );
    case 'bypass':
    case 'ports':
      return (
        <g
          transform={`translate(${m} ${y + (st === 'ports' ? 3 : -3)}) scale(.46)`}
          data-legend-symbol={st}
        >
          <path d="M-40 0H40M0 0V30" className="fs-pipe fs-neutral-pipe" />
          <ValveBody ports={['l', 'r', 'd']} act="u" />
          <path d={st === 'ports' ? 'M-40 0H-12' : 'M0 12V30'} className="fs-port-mark" />
        </g>
      );
    default:
      return null;
  }
}

const HP_STATE: Record<string, string> = {
  on: 'kompresor běží',
  off: 'TČ stojí',
  unknown: 'stav neznámý',
};

export interface FullSchematicProps {
  snap: HeatingSnapshot;
  service?: boolean;
  /** Fixed theme for tests; default follows the page. */
  theme?: 'light' | 'dark';
}

export function FullSchematic({ snap, service = false, theme }: FullSchematicProps) {
  const uid = useId().replace(/:/g, '');
  const pageTheme = usePageTheme();
  const t = theme ?? pageTheme;
  const manifest = useHeatingLogoManifest();
  const [logoFailed, setLogoFailed] = useState(false);
  const logoHref = manifest && !logoFailed ? `${HEATING_LOGO_ROOT}${logoFile(manifest, t)}` : null;
  const st = fullState(snap);
  const P = st.pipes;
  const W = G.canvas[0]!;
  const H = G.canvas[1]!;
  const hops = new Set(G.bridges.map((b) => b.over));
  const ordered = [...G.pipes].sort((a, b) => Number(hops.has(a.id)) - Number(hops.has(b.id)));
  const labels = G.labels;
  const codes = snap.service_codes ?? {};
  const idleCooling = st.coolValve.cooling !== true;
  const colourOf = Object.fromEntries(G.pipes.map((p) => [p.id, p.colour]));
  const dep = st.compressor !== 'on';
  const [hx, hy, hw] = G.glyphs.hp as [number, number, number];
  const mixC = G.glyphs.valveMix.c as [number, number];
  const coolC = G.glyphs.valves.valve_cool!.c as [number, number];
  const fault = st.mixer.fault;
  const pillText = 'Směšovací ventil ÚT · porucha · nouzově otevřen';
  const pillX = mixC[0] + 46;
  const pillY = mixC[1] - 39;
  const pillW = 396.3;
  const coolLine =
    st.coolValve.path === 'A'
      ? 'chlazení · cesta A'
      : st.coolValve.path === 'B'
        ? 'vypnuto · cesta B'
        : 'stav –';
  const mixLine = st.mixer.pct === null ? null : `A ${st.readings.mixer_pct}`;
  const outdoor = snap.outdoor.temp;
  const [lgx, lgy, , lgh] = G.legend.box as [number, number, number, number];
  const statusY = lgy + lgh + 34;

  const label = (k: string, extra?: ReactNode, extraClass?: string) => {
    const l = labels[k];
    if (!l) return null;
    return (
      <g key={k} data-label-group={k}>
        {l.card && (
          <rect
            x={l.box[0]! - 4}
            y={l.box[1]! - 2}
            width={l.box[2]! + 8}
            height={l.box[3]! + 4}
            rx="5"
            className="fs-card"
          />
        )}
        {l.sensor && <Sensor c={[l.box[0]! + 7, l.box[1]! + l.box[3]! / 2]} />}
        {l.pipeSensor && (
          <g className="fs-pipe-sensor" data-sensor-for={k}>
            <Sensor c={l.pipeSensor} />
          </g>
        )}
        <g
          opacity={l.compressorDependent && dep ? 0.78 : undefined}
          data-compressor-dependent={l.compressorDependent ? '' : undefined}
        >
          <Text l={l} k={k} extraClass={extraClass}>
            {l.reading ? <Reading value={st.readings[k]} /> : null}
            {extra}
          </Text>
        </g>
        {service && SERVICE_FIELD[k] && codes[SERVICE_FIELD[k]] && (
          <ServiceCode k={k} l={l} code={codes[SERVICE_FIELD[k]]!} />
        )}
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="fs-svg"
      data-theme={t}
      data-service={service ? '' : undefined}
      data-testid="heating-full-svg"
      data-compressor={st.compressor}
      data-live={st.live ? '' : undefined}
      role="img"
      aria-label="Plné schéma topení: tepelné čerpadlo, akumulační nádrž, okruhy domu, rybárny, bazénu a zemního kolektoru"
    >
      <defs>
        <linearGradient id={`${uid}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={st.readings.tank_high ? '#ba6970' : 'var(--fs-inactive)'} />
          <stop offset=".27" stopColor="#bb7b80" />
          <stop offset=".52" stopColor="#9a9da3" />
          <stop offset=".75" stopColor="#739abb" />
          <stop offset="1" stopColor={st.readings.tank_low ? '#4e88b9' : 'var(--fs-inactive)'} />
        </linearGradient>
        <linearGradient id="fs-poolw" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--fs-pool)" style={{ stopOpacity: 'var(--fs-pool-alpha)' }} />
          <stop offset="1" stopColor="var(--fs-pool)" stopOpacity=".16" />
        </linearGradient>
        <pattern
          id="fs-soilhatch"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0V10" className="fs-hatch" />
        </pattern>
        <pattern
          id="fs-concretehatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <rect width="8" height="8" className="fs-concrete" />
          <path d="M0 0V8" className="fs-concrete-grain" />
        </pattern>
        <radialGradient id="fs-comp-hot" cx=".5" cy=".42" r=".62">
          <stop stopColor="var(--fs-glow-core)" />
          <stop offset=".5" stopColor="var(--fs-glow-mid)" />
          <stop offset="1" stopColor="var(--fs-glow-edge)" />
        </radialGradient>
        <radialGradient id="fs-comp-halo" cx=".5" cy=".5" r=".5">
          <stop stopColor="var(--fs-glow-halo)" stopOpacity=".5" />
          <stop offset=".6" stopColor="var(--fs-glow-halo)" stopOpacity=".18" />
          <stop offset="1" stopColor="var(--fs-glow-halo)" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id="fs-meander"
          gradientUnits="userSpaceOnUse"
          x1={G.coils.meanderX[0]}
          y1="0"
          x2={G.coils.meanderX[1]}
          y2="0"
        >
          <stop style={{ stopColor: 'var(--fs-heat_supply)' }} />
          <stop offset="1" style={{ stopColor: 'var(--fs-heat_return)' }} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} className="fs-bg" />
      <Architecture />
      <TankShell r={G.glyphs.tank} water={`url(#${uid}-water)`} />
      {G.bridges.map((b) => (
        <path key={`halo-${b.over}`} d={b.arc} className="fs-halo" stroke={HALO[b.halo]} />
      ))}
      <g data-layer="pipes">
        {ordered.map((p) => {
          const state = (P[p.id] ?? 'unknown') as PipeState;
          return (
            <Fragment key={p.id}>
              <path
                d={p.d}
                className={pipeCls(p.colour, state)}
                data-route={p.id}
                data-state={state}
              />
              {state === 'flow' && <path d={p.d} className="fs-flow-anim" aria-hidden="true" />}
            </Fragment>
          );
        })}
        {G.bridges.map((b) => (
          <path
            key={`arc-${b.over}`}
            d={b.arc}
            className={`${pipeCls(colourOf[b.over]!, P[b.over] ?? 'unknown')} fs-bridge-arc`}
            data-bridge={b.over}
          />
        ))}
      </g>
      <path
        d={G.coils.ground}
        className={`fs-coil ${pipeCls('coll', P.jbr_to_ground!)}`}
        data-coil="ground"
      />
      <path
        d={G.coils.poolFeed}
        className={`fs-coil ${pipeCls('heat_supply', P.ppool_to_bottom!)}`}
        data-coil="floor_pool_feed"
      />
      <path
        d={G.coils.poolMeander}
        className={`fs-coil fs-pipe fs-s-${P.ppool_to_bottom}`}
        stroke="url(#fs-meander)"
        data-coil="floor_pool_meander"
      />
      {G.leaders.map((ld) => (
        <path
          key={ld.of}
          d={`M${ld.pts.map((p) => `${p[0]} ${p[1]}`).join('L')}`}
          className="fs-leader"
        />
      ))}
      {fault && (
        <path
          d={`M${mixC[0] + 13.4} ${mixC[1] - 13.4}L${pillX} ${pillY + 14}`}
          className="fs-leader fs-leader-fault"
        />
      )}
      {/* glyphs */}
      <RadiatorPair
        box={G.glyphs.radiators.box}
        ys={G.glyphs.radiators.ys}
        slab={G.glyphs.radiators.slab}
        supplyClass={pipeCls('heat_supply', P.jsup_to_rad!)}
        returnClass={pipeCls('heat_return', P.rad_to_jret!)}
      />
      <g className="fs-lift">
        {Object.entries(G.glyphs.fans).map(([k, r]) => (
          <g key={k} data-glyph={k}>
            <Fan r={r} />
          </g>
        ))}
        <g data-glyph="ryb_water" className="fs-offline-glyph">
          <Aquarium r={G.glyphs.aquarium} />
        </g>
        <g data-glyph="hx_cool" className={idleCooling ? 'fs-idle-glyph' : undefined}>
          <Phe r={G.glyphs.hx} />
        </g>
        <Solar box={G.glyphs.solar.box} legsTo={G.glyphs.solar.legsTo} />
        <Filter r={G.glyphs.filter} />
        <Treatment r={G.glyphs.ph} dosing={false} />
        <Salinator r={G.glyphs.salinator} />
        <Treatment r={G.glyphs.acid} dosing />
        <Dehumidifier r={G.glyphs.dehumidifier} />
        <Terminal
          box={G.glyphs.tap}
          up
          pipeClass={pipeCls('dhw', P.tank_to_tap!)}
          fillClass="fs-term fs-f-dhw"
        />
        <Terminal
          box={G.glyphs.cold}
          up={false}
          pipeClass={pipeCls('cold_water', P.cold_to_tank!)}
          fillClass="fs-term fs-f-cold_water"
        />
        <Ek
          x0={G.glyphs.ek.x0}
          y0={G.glyphs.ek.y0}
          x1={G.glyphs.ek.x1}
          on={snap.backup_heater.on}
        />
      </g>
      <TankInner
        dhw={G.glyphs.tankDhw}
        coil={G.glyphs.tankCoil}
        coilClass={`fs-solar-coil fs-s-${P.solar_to_tank}`}
      />
      <HeatPump st={st} logoHref={logoHref} onLogoError={() => setLogoFailed(true)} />
      <MixingValve st={st} />
      <ThreeWay id="valve_dhw" path={st.dhwValve} map={{ AB: 'l', A: 'u', B: 'd' }} />
      <g className={idleCooling ? 'fs-idle-glyph-soft' : undefined}>
        <ThreeWay id="valve_cool" path={st.coolValve.path} map={{ AB: 'u', A: 'd', B: 'l' }} />
      </g>
      <ZoneValve id="valve_ryb_heat" open={st.fishValve} />
      <g className="fs-offline-glyph">
        <ZoneValve id="valve_ryb_water" open={false} />
      </g>
      {Object.entries(G.glyphs.pumps).map(([k, p]) => (
        <g
          key={k}
          className={`fs-lift${k === 'pump_chlad' && idleCooling ? ' fs-idle-glyph' : ''}`}
          data-glyph={k}
        >
          <Pump c={p.c} dir={p.dir} on={st.pumps[k] ?? null} id={k} label={PUMP_NAMES[k] ?? k} />
        </g>
      ))}
      {Object.entries(G.glyphs.sensors).map(([k, c]) => (
        <Sensor key={k} c={c} />
      ))}
      {G.marks.map((mk, i) => (
        <rect
          key={i}
          x={mk.orient === 'h' ? mk.x - 4 : mk.x - 8}
          y={mk.orient === 'h' ? mk.y - 8 : mk.y - 4}
          width={mk.orient === 'h' ? 8 : 16}
          height={mk.orient === 'h' ? 16 : 8}
          rx="2.5"
          className="fs-sleeve"
        />
      ))}
      {G.fittings.map((f) => {
        const hpPort = f.port.startsWith('hp.');
        const route = G.pipes.find((p) => p.from === f.port || p.to === f.port);
        return hpPort ? (
          <g key={f.port} data-fitting={f.port} transform={`translate(${f.x} ${f.y})`}>
            <circle r="5.5" className={`fs-port-collar fs-f-${route?.colour ?? 'heat_supply'}`} />
            <circle r="2.2" className="fs-port-core" />
          </g>
        ) : (
          <g
            key={f.port}
            transform={`translate(${f.x} ${f.y}) rotate(${f.orient === 'v' ? 90 : 0})`}
            data-fitting={f.port}
          >
            <rect x="-5" y="-7" width="10" height="14" rx="2.5" className="fs-fitting" />
          </g>
        );
      })}
      <g data-layer="chevrons">
        {G.chevrons
          .filter((cv) => P[cv.route] === 'flow')
          .map((cv, i) => (
            <g key={i} data-flow-route={cv.route}>
              <Chevron x={cv.x} y={cv.y} angle={cv.angle} size={cv.scale} />
            </g>
          ))}
      </g>
      {G.junctions.map((j) => (
        <circle
          key={j.id}
          cx={j.x}
          cy={j.y}
          r={j.id === 'j_byp' || j.id === 'j_mix' ? 5.6 : 4.6}
          className="fs-dot"
          style={{ stroke: HALO[j.halo] }}
          data-junction={j.id}
        />
      ))}
      {G.badges.map((bd) => {
        const derived = bd.text === '?';
        return (
          <g key={bd.of} data-badge-for={bd.of}>
            {derived ? (
              <rect
                x={bd.x - bd.r}
                y={bd.y - bd.r}
                width={2 * bd.r}
                height={2 * bd.r}
                rx="3"
                className="fs-badge-derived"
              />
            ) : (
              <circle cx={bd.x} cy={bd.y} r={bd.r} className="fs-badge" />
            )}
            <text
              x={bd.x}
              y={bd.y + 5.2}
              fontSize="15"
              textAnchor="middle"
              className={`fs-t ${derived ? 'fs-t-derived' : 'fs-t-badge'}`}
            >
              {bd.text}
            </text>
          </g>
        );
      })}
      {G.legend.items.map((it, i) => (
        <LegendSample key={i} item={it} />
      ))}
      {/* labels */}
      {Object.keys(labels).map((k) => {
        if (k === 'tank_dhw') return null;
        if (k === 'valve_ryb_water' || k === 'ryb_water_state')
          return label(k, undefined, 'fs-t-offline');
        if (k === 'hx_cool' || k === 'pump_chlad')
          return label(k, undefined, idleCooling ? 'fs-t-idle' : undefined);
        return label(k);
      })}
      {(() => {
        const l = labels.tank_dhw!;
        const v = st.readings.tank_dhw;
        return (
          <g data-label-group="tank_dhw">
            <rect
              x={l.box[0]! - 4}
              y={l.box[1]! - 11}
              width={l.box[2]! + 8}
              height={l.box[3]! + 22}
              rx="5"
              className="fs-card"
            />
            <text
              x={l.x}
              y={l.y - 9}
              fontSize={l.font}
              textAnchor="middle"
              className="fs-t fs-t-w fs-tank-detail"
              data-label="tank_dhw"
            >
              {l.lines[0]}
            </text>
            <text
              x={l.x}
              y={l.y + 9}
              fontSize={l.font}
              textAnchor="middle"
              className={`fs-t ${v ? 'fs-t-w fs-val-card' : 'fs-nodata-card'}`}
            >
              {v ?? '–'}
            </text>
          </g>
        );
      })()}
      {/* heat pump header, centred over the cabinet */}
      <text
        x={hx + hw / 2}
        y={hy - 40}
        fontSize="15"
        textAnchor="middle"
        className="fs-t fs-t-T"
        stroke="var(--fs-tech)"
        strokeWidth="4"
        data-label="hp"
        data-testid="heating-full-hp-state"
      >
        {manifest?.model ? `TČ ${manifest.model}` : 'Tepelné čerpadlo'}
        <tspan
          className={`fs-t-m${st.compressor === 'on' ? ' fs-hp-run' : ''}`}
        >{` · ${HP_STATE[st.compressor]}`}</tspan>
      </text>
      {service && codes['heat_pump.compressor_on'] && (
        <text
          x={hx + hw / 2}
          y={hy - 62}
          fontSize="15"
          textAnchor="middle"
          className="fs-t fs-t-code"
          stroke="var(--fs-tech)"
          strokeWidth="4"
          data-service-code="hp"
        >
          {codes['heat_pump.compressor_on']}
        </text>
      )}
      {/* cooling valve: name + state beside its actuator */}
      <g data-valve-label="valve_cool">
        <text
          x={coolC[0] + 32}
          y={coolC[1] - 4}
          fontSize="15"
          className="fs-t fs-t-p"
          stroke="var(--fs-tech)"
          strokeWidth="4"
          data-label="valve_cool"
        >
          Ventil chlazení
        </text>
        <text
          x={coolC[0] + 32}
          y={coolC[1] + 14}
          fontSize="15"
          className={`fs-t ${st.coolValve.path === 'unknown' ? 'fs-nodata' : 'fs-t-m'}`}
          stroke="var(--fs-tech)"
          strokeWidth="4"
          data-testid="heating-full-cool-state"
        >
          {coolLine}
        </text>
      </g>
      {mixLine && (
        <text
          x={mixC[0] - 30}
          y={mixC[1] + 38}
          fontSize="15"
          textAnchor="end"
          className="fs-t fs-t-m"
          stroke="var(--fs-tech)"
          strokeWidth="4"
          data-testid="heating-full-mix-pct"
        >
          {mixLine}
        </text>
      )}
      {fault && (
        <g data-testid="heating-full-mix-fault" role="img" aria-label={`Porucha: ${fault.label}`}>
          <rect x={pillX} y={pillY} width={pillW} height="28" rx="14" className="fs-pill" />
          <FaultIcon x={pillX + 17} y={pillY + 14.5} />
          <text x={pillX + 32} y={pillY + 19.5} fontSize="15" className="fs-t fs-t-pill">
            {pillText}
          </text>
        </g>
      )}
      {/* live status under the legend (fills the former empty sky) */}
      <g data-testid="heating-full-status">
        <text
          x={lgx + 24}
          y={statusY}
          fontSize="15"
          className="fs-t fs-t-h"
          stroke="var(--fs-bg)"
          strokeWidth="4"
        >
          STAV
        </text>
        {(
          [
            [
              'Venku',
              outdoor === null
                ? null
                : `${outdoor.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\u202f°C`,
            ],
            ['Tepelné čerpadlo', HP_STATE[st.compressor]!],
            [
              'Data',
              st.live ? 'živě z regulace' : snap.source === 'ok' ? 'neaktuální' : 'nedostupná',
            ],
          ] as const
        ).map(([name, value], i) => (
          <text
            key={name}
            x={lgx + 24}
            y={statusY + 28 + i * 24}
            fontSize="15"
            className="fs-t fs-t-s"
            stroke="var(--fs-bg)"
            strokeWidth="4"
          >
            {name}
            <tspan x={lgx + 200} className={value ? 'fs-val' : 'fs-nodata'}>
              {value ?? '–'}
            </tspan>
          </text>
        ))}
      </g>
      {service && (
        <text
          x={G.arch.blockR + 360}
          y={G.arch.plantTop - 36}
          fontSize="15"
          className="fs-t fs-t-s"
          data-testid="heating-full-service-title"
        >
          Servis · adresy z mapy regulace
        </text>
      )}
    </svg>
  );
}

function ServiceCode({ k, l, code }: { k: string; l: GeoLabel; code: string }) {
  const [bx, by, bw, bh] = l.box as [number, number, number, number];
  const place = SERVICE_PLACE[k];
  const x = place === 'inline' ? bx + bw + 10 : l.x;
  const y = place === 'inline' ? l.y : place === 'above' ? by - 6 : by + bh + 14;
  return (
    <text
      x={x}
      y={y}
      fontSize="15"
      textAnchor={place === 'inline' ? 'start' : l.anchor}
      className={`fs-t fs-t-code${l.card ? ' fs-tank-detail' : ''}`}
      stroke={l.card ? 'none' : (HALO[l.halo] ?? 'none')}
      strokeWidth={l.card ? 0 : 4}
      data-service-code={k}
    >
      {code}
    </text>
  );
}
