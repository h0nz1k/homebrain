import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HEATING_LOGO_ROOT, useHeatingLogoManifest, type HeatingLogoManifest } from '../logo.js';
import { fmtDuration, fmtT as formatTemperature, heroScene } from '../model.js';
import type { HeatingSnapshot } from '../types.js';

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

// Tank-in-tank: hot supply is high, charging flow below DHW, both returns low.
// The mixer draws beside the DHW vessel, with pipes painted above the tank for clarity.
// Same hydraulic topology as C3. The tank sits lower so the mixer and the flow to the house get
// a full-width band under the eaves. Local coordinates are translated by 50: floor 458, soil 493.
const ROUTES = [
  ['compressor-outlet', 'M14 316V164', 'hot'],
  ['tank-inlet', 'M14 164H118V266H120', 'hot'],
  ['dhw-inlet', 'M14 164V126Q14 118 22 118H120', 'hot'],
  [
    'tank-return',
    'M120 350H118V268Q118 260 110 260H108Q100 260 100 252V250H30Q22 250 22 258V308Q22 316 30 316H50',
    'cold',
  ],
  ['mixing-hot', 'M230 180V110Q230 102 222 102H198Q190 102 190 94V82Q190 74 198 74H214', 'hot'],
  ['radiator-supply', 'M214 74H330Q338 74 338 82V334Q338 342 330 342H280', 'hot'],
  ['radiator-return', 'M308 386V395Q308 403 300 403H270Q262 403 262 395V300', 'cold'],
  ['house-tank-return', 'M262 300H242', 'cold'],
  ['mixing-bypass', 'M262 300V102Q262 94 254 94H222Q214 94 214 86V74', 'cold'],
  ['collector', 'M54 401V467Q54 474 61 474H324A6 6 0 0 1 324 486H40Q33 486 33 479V401', 'ground'],
] as const;

// Every straight run that can reach 60 CSS px has a persistent flow cue.
const DIRECTIONS: Record<string, [number, number, number][]> = {
  'compressor-outlet': [[14, 268, -90]],
  'tank-inlet': [
    [70, 164, 0],
    [118, 210, 90],
  ],
  'dhw-inlet': [
    [14, 132, -90],
    [70, 118, 0],
  ],
  'tank-return': [
    [118, 295, -90],
    [60, 250, 180],
    [22, 290, 90],
  ],
  'mixing-hot': [
    [230, 145, -90],
    [208, 102, 180],
    [190, 87, -90],
  ],
  'radiator-supply': [
    [280, 74, 0],
    [338, 250, 90],
    [308, 342, 180],
  ],
  'radiator-return': [
    [286, 403, 180],
    [262, 310, -90],
  ],
  'house-tank-return': [[254, 300, 180]],
  'mixing-bypass': [
    [262, 148, -90],
    [242, 94, 180],
  ],
  collector: [
    [54, 435, 90],
    [170, 474, 0],
    [180, 486, 180],
    [33, 435, -90],
  ],
  'cold-water': [
    [228, 420, -90],
    [211, 270, 180],
  ],
  'dhw-draw': [
    [175, 100, -90],
    [150, 60, 180],
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
      aria-label={`Čerpadlo ${id === 'charge' ? 'nabíjení' : 'topení'}: ${on === null ? '—' : on ? 'běží' : 'stojí'}`}
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
}: {
  x: number;
  y: number;
  diverter?: boolean;
  port?: 'tank' | 'dhw' | null;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
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
  ]);
  const uid = useId().replace(/:/g, '');
  const scene = heroScene(snap);
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
        viewBox="0 0 344 542"
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
        <path d="M-4 78L172 3L344 78V490H-4Z" className="ht-c3-interior" />
        <path d="M-4 78L172 3L344 78M-4 78V490H344V78" className="ht-c3-envelope" />
        <path
          d="M-4 78L172 3L344 78L350 84L172 9L2 84ZM344 78L350 84V490H344Z"
          className="ht-c3-depth"
        />
        <path d="M8 458H334" className="ht-c3-floor" />
        <rect x="-6" y="493" width="356" height="49" rx="8" className="ht-c3-soil" />
        <path d="M-6 505.5H350" className="ht-c3-topsoil" />
        <path d="M-6 518H350" className="ht-c3-soil-layer" />
        <path d="M-6 490H25M64 490H220M236 490H350" className="ht-c3-grass" />
        {Array.from({ length: 29 }, (_, i) => 70 + i * 9.5)
          .filter((x) => x < 214)
          .map((x) => (
            <path key={x} d={`M${x} 487l-2 -5 4 3 2 -6 1 8`} className="ht-c3-blade" />
          ))}
        <rect x="25" y="484" width="37" height="12" rx="5" className="ht-c3-metal" />
        <rect x="221" y="485" width="14" height="10" rx="4" className="ht-c3-metal" />
        <g transform="translate(0 50)">
          <g className="ht-c3-tank" data-floor="tank">
            <path
              d="M120 112Q181 93 242 112V408H120Z"
              fill={`url(#${uid}-shell)`}
              className="ht-c3-shell"
            />
            <ellipse
              cx="181"
              cy="112"
              rx="61"
              ry="10.5"
              fill={`url(#${uid}-rim)`}
              className="ht-c3-rim"
            />
            <rect
              x="123"
              y="134"
              width="116"
              height="246"
              rx="17"
              fill={`url(#${uid}-water)`}
              className="ht-c3-window"
            />

            <rect
              x="146"
              y="146"
              width="70"
              height="108"
              rx="30"
              className="ht-c3-vessel"
              data-vessel=""
            />
            <rect
              x="154"
              y="173"
              width="54"
              height="69"
              rx="9"
              className="ht-c3-value-bg"
              data-vessel-card=""
            />
            <Label x={181} y={193} anchor="middle" id="dhw" muted={snap.dhw.temp === null}>
              Teplá voda
              <tspan x="181" dy="19" className="ht-c3-dhw-value">
                {fmtT(snap.dhw.temp).slice(0, -3)}
                {snap.dhw.temp !== null && (
                  <tspan className="ht-c3-dhw-unit">{fmtT(snap.dhw.temp).slice(-3)}</tspan>
                )}
              </tspan>
              <tspan
                x="181"
                dy="17"
                className={snap.dhw.target === null ? 'ht-c3-muted' : undefined}
              >
                {snap.dhw.target === null ? '' : `cíl ${fmtT(snap.dhw.target, 0)}`}
              </tspan>
            </Label>
            <rect
              x="143"
              y="316"
              width="76"
              height="59"
              rx="10"
              className="ht-c3-value-bg"
              data-tank-card=""
            />
            <Label x={181} y={334} anchor="middle" id="tank" muted={snap.tank.bottom === null}>
              Nádrž dole
              <tspan x="181" dy="27" className="ht-c3-tank-value">
                {fmtT(snap.tank.bottom).replace(/\s°C$/u, '')}
                {snap.tank.bottom !== null && <tspan className="ht-c3-unit">{'\u202f°C'}</tspan>}
              </tspan>
            </Label>
            <path
              d="M120 398Q181 380 242 398V408H120Z"
              fill={`url(#${uid}-rim)`}
              className="ht-c3-rim"
            />
          </g>
          {ROUTES.map(([id, d, kind]) => (
            <g
              key={id}
              data-pipe-id={id}
              data-active={scene.activePipes.includes(id) ? '' : undefined}
              className={`ht-c3-route ht-c3-${kind}${id === 'mixing-bypass' ? ' ht-c3-bypass' : ''}`}
            >
              <path d={d} />
              <Directions id={id} />
              {scene.activePipes.includes(id) && id !== 'mixing-bypass' && (
                <circle r="2.4" className="ht-c3-particle" />
              )}
            </g>
          ))}
          {/* Cold mains rise from the ground and feed the bottom of the inner DHW vessel. */}
          <g data-pipe-id="cold-water">
            <path
              d="M228 460V320Q228 312 236 312H240Q248 312 248 304V278Q248 270 240 270H189Q181 270 181 262V254"
              className="ht-c3-cold-inlet"
            />
            <Directions id="cold-water" />
          </g>
          <Label x={234} y={463} id="cold-water">
            studená voda
          </Label>
          {/* Standing hot water: deliberately static, not a simulated draw. */}
          <g data-pipe-id="dhw-draw">
            <path d="M175 146V68Q175 60 167 60H131" className="ht-c3-draw" />
            <Directions id="dhw-draw" />
          </g>
          <g
            className="ht-c3-tap"
            fill={`url(#${uid}-chrome)`}
            transform="translate(-126.4 5) scale(.8)"
          >
            <path d="M277 61V39Q282 35 287 39V61M287 46H311V51H307V49H287M281 37V32L298 30V33L285 35V37" />
            <path d="M273 61H322V65H273Z" />
            <path d="M273 65H317Q317 76 306 76H284Q273 76 273 65Z" />
            <path d="M319 65V75" />
          </g>
          <Label x={18} y={52} id="tap">
            Odběr TUV
          </Label>
          <rect x="131.5" y="289" width="99" height="15.5" rx="4" className="ht-c3-title-bg" />
          <Label x={181} y={301.3} anchor="middle" id="tank-title">
            Akumulační nádrž
          </Label>
          <g
            transform="translate(0 73)"
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
          <Valve x={14} y={164} diverter port={scene.port} />
          <Label x={22} y={106} id="dhw-port">
            → teplá voda
          </Label>
          <Label x={34} y={184} id="tank-port">
            → nádrž
          </Label>
          <Label x={34} y={138} id="valve">
            Ventil TUV
          </Label>
          <Label x={20.7} y={225} id="hp-out" muted={scene.hpMuted || hp.condenser_out === null}>
            výstup <tspan>{fmtT(hp.condenser_out)}</tspan>
          </Label>
          <Label x={29} y={305} id="hp-in" muted={scene.hpMuted || hp.return_temp === null}>
            vstup <tspan>{fmtT(hp.return_temp)}</tspan>
          </Label>
          <Pump x={85} y={250} on={snap.pumps.secondary} id="charge" horizontal />
          <Label x={54} y={279} id="charge" muted={snap.pumps.secondary !== true}>
            nabíjení
          </Label>
          <Valve x={214} y={74} />
          <Label x={214} y={42} anchor="middle" id="mixing" muted={scene.mixingPct === null}>
            Směšovací ventil
            {scene.mixingPct !== null && <tspan>{`\u00a0${scene.mixingPct} %`}</tspan>}
          </Label>
          <Label x={228} y={63} id="supply" muted={scene.supplyMuted}>
            do topení
            {snap.pumps.heating === true && snap.house.supply_temp !== null && (
              <tspan>{`\u00a0${fmtT(snap.house.supply_temp)}`}</tspan>
            )}
          </Label>
          <g className="ht-c3-radiator" transform="translate(0 43)">
            <path d="M280 297V307M308 326V343" className="ht-c3-metal-pipe" />
            <path d="M274 326V363.5M312 326V363.5" className="ht-c3-rad-feet" />
            <rect x="268" y="306" width="50" height="23" rx="3" className="ht-c3-ceramic" />
            {[273, 281, 289, 297, 305, 313].map((x) => (
              <rect key={x} x={x} y="309" width="4" height="17" rx="1" className="ht-c3-fin" />
            ))}
          </g>
          <Label x={270} y={331} id="radiators">
            radiátory
          </Label>
          <Pump x={286} y={403} on={snap.pumps.heating} id="house" horizontal />
          <Label x={240} y={430.5} id="house-pump" muted={snap.pumps.heating !== true}>
            čerpadlo topení
          </Label>
        </g>
        <Label x={69} y={513} id="collector">
          Zemní kolektor
        </Label>
      </svg>
    </div>
  );
}
