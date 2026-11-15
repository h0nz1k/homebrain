import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HEATING_LOGO_ROOT, useHeatingLogoManifest, type HeatingLogoManifest } from '../logo.js';
import { fmtDuration, fmtHpPower, fmtT, heroScene } from '../model.js';
import { solarConfigured } from '../solar.js';
import type { HeatingSnapshot } from '../types.js';

const HP_W = 66;
const LOGO_W = HP_W * 0.72;

const RDX = -20;
const RDY = -189;
const MIRROR = 644;
const SOL_S_X = 342;
const SOL_R_X = 356;
const COIL_IN_Y = 338;
const COIL_OUT_Y = 393;
const PANEL_CG = [322.85, 46.01] as const;
const PANEL_ANG = 21.75;
const PANEL_HALF_L = 40;
const PANEL_HALF_H = 10;
const RAD_SUPPLY_Y = 200;
const RAD_RETURN = [285, 225] as const;
const HEAT_RET_Y = 290;
const SOLAR_SUPPLY_Y0 = 14.4;
const SOLAR_RETURN_TOP = 20.0;

const COIL_D = 'M258 338H229V349H245V360H229V371H245V382H229V393H258';

const ROUTES = [
  [
    'hp-supply',
    'M14 354V198Q14 190 22 190H81Q89 190 89 198V262Q89 270 97 270H136',
    'hot',
  ],
  [
    'hp-return',
    'M136 400H114Q110 400 110 396V331.5Q110 323.5 102 323.5H58Q50 323.5 50 331.5V354',
    'cold',
  ],
  ['heat-supply', `M258 ${RAD_SUPPLY_Y}H272`, 'hot'],
  [
    'heat-return',
    `M${RAD_RETURN[0]} ${RAD_RETURN[1]}V${HEAT_RET_Y - 8}Q${RAD_RETURN[0]} ${HEAT_RET_Y} ${RAD_RETURN[0] - 8} ${HEAT_RET_Y}H258`,
    'cold',
  ],
  [
    'collector',
    'M54 443V509Q54 516.5 61.5 516.5H324A8.75 8.75 0 0 1 324 534H40Q33 534 33 527V443',
    'ground',
  ],
  [
    'solar-supply',
    `M${SOL_S_X} ${SOLAR_SUPPLY_Y0}V${COIL_IN_Y - 8}Q${SOL_S_X} ${COIL_IN_Y} ${SOL_S_X - 8} ${COIL_IN_Y}H258`,
    'solar',
  ],
  [
    'solar-return',
    `M258 ${COIL_OUT_Y}H${SOL_R_X - 8}Q${SOL_R_X} ${COIL_OUT_Y} ${SOL_R_X} ${COIL_OUT_Y - 8}V${SOLAR_RETURN_TOP}`,
    'solar',
  ],
] as const;

const SOLAR_ROUTE_IDS = new Set(['solar-supply', 'solar-return']);

const DIRECTIONS: Record<string, [number, number, number][]> = {
  'hp-supply': [
    [14, 280, -90],
    [48, 190, 0],
    [89, 230, 90],
  ],
  'hp-return': [[110, 352, -90]],
  'heat-supply': [[265, RAD_SUPPLY_Y, 0]],
  'heat-return': [[272, HEAT_RET_Y, 180]],
  collector: [
    [54, 476, 90],
    [190, 516.5, 0],
    [180, 534, 180],
    [33, 485, -90],
  ],
  'solar-supply': [
    [SOL_S_X, 200, 90],
    [300, COIL_IN_Y, 180],
  ],
  'solar-return': [
    [SOL_R_X, 230, -90],
    [275, COIL_OUT_Y, 0],
  ],
  'dhw-draw': [
    [192, 122, -90],
    [140, 76, 180],
  ],
};

function usePageTheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' => {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'light') return 'light';
    if (theme === 'dark') return 'dark';
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  };
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme(read());
    const mo = new MutationObserver(update);
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    if (typeof matchMedia !== 'undefined') {
      const mq = matchMedia('(prefers-color-scheme: light)');
      mq.addEventListener('change', update);
      return () => {
        mo.disconnect();
        mq.removeEventListener('change', update);
      };
    }
    return () => mo.disconnect();
  }, []);
  return theme;
}

function logoFile(manifest: HeatingLogoManifest, theme: 'light' | 'dark'): string {
  return theme === 'dark' && manifest.logoDark ? manifest.logoDark : manifest.logo;
}

function compressorLabel(hp: HeatingSnapshot['heat_pump']): string {
  if (hp.compressor_on === null) return 'Kompresor —';
  const base = hp.compressor_on ? 'Kompresor běží' : 'Kompresor stojí';
  if (hp.compressor_on && hp.running_since && Number.isFinite(Date.parse(hp.running_since))) {
    return `${base} ${fmtDuration(Math.max(0, (Date.now() - Date.parse(hp.running_since)) / 60_000))}`;
  }
  return base;
}

const fmtSchT = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? '' : fmtT(value, digits);

function hpStateLine(snap: HeatingSnapshot, off: boolean): string {
  const hp = snap.heat_pump;
  if (off || hp.compressor_on === null) return `stojí · ${fmtHpPower(hp.power_w)}`;
  const run = hp.compressor_on ? 'běží' : 'stojí';
  return `${run} · ${fmtHpPower(hp.power_w)}`;
}

function heatStateLine(snap: HeatingSnapshot, off: boolean): string {
  if (off || snap.pumps.heating !== true) return 'Netopí se';
  if (snap.house.supply_temp !== null) return fmtT(snap.house.supply_temp);
  return snap.activity === 'house_circuit' ? 'Topí' : 'Netopí se';
}

function solarPanelMeander(): string {
  const us = Array.from({ length: 12 }, (_, i) => -33 + i * 6);
  const mt = -PANEL_HALF_H + 4.5;
  const mb = PANEL_HALF_H - 4.5;
  let d = `M${us[0]} ${mb}`;
  for (let i = 0; i < us.length; i++) {
    const yTo = i % 2 === 0 ? mt : mb;
    d += `V${yTo}`;
    if (i + 1 < us.length) d += `H${us[i + 1]}`;
  }
  return d;
}

function Directions({ id }: { id: string }) {
  const dirs = DIRECTIONS[id];
  if (!dirs) return null;
  return dirs.map(([x, y, rotation], index) => (
    <g
      key={index}
      className="ht-c3-direction"
      aria-hidden="true"
      transform={`translate(${x} ${y}) rotate(${rotation})`}
    >
      <path d="M-3 -2L0 0L-3 2" />
    </g>
  ));
}

function Label({
  x,
  y,
  children,
  id,
  muted = false,
  anchor = 'start',
  className,
}: {
  x: number;
  y: number;
  children: ReactNode;
  id?: string;
  muted?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  className?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={`ht-c3-label${muted ? ' ht-c3-muted' : ''}${className ? ` ${className}` : ''}`}
      data-label={id}
      data-testid={id ? `heating-sch-${id}` : undefined}
    >
      {children}
    </text>
  );
}

function Pump({
  x,
  y,
  on,
  id,
  horizontal = false,
}: {
  x: number;
  y: number;
  on: boolean | null;
  id: string;
  horizontal?: boolean;
}) {
  const names: Record<string, string> = {
    charge: 'nabíjení',
    solar: 'solár',
    house: 'topení',
  };
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-pump={id}
      data-on={on === true ? '' : undefined}
      role="img"
      aria-label={`Čerpadlo ${names[id] ?? id}: ${on === null ? '—' : on ? 'běží' : 'stojí'}`}
    >
      <g transform={horizontal ? 'scale(.72) rotate(90)' : 'scale(.7)'}>
        <path d="M0 -18V18" className="ht-c3-metal-pipe" />
        <path d="M0 -12C-16 -12 -16 15 -1 16Q12 16 12 2Q12 -12 0 -12Z" className="ht-c3-metal" />
        <path d="M-5 -9L6 -13L15 -7V7L5 12L-5 7Z" className="ht-c3-motor" />
        <ellipse cx="-2" cy="0" rx="8" ry="10" className="ht-c3-metal" />
        <circle cx="-2" cy="5" r="1.8" className={on === true ? 'ht-c3-led-on' : 'ht-c3-led'} />
      </g>
    </g>
  );
}

export function HeatingSchematic({ snap }: { snap: HeatingSnapshot }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || typeof matchMedia === 'undefined') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const particles = Array.from(
      root.current.querySelectorAll<SVGCircleElement>('.ht-c3-particle'),
    );
    let animations: Animation[] = [];
    const update = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
      if (reduced.matches) return;
      for (const particle of particles) {
        const path = particle.parentElement?.querySelector('path');
        if (
          !path ||
          typeof path.getTotalLength !== 'function' ||
          typeof particle.animate !== 'function'
        )
          continue;
        const length = path.getTotalLength();
        const frames = Array.from({ length: 100 }, (_, i) => {
          const point = path.getPointAtLength((length * i) / 99);
          return { transform: `translate(${point.x}px, ${point.y}px)`, opacity: 1, offset: i / 99 };
        });
        animations.push(
          particle.animate(frames, { duration: Math.max(2400, length * 25), iterations: Infinity }),
        );
      }
    };
    update();
    reduced.addEventListener('change', update);
    return () => {
      animations.forEach((animation) => animation.cancel());
      reduced.removeEventListener('change', update);
    };
  }, [
    snap.activity,
    snap.heat_pump.compressor_on,
    snap.pumps.heating,
    snap.pumps.secondary,
    snap.extras.solar?.state,
    snap.extras.solar?.pump,
  ]);
  const uid = useId().replace(/:/g, '');
  const scene = heroScene(snap);
  const showSolar = solarConfigured(snap);
  const pipeRoutes = showSolar
    ? ROUTES
    : ROUTES.filter(([id]) => !SOLAR_ROUTE_IDS.has(id));
  const hp = snap.heat_pump;
  const logoManifest = useHeatingLogoManifest();
  const [logoFailed, setLogoFailed] = useState(false);
  const pageTheme = usePageTheme();
  const showLogo = logoManifest != null && !logoFailed;
  const compHint = compressorLabel(hp);
  const off = scene.schematicOff;
  const solar = snap.extras.solar;
  const groundTemp = hp.brine_in ?? hp.brine_out;
  const solarPumpPct =
    solar?.pump_pct !== null && solar?.pump_pct !== undefined
      ? solar.pump_pct
      : solar?.pump === true
        ? 100
        : solar?.pump === false
          ? 0
          : null;

  return (
    <div
      ref={root}
      className="ht-c3"
      data-testid="heating-schematic"
      data-state={off ? 'off' : 'on'}
      data-compressor={
        hp.compressor_on === true ? 'on' : hp.compressor_on === false ? 'off' : 'unknown'
      }
      data-hp-logo={showLogo ? '' : undefined}
      data-scenario={scene.scenario}
      data-solar={showSolar ? '' : undefined}
    >
      <svg
        viewBox="0 0 372 590"
        preserveAspectRatio="xMidYMin meet"
        role="img"
        aria-label="Toky tepla: solární kolektor, tepelné čerpadlo, akumulační nádrž, topení a teplá voda"
        data-toky-schematic=""
      >
        <defs>
          <linearGradient id={`${uid}-water`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor={snap.tank.top === null ? 'var(--ht-c3-inactive)' : '#ba6970'} />
            <stop offset=".27" stopColor="#bb7b80" />
            <stop offset=".52" stopColor="#9a9da3" />
            <stop offset=".75" stopColor="#739abb" />
            <stop
              offset="1"
              stopColor={snap.tank.bottom === null ? 'var(--ht-c3-inactive)' : '#4e88b9'}
            />
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
          <linearGradient id={`${uid}-chrome`}>
            <stop stopColor="#7b8991" />
            <stop offset=".35" stopColor="#e4e9eb" />
            <stop offset="1" stopColor="#78878f" />
          </linearGradient>
        </defs>
        <path d="M-4 78L184 3L372 78V534H-4Z" className="ht-c3-interior" />
        <path d="M-4 78L184 3L372 78M-4 78V534H372V78" className="ht-c3-envelope" />
        <path
          d="M-4 78L184 3L372 78L378 84L184 9L2 84ZM372 78L378 84V534H372Z"
          className="ht-c3-depth"
        />
        <path d="M8 496H362" className="ht-c3-floor" />
        <rect x="-6" y="538" width="384" height="52" rx="8" className="ht-c3-soil" />
        <path d="M-6 550.5H378" className="ht-c3-topsoil" />
        <path d="M-6 563H378" className="ht-c3-soil-layer" />
        <path d="M-6 534H25M64 534H378" className="ht-c3-grass" />
        {Array.from({ length: 29 }, (_, i) => 70 + i * 9.5)
          .filter((x) => x < 100)
          .map((x) => (
            <path key={x} d={`M${x} 531l-2 -5 4 3 2 -6 1 8`} className="ht-c3-blade" />
          ))}
        <rect x="25" y="528" width="37" height="12" rx="5" className="ht-c3-metal" />
        {showSolar && (
          <g
            data-testid="heating-sch-solar-panel"
            className="ht-c3-solar-roof"
            data-solar-roof=""
            data-node="solar-panel"
            transform={`translate(${PANEL_CG[0]} ${PANEL_CG[1]}) rotate(${PANEL_ANG})`}
          >
            <path
              d={`M-26 ${PANEL_HALF_H}V${PANEL_HALF_H + 2}M16 ${PANEL_HALF_H}V${PANEL_HALF_H + 2}`}
              className="ht-c3-metal-pipe"
              style={{ strokeWidth: 3 }}
            />
            <rect
              x={-PANEL_HALF_L}
              y={-PANEL_HALF_H}
              width={2 * PANEL_HALF_L}
              height={2 * PANEL_HALF_H}
              rx={3}
              className="ht-c3-metal"
            />
            <rect
              x={-PANEL_HALF_L + 2.5}
              y={-PANEL_HALF_H + 2.5}
              width={2 * PANEL_HALF_L - 5}
              height={2 * PANEL_HALF_H - 5}
              rx={1.5}
              className="ht-c3-solar-collector"
              style={{ strokeWidth: 1 }}
            />
            <path
              d={solarPanelMeander()}
              className="ht-c3-solar-fin"
              style={{ strokeWidth: 1.6, fill: 'none', strokeLinejoin: 'round' }}
              aria-hidden="true"
            />
            <path
              d={`M${-PANEL_HALF_L + 4} ${-PANEL_HALF_H + 3.2}H${PANEL_HALF_L - 14}`}
              style={{ stroke: '#fff', strokeOpacity: 0.18, strokeWidth: 1, fill: 'none' }}
            />
          </g>
        )}
        <g transform="translate(0 50)">
          <g className="ht-c3-tank" data-floor="tank" data-node="tank">
            <path
              d="M136 112Q197 93 258 112V446H136Z"
              fill={`url(#${uid}-shell)`}
              className="ht-c3-shell"
            />
            <ellipse
              cx="197"
              cy="112"
              rx="61"
              ry="10.5"
              fill={`url(#${uid}-rim)`}
              className="ht-c3-rim"
            />
            <rect
              x="139"
              y="134"
              width="116"
              height="284"
              rx="17"
              fill={`url(#${uid}-water)`}
              className="ht-c3-window"
            />
            {showSolar && (
              <path
                d={COIL_D}
                className="ht-c3-solar-coil"
                data-testid="heating-sch-solar-coil"
                data-coil=""
                fill="none"
              />
            )}
            <rect
              x="171"
              y="146"
              width="70"
              height="108"
              rx="13"
              className="ht-c3-vessel"
              data-vessel=""
            />
            <rect
              x="178"
              y="173"
              width="56"
              height="69"
              rx="9"
              className="ht-c3-value-bg"
              data-vessel-card=""
            />
            <Label x={206} y={193} anchor="middle" id="dhw" muted={off || snap.dhw.temp === null}>
              Teplá voda
              <tspan x="206" dy="19" className="ht-c3-dhw-value">
                {fmtSchT(snap.dhw.temp).slice(0, -3)}
                {snap.dhw.temp !== null && (
                  <tspan className="ht-c3-dhw-unit">{fmtSchT(snap.dhw.temp).slice(-3)}</tspan>
                )}
              </tspan>
              <tspan
                x="206"
                dy="17"
                className={snap.dhw.target === null || off ? 'ht-c3-muted' : undefined}
              >
                {snap.dhw.target === null ? '' : `cíl ${fmtT(snap.dhw.target, 0)}`}
              </tspan>
            </Label>
            <rect
              x="143"
              y="330"
              width="76"
              height="59"
              rx="10"
              className="ht-c3-value-bg"
              data-tank-card=""
            />
            <Label x={181} y={348} anchor="middle" id="tank" muted={snap.tank.bottom === null}>
              Nádrž dole
              <tspan x="181" dy="27" className="ht-c3-tank-value">
                {fmtSchT(snap.tank.bottom).replace(/\s°C$/u, '').replace(/\u202f°C$/u, '')}
                {snap.tank.bottom !== null && <tspan className="ht-c3-unit">{'\u202f°C'}</tspan>}
              </tspan>
            </Label>
            <path
              d="M136 436Q197 418 258 436V446H136Z"
              fill={`url(#${uid}-rim)`}
              className="ht-c3-rim"
            />
          </g>
          {pipeRoutes.map(([id, d, kind]) => (
            <g
              key={id}
              data-pipe-id={id}
              data-active={scene.activePipes.includes(id) ? '' : undefined}
              className={`ht-c3-route ht-c3-${kind}${id === 'solar-return' ? ' ht-c3-solar-return' : ''}`}
            >
              <path d={d} />
              {!off && <Directions id={id} />}
              {scene.activePipes.includes(id) &&
                (id.startsWith('solar-') ? solar?.state === 'heating' : true) && (
                  <circle r="2.4" className="ht-c3-particle" />
                )}
            </g>
          ))}
          <g data-pipe-id="dhw-draw">
            <path d="M192 146V84Q192 76 184 76H88.4" className="ht-c3-draw" />
            {!off && <Directions id="dhw-draw" />}
          </g>
          <g
            className="ht-c3-tap"
            fill={`url(#${uid}-chrome)`}
            transform="translate(-169 21) scale(.8)"
            data-node="tap"
          >
            <path d="M277 61V39Q282 35 287 39V61M287 46H311V51H307V49H287M281 37V32L298 30V33L285 35V37" />
            <path d="M273 61H322V65H273Z" />
            <path d="M273 65H317Q317 76 306 76H284Q273 76 273 65Z" />
            <path d="M319 65V75" />
          </g>
          <Label x={69} y={36.5} anchor="middle" id="tap">
            Odběr teplé vody
          </Label>
          <rect x="112" y="453.45" width="108.5" height="19.75" rx="4" className="ht-c3-title-bg" />
          <Label x={166.25} y={468.3} anchor="middle" id="tank-title">
            Akumulační nádrž
          </Label>
          <g
            transform="translate(0 111)"
            className="ht-c3-hp"
            data-floor="hp"
            data-node="hp"
            role="img"
            aria-label="Tepelné čerpadlo"
          >
            <rect x="8" y="243" width={HP_W} height="88" rx="9" className="ht-c3-cabinet" />
            <path d="M17 331V335M63 331V335" className="ht-c3-metal-pipe" />
            {showLogo && logoManifest ? (
              <image
                data-testid="heating-sch-hp-logo"
                href={`${HEATING_LOGO_ROOT}${logoFile(logoManifest, pageTheme)}`}
                x={8 + (HP_W - LOGO_W) / 2}
                y={258}
                width={LOGO_W}
                height={26}
                className="ht-c3-owner-logo"
                preserveAspectRatio="xMidYMid meet"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <Label x={16} y={261} id="hp-mark">
                TČ
              </Label>
            )}
            <circle
              data-testid="heating-sch-compressor-led"
              cx={20}
              cy={252}
              r={4.5}
              className={
                hp.compressor_on === true
                  ? 'ht-c3-comp-led-on'
                  : hp.compressor_on === false
                    ? 'ht-c3-comp-led-off'
                    : 'ht-c3-comp-led-unknown'
              }
              data-pulse={hp.compressor_on === true ? '' : undefined}
              role="img"
              aria-label={compHint}
            >
              <title>{compHint}</title>
            </circle>
            <rect x="16" y="290" width="49" height="29" rx="4" className="ht-c3-cutaway" />
            <path d="M22 296V315M57 296V315" className="ht-c3-plates" />
            <rect x="31" y="294" width="21" height="24" rx="8" className="ht-c3-compressor" />
          </g>
          <Label x={24} y={291} id="hp">
            Tepelné čerpadlo
          </Label>
          <Label x={24} y={309} id="hp-state" muted={off || hp.compressor_on === null}>
            {hpStateLine(snap, off)}
          </Label>
          <g
            className="ht-c3-radiator"
            transform={`translate(${RDX + MIRROR} ${RDY}) scale(-1 1)`}
            data-node="radiator"
          >
            <path d="M347 389H352M339 406V414" className="ht-c3-metal-pipe" />
            <rect x="297" y="385" width="50" height="23" rx="3" className="ht-c3-ceramic" />
            {[302, 310, 318, 326, 334, 342].map((x) => (
              <rect key={x} x={x} y="388" width="4" height="17" rx="1" className="ht-c3-fin" />
            ))}
          </g>
          <Label x={264} y={166} id="heat" className="ht-c3-nw-head">
            Topení
          </Label>
          <Label
            x={264}
            y={184}
            id="heat-state"
            muted={off || (snap.pumps.heating !== true && snap.activity !== 'house_circuit')}
          >
            {heatStateLine(snap, off)}
          </Label>
          {showSolar && (
            <>
              <Label
                x={SOL_S_X - 15}
                y={41}
                anchor="end"
                id="solar-collector"
                muted={solar?.temp === null}
              >
                Solární kolektor
                <tspan x={SOL_S_X - 15} dy="16" className="ht-c3-nw-solar-v">
                  {fmtT(solar?.temp ?? null)}
                </tspan>
              </Label>
              <Label
                x={315}
                y={420}
                anchor="middle"
                id="solar-pump"
                muted={solar?.pump !== true}
              >
                Solární čerpadlo
                {solarPumpPct !== null && (
                  <tspan x="315" dy="16" className="ht-c3-nw-v">
                    {`${solarPumpPct}\u00a0%`}
                  </tspan>
                )}
              </Label>
              <Pump x={306} y={COIL_OUT_Y} on={solar?.pump ?? null} id="solar" horizontal />
            </>
          )}
          <Pump x={110} y={383} on={snap.pumps.secondary} id="charge" />
          <Pump x={RAD_RETURN[0]} y={255} on={snap.pumps.heating} id="house" />
        </g>
        <Label x={69} y={556.3} id="collector" muted={groundTemp === null}>
          Zemní kolektor
          {groundTemp !== null && (
            <tspan className="ht-c3-nw-v">{`\u00a0${fmtSchT(groundTemp)}`}</tspan>
          )}
        </Label>
      </svg>
      {off && (
        <p className="ht-c3-note" data-testid="heating-sch-off-note">
          Teploty: naposledy naměřené
        </p>
      )}
    </div>
  );
}