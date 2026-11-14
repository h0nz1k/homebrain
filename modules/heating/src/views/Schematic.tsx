import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HEATING_LOGO_ROOT, useHeatingLogoManifest, type HeatingLogoManifest } from '../logo.js';
import { fmtDuration, fmtT as formatTemperature, heroScene } from '../model.js';
import { solarConfigured } from '../solar.js';
import type { HeatingSnapshot } from '../types.js';

/** Solární okruh ve schématu – dokončí se v další fázi. */
export const SCHEMATIC_SOLAR = false;

const HP_W = 66;
const LOGO_W = HP_W * 0.72;

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

const fmtT = (value: number | null, digits = 1) =>
  value === null ? '' : formatTemperature(value, digits).replace(/\s°C$/u, '\u202f°C');

// Tank-in-tank (Refs #82): every pipe meets the outer shell with a short perpendicular stub and
// runs in its own lane at least 20 CSS px away from the tank, so nothing is drawn along the wall.
// Left: red flow and blue return use separate lanes; the charging pump sits on the blue lane.
// Right: the mixer draws from the top cap beside the DHW vessel; the bypass/return column stands
// clear of the wall. Cold mains rise from the ground straight into the inner vessel bottom.
// Local coordinates are translated by 50: floor 446, grass 484.
const ROUTES = [
  ['compressor-outlet', 'M14 354V190', 'hot'],
  ['tank-inlet', 'M14 190H81Q89 190 89 198V262Q89 270 97 270H136', 'hot'],
  ['dhw-inlet', 'M14 190V146Q14 138 22 138H136', 'hot'],
  [
    'tank-return',
    'M136 400H114Q110 400 110 396V331.5Q110 323.5 102 323.5H58Q50 323.5 50 331.5V354',
    'cold',
  ],
  ['mixing-hot', 'M251 110.3V78', 'hot'],
  ['radiator-supply', 'M251 78V62Q251 58 255 58H350Q358 58 358 66V385Q358 389 354 389H347', 'hot'],
  ['radiator-return', 'M339 408V432Q339 440 331 440H292Q284 440 284 432V312', 'cold'],
  ['house-tank-return', 'M284 312H258', 'cold'],
  ['mixing-bypass', 'M284 312V86Q284 78 276 78H251', 'cold'],
  [
    'collector',
    'M54 443V509Q54 516.5 61.5 516.5H324A8.75 8.75 0 0 1 324 534H40Q33 534 33 527V443',
    'ground',
  ],
  ['solar-supply', 'M350 47H362V390H295V390', 'solar'],
  ['solar-return', 'M295 408V428H362V52H336V47', 'solar'],
] as const;

const SOLAR_ROUTE_IDS = new Set(['solar-supply', 'solar-return']);

// Every straight run that can reach 60 CSS px has a persistent flow cue.
const DIRECTIONS: Record<string, [number, number, number][]> = {
  'compressor-outlet': [[14, 280, -90]],
  'tank-inlet': [
    [48, 190, 0],
    [89, 230, 90],
  ],
  'dhw-inlet': [[79, 138, 0]],
  'tank-return': [[110, 352, -90]],
  'mixing-hot': [],
  'radiator-supply': [
    [300, 58, 0],
    [358, 220, 90],
  ],
  'radiator-return': [[284, 372, -90]],
  'house-tank-return': [],
  'mixing-bypass': [[284, 200, -90]],
  collector: [
    [54, 476, 90],
    [190, 516.5, 0],
    [180, 534, 180],
    [33, 485, -90],
  ],
  'solar-supply': [
    [355, 48, 0],
    [362, 235, 90],
    [328, 390, 180],
  ],
  'solar-return': [
    [295, 418, 90],
    [362, 250, -90],
    [334, 50, -90],
  ],
  'cold-water': [[228, 300, -90]],
  'dhw-draw': [
    [192, 122, -90],
    [140, 76, 180],
  ],
};

function Directions({ id }: { id: string }) {
  return DIRECTIONS[id]!.map(([x, y, rotation], index) => (
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
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-pump={id}
      data-on={on === true ? '' : undefined}
      role="img"
      aria-label={`Čerpadlo ${
        id === 'charge' ? 'nabíjení' : id === 'solar' ? 'solár' : 'topení'
      }: ${on === null ? '—' : on ? 'běží' : 'stojí'}`}
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

function Valve({
  x,
  y,
  diverter,
  port,
  rotate = 0,
}: {
  x: number;
  y: number;
  diverter?: boolean;
  port?: 'tank' | 'dhw' | null;
  rotate?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y})${rotate ? ` rotate(${rotate})` : ''}`}
      data-valve={diverter ? (port ?? 'unknown') : undefined}
      className="ht-c3-valve"
    >
      <path d={diverter ? 'M0 14V0H14M0 0V-14' : 'M-14 0H14M0 0V14'} className="ht-c3-metal-pipe" />
      <circle r="8" className="ht-c3-metal" />
      {(!diverter || port !== null) && (
        <path d={diverter && port === 'dhw' ? 'M0 5V-5' : 'M-5 0H5'} className="ht-c3-indicator" />
      )}
      <path d="M0 -8V-15" className="ht-c3-metal-pipe" />
      <rect x="-8" y="-22" width="16" height="9" rx="1" className="ht-c3-motor" />
      <path d="M-4 -18H1" className="ht-c3-servo-mark" />
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
    snap.house.mixing_valve_pct,
    snap.extras.solar?.state,
    snap.extras.solar?.pump,
  ]);
  const uid = useId().replace(/:/g, '');
  const scene = heroScene(snap);
  const showSolar = SCHEMATIC_SOLAR && solarConfigured(snap);
  const pipeRoutes = showSolar
    ? ROUTES
    : ROUTES.filter(([id]) => !SOLAR_ROUTE_IDS.has(id));
  const hp = snap.heat_pump;
  const logoManifest = useHeatingLogoManifest();
  const [logoFailed, setLogoFailed] = useState(false);
  const pageTheme = usePageTheme();
  const showLogo = logoManifest != null && !logoFailed;
  const compHint = compressorLabel(hp);
  return (
    <div
      ref={root}
      className="ht-c3"
      data-testid="heating-schematic"
      data-compressor={
        hp.compressor_on === true ? 'on' : hp.compressor_on === false ? 'off' : 'unknown'
      }
      data-hp-logo={showLogo ? '' : undefined}
      data-scenario={scene.scenario}
    >
      <svg
        viewBox="0 0 372 590"
        preserveAspectRatio="xMidYMin meet"
        role="img"
        aria-label="Zásoba tepla: tepelné čerpadlo, nádrž s vnitřním zásobníkem TUV a radiátory"
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
        <path d="M-6 534H25M64 534H220M236 534H378" className="ht-c3-grass" />
        {Array.from({ length: 29 }, (_, i) => 70 + i * 9.5)
          .filter((x) => x < 100)
          .map((x) => (
            <path key={x} d={`M${x} 531l-2 -5 4 3 2 -6 1 8`} className="ht-c3-blade" />
          ))}
        <rect x="25" y="528" width="37" height="12" rx="5" className="ht-c3-metal" />
        <rect x="224" y="529" width="8" height="10" rx="3" className="ht-c3-metal" />
        <g transform="translate(0 50)">
          <g className="ht-c3-tank" data-floor="tank">
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
            <Label x={206} y={193} anchor="middle" id="dhw" muted={snap.dhw.temp === null}>
              Teplá voda
              <tspan x="206" dy="19" className="ht-c3-dhw-value">
                {fmtT(snap.dhw.temp).slice(0, -3)}
                {snap.dhw.temp !== null && (
                  <tspan className="ht-c3-dhw-unit">{fmtT(snap.dhw.temp).slice(-3)}</tspan>
                )}
              </tspan>
              <tspan
                x="206"
                dy="17"
                className={snap.dhw.target === null ? 'ht-c3-muted' : undefined}
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
                {fmtT(snap.tank.bottom).replace(/\s°C$/u, '')}
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
              className={`ht-c3-route ht-c3-${kind}${id === 'mixing-bypass' ? ' ht-c3-bypass' : ''}${
                id === 'solar-return' ? ' ht-c3-solar-return' : ''
              }`}
            >
              <path d={d} />
              <Directions id={id} />
              {scene.activePipes.includes(id) &&
                id !== 'mixing-bypass' &&
                (id.startsWith('solar-') ? snap.extras.solar?.state === 'heating' : true) && (
                  <circle r="2.4" className="ht-c3-particle" />
                )}
            </g>
          ))}
          {/* Cold mains rise from the ground straight into the bottom of the inner DHW vessel. */}
          <g data-pipe-id="cold-water">
            <path d="M228 506V254" className="ht-c3-cold-inlet" />
            <Directions id="cold-water" />
          </g>
          <Label x={233.5} y={506.3} id="cold-water">
            studená voda
          </Label>
          {/* Standing hot water: deliberately static, not a simulated draw. */}
          <g data-pipe-id="dhw-draw">
            <path d="M192 146V84Q192 76 184 76H88.4" className="ht-c3-draw" />
            <Directions id="dhw-draw" />
          </g>
          <g
            className="ht-c3-tap"
            fill={`url(#${uid}-chrome)`}
            transform="translate(-169 21) scale(.8)"
          >
            <path d="M277 61V39Q282 35 287 39V61M287 46H311V51H307V49H287M281 37V32L298 30V33L285 35V37" />
            <path d="M273 61H322V65H273Z" />
            <path d="M273 65H317Q317 76 306 76H284Q273 76 273 65Z" />
            <path d="M319 65V75" />
          </g>
          <Label x={69} y={36.5} anchor="middle" id="tap">
            Odběr TUV
          </Label>
          <rect x="112" y="453.45" width="108.5" height="19.75" rx="4" className="ht-c3-title-bg" />
          <Label x={166.25} y={468.3} anchor="middle" id="tank-title">
            Akumulační nádrž
          </Label>
          <g
            transform="translate(0 111)"
            className="ht-c3-hp"
            data-floor="hp"
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
          <Valve x={14} y={190} diverter port={scene.port} />
          <Label x={22} y={127.7} id="dhw-port">
            → teplá voda
          </Label>
          <Label x={28} y={210.4} id="tank-port">
            → nádrž
          </Label>
          <Label x={26} y={159.5} id="valve">
            Ventil TUV
          </Label>
          <Label x={21} y={291.3} id="hp-out" muted={scene.hpMuted || hp.condenser_out === null}>
            výstup <tspan>{fmtT(hp.condenser_out)}</tspan>
          </Label>
          <Label x={29} y={312.8} id="hp-in" muted={scene.hpMuted || hp.return_temp === null}>
            vstup <tspan>{fmtT(hp.return_temp)}</tspan>
          </Label>
          {showSolar && (
            <>
              <g
                data-testid="heating-sch-solar-panel"
                className="ht-c3-solar-roof"
                data-solar-roof=""
                transform="translate(346 28) rotate(22)"
              >
                <rect
                  x={-32}
                  y={-7}
                  width={64}
                  height={14}
                  rx={4}
                  className="ht-c3-solar-collector"
                />
                {[-28, -14, 0, 14, 28].map((x) => (
                  <path
                    key={x}
                    d={`M${x} -10v19M${x + 6} -10v19`}
                    className="ht-c3-solar-fin"
                    aria-hidden="true"
                  />
                ))}
              </g>
              <Label
                x={252}
                y={100}
                anchor="end"
                id="solar-collector"
                className="ht-c3-solar-label"
                muted={snap.extras.solar?.temp === null}
              >
                Solární kolektor
                <tspan x={252} dy={14}>
                  {fmtT(snap.extras.solar?.temp ?? null)}
                </tspan>
              </Label>
              <path
                d="M295 390H252V402H272V414H292V402H312V414H295 408"
                className="ht-c3-solar-coil"
                data-testid="heating-sch-solar-coil"
                fill="none"
              />
              <Pump x={362} y={404} on={snap.extras.solar?.pump ?? null} id="solar" horizontal />
              <Label
                x={378}
                y={408}
                anchor="start"
                id="solar-pump"
                muted={snap.extras.solar?.pump !== true}
              >
                solární čerpadlo
              </Label>
            </>
          )}
          <Pump x={110} y={383} on={snap.pumps.secondary} id="charge" />
          <Label x={79} y={420.5} id="charge" muted={snap.pumps.secondary !== true}>
            nabíjení
          </Label>
          <Valve x={251} y={78} rotate={-90} />
          <Label x={244} y={62.2} anchor="end" id="mixing" muted={scene.mixingPct === null}>
            Směšovací ventil
            {scene.mixingPct !== null && <tspan>{`\u00a0${scene.mixingPct} %`}</tspan>}
          </Label>
          <Label x={249} y={47.7} id="supply" muted={scene.supplyMuted}>
            do topení
            {snap.pumps.heating === true && snap.house.supply_temp !== null && (
              <tspan>{`\u00a0${fmtT(snap.house.supply_temp)}`}</tspan>
            )}
          </Label>
          <g className="ht-c3-radiator">
            <path d="M347 389H352M339 406V414" className="ht-c3-metal-pipe" />
            <path d="M300 406V445M344 406V445" className="ht-c3-rad-feet" />
            <rect x="297" y="385" width="50" height="23" rx="3" className="ht-c3-ceramic" />
            {[302, 310, 318, 326, 334, 342].map((x) => (
              <rect key={x} x={x} y="388" width="4" height="17" rx="1" className="ht-c3-fin" />
            ))}
          </g>
          <Label x={291.5} y={377.2} id="radiators">
            radiátory
          </Label>
          <Pump x={315} y={440} on={snap.pumps.heating} id="house" horizontal />
          <Label x={365} y={468.8} anchor="end" id="house-pump" muted={snap.pumps.heating !== true}>
            čerpadlo topení
          </Label>
        </g>
        <Label x={69} y={556.3} id="collector">
          Zemní kolektor
        </Label>
      </svg>
    </div>
  );
}
