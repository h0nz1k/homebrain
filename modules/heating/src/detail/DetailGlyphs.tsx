import type { ReactNode } from 'react';
import { useId } from 'react';
import type { HeatingSnapshot } from '../types.js';

function solarPanelMeander(halfL = 40, halfH = 10): string {
  const yTop = -halfH + 3.5;
  const yBot = halfH - 3.5;
  let d = `M${-halfL + 4} ${yTop}`;
  for (let x = -halfL + 10; x <= halfL - 6; x += 6) {
    d += `V${yBot}H${x + 6}V${yTop}`;
  }
  return d;
}

export function DetailArchitecture() {
  return (
    <>
      <path
        d="M-60 280L530 60L1150 340V1100H-60Z"
        className="ht-d1-house"
        data-architecture="main-house"
      />
      <rect x={-60} y={1100} width={1225} height={100} rx={8} className="ht-d1-ground-band" />
      <path
        data-architecture="rybarna"
        d="M800 875L910 820L1020 875V1015H800Z"
        className="ht-d1-house ht-d1-house-secondary"
      />
      <path
        data-architecture="pool-hall"
        d="M760 560L1080 520L1140 580V840H760Z"
        className="ht-d1-house ht-d1-pool-hall"
      />
      <text x={920} y={548} className="ht-d1-arch-label" textAnchor="middle">
        Bazén
      </text>
    </>
  );
}

export function DetailTankGlyph() {
  const uid = useId().replace(/:/g, '');
  return (
    <g transform="translate(185.2 197.3) scale(1.8)" data-node="tank">
      <defs>
        <linearGradient id={`${uid}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ba6970" />
          <stop offset=".27" stopColor="#bb7b80" />
          <stop offset=".52" stopColor="#9a9da3" />
          <stop offset=".75" stopColor="#739abb" />
          <stop offset="1" stopColor="#4e88b9" />
        </linearGradient>
        <linearGradient id={`${uid}-shell`}>
          <stop stopColor="var(--ht-c3-jacket)" />
          <stop offset=".2" stopColor="var(--ht-c3-jacket-light)" />
          <stop offset=".6" stopColor="var(--ht-c3-jacket)" />
          <stop offset="1" stopColor="var(--ht-c3-jacket-end)" />
        </linearGradient>
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#858d99" />
          <stop offset="1" stopColor="#6b7280" />
        </linearGradient>
      </defs>
      <path d="M136 112Q197 93 258 112V446H136Z" fill={`url(#${uid}-shell)`} className="ht-c3-shell" />
      <ellipse cx={197} cy={112} rx={61} ry={10.5} fill={`url(#${uid}-rim)`} className="ht-c3-rim" />
      <rect x={139} y={134} width={116} height={284} rx={17} fill={`url(#${uid}-water)`} className="ht-c3-window" />
      <rect x={171} y={146} width={70} height={108} rx={13} className="ht-c3-vessel" />
      <path d="M136 436Q197 418 258 436V446H136Z" fill={`url(#${uid}-rim)`} className="ht-c3-rim" />
    </g>
  );
}

export function DetailHpGlyph({ snap }: { snap: HeatingSnapshot }) {
  const on = snap.heat_pump.compressor_on;
  const led =
    on === true ? 'ht-c3-comp-led-on' : on === false ? 'ht-c3-comp-led-off' : 'ht-c3-comp-led-unknown';
  return (
    <g transform="translate(95.6 122.8) scale(1.8)" data-node="hp">
      <g transform="translate(0 111)" className="ht-c3-hp" role="img" aria-label="Tepelné čerpadlo">
        <rect x={8} y={243} width={66} height={88} rx={9} className="ht-c3-cabinet" />
        <path d="M17 331V335M63 331V335" className="ht-c3-metal-pipe" />
        <circle cx={20} cy={252} r={4.5} className={led} data-pulse={on === true ? '' : undefined} />
        <rect x={16} y={290} width={49} height={29} rx={4} className="ht-c3-cutaway" />
        <path d="M22 296V315M57 296V315" className="ht-c3-plates" />
        <rect x={31} y={294} width={21} height={24} rx={8} className="ht-c3-compressor" />
      </g>
    </g>
  );
}

export function DetailRadiatorGlyph({ id = 'radiator', transform }: { id?: string; transform: string }) {
  return (
    <g transform={transform} data-node={id}>
      <path d="M347 389H352M339 406V414" className="ht-c3-metal-pipe" />
      <rect x={297} y={385} width={50} height={23} rx={3} className="ht-c3-ceramic" />
      {[302, 310, 318, 326, 334, 342].map((x) => (
        <rect key={x} x={x} y={388} width={4} height={17} rx={1} className="ht-c3-fin" />
      ))}
    </g>
  );
}

export function DetailSolarPanel({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <g
      className="ht-c3-solar-roof"
      data-node="solar-panel"
      transform="translate(1020 253) rotate(24.3045) scale(2.6)"
    >
      <path d="M-26 10V12M16 10V12" className="ht-c3-metal-pipe" style={{ strokeWidth: 3 }} />
      <rect x={-40} y={-10} width={80} height={20} rx={3} className="ht-c3-metal" />
      <rect x={-37.5} y={-7.5} width={75} height={15} rx={1.5} className="ht-c3-solar-collector" style={{ strokeWidth: 1 }} />
      <path
        d={solarPanelMeander(40, 10)}
        className="ht-c3-solar-fin"
        style={{ strokeWidth: 1.6, fill: 'none', strokeLinejoin: 'round' }}
        aria-hidden
      />
      <path d="M-36 -6.8H26" style={{ stroke: '#fff', strokeOpacity: 0.18, strokeWidth: 1, fill: 'none' }} />
    </g>
  );
}

export function PoolBasinGlyph({ uid }: { uid: string }) {
  return (
    <g data-node="pool-basin" transform="translate(820 650)">
      <defs>
        <linearGradient id={`${uid}-pool-water`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#6ec5e8" stopOpacity={0.85} />
          <stop offset="1" stopColor="#2f7fa8" />
        </linearGradient>
      </defs>
      <path
        d="M0 30V90Q0 108 18 108H182Q200 108 200 90V30Z"
        fill={`url(#${uid}-pool-water)`}
        stroke="#89979d"
        strokeWidth={3}
      />
      <path d="M0 30H200" stroke="#d8eef8" strokeWidth={2.5} opacity={0.9} />
      <path d="M12 30V12H28V24H12" fill="none" stroke="#b7c8d0" strokeWidth={3} />
      <path d="M168 20V46M186 20V46M168 30H186" fill="none" stroke="#b7c8d0" strokeWidth={3} />
      <rect x={186} y={24} width={22} height={64} rx={4} fill="#89979d" stroke="#b4bec3" opacity={0.85} />
    </g>
  );
}

export function PoolExchangerGlyph() {
  return (
    <g transform="translate(868 696)" data-node="pool-exch">
      <rect x={0} y={0} width={36} height={48} rx={4} className="ht-c3-metal" />
      {[8, 20, 32].map((y) => (
        <path key={y} d={`M4 ${y}H32`} className="ht-c3-plates" style={{ strokeWidth: 2 }} />
      ))}
    </g>
  );
}

export function FloorHeatingLoop() {
  return (
    <path
      data-floor-loop=""
      d="M780 800H1010Q1030 800 1030 820V860Q1030 880 1010 880H800Q780 880 780 860V820Q780 800 800 800H920"
      className="ht-d1-floor-loop"
      fill="none"
    />
  );
}

export function DetailTapGlyph() {
  return (
    <g transform="translate(137 260) scale(1.8)" data-node="tap">
      <g className="ht-c3-tap" transform="translate(-169 21) scale(.8)">
        <path d="M277 61V39Q282 35 287 39V61M287 46H311V51H307V49H287M281 37V32L298 30V33L285 35V37" />
        <path d="M273 61H322V65H273Z" />
        <path d="M273 65H317Q317 76 306 76H284Q273 76 273 65Z" />
        <path d="M319 65V75" />
      </g>
    </g>
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
    <g data-device={id} transform={`translate(${x} ${y}) rotate(${angle})`} role="img" aria-label={id}>
      {shape}
    </g>
  );
}