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
  value === null ? '' : formatTemperature(value, digits);

// Scene coordinates follow the approved C3 hydraulic ports. The room starts at y=50.
const ROUTES = [
  ['compressor-outlet', 'M68 249H80Q88 249 88 241V174', 'hot'],
  ['tank-inlet', 'M88 174H120', 'hot'],
  ['dhw-inlet', 'M88 174V108Q88 100 96 100H120', 'hot'],
  ['tank-return', 'M120 261H104Q96 261 96 269V311Q96 319 88 319H68', 'cold'],
  ['mixing-hot', 'M242 145H262Q270 145 270 153V177Q270 193 280 193H290', 'hot'],
  ['radiator-supply', 'M290 193H322Q330 193 330 201V289Q330 297 322 297H280', 'hot'],
  [
    'radiator-return',
    'M308 343V345Q308 353 300 353H260Q252 353 252 345V228Q252 220 254 220',
    'cold',
  ],
  ['house-tank-return', 'M254 220V197Q254 189 246 189H242', 'cold'],
  ['mixing-bypass', 'M254 220H282Q290 220 290 212V193', 'cold'],
  [
    'collector',
    'M54 358V429Q54 436 61 436H324A7 7 0 0 1 324 450H61A7 7 0 0 0 61 464H324A7 7 0 0 1 324 478H40Q33 478 33 471V358',
    'ground',
  ],
] as const;

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
  const [markerScale, setMarkerScale] = useState(1);
  useEffect(() => {
    const svg = root.current?.querySelector('svg');
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) setMarkerScale(Math.max(1, (14.2 * 344) / (18 * width)));
    };
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    update();
    return () => observer.disconnect();
  }, []);
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
  const pumpState = (on: boolean | null) => (on === null ? '—' : on ? 'běží' : 'stojí');
  const markers = [
    {
      id: 'hp-in',
      x: 74,
      y: 319,
      label: 'vstup do tepelného čerpadla',
      value: fmtT(hp.return_temp),
      muted: scene.hpMuted || hp.return_temp === null,
    },
    {
      id: 'charge',
      x: 96,
      y: 293,
      label: 'nabíjecí čerpadlo',
      value: pumpState(snap.pumps.secondary),
      muted: snap.pumps.secondary !== true,
    },
    {
      id: 'mixing',
      x: 290,
      y: 185,
      label: 'směšovací ventil',
      value: scene.mixingPct === null ? '' : `${scene.mixingPct} %`,
      muted: scene.mixingPct === null,
    },
    {
      id: 'house-pump',
      x: 252,
      y: 350,
      label: 'čerpadlo topení',
      value: pumpState(snap.pumps.heating),
      muted: snap.pumps.heating !== true,
    },
    {
      id: 'radiators',
      x: 294,
      y: 317,
      label: 'radiátory',
      value: '',
      muted: snap.pumps.heating !== true,
    },
    { id: 'cold-water', x: 213, y: 354, label: 'studená voda', value: '', muted: false },
  ];
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
        <path d="M-4 78L172 3L344 78V450H-4Z" className="ht-c3-interior" />
        <path d="M-4 78L172 3L344 78M-4 78V450H344V78" className="ht-c3-envelope" />
        <path
          d="M-4 78L172 3L344 78L350 84L172 9L2 84ZM344 78L350 84V450H344Z"
          className="ht-c3-depth"
        />
        <path d="M8 415H334" className="ht-c3-floor" />
        <rect x="-6" y="451" width="356" height="91" rx="8" className="ht-c3-soil" />
        <path d="M-6 463.5H350" className="ht-c3-topsoil" />
        <path d="M-6 476H350" className="ht-c3-soil-layer" />
        <path d="M-6 448H25M64 448H350" className="ht-c3-grass" />
        {Array.from({ length: 29 }, (_, i) => (
          <path key={i} d={`M${70 + i * 9.5} 445l-2 -5 4 3 2 -6 1 8`} className="ht-c3-blade" />
        ))}
        <rect x="25" y="442" width="37" height="12" rx="5" className="ht-c3-metal" />
        <g transform="translate(0 50)">
          {ROUTES.map(([id, d, kind]) => (
            <g
              key={id}
              data-pipe-id={id}
              data-active={scene.activePipes.includes(id) ? '' : undefined}
              className={`ht-c3-route ht-c3-${kind}${id === 'mixing-bypass' ? ' ht-c3-bypass' : ''}`}
            >
              <path d={d} />
              {scene.activePipes.includes(id) && id !== 'mixing-bypass' && (
                <circle r="2.4" className="ht-c3-particle" />
              )}
            </g>
          ))}
          <g className="ht-c3-tank" data-floor="tank">
            <path
              d="M120 53.5Q181 34.5 242 53.5V365H120Z"
              fill={`url(#${uid}-shell)`}
              className="ht-c3-shell"
            />
            <ellipse
              cx="181"
              cy="53.5"
              rx="61"
              ry="10.5"
              fill={`url(#${uid}-rim)`}
              className="ht-c3-rim"
            />
            <rect
              x="128"
              y="75"
              width="106"
              height="262"
              rx="17"
              fill={`url(#${uid}-water)`}
              className="ht-c3-window"
            />

            <rect
              x="146"
              y="87"
              width="70"
              height="128"
              rx="30"
              className="ht-c3-vessel"
              data-vessel=""
            />
            <rect
              x="154"
              y="114"
              width="54"
              height="69"
              rx="9"
              className="ht-c3-value-bg"
              data-vessel-card=""
            />
            <Label x={181} y={134} anchor="middle" id="dhw" muted={snap.dhw.temp === null}>
              Teplá voda
              <tspan x="181" dy="19" className="ht-c3-dhw-value">
                {fmtT(snap.dhw.temp).replace(/\s°C$/u, '')}
                {snap.dhw.temp !== null && <tspan className="ht-c3-dhw-unit">{'\u00a0°C'}</tspan>}
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
              x="162"
              y="268"
              width="70"
              height="59"
              rx="10"
              className="ht-c3-value-bg"
              data-tank-card=""
            />
            <Label x={196.6} y={286} anchor="middle" id="tank" muted={snap.tank.bottom === null}>
              Nádrž dole
              <tspan x="196.6" dy="27" className="ht-c3-tank-value">
                {fmtT(snap.tank.bottom).replace(/\s°C$/u, '')}
                {snap.tank.bottom !== null && <tspan className="ht-c3-unit">{'\u00a0°C'}</tspan>}
              </tspan>
            </Label>
            <path
              d="M120 355Q181 337 242 355V365H120Z"
              fill={`url(#${uid}-rim)`}
              className="ht-c3-rim"
            />
          </g>
          {/* A short back-wall floor main feeds the vessel dip tube, left of the lower tank card. */}
          <path
            d="M220 364V355H138Q130 355 130 347V232Q130 224 138 224H158Q165 224 165 217V210"
            className="ht-c3-cold-inlet"
            data-pipe-id="cold-water"
          />
          <path
            d="M210 352L216 358V352L210 358ZM213 352V348M210 348H216"
            data-cold-water-valve=""
            className="ht-c3-water-valve"
          />
          <path d="M216 364H224" className="ht-c3-water-valve" />

          {/* Standing hot water: deliberately static, not a simulated draw. */}
          <path
            d="M181 87V46Q181 38 189 38H244Q252 38 252 46V64Q252 72 260 72H282"
            className="ht-c3-draw"
            data-pipe-id="dhw-draw"
          />
          <Label x={181} y={22} anchor="middle" id="tank-title">
            Akumulační nádrž
          </Label>
          {snap.tank.top !== null && (
            <g className="ht-c3-land-only">
              <path d="M118 58H124L134 75" className="ht-c3-leader" data-tank-top-leader="" />
              <rect x="22" y="48" width="96" height="18" rx="4" className="ht-c3-tank-top-bg" />
              <Label x={114} y={61} anchor="end" id="tank-top" muted={false}>
                nahoře {fmtT(snap.tank.top)}
              </Label>
            </g>
          )}
          <g className="ht-c3-hp" data-floor="hp" role="img" aria-label="Tepelné čerpadlo">
            <rect x="8" y="243" width={HP_W} height="118" rx="9" className="ht-c3-cabinet" />
            <path d="M17 361V365M63 361V365" className="ht-c3-metal-pipe" />
            {showLogo && logoManifest ? (
              <image
                data-testid="heating-sch-hp-logo"
                href={`${HEATING_LOGO_ROOT}${logoFile(logoManifest, pageTheme)}`}
                x={8 + (HP_W - LOGO_W) / 2}
                y={258}
                width={LOGO_W}
                height={52}
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
            <rect x="16" y="320" width="49" height="29" rx="4" className="ht-c3-cutaway" />
            <path d="M22 326V345M57 326V345" className="ht-c3-plates" />
            <rect x="31" y="324" width="21" height="24" rx="8" className="ht-c3-compressor" />
          </g>
          <Valve x={88} y={174} diverter port={scene.port} />
          <Label x={10} y={122} id="valve">
            Ventil TUV
            <tspan x="10" dy="18">
              {scene.port === null ? '' : scene.port === 'dhw' ? '→ ohřev' : '→ nádrž'}
            </tspan>
            {scene.port === 'dhw' && (
              <tspan x="10" dy="16">
                TUV
              </tspan>
            )}
          </Label>
          <Label x={115} y={89} anchor="end" id="dhw-port">
            → teplá voda
          </Label>
          <Pump x={96} y={293} on={snap.pumps.secondary} id="charge" />

          <Label x={10} y={211} id="hp-out" muted={scene.hpMuted || hp.condenser_out === null}>
            výstup
            <tspan x="10" dy="16">
              {fmtT(hp.condenser_out)}
            </tspan>
          </Label>
          {/* Retain baseline path data without the obsolete label guide. */}
          <path d="M96 319V328" display="none" />

          <Valve x={290} y={193} />
          <path d="M290 151V170" display="none" />

          <Label x={263} y={249} id="supply" muted={scene.supplyMuted}>
            do topení
            {snap.pumps.heating === true && snap.house.supply_temp !== null && (
              <tspan x="263" dy="18">
                {fmtT(snap.house.supply_temp)}
              </tspan>
            )}
          </Label>
          <g className="ht-c3-radiator">
            <path d="M280 297V307M308 326V343" className="ht-c3-metal-pipe" />
            <path d="M274 326V365M312 326V365" className="ht-c3-rad-feet" />
            <rect x="268" y="306" width="50" height="23" rx="3" className="ht-c3-ceramic" />
            {[273, 281, 289, 297, 305, 313].map((x) => (
              <rect key={x} x={x} y="309" width="4" height="17" rx="1" className="ht-c3-fin" />
            ))}
          </g>

          <Pump x={252} y={350} on={snap.pumps.heating} id="house" />
          <path d="M252 362V365" className="ht-c3-pump-foot" data-floor="pump" />

          {markers.map((marker, index) => (
            <g
              key={marker.id}
              transform={`translate(${marker.x} ${marker.y})`}
              data-marker={marker.id}
              aria-hidden="true"
              className="ht-c3-marker"
              data-muted={marker.muted ? '' : undefined}
            >
              <g transform={`scale(${markerScale})`}>
                <circle r="9" />
                <text textAnchor="middle" dominantBaseline="central">
                  {index + 1}
                </text>
              </g>
            </g>
          ))}
          <g className="ht-c3-tap" fill={`url(#${uid}-chrome)`}>
            <path d="M277 61V39Q282 35 287 39V61M287 46H311V51H307V49H287M281 37V32L298 30V33L285 35V37" />
            <path d="M273 61H322V65H273Z" />
            <path d="M273 65H317Q317 76 306 76H284Q273 76 273 65Z" />
            <path d="M319 65V75" />
          </g>
          <Label x={266} y={94} id="tap">
            Odběr TUV
          </Label>
        </g>
        <Label x={69} y={470} id="collector">
          Zemní kolektor
        </Label>
      </svg>
      <ol className="ht-c3-legend" aria-label="Legenda schématu">
        {markers.map((marker, index) => (
          <li key={marker.id} data-muted={marker.muted ? '' : undefined}>
            <span className="ht-c3-legend-badge" aria-hidden="true">
              {index + 1}
            </span>
            <span
              data-testid={`heating-sch-${marker.id}`}
              className={marker.muted ? 'ht-c3-muted' : undefined}
            >
              {marker.label}
              {marker.value && (
                <>
                  {' '}
                  <span className="ht-c3-legend-value">{marker.value}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
