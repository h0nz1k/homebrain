/**
 * Glyphs of the full schematic, ported 1:1 from the approved static round p3i (`gen_p3i.py`).
 * Pure SVG; colours come from the `.ht-fs` CSS variables (both themes).
 */
import type { ReactNode } from 'react';

const DIRV: Record<string, [number, number]> = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };
const ANG: Record<string, number> = { r: 0, d: 90, l: 180, u: -90 };

/** Circulator: metal housing, motor and flow triangle. `on` drives the triangle tone only. */
export function Pump({
  c,
  dir,
  on,
  id,
  label,
}: {
  c: readonly number[];
  dir: string;
  on: boolean | null;
  id: string;
  label: string;
}) {
  const state = on === null ? 'unknown' : on ? 'on' : 'off';
  return (
    <g
      className={`fs-pump fs-pump-${state}`}
      transform={`translate(${c[0]} ${c[1]})`}
      data-pump={id}
      data-state={state}
      role="img"
      aria-label={`${label}: ${on === null ? 'stav neznámý' : on ? 'běží' : 'stojí'}`}
    >
      <circle r="15" className="fs-metal fs-ring" />
      <circle r="10.5" className="fs-motor" />
      <path d="M-4.6 -6.2L7.2 0L-4.6 6.2Z" className="fs-tri" transform={`rotate(${ANG[dir]})`} />
    </g>
  );
}

/** Valve body: flanges, r9.5 body, position bar, actuator (stem + motor + servo mark). */
export function ValveBody({
  ports,
  act,
  closed = [],
  bar = true,
}: {
  ports: readonly string[];
  act: string;
  closed?: readonly string[];
  bar?: boolean;
}) {
  const rot = { u: 0, r: 90, d: 180, l: -90 }[act as 'u'] ?? 0;
  return (
    <>
      {ports.map((p) => {
        const [dx, dy] = DIRV[p]!;
        return (
          <path
            key={p}
            d={`M0 0L${dx * 13} ${dy * 13}`}
            className={`fs-flange${closed.includes(p) ? ' fs-flange-closed' : ''}`}
            data-port-dir={p}
          />
        );
      })}
      <circle r="9.5" className="fs-metal" />
      {bar && <path d={act === 'u' || act === 'd' ? 'M-5 0H5' : 'M0 -5V5'} className="fs-posbar" />}
      <g transform={`rotate(${rot})`}>
        <path d="M0 -9.5V-15" className="fs-stem" />
        <rect x="-9" y="-26" width="18" height="11" rx="2" className="fs-motor" />
        <path d="M-4.5 -20.5H1.5" className="fs-servo" />
      </g>
    </>
  );
}

export function Sensor({ c }: { c: readonly number[] }) {
  return (
    <g className="fs-sensor" transform={`translate(${c[0]} ${c[1]})`}>
      <circle r="6.5" className="fs-sensor-ring" />
      <circle r="2.4" className="fs-sensor-core" />
    </g>
  );
}

/** Warning triangle with a knocked-out '!'. */
export function FaultIcon({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -7.5L8 6.5H-8Z" className="fs-fault-icon" strokeLinejoin="round" />
      <path d="M0 -2.6V1.6M0 4.1v.1" className="fs-fault-mark" />
    </g>
  );
}

export function Chevron({
  x,
  y,
  angle = 0,
  size = 1,
}: {
  x: number;
  y: number;
  angle?: number;
  size?: number;
}) {
  const d = 'M-6.4 -6.4L5.4 0L-6.4 6.4';
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`} className="fs-chev-g">
      <path d={d} className="fs-chev fs-chev-keyline" />
      <path d={d} className="fs-chev" />
    </g>
  );
}

/** Upright plate heat exchanger with pressed chevron plates and four corner ports. */
export function Phe({ r }: { r: readonly number[] }) {
  const [x, y, w, h] = r as [number, number, number, number];
  const ridges = (
    [
      [0.21, 5],
      [0.32, -5],
      [0.43, 5],
      [0.54, -5],
      [0.65, 5],
      [0.76, -5],
    ] as const
  )
    .map(([f, dy]) => `M${x + 12} ${y + h * f}l${(w - 24) / 2} ${dy}l${(w - 24) / 2} ${-dy}`)
    .join('');
  const cr = Math.min(w, h) * 0.068;
  return (
    <g className="fs-phe">
      <rect x={x} y={y} width={w} height={h} rx="3" className="fs-phe-frame" />
      <rect x={x + 6} y={y + 7} width={w - 12} height={h - 14} rx="3" className="fs-phe-pack" />
      <path d={ridges} className="fs-phe-plates" />
      {[
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={cr} className="fs-fitting" />
      ))}
    </g>
  );
}

function HxCore({ r }: { r: readonly number[] }) {
  const [x, y, w, h] = r as [number, number, number, number];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const end = w / 2;
  const half = h / 2;
  const pack = Math.min(w * 0.6, 72);
  const height = Math.min(h * 0.56, 35);
  const plates = [-6, -4, -2, 0, 2, 4, 6].map((i) => (pack * i) / 12);
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <rect x={-end} y={-half} width={w} height={h} rx="5" className="fs-hx-body" />
      <rect
        x={-pack / 2 - 3}
        y={-height / 2 - 2}
        width={pack + 6}
        height={height + 4}
        rx="3"
        className="fs-fan-ring"
      />
      <rect x={-end} y={-half} width="8" height={h} rx="2" className="fs-metal" />
      <rect x={end - 8} y={-half} width="8" height={h} rx="2" className="fs-metal" />
      {plates.map((p) => (
        <path key={p} d={`M${p} ${-height / 2}v${height}`} className="fs-hx-plates" />
      ))}
      {[-1, 1].flatMap((side) =>
        [-1, 1].map((level) => (
          <circle
            key={`${side}${level}`}
            cx={side * (end - 4)}
            cy={level * half * 0.53}
            r={Math.min(1.8, half / 6)}
            className="fs-hub"
          />
        )),
      )}
    </g>
  );
}

/** Fan heater = exchanger core + fan. */
export function Fan({ r }: { r: readonly number[] }) {
  const [x, y, w, h] = r as [number, number, number, number];
  const fr = h / 2 - 3;
  const fx = x + w - fr - 2;
  const fy = y + h / 2;
  return (
    <g className="fs-fan">
      <HxCore r={[x, y, w - 2 * fr - 8, h]} />
      <g transform={`translate(${fx} ${fy})`}>
        <circle r={fr} className="fs-fan-ring" />
        {[0, 120, 240].map((a) => (
          <path
            key={a}
            d={`M0 0C${(fr * 0.2).toFixed(1)} ${(-fr * 0.55).toFixed(1)} ${(fr * 0.75).toFixed(1)} ${(-fr * 0.6).toFixed(1)} ${(fr * 0.85).toFixed(1)} ${(-fr * 0.2).toFixed(1)}Z`}
            className="fs-blade"
            transform={`rotate(${a})`}
          />
        ))}
        <circle r="2.6" className="fs-hub" />
      </g>
    </g>
  );
}

export function Aquarium({ r }: { r: readonly number[] }) {
  const [x, y, w, h] = r as [number, number, number, number];
  return (
    <g className="fs-aquarium">
      <rect x={x} y={y} width={w} height={h} rx="6" className="fs-glass" />
      <path d={`M${x + 4} ${y + 14}H${x + w - 4}V${y + h - 4}H${x + 4}Z`} className="fs-aq-water" />
    </g>
  );
}

function Radiator({ r }: { r: readonly number[] }) {
  const [x, y, w, h] = r as [number, number, number, number];
  const n = Math.floor((w - 8) / 9);
  return (
    <g className="fs-radiator">
      <rect x={x} y={y} width={w} height={h} rx="4" className="fs-ceramic" />
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={x + 6 + i * 9}
          y={y + 4}
          width="5"
          height={h - 8}
          rx="1.5"
          className="fs-fin"
        />
      ))}
    </g>
  );
}

const RAD_X = 34;
/** ONE radiator circuit: supply riser → two radiators → return riser (pipes coloured by state). */
export function RadiatorPair({
  box,
  ys,
  slab,
  supplyClass,
  returnClass,
}: {
  box: readonly number[];
  ys: readonly number[];
  slab: number;
  supplyClass: string;
  returnClass: string;
}) {
  const [x, y, , h] = box as [number, number, number, number];
  const xs = x + 16;
  const xr = x + RAD_X + 128 + 18;
  const top = ys[0]!;
  const bot = ys[ys.length - 1]!;
  return (
    <g data-glyph="radiators">
      <path
        d={`M${x} ${top}H${x + RAD_X}M${xs} ${top}V${bot}H${x + RAD_X}`}
        className={supplyClass}
      />
      <path
        d={`M${x + RAD_X + 128} ${top}H${xr}M${x + RAD_X + 128} ${bot}H${xr}M${xr} ${top}V${y + h}`}
        className={returnClass}
      />
      {ys.map((yy) => (
        <Radiator key={yy} r={[x + RAD_X, yy - 18, 128, 36]} />
      ))}
      {[xs, xr].map((xx) => (
        <rect
          key={xx}
          x={xx - 8}
          y={slab - 4}
          width="16"
          height="8"
          rx="2.5"
          className="fs-sleeve"
        />
      ))}
    </g>
  );
}

export function Solar({ box, legsTo }: { box: readonly number[]; legsTo: number }) {
  const [x, y, w, h] = box as [number, number, number, number];
  const n = Math.floor((w - 14) / 16);
  const fins = Array.from(
    { length: n },
    (_, i) => `M${x + 10 + i * 16} ${y + 4}v${h - 8}M${x + 16 + i * 16} ${y + 4}v${h - 8}`,
  ).join('');
  const qs = [x + w * 0.4, x + w * 0.83];
  return (
    <g className="fs-solar">
      <path d={qs.map((q) => `M${q} ${y + h}V${legsTo - 4}`).join('')} className="fs-leg" />
      {qs.map((q) => (
        <rect key={q} x={q - 9} y={legsTo - 5} width="18" height="5" rx="1.5" className="fs-foot" />
      ))}
      <rect x={x} y={y} width={w} height={h} rx="5" className="fs-solar-panel" />
      <path d={fins} className="fs-solar-fin" />
    </g>
  );
}

export function Filter({ r }: { r: readonly number[] }) {
  const [x, y, w, h] = r as [number, number, number, number];
  return (
    <g className="fs-filter">
      <rect x={x} y={y} width={w} height={h} rx={w / 2 - 4} className="fs-filter-shell" />
      <path
        d={`M${x + 8} ${y + 14}H${x + w - 8}M${x + 8} ${y + h - 12}H${x + w - 8}`}
        className="fs-band"
      />
    </g>
  );
}

export function Salinator({ r }: { r: readonly number[] }) {
  const [x, y, w, h] = r as [number, number, number, number];
  const plates = [0, 1, 2, 3].map((i) => `M${x + 11 + i * 6} ${y + 20}V${y + h - 7}`).join('');
  return (
    <g className="fs-salinator">
      <rect x={x + 7} y={y} width={w - 14} height="11" rx="2" className="fs-motor" />
      <path d={`M${x + w / 2} ${y + 11}v4`} className="fs-stem" />
      <rect x={x} y={y + 14} width={w} height={h - 14} rx="9" className="fs-cell" />
      <path d={plates} className="fs-electrode" />
    </g>
  );
}

export function Treatment({ r, dosing }: { r: readonly number[]; dosing: boolean }) {
  const [x, y, w, h] = r as [number, number, number, number];
  const cx = x + w / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" className="fs-cell" />
      {dosing ? (
        <path d={`M${cx} ${y + 6}q-12 13 0 17q12-4 0-17Z`} className="fs-cell" />
      ) : (
        <>
          <path d={`M${cx} ${y + 6}v19`} className="fs-electrode" />
          <circle cx={cx} cy={y + 25} r="4" className="fs-device-led" />
        </>
      )}
    </g>
  );
}

export function Dehumidifier({ r }: { r: readonly number[] }) {
  const [x, y, w, h] = r as [number, number, number, number];
  const vents: string[] = [];
  for (let i = 8; i < w - 12; i += 5) vents.push(`M${x + i} ${y + 5}v8`);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="5" className="fs-cabinet" />
      <path d={vents.join('')} className="fs-hx-plates" />
      <circle cx={x + w - 9} cy={y + 9} r="2" className="fs-device-led" />
    </g>
  );
}

/** Immersion heater: flange on the tank shell + hair-pin element. */
export function Ek({ x0, y0, x1, on }: { x0: number; y0: number; x1: number; on: boolean | null }) {
  const rod = `M${x0 + 5} ${y0 + 2}H${x1}A6 6 0 0 1 ${x1} ${y0 + 14}H${x0 + 5}`;
  return (
    <g className="fs-ek" data-on={on === true ? '' : undefined}>
      <rect x={x0 - 5} y={y0 - 4} width="10" height="24" rx="2" className="fs-ek-flange" />
      <path d={rod} className="fs-tank-coil-keyline" />
      <path d={rod} className="fs-ek-rod" />
    </g>
  );
}

const DOME = 36;
export function domeY(r: readonly number[], x: number) {
  const [tx, ty, tw] = r as [number, number, number];
  const a = tw / 2;
  const t = Math.min(1, Math.abs(x - (tx + a)) / a);
  return ty + DOME - DOME * Math.sqrt(1 - t * t);
}

/** Buffer tank: capsule with domed ends on two legs, stratified water window. */
export function TankShell({ r, water }: { r: readonly number[]; water: string }) {
  const [x, y, w, h] = r as [number, number, number, number];
  const base = y + h - 22;
  const a = w / 2;
  const cap = `M${x} ${y + DOME}A${a} ${DOME} 0 0 1 ${x + w} ${y + DOME}V${base - DOME}A${a} ${DOME} 0 0 1 ${x} ${base - DOME}Z`;
  const i = 7;
  const ai = a - i;
  const d2 = DOME - 5;
  const win = `M${x + i} ${y + i + d2}A${ai} ${d2} 0 0 1 ${x + w - i} ${y + i + d2}V${base - i - d2}A${ai} ${d2} 0 0 1 ${x + i} ${base - i - d2}Z`;
  const qs = [x + 34, x + w - 34];
  return (
    <g className="fs-tank" data-glyph="tank">
      <path d={qs.map((q) => `M${q} ${base - 6}V${y + h - 4}`).join('')} className="fs-tank-leg" />
      {qs.map((q) => (
        <rect key={q} x={q - 13} y={y + h - 5} width="26" height="5" rx="2" className="fs-foot" />
      ))}
      <path d={cap} className="fs-shell" />
      <path d={win} fill={water} className="fs-window" />
    </g>
  );
}

export function TankInner({
  dhw,
  coil,
  coilClass,
}: {
  dhw: readonly number[];
  coil: readonly number[];
  coilClass: string;
}) {
  const [vx, vy, vw, vh] = dhw as [number, number, number, number];
  const [cx, cy, cw, ch] = coil as [number, number, number, number];
  const xr = cx + cw;
  const xl = cx + 10;
  const y1 = cy + 14;
  const y2 = cy + ch - 14;
  const n = Math.floor((xr - 8 - xl) / 16);
  const top = `M${xr} ${y1}H${xr - 8}${'q-4 -7 -8 0q-4 7 -8 0'.repeat(n)}H${xl}`;
  const d = `${top}Q${xl - 12} ${(y1 + y2) / 2} ${xl} ${y2}H${xr}`;
  return (
    <>
      <rect x={vx} y={vy} width={vw} height={vh} rx="14" className="fs-vessel" />
      <path d={d} className="fs-tank-coil-keyline" />
      <path d={d} className={coilClass} />
    </>
  );
}

/** TUV / SV stub end: the pipe ends in an open arrow head. */
export function Terminal({
  box,
  up,
  pipeClass,
  fillClass,
}: {
  box: readonly number[];
  up: boolean;
  pipeClass: string;
  fillClass: string;
}) {
  const [x, y, w, h] = box as [number, number, number, number];
  const cx = x + w / 2;
  return up ? (
    <g>
      <path d={`M${cx} ${y + h}V${y + 10}`} className={pipeClass} />
      <path d={`M${cx - 8} ${y + 11}L${cx} ${y}L${cx + 8} ${y + 11}Z`} className={fillClass} />
    </g>
  ) : (
    <g>
      <path d={`M${cx} ${y}V${y + h}`} className={pipeClass} />
      <path d={`M${cx - 8} ${y + 8}L${cx} ${y + 19}L${cx + 8} ${y + 8}Z`} className={fillClass} />
      <path d={`M${cx - 6} ${y}H${cx + 6}`} className={pipeClass} style={{ strokeWidth: 4 }} />
    </g>
  );
}

/** Telescopic pool enclosure in three overlapping profiles. */
export function PoolEnclosure({ x, width, rail }: { x: number; width: number; rail: number }) {
  const seg = width * 0.386;
  const parts: ReactNode[] = [];
  for (const index of [2, 1, 0]) {
    const a = x - width * 0.028 + index * width * 0.324;
    const z = a + seg;
    const h = width * (0.345 - index * 0.031);
    const profile = `M${a} ${rail}V${rail - h * 0.5}Q${a} ${rail - h} ${a + seg * 0.3} ${rail - h}H${z - seg * 0.3}Q${z} ${rail - h} ${z} ${rail - h * 0.5}V${rail}`;
    const ribs = [0.36, 0.64].map((f) => `M${a + f * seg} ${rail}V${rail - h + 3}`).join('');
    parts.push(
      <g key={index}>
        <path d={`${profile}Z`} className="fs-encl-fill" />
        <path d={ribs} className="fs-encl-rib" />
        <path d={profile} className="fs-encl" />
      </g>,
    );
  }
  return (
    <g>
      {parts}
      <path d={`M${x - 16} ${rail}H${x + width + 16}`} className="fs-encl-rail" />
    </g>
  );
}
