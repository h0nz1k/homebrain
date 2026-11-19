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
import { endLabels, pipeBoxes, type Box4 } from './endLabels.js';
import { COOL_STATE, MIX_STATE, Overview } from './overview.js';
import type { Rect } from './panZoom.js';
import { LABEL_FONT, Pill, ValueLabel } from './pill.js';
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

/**
 * House mixing valve: open path A↔AB / B↔AB when the position is known, neutral body otherwise
 * ("poloha –"). Fault ring + badge only for an explicitly mapped fault lamp (`MIXER_FAULT_KEY`).
 */
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
          <g
            data-fault-glyph="valve_mix"
            data-testid="heating-full-mix-fault"
            role="img"
            aria-label={`Porucha: ${fault.label}`}
          >
            <circle r="17.5" className="fs-valve-fault-key" />
            <circle r="17.5" className="fs-valve-fault" />
            <FaultIcon x={21} y={21} s={0.97} />
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
  // manhole lid on the right half: the zone plate sits on the left of the pit edge
  const lx = pit[0] + pit[2] - lw - 40;
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
    </g>
  );
}

const HP_STATE: Record<string, string> = {
  on: 'kompresor běží',
  off: 'kompresor stojí',
  unknown: 'stav neznámý',
};

export interface FullSchematicProps {
  snap: HeatingSnapshot;
  service?: boolean;
  /** Fixed theme for tests; default follows the page. */
  theme?: 'light' | 'dark';
  /** overview = whole drawing on one screen (zone cards, ≥ 13 px), detail = every label. */
  lod?: 'overview' | 'detail';
  /** Visible preset box: pipes leaving it get an end label at the edge. */
  frame?: Rect | null;
}

/** Labels drawn as name + value pill under each other (narrow places, e.g. at the TČ ports). */
const STACKED = new Set(['hp_t_out', 'hp_t_in', 'hp_coll_out', 'hp_coll_in']);
/** Stacked labels above their pipe move up by the pill height. */
const READING_UP: Record<string, number> = { hp_t_out: 26, hp_t_in: 65 };
/** r3: room sensors start right of the rybárna riser so their pill ends before the radiator riser. */
const READING_X: Record<string, number> = { chip_attic: 746, chip_floor1: 746 };
/** r3 wording: the same text in the drawing, the cards and the status panel. */
const NAME_FIX: Record<string, string> = {};

export function FullSchematic({
  snap,
  service = false,
  theme,
  lod = 'detail',
  frame = null,
}: FullSchematicProps) {
  const overview = lod === 'overview';
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
  const colourOf = Object.fromEntries(G.pipes.map((p) => [p.id, p.colour]));
  const [hx, hy, hw] = G.glyphs.hp as [number, number, number];
  const mixC = G.glyphs.valveMix.c as [number, number];
  const coolC = G.glyphs.valves.valve_cool!.c as [number, number];
  // Cooling has no "active" signal in the map (only the enable flag): muted "bez signálu".
  const coolLine = COOL_STATE(st);
  const mixLine = `poloha: ${MIX_STATE(st)}`;

  const label = (k: string, extra?: ReactNode, extraClass?: string) => {
    const l = labels[k];
    if (!l) return null;
    const code = service && SERVICE_FIELD[k] ? codes[SERVICE_FIELD[k]] : undefined;
    if (l.zone) return <ZonePlate key={k} k={k} l={l} />;
    if (TANK_ROWS[k]) return null;
    if (l.reading && !l.card) {
      const stack = STACKED.has(k);
      const pipeSensor = l.pipeSensor;
      const lead = l.sensor ? 20 : 0;
      return (
        <g key={k} data-compressor-dependent={l.compressorDependent ? '' : undefined}>
          {pipeSensor && (
            <g className="fs-pipe-sensor" data-sensor-for={k}>
              <Sensor c={pipeSensor} />
            </g>
          )}
          <ValueLabel
            k={k}
            x={(READING_X[k] ?? l.x) - (l.anchor === 'start' ? lead : 0)}
            y={stack && READING_UP[k] ? l.y - READING_UP[k] : l.y}
            name={NAME_FIX[k] ?? l.lines[0] ?? ''}
            value={st.readings[k]}
            anchor={l.anchor}
            layout={stack ? 'stack' : 'inline'}
            nameClass={`fs-t-${l.styles[0] ?? 's'}`}
            halo={HALO[l.halo] === 'none' ? undefined : HALO[l.halo]}
            lead={lead}
          >
            {({ x0 }) => (l.sensor ? <Sensor c={[x0 + 7, l.y - 5]} /> : null)}
          </ValueLabel>
          {code && <ServiceCode k={k} l={l} code={code} reading={st.readings[k]} />}
        </g>
      );
    }
    // Cards inside the tank: the code joins the line and the card grows (no free space around).
    const grow = code && l.card ? 64 : 0;
    const tl: GeoLabel = grow ? { ...l, x: l.box[0]! + 18 - grow / 2, anchor: 'start' } : l;
    return (
      <g key={k} data-label-group={k}>
        {l.card && (
          <rect
            x={l.box[0]! - 4 - grow / 2}
            y={l.box[1]! - 2}
            width={l.box[2]! + 8 + grow}
            height={l.box[3]! + 4}
            rx="5"
            className="fs-card"
          />
        )}
        {l.sensor && <Sensor c={[l.box[0]! + 7 - grow / 2, l.box[1]! + l.box[3]! / 2]} />}
        {l.pipeSensor && (
          <g className="fs-pipe-sensor" data-sensor-for={k}>
            <Sensor c={l.pipeSensor} />
          </g>
        )}
        <g data-compressor-dependent={l.compressorDependent ? '' : undefined}>
          <Text
            l={NAME_FIX[k] ? { ...tl, lines: [NAME_FIX[k]] } : tl}
            k={k}
            extraClass={extraClass}
          >
            {extra}
            {code && l.card && (
              <tspan className="fs-t-code" data-service-code={k}>{` · ${code}`}</tspan>
            )}
          </Text>
        </g>
        {code && !l.card && (
          <ServiceCode k={k} l={l} code={code} reading={l.reading ? st.readings[k] : undefined} />
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
      data-lod={lod}
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
      <rect y={overview ? -400 : 0} width={W} height={H + (overview ? 800 : 0)} className="fs-bg" />
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
              {state === 'unknown' && <path d={p.d} className="fs-pipe-core" aria-hidden="true" />}
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
      {/* the supply → return gradient only while the pump runs; standing water = one colour */}
      <path
        d={G.coils.poolMeander}
        className={`fs-coil fs-pipe fs-s-${P.ppool_to_bottom}${
          P.ppool_to_bottom === 'flow' ? '' : ' fs-c-heat_supply'
        }`}
        stroke={P.ppool_to_bottom === 'flow' ? 'url(#fs-meander)' : undefined}
        data-coil="floor_pool_meander"
        data-state={P.ppool_to_bottom}
      />
      {G.leaders.map((ld) => (
        <path
          key={ld.of}
          d={`M${ld.pts.map((p) => `${p[0]} ${p[1]}`).join('L')}`}
          className="fs-leader"
        />
      ))}
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
        <g data-glyph="ryb_water" data-state="off">
          <Aquarium r={G.glyphs.aquarium} />
        </g>
        <g data-glyph="hx_cool">
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
      <ThreeWay id="valve_cool" path={st.coolValve.path} map={{ AB: 'u', A: 'd', B: 'l' }} />
      <ZoneValve id="valve_ryb_heat" open={st.fishValve} />
      <g className="fs-offline-glyph" data-state="off">
        <ZoneValve id="valve_ryb_water" open={false} />
      </g>
      {Object.entries(G.glyphs.pumps).map(([k, p]) => (
        <g key={k} className="fs-lift" data-glyph={k}>
          <Pump c={p.c} dir={p.dir} on={st.pumps[k] ?? null} id={k} label={PUMP_NAMES[k] ?? k} />
        </g>
      ))}
      {Object.entries(G.glyphs.sensors).map(([k, c]) => (
        <Sensor key={k} c={c} />
      ))}
      {/* wall pass-through: two short bars across the pipe (a dot is only ever a joint) */}
      {G.marks.map((mk, i) => {
        const d =
          mk.orient === 'h'
            ? `M${mk.x - 5} ${mk.y - 10}V${mk.y + 10}M${mk.x + 5} ${mk.y - 10}V${mk.y + 10}`
            : `M${mk.x - 10} ${mk.y - 5}H${mk.x + 10}M${mk.x - 10} ${mk.y + 5}H${mk.x + 10}`;
        return (
          <g key={i} data-sleeve="">
            <path d={d} className="fs-sleeve-key" />
            <path d={d} className="fs-sleeve-bar" />
          </g>
        );
      })}
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
              <Chevron x={cv.x} y={cv.y} angle={cv.angle} size={cv.scale * (overview ? 1.6 : 1)} />
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
      {G.badges.map((bd) => (
        <g key={bd.of} data-badge-for={bd.of} data-question={bd.text}>
          <circle cx={bd.x} cy={bd.y} r={bd.r * (overview ? 2.4 : 1)} className="fs-badge" />
          <text
            x={bd.x}
            y={bd.y + (overview ? 12.4 : 5.2)}
            fontSize={overview ? 35 : 15}
            textAnchor="middle"
            className="fs-t fs-t-badge"
          >
            {bd.text}
          </text>
        </g>
      ))}
      {/* labels */}
      {!overview &&
        Object.keys(labels).map((k) => {
          if (k === 'valve_ryb_water' || k === 'ryb_water_state')
            return label(k, undefined, 'fs-t-offline');
          return label(k);
        })}
      {!overview && <TankColumn st={st} codes={service ? codes : {}} />}
      {!overview && (
        <>
          {/* heat pump nameplate: two lines sitting on the cabinet top */}
          <g data-label-group="hp">
            <text
              x={hx + hw / 2}
              y={hy - 28}
              fontSize="15"
              textAnchor="middle"
              className="fs-t fs-t-T"
              stroke="var(--fs-tech)"
              strokeWidth="4"
              data-label="hp"
            >
              {manifest?.model ? `TČ ${manifest.model}` : 'Tepelné čerpadlo'}
            </text>
            <text
              x={hx + hw / 2}
              y={hy - 9}
              fontSize="15"
              textAnchor="middle"
              className={`fs-t ${st.compressor === 'on' ? 'fs-hp-run' : 'fs-t-m'}`}
              stroke="var(--fs-tech)"
              strokeWidth="4"
              data-testid="heating-full-hp-state"
            >
              {HP_STATE[st.compressor]}
            </text>
          </g>
          {service && codes['heat_pump.compressor_on'] && (
            <text
              x={hx + hw + 10}
              y={hy - 9}
              fontSize="15"
              className="fs-t fs-t-code"
              stroke="var(--fs-tech)"
              strokeWidth="4"
              data-service-code="hp"
            >
              {codes['heat_pump.compressor_on']}
            </text>
          )}
          {/* mixing valve: name + position right of the body, below the supply */}
          <g data-valve-label="valve_mix">
            <text
              x={mixC[0] + 34}
              y={mixC[1] + 27}
              fontSize="15"
              className="fs-t fs-t-p"
              stroke="var(--fs-tech)"
              strokeWidth="4"
              data-label="valve_mix"
            >
              Směšovací ventil
            </text>
            <text
              x={mixC[0] + 34}
              y={mixC[1] + 45}
              fontSize="15"
              className={`fs-t ${st.mixer.pct === null ? 'fs-nodata' : 'fs-t-m'}`}
              stroke="var(--fs-tech)"
              strokeWidth="4"
              data-testid="heating-full-mix-pct"
            >
              {mixLine}
            </text>
          </g>
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
          <FishState st={st} />
          <PoolCard st={st} />
        </>
      )}
      {overview && <Overview st={st} />}
      {!overview && frame && <EndLabels frame={frame} />}
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

function ServiceCode({
  k,
  l,
  code,
  reading,
}: {
  k: string;
  l: GeoLabel;
  code: string;
  reading?: string | null;
}) {
  const [bx, by, bw, bh] = l.box as [number, number, number, number];
  const place = SERVICE_PLACE[k];
  // The frozen box measures the name only; the live value follows it (≈ 7.6 units per glyph).
  const value = reading === undefined ? 0 : 10 + 7.6 * (reading ?? '–').length;
  const x = place === 'inline' ? bx + bw + value + 8 : l.x;
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

/** Zone title: a plate on the top-left edge of its zone (same position for every zone). */
function ZonePlate({ k, l }: { k: string; l: GeoLabel }) {
  const [x, y, w] = l.box as [number, number, number];
  const text = l.lines[0] ?? '';
  const width = Math.max(w, text.length * 15 * 0.68) + 16;
  return (
    <g data-label-group={k} data-zone-title="">
      <rect x={x - 8} y={y - 2} width={width} height="22" rx="4" className="fs-zone-plate" />
      <text x={x} y={y + 14.5} fontSize="15" className="fs-t fs-t-zone" data-label={k}>
        {text}
      </text>
      {l.sub && (
        <text
          x={x}
          y={y + 38}
          fontSize="15"
          className="fs-t fs-t-s"
          stroke={HALO[l.halo] ?? 'none'}
          strokeWidth="4"
          data-label={`${k}_sub`}
        >
          {l.sub}
        </text>
      )}
    </g>
  );
}

/**
 * r3: the tank labels sit in a free column right of the tank (outside the body, nothing over the
 * coils, heater or ports). Wall sensors sit on the right wall at their height; the inner parts
 * (DHW coil, solar coil, heater) get a short leader to their edge.
 */
const TANK_ROWS: Record<string, { cy: number; to?: 'dhw' | 'coil' | 'ek'; sensor?: boolean }> = {
  tank: { cy: 492 },
  tank_dhw: { cy: 532, to: 'dhw' },
  tank_high: { cy: 572, sensor: true },
  tank_solar_coil: { cy: 608, to: 'coil' },
  ek: { cy: 746, to: 'ek' },
  tank_low: { cy: 852, sensor: true },
};
const TANK_NAMES: Record<string, string> = {
  tank: 'AKN',
  tank_dhw: 'Teplá voda',
  tank_high: 'T nahoře',
  tank_solar_coil: 'Solární spirála',
  ek: 'Elektrický dohřev',
  tank_low: 'T dole',
};
const TANK_FIELD: Record<string, string> = { tank_high: 'tank.top', tank_low: 'tank.bottom' };

function TankColumn({ st, codes }: { st: FullState; codes: Record<string, string> }) {
  const [tx, , tw] = G.glyphs.tank as [number, number, number];
  const wall = tx + tw;
  const x0 = wall + 16;
  const dhw = G.glyphs.tankDhw;
  const coil = G.glyphs.tankCoil;
  const target = {
    dhw: [dhw[0]! + dhw[2]!, dhw[1]! + dhw[3]! / 2],
    coil: [coil[0]! + coil[2]!, coil[1]! + coil[3]! / 2],
    ek: [G.glyphs.ek.x1 + 4, G.glyphs.ek.y0],
  } as const;
  return (
    <g data-tank-column="">
      {Object.entries(TANK_ROWS).map(([k, r]) => {
        const name = TANK_NAMES[k]!;
        const code = codes[TANK_FIELD[k] ?? ''];
        const reading = k === 'tank_dhw' || k === 'tank_high' || k === 'tank_low';
        const y = r.cy + LABEL_FONT * 0.34;
        const leader = r.to ? target[r.to] : null;
        return (
          <g key={k} data-tank-row={k}>
            {leader && (
              <path
                d={`M${x0 - 4} ${r.cy}H${wall + 4}L${leader[0]} ${leader[1]}`}
                className="fs-leader"
                data-leader-for={k}
              />
            )}
            {r.sensor && <Sensor c={[wall, r.cy]} />}
            {reading ? (
              <ValueLabel
                k={k}
                x={x0}
                y={y}
                name={name}
                value={st.readings[k]}
                nameClass="fs-t-p"
                halo="var(--fs-tech)"
              />
            ) : (
              <text
                x={x0}
                y={y}
                fontSize={LABEL_FONT}
                className={`fs-t ${k === 'tank' ? 'fs-t-T' : 'fs-t-p'}`}
                stroke="var(--fs-tech)"
                strokeWidth="4"
                data-label={k}
              >
                {name}
              </text>
            )}
            {code && (
              <text
                x={x0 + 172}
                y={y}
                fontSize="14"
                className="fs-t fs-t-code"
                data-service-code={k}
              >
                {code}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Rybárna: tempering state from the valve to heating + heating-enabled flag + temperatures. */
function FishState({ st }: { st: FullState }) {
  if (!st.fish) return null;
  const l = G.labels.chip_fish;
  if (!l) return null;
  return (
    <text
      x={l.x}
      y={l.y + 22}
      fontSize="15"
      className={`fs-t ${st.fish.label === 'stav –' ? 'fs-nodata' : 'fs-t-s'}`}
      stroke="var(--fs-room)"
      strokeWidth="4"
      data-testid="heating-full-fish-state"
      data-active={String(st.fish.active)}
    >
      {st.fish.label}
    </text>
  );
}

/**
 * Pool card inside the basin (r3): the basin has no water-temperature sensor – said so plainly;
 * 27,9 °C is the return of the floor heating. Pump rows carry the pump glyph (legend encoding).
 */
function PoolCard({ st }: { st: FullState }) {
  const [px, py, pw] = G.glyphs.pool as [number, number, number];
  const x = px + 12;
  const w = pw - 24;
  const y = py + 22;
  const p = st.pool;
  const right = x + w - 10;
  const row = (i: number) => y + 22 + i * 30;
  return (
    <g data-testid="heating-full-pool-card" data-label-group="pool">
      <rect x={x} y={y} width={w} height="160" rx="8" className="fs-card fs-card-edge" />
      <text
        x={x + 10}
        y={row(0) + 5}
        fontSize={LABEL_FONT}
        className="fs-t fs-tank-detail"
        data-pool-row="Teplota vody"
      >
        Teplota vody
      </text>
      <Pill x={right} cy={row(0)} anchor="end" value={null} missing="bez čidla" k="pool_water" />
      <text
        x={x + 10}
        y={row(1) + 5}
        fontSize={LABEL_FONT}
        className="fs-t fs-tank-detail"
        data-pool-row="Zpátečka ohřevu bazénu"
      >
        Zpátečka ohřevu bazénu
      </text>
      <Pill x={right} cy={row(1) + 28} anchor="end" value={p?.temp ?? null} k="pool_return" />
      {(
        [
          ['Ohřev dna', 'pump_pool', p?.heating ?? null],
          ['Filtrace', 'pump_filt', p?.filter ?? null],
        ] as const
      ).map(([name, id, on], i) => {
        const cy = row(2.9 + i);
        return (
          <g key={id} data-pool-row={name} data-state={String(on)}>
            <g transform={`translate(${x + 20} ${cy}) scale(.8) translate(${-x - 20} ${-cy})`}>
              <Pump c={[x + 20, cy]} dir="r" on={on} id={`card_${id}`} label={name} />
            </g>
            <text x={x + 40} y={cy + 5} fontSize={LABEL_FONT} className="fs-t fs-tank-detail">
              {name}
            </text>
            <Pill
              x={right}
              cy={cy}
              anchor="end"
              value={on === null ? null : on ? 'běží' : 'stojí'}
              missing="bez signálu"
              k={`pool_${id}`}
              className={on ? 'fs-pill-run' : undefined}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Everything an end label must keep clear of: pipes, glyphs, labels, plates, the tank column. */
export const END_AVOID: Box4[] = (() => {
  const out: Box4[] = pipeBoxes(G.pipes);
  for (const [k, b] of Object.entries(G.boxes)) {
    if (k === 'ground' || k === 'pool' || k === 'floor_pool') continue;
    out.push([b[0]! - 4, b[1]! - 4, b[2]! + 8, b[3]! + 8]);
  }
  for (const l of Object.values(G.labels)) {
    const [x, y, w, h] = l.box as Box4;
    if (l.zone) {
      out.push([x - 10, y - 4, (l.lines[0]?.length ?? 0) * 15 * 0.68 + 20, l.sub ? 48 : 26]);
      continue;
    }
    const extra = l.reading ? 100 : 0;
    const x0 = l.anchor === 'start' ? x : l.anchor === 'middle' ? x - extra / 2 : x - extra;
    out.push([x0 - (l.sensor ? 20 : 0) - 6, y - 3, w + extra + (l.sensor ? 20 : 0) + 12, h + 6]);
  }
  const [tx, , tw] = G.glyphs.tank as Box4;
  out.push([tx, G.glyphs.tank[1]! - 10, tw, G.glyphs.tank[3]! + 30]);
  for (const r of Object.values(TANK_ROWS)) out.push([tx + tw, r.cy - 14, 240, 28]);
  const [hx, hy, hw] = G.glyphs.hp as Box4;
  out.push([hx - 20, hy - 46, hw + 40, 46]);
  const [mx, my] = G.glyphs.valveMix.c as [number, number];
  out.push([mx + 30, my + 10, 170, 42]);
  const [cx, cy] = G.glyphs.valves.valve_cool!.c as [number, number];
  out.push([cx + 28, cy - 20, 140, 42]);
  const [px, py, pw] = G.glyphs.pool as Box4;
  out.push([px, py, pw, 200]);
  return out;
})();

/** "Where it goes" labels at the edge of the preset frame (r3). */
function EndLabels({ frame }: { frame: Rect }) {
  return (
    <g data-layer="end-labels">
      {endLabels(G.pipes, frame, END_AVOID, G.boxes).map((e) => (
        <g key={`${e.edge}-${e.pipe}`} data-end-label={e.pipe} data-edge={e.edge}>
          {e.bracket && (
            <path
              d={`M${e.bracket[0]} ${e.bracket[1]}L${e.bracket[2]} ${e.bracket[3]}`}
              className="fs-end-bracket"
            />
          )}
          <text
            x={e.x}
            y={e.y}
            fontSize={LABEL_FONT}
            textAnchor={e.anchor}
            className="fs-t fs-t-end"
            stroke="var(--fs-tech)"
            strokeWidth="4"
          >
            {e.text}
          </text>
        </g>
      ))}
    </g>
  );
}
