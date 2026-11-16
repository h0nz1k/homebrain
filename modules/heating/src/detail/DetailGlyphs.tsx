import type { ReactNode } from 'react';
import { useId } from 'react';
import type { DetailSchematicModel, SchematicBody } from './types.js';

export function DetailArchitecture({ model }: { model: DetailSchematicModel }) {
  const ratio = model.bodies.find((b) => b.id === 'tank')!.h / 420;
  const ground = model.bodies.find((b) => b.id === 'main-house')!;
  const groundY = ground.y + ground.h;
  const hall = model.bodies.find((b) => b.id === 'pool-hall')!;

  return (
    <>
      <rect
        data-soil=""
        x={ground.x}
        y={groundY}
        width={ground.w}
        height={hall.y + hall.h - groundY + 24 * ratio}
        fill="var(--ht-c3-soil)"
      />
      {['main-house', 'fish-house', 'pool-hall'].map((id) => {
        const b = model.bodies.find((b) => b.id === id)!;
        const roof = (id === 'main-house' ? 90 : 45) * ratio;
        return (
          <path
            key={id}
            data-architecture={id === 'fish-house' ? 'rybarna' : id}
            d={
              id === 'pool-hall'
                ? `M${b.x} ${b.y}H${b.x + b.w}V${b.y + b.h}H${b.x}Z`
                : `M${b.x} ${b.y + roof}L${b.x + b.w / 2} ${b.y}L${b.x + b.w} ${b.y + roof}V${b.y + b.h}H${b.x}Z`
            }
            className="ht-d1-house"
          />
        );
      })}
      <text
        x={model.layout.poolHallX + model.bodies.find((b) => b.id === 'pool-hall')!.w * 0.26}
        y={model.bodies.find((b) => b.id === 'pool-hall')!.y + 100 * ratio}
        className="ht-d1-arch-label"
        textAnchor="middle"
      >
        Bazén
      </text>
      <path
        data-hall-ground=""
        d={`M${hall.x + hall.w} ${hall.y + hall.h}H${hall.x}`}
        fill="none"
        stroke="var(--ht-c3-wall)"
        strokeWidth={5}
      />
      <rect
        data-ground-line={groundY}
        x={ground.x}
        y={groundY}
        width={model.bodies.find((b) => b.id === 'main-house')!.w}
        height={95 * ratio}
        className="ht-d1-ground-band"
      />
    </>
  );
}

export function DetailTankGlyph({ body: b }: { body: SchematicBody }) {
  const uid = useId().replace(/:/g, '');
  return (
    <g data-node="tank" transform={`translate(${b.x} ${b.y}) scale(${b.w / 140} ${b.h / 420})`}>
      <defs>
        <linearGradient id={uid} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop stopColor="#ca7370" />
          <stop offset=".5" stopColor="#ac989d" />
          <stop offset="1" stopColor="#4d91bd" />
        </linearGradient>
      </defs>
      <rect
        width={140}
        height={420}
        rx={24}
        fill={`url(#${uid})`}
        stroke="var(--ht-c3-wall)"
        strokeWidth={3}
      />
      <path
        d="M10 24Q70 42 130 24M10 396Q70 380 130 396"
        fill="none"
        stroke="var(--ht-c3-wall)"
        strokeWidth={2}
      />
      <path
        d="M40 0V65H110V85H30V105H110V125H100V380H80V420"
        className="ht-d1-internal ht-d1-potable-coil"
      />
      <path d="M0 340H25V350H70V365H25V370H0" className="ht-c3-solar-coil" />
    </g>
  );
}

export function DetailHpGlyph({ body: b, on }: { body: SchematicBody; on: boolean | null }) {
  return (
    <g
      data-node="hp"
      aria-label="Tepelné čerpadlo"
      transform={`translate(${b.x} ${b.y}) scale(${b.w / 100} ${b.h / 130})`}
    >
      <rect width={100} height={130} rx={12} className="ht-c3-cabinet" />
      <circle
        data-hp-status-dot=""
        cx={15}
        cy={15}
        r={4}
        fill={on === true ? 'var(--hb-ok)' : 'var(--hb-t2)'}
      />
      <rect x={20} y={40} width={60} height={65} rx={6} className="ht-c3-cutaway" />
      <path d="M29 48V96M71 48V96" className="ht-c3-plates" />
      <rect x={40} y={56} width={22} height={36} rx={9} className="ht-c3-compressor" />
      <path d="M24 25H76" className="ht-c3-plates" />
      <path d="M15 140V130M85 140V130" className="ht-c3-metal-pipe" />
    </g>
  );
}
export function DetailRadiatorGlyph({ body: b }: { body: SchematicBody }) {
  return (
    <g data-node={b.id} transform={`translate(${b.x} ${b.y}) scale(${b.w / 120} ${b.h / 65})`}>
      <rect width={120} height={65} rx={6} className="ht-c3-ceramic" />
      {[12, 28, 44, 60, 76, 92, 108].map((x) => (
        <path key={x} d={`M${x} 8V57`} className="ht-c3-fin" style={{ strokeWidth: 5 }} />
      ))}
    </g>
  );
}
export function DetailSolarPanel({ model, show }: { model: DetailSchematicModel; show: boolean }) {
  if (!show) return null;
  const b = model.bodies.find((b) => b.id === 'main-house')!;
  const x = (model.ports['solar.in']!.x + model.ports['solar.out']!.x) / 2;
  const ratio = model.bodies.find((b) => b.id === 'tank')!.h / 420;
  // Panel feet sit on the left roof slope; the active surface remains above it.
  const y = b.y + (Math.abs(x - (b.x + b.w / 2)) * 180 * ratio) / b.w;
  return (
    <g
      data-node="solar-panel"
      transform={`translate(${x} ${y - 12 * ratio}) rotate(${(Math.atan2(-90 * ratio, b.w / 2) * 180) / Math.PI}) scale(${model.bodies.find((b) => b.id === 'tank')!.w / 140} 1)`}
    >
      <path d={`M-65 0V${12 * ratio}M65 0V${12 * ratio}`} className="ht-c3-metal-pipe" />
      <rect x={-90} y={-28} width={180} height={28} rx={4} className="ht-c3-solar-collector" />
      <path d="M-45 -26V-2M0 -26V-2M45 -26V-2" className="ht-c3-solar-fin" />
    </g>
  );
}
export function PoolBasinGlyph({ body: b, uid }: { body: SchematicBody; uid: string }) {
  return (
    <g data-node="pool-basin" transform={`translate(${b.x} ${b.y}) scale(${b.w / 180} 1)`}>
      <defs>
        <linearGradient id={`${uid}-water`} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop stopColor="#77d7ef" />
          <stop offset="1" stopColor="#277fae" />
        </linearGradient>
      </defs>
      <path
        d={`M0 0V${b.h}H180V0`}
        fill={`url(#${uid}-water)`}
        stroke="var(--ht-c3-wall)"
        strokeWidth={4}
      />
      <path d={`M0 8Q22 3 45 8T90 8T135 8T180 8`} stroke="#d5f8ff" strokeWidth={3} fill="none" />
      <path
        d={`M145 -10V${b.h - 5}M163 -10V${b.h - 5}M145 ${b.h * 0.4}H163M145 ${b.h * 0.7}H163`}
        stroke="#e5eaf0"
        strokeWidth={3}
        fill="none"
      />
    </g>
  );
}
export function PoolExchangerGlyph({ body: b }: { body: SchematicBody }) {
  return (
    <g data-node="pool-exch" transform={`translate(${b.x} ${b.y}) scale(${b.w / 36} ${b.h / 60})`}>
      <rect width={36} height={60} rx={5} className="ht-c3-metal" />
      {[10, 22, 34, 46].map((y) => (
        <path key={y} d={`M5 ${y}H31`} className="ht-c3-plates" />
      ))}
    </g>
  );
}
export function FloorHeatingLoop({ model }: { model: DetailSchematicModel }) {
  return (
    <rect
      data-floor-loop=""
      x={model.layout.poolHallX + 15}
      y={model.ports['floor.in']!.y - model.bodies.find((b) => b.id === 'tank')!.h / 42}
      width={model.bodies.find((b) => b.id === 'pool-hall')!.w * 0.94}
      height={model.bodies.find((b) => b.id === 'tank')!.h / 6}
      rx={8}
      className="ht-d1-floor-area"
    />
  );
}
export function DetailTapGlyph({ model }: { model: DetailSchematicModel }) {
  const p = model.ports['tap.in']!;
  return (
    <path
      data-node="tap"
      transform={`translate(${p.x} ${p.y})`}
      d="M0 -10V0H30V14H20V10H-10V-10ZM-5 20H45L35 38H5ZM-5 -15H15M5 -15V-20"
      className="ht-c3-tap"
    />
  );
}

export function DeviceGlyph({
  id,
  x,
  y,
  angle,
  kind,
  on,
}: {
  id: string;
  x: number;
  y: number;
  angle: number;
  kind: 'pump' | 'valve';
  on?: boolean | null;
}) {
  let shape: ReactNode;
  if (kind === 'pump') {
    shape = (
      <g transform="scale(1.05) rotate(90)">
        <path d="M0 -18V18" className="ht-c3-metal-pipe" />
        <path d="M0 -12C-16 -12 -16 15 -1 16Q12 16 12 2Q12 -12 0 -12Z" className="ht-c3-metal" />
        <path d="M-5 -9L6 -13L15 -7V7L5 12L-5 7Z" className="ht-c3-motor" />
        <ellipse cx={-2} cy={0} rx={8} ry={10} className="ht-c3-metal" />
        <circle cx={-2} cy={5} r={1.8} className={on === true ? 'ht-c3-led-on' : 'ht-c3-led'} />
      </g>
    );
  } else {
    shape = (
      <path
        d="M-15 -10L15 10V-10L-15 10ZM0 0L-9 -15H9Z"
        fill="var(--hb-s2)"
        stroke="#b4bec3"
        strokeWidth={2}
      />
    );
  }
  return (
    <g
      data-device={id}
      transform={`translate(${x} ${y}) rotate(${angle})`}
      role="img"
      aria-label={id}
    >
      {shape}
    </g>
  );
}
