import { useId, useState } from 'react';
import type { WineColorCode, WineRecord, WineType } from '../domain/index.js';

/**
 * Licence-clean bottle fallback (WIN-019): our own SVG "packshot" built to sit in the same
 * series as the vendor e-shop photos, just without a label. Geometry and tones were measured
 * from the normalised 3:4 photos: straight-on camera, bottle centred, capsule top at 6.5 %
 * and base at 93.5 % of the frame height, body ~29 % of the frame width, soft contact shadow
 * trailing right. Glass is lit by two strip lights (broad key stripe left, thin fill right)
 * with dark refractive rims; closure is a metal screwcap, a pearl capsule or foil + muselet.
 * No vendor assets are used.
 */
export type BottleShape = 'bordeaux' | 'burgundy' | 'flute' | 'sparkling' | 'rose';

// viewBox 0 0 300 400 (3:4 like the e-shop photos).
const C = 150;
const BASE = 374;
interface Shape {
  top: number; // closure top y
  neck: number; // neck half-width
  body: number; // body half-width
  shoulder: number; // y where the neck starts to flare
  full: number; // y where the body reaches full width
  cap: number; // capsule / foil bottom y
  k1: number; // shoulder curve: how long the neck keeps straight (0..1)
  k2: number; // shoulder curve: how early the body reaches full width (0..1)
}
const BORDEAUX: Shape = {
  top: 26,
  neck: 15.5,
  body: 43,
  shoulder: 110,
  full: 160,
  cap: 92,
  k1: 0.3,
  k2: 0.45,
};
const SHAPES: Record<BottleShape, Shape> = {
  bordeaux: BORDEAUX,
  rose: BORDEAUX,
  burgundy: { top: 26, neck: 15, body: 45, shoulder: 104, full: 212, cap: 90, k1: 0.45, k2: 0.3 },
  flute: { top: 26, neck: 13, body: 35, shoulder: 112, full: 244, cap: 96, k1: 0.5, k2: 0.25 },
  sparkling: {
    top: 40,
    neck: 15,
    body: 43.5,
    shoulder: 112,
    full: 250,
    cap: 98,
    k1: 0.5,
    k2: 0.22,
  },
};

type Glass = WineColorCode | 'sparkling';
interface GlassTone {
  /** rim → edge → mid → centre (wine seen through the glass), sampled from packshots */
  tone: readonly [string, string, string, string];
  /** flint glass: empty neck above the fill line, light refraction at the heel */
  flint: boolean;
  /** strength of the key-light stripe */
  key: number;
}
const GLASS: Record<Glass, GlassTone> = {
  white: { tone: ['#1c1d0c', '#55531f', '#8f8a3a', '#bfb66a'], flint: false, key: 0.8 },
  red: { tone: ['#060304', '#43101b', '#230a10', '#1b0b0f'], flint: false, key: 0.6 },
  rose: { tone: ['#6e2c1a', '#bb5d38', '#e2825a', '#f3a27c'], flint: true, key: 0.75 },
  orange: { tone: ['#3d2008', '#7a4614', '#bf7c33', '#d99d52'], flint: true, key: 0.7 },
  other: { tone: ['#181b18', '#353a35', '#626a62', '#7d857d'], flint: false, key: 0.8 },
  sparkling: { tone: ['#0a0e07', '#232c12', '#475424', '#647234'], flint: false, key: 0.8 },
};

type Closure = 'silver' | 'pearl' | 'foil';
/** Metallic / satin gradients across the closure (left → right, key light from the left). */
const CLOSURE: Record<Closure, readonly string[]> = {
  silver: ['#5d6469', '#b3babf', '#eef1f3', '#b7bec3', '#868d93', '#4d5459'],
  pearl: ['#848a90', '#cdd1d4', '#eceef0', '#dadde0', '#a9aeb3', '#686e74'],
  foil: ['#4a3712', '#a07f3a', '#e2c47e', '#b8954a', '#7d5f26', '#3e2d0e'],
};
const CLOSURE_STOPS = [0, 0.14, 0.32, 0.55, 0.8, 1];

const BURGUNDY = /(rulandsk|pinot|chardonnay|svatovav|veltl|frankovk|zweigelt)/i;
const FLUTE = /(ryzlink rýnský|riesling|muškát|tramín|pálava|gewürz)/i;

/** Pick a silhouette from wine type, colour and grape (deterministic). */
export function bottleShape(
  w: Pick<WineRecord, 'wineType' | 'color' | 'grapeVarieties'>,
): BottleShape {
  if (w.wineType === 'sparkling' || w.wineType === 'semi_sparkling') return 'sparkling';
  if (w.color === 'rose') return 'rose';
  const grape = w.grapeVarieties.join(' ');
  if (FLUTE.test(grape)) return 'flute';
  if (BURGUNDY.test(grape) || w.color === 'orange') return 'burgundy';
  return 'bordeaux';
}

/** Closed silhouette; `inset` shrinks it horizontally (for the refraction edge). */
function outline({ top, neck, body, shoulder, full, k1, k2 }: Shape, inset = 0): string {
  const n = neck - inset;
  const b = body - inset;
  const span = full - shoulder;
  const y1 = shoulder + span * k1;
  const y2 = full - span * k2;
  const side = (s: 1 | -1) => `C${C + s * (n + 0.5)} ${y1} ${C + s * b} ${y2} ${C + s * b} ${full}`;
  return [
    `M${C - n} ${top + 4}`,
    `H${C + n}`,
    `V${shoulder}`,
    side(1),
    `V${BASE - 12}`,
    `Q${C + b} ${BASE - 1} ${C + b - 11} ${BASE}`,
    `Q${C} ${BASE + 4} ${C - b + 11} ${BASE}`,
    `Q${C - b} ${BASE - 1} ${C - b} ${BASE - 12}`,
    `V${full}`,
    `C${C - b} ${y2} ${C - (n + 0.5)} ${y1} ${C - n} ${shoulder}`,
    'Z',
  ].join(' ');
}

/** Open path along one shoulder (used for the curved shoulder highlight). */
function shoulderLine({ neck, body, shoulder, full, k1, k2 }: Shape, s: 1 | -1, f: number) {
  const span = full - shoulder;
  const x = (v: number) => C + s * v * f;
  return `M${x(neck)} ${shoulder - 14} V${shoulder} C${x(neck + 0.5)} ${shoulder + span * k1} ${x(body)} ${full - span * k2} ${x(body)} ${full + 26}`;
}

export function BottleArt({
  color,
  wineType,
  shape,
  height = 120,
  decorative = false,
}: {
  color: WineColorCode;
  wineType: WineType;
  shape?: BottleShape;
  height?: number;
  decorative?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (k: string) => `url(#${k}${id})`;
  const sparkling = wineType === 'sparkling' || wineType === 'semi_sparkling';
  const s: BottleShape = shape ?? (sparkling ? 'sparkling' : 'bordeaux');
  const g = SHAPES[s];
  const glassKey: Glass = sparkling && color !== 'rose' ? 'sparkling' : color;
  const glass = GLASS[glassKey];
  const closure: Closure = s === 'sparkling' ? 'foil' : color === 'white' ? 'silver' : 'pearl';
  const [rim, edge, mid, centre] = glass.tone;
  const body = outline(g);
  const fill = g.shoulder - 4; // wine level in flint bottles (headspace in the neck)
  const keyX = C - g.body * 0.6;
  const neckW = g.neck * 2;
  const neckEnd = (g.shoulder + g.full) / 2;
  return (
    <svg
      className="wine-bottle wine-bottle--art"
      width={Math.round(height * 0.75)}
      height={height}
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid meet"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Ilustrační lahev (bez fotografie)'}
      data-testid="wine-photo-placeholder"
      data-shape={s}
      data-glass={glassKey}
      data-closure={closure}
    >
      <defs>
        {/* wine through glass, key light from the left */}
        <linearGradient id={`g${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={rim} />
          <stop offset="0.05" stopColor={edge} />
          <stop offset="0.2" stopColor={mid} />
          <stop offset="0.42" stopColor={centre} />
          <stop offset="0.62" stopColor={centre} />
          <stop offset="0.84" stopColor={mid} />
          <stop offset="0.95" stopColor={edge} />
          <stop offset="1" stopColor={rim} />
        </linearGradient>
        {/* empty clear neck (flint bottles) */}
        <linearGradient id={`e${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#7d8388" />
          <stop offset="0.2" stopColor="#d4d9dd" />
          <stop offset="0.45" stopColor="#eef1f3" />
          <stop offset="0.8" stopColor="#c3c9ce" />
          <stop offset="1" stopColor="#6f757a" />
        </linearGradient>
        {/* heel: thick glass at the base */}
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.55" stopColor="#000" stopOpacity={glass.flint ? 0.1 : 0.3} />
          <stop offset="1" stopColor="#000" stopOpacity={glass.flint ? 0.55 : 0.6} />
        </linearGradient>
        <linearGradient id={`c${id}`} x1="0" x2="1">
          {CLOSURE[closure].map((stop, n) => (
            <stop key={n} offset={CLOSURE_STOPS[n]} stopColor={stop} />
          ))}
        </linearGradient>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`b${id}`} x="-50%" y="-400%" width="200%" height="900%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id={`q${id}`} x="-50%" y="-400%" width="200%" height="900%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
        <filter id={`s${id}`} x="-200%" y="-5%" width="500%" height="110%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <linearGradient id={`l${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.12" stopColor="#fff" />
          <stop offset="0.8" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`n${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.7" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`a${id}`} maskContentUnits="userSpaceOnUse">
          <rect x={C - g.neck} y={g.top} width={neckW} height={neckEnd - g.top} fill={u('n')} />
        </mask>
        <filter id={`w${id}`} x="-20%" y="-5%" width="140%" height="110%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <filter id={`m${id}`} x="-200%" y="-5%" width="500%" height="110%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id={`f${id}`} x="-200%" y="-5%" width="500%" height="110%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <clipPath id={`k${id}`}>
          <path d={body} />
        </clipPath>
      </defs>

      {/* floor: soft shadow trailing right + tight contact shadow */}
      <ellipse
        cx={C + 22}
        cy={BASE - 1}
        rx={g.body * 1.55}
        ry={4.5}
        fill="#000"
        opacity="0.13"
        filter={u('b')}
      />
      <ellipse
        cx={C + 3}
        cy={BASE + 2}
        rx={g.body * 1.05}
        ry={1.8}
        fill="#000"
        opacity="0.65"
        filter={u('q')}
      />

      <path d={body} fill={u('g')} />
      <g clipPath={u('k')}>
        {/* the neck is its own cylinder: same falloff across its width, fading into the body */}
        <rect
          x={C - g.neck}
          y={g.top}
          width={neckW}
          height={neckEnd - g.top}
          fill={u('g')}
          mask={u('a')}
        />
        <rect x={C - g.body} y={BASE - 34} width={g.body * 2} height={36} fill={u('h')} />
        {/* punt seen through the glass + light refracted in the heel */}
        <ellipse
          cx={C}
          cy={BASE - 5}
          rx={g.body * 0.78}
          ry={8}
          fill="#000"
          opacity={glass.flint ? 0.22 : 0.35}
          filter={u('q')}
        />
        <path
          d={`M${C - g.body * 0.8} ${BASE - 17} Q${C} ${BASE - 23} ${C + g.body * 0.8} ${BASE - 17}`}
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          opacity={glass.flint ? 0.45 : 0.22}
          filter={u('f')}
        />
        {/* thick glass at the silhouette: a soft rim in a deeper shade of the glass */}
        <path
          d={body}
          fill="none"
          stroke={rim}
          strokeWidth="11"
          strokeOpacity="0.85"
          filter={u('w')}
        />
        {glass.flint && (
          <>
            <rect x={C - g.neck} y={g.top} width={neckW} height={fill - g.top} fill={u('e')} />
            <rect
              x={C - g.neck}
              y={fill - 0.5}
              width={neckW}
              height={2.2}
              fill="#000"
              opacity="0.3"
              filter={u('f')}
            />
            <rect
              x={C - g.neck}
              y={fill + 1.6}
              width={neckW}
              height={2}
              fill="#fff"
              opacity="0.3"
            />
          </>
        )}
        {/* refraction edge: a thin bright line just inside the dark rim */}
        <path
          d={outline(g, 3.2)}
          fill="none"
          stroke="#fff"
          strokeOpacity={glass.flint ? 0.32 : 0.16}
          strokeWidth="1.1"
        />
        {/* key light (broad soft + crisp core), shoulder sweep, fill light right, neck */}
        <rect
          x={keyX - 8}
          y={g.full - 10}
          width={16}
          height={BASE - g.full - 12}
          rx={8}
          fill={u('l')}
          opacity={glass.key * 0.55}
          filter={u('s')}
        />
        <rect
          x={keyX - 3}
          y={g.full}
          width={6}
          height={BASE - g.full - 26}
          rx={3}
          fill={u('l')}
          opacity={glass.key * 0.8}
          filter={u('m')}
        />
        <rect
          x={keyX - 0.9}
          y={g.full + 10}
          width={1.8}
          height={BASE - g.full - 50}
          rx={0.9}
          fill={u('l')}
          opacity={glass.key * 0.75}
        />
        {/* softbox window reflected on the left shoulder */}
        <ellipse
          cx={C - (g.neck + g.body) * 0.42}
          cy={g.shoulder + (g.full - g.shoulder) * 0.62}
          rx={5}
          ry={(g.full - g.shoulder) * 0.28}
          transform={`rotate(${s === 'bordeaux' || s === 'rose' ? 38 : 22} ${C - (g.neck + g.body) * 0.42} ${g.shoulder + (g.full - g.shoulder) * 0.62})`}
          fill="#fff"
          opacity={glass.key * 0.45}
          filter={u('s')}
        />
        <path
          d={shoulderLine(g, -1, 0.6)}
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          opacity={glass.key * 0.8}
          filter={u('f')}
        />
        <path
          d={shoulderLine(g, 1, 0.74)}
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity={glass.key * 0.4}
          filter={u('f')}
        />
        <rect
          x={C + g.body * 0.72 - 2.5}
          y={g.full + 4}
          width={5}
          height={BASE - g.full - 30}
          rx={2.5}
          fill={u('l')}
          opacity={glass.key * 0.35}
          filter={u('m')}
        />
        <rect
          x={C + g.body * 0.72 - 0.6}
          y={g.full + 14}
          width={1.2}
          height={BASE - g.full - 56}
          fill={u('l')}
          opacity={glass.key * 0.5}
        />
        <rect
          x={C - g.neck * 0.55 - 1}
          y={g.cap + 2}
          width={2.2}
          height={g.shoulder - g.cap}
          rx={1.1}
          fill="#fff"
          opacity={glass.key * 0.7}
          filter={u('f')}
        />
      </g>

      {closure === 'foil' ? (
        <SparklingTop g={g} u={u} />
      ) : (
        <Capsule g={g} u={u} screw={closure === 'silver'} />
      )}
    </svg>
  );
}

/** Still-wine capsule: lip collar, long skirt, crisp lower edge casting a hairline shadow. */
function Capsule({ g, u, screw }: { g: Shape; u: (k: string) => string; screw: boolean }) {
  const w = g.neck + 1.2;
  const lip = 13;
  return (
    <g>
      <rect
        x={C - w}
        y={g.cap}
        width={w * 2}
        height={3}
        fill="#000"
        opacity="0.25"
        filter={u('f')}
      />
      <path
        d={`M${C - w - 1.6} ${g.top + 2.5} Q${C - w - 1.6} ${g.top} ${C - w + 1} ${g.top} H${C + w - 1} Q${C + w + 1.6} ${g.top} ${C + w + 1.6} ${g.top + 2.5} V${g.top + lip} L${C + w} ${g.top + lip + 2} V${g.cap} H${C - w} V${g.top + lip + 2} L${C - w - 1.6} ${g.top + lip} Z`}
        fill={u('c')}
        stroke="#000"
        strokeOpacity="0.28"
        strokeWidth="0.8"
      />
      <rect x={C - w - 1.6} y={g.top} width={(w + 1.6) * 2} height={5} fill={u('t')} />
      <rect x={C - w} y={g.top + lip + 1.5} width={w * 2} height={1} fill="#000" opacity="0.2" />
      {screw && (
        <g opacity="0.16">
          {Array.from({ length: 13 }, (_, n) => (
            <rect
              key={n}
              x={C - w + 1 + n * ((w * 2 - 2) / 12) - 0.4}
              y={g.top + 3}
              width={0.8}
              height={lip - 3}
              fill="#000"
            />
          ))}
        </g>
      )}
      {screw && (
        <rect x={C - w} y={g.top + 32} width={w * 2} height={0.9} fill="#000" opacity="0.22" />
      )}
      <rect x={C - w} y={g.cap - 2.5} width={w * 2} height={2.5} fill="#000" opacity="0.14" />
    </g>
  );
}

/** Sparkling: gold foil over the cork, wire muselet with a crown plaque. */
function SparklingTop({ g, u }: { g: Shape; u: (k: string) => string }) {
  const w = g.neck + 1.4;
  const top = g.top;
  const ring = top + 26;
  return (
    <g>
      <rect
        x={C - w}
        y={g.cap}
        width={w * 2}
        height={3}
        fill="#000"
        opacity="0.22"
        filter={u('f')}
      />
      {/* foil skirt with crinkles */}
      <path
        d={`M${C - w - 2} ${top + 6} Q${C} ${top - 4} ${C + w + 2} ${top + 6} V${ring + 8} L${C + w} ${ring + 14} V${g.cap} Q${C} ${g.cap + 3} ${C - w} ${g.cap} V${ring + 14} L${C - w - 2} ${ring + 8} Z`}
        fill={u('c')}
        stroke="#000"
        strokeOpacity="0.3"
        strokeWidth="0.8"
      />
      <g stroke="#000" strokeOpacity="0.12" strokeWidth="0.8" fill="none">
        <path d={`M${C - w} ${ring + 19} q8 3 ${w * 2} -1`} />
        <path d={`M${C - w} ${ring + 27} q10 -2 ${w * 2} 1`} />
      </g>
      {/* muselet: plaque, two visible legs, ring around the lip, twist */}
      <g stroke="#3b4046" strokeWidth="2.2" strokeOpacity="0.45" fill="none" strokeLinecap="round">
        <path d={`M${C - 8} ${top + 1} L${C - w - 0.5} ${ring}`} />
        <path d={`M${C + 8} ${top + 1} L${C + w + 0.5} ${ring}`} />
        <path d={`M${C - 2} ${top + 2} L${C - 4} ${ring}`} />
      </g>
      <g stroke="#dfe3e6" strokeWidth="1.2" fill="none" strokeLinecap="round">
        <path d={`M${C - 8} ${top + 1} L${C - w - 0.5} ${ring}`} />
        <path d={`M${C + 8} ${top + 1} L${C + w + 0.5} ${ring}`} />
        <path d={`M${C - 2} ${top + 2} L${C - 4} ${ring}`} />
        <path d={`M${C - w - 2} ${ring} Q${C} ${ring + 3.5} ${C + w + 2} ${ring}`} />
      </g>
      <g stroke="#5c6166" strokeWidth="0.5" strokeOpacity="0.6" fill="none">
        <path d={`M${C - w - 2} ${ring + 1.2} Q${C} ${ring + 4.6} ${C + w + 2} ${ring + 1.2}`} />
      </g>
      <path
        d={`M${C - 6} ${ring + 2} q-3 6 0 10 q3 -4 0 -10`}
        stroke="#d9dde0"
        strokeWidth="1.2"
        fill="none"
      />
      <ellipse
        cx={C}
        cy={top}
        rx={10.5}
        ry={3}
        fill={u('c')}
        stroke="#000"
        strokeOpacity="0.3"
        strokeWidth="0.6"
      />
      <ellipse cx={C - 3} cy={top - 0.6} rx={4} ry={1} fill="#fff" opacity="0.6" />
      <rect x={C - w} y={g.cap - 2.5} width={w * 2} height={2.5} fill="#000" opacity="0.14" />
    </g>
  );
}

/** Local photo URL (signed by the integration) or null → SVG fallback. */
export function photoUrl(wine: WineRecord): string | null {
  const img = wine.image;
  if (!img || img.licenseStatus === 'review') return null;
  if (img.url) return img.url;
  return /^(\/|https?:|data:image\/)/.test(img.localPath) ? img.localPath : null;
}

/**
 * Photo slot (WIN-012): the vendor photo and the SVG fallback share one 3:4 studio tile
 * (object-fit: contain, same padding). The photo is multiplied onto the tile, so its white
 * studio background takes the tile colour (white in light theme, soft neutral in dark).
 */
export function WineBottle({
  wine,
  height,
  decorative,
}: {
  wine: WineRecord;
  height: number;
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = photoUrl(wine);
  const showPhoto = url !== null && failed !== url;
  return (
    <span
      className="wine-bottle-frame"
      style={{ height, width: Math.round(height * 0.75) }}
      data-photo={showPhoto || undefined}
    >
      {showPhoto ? (
        <img
          className="wine-bottle wine-bottle--photo"
          src={url}
          alt={decorative ? '' : `Fotografie: ${wine.name}`}
          loading="lazy"
          onError={() => setFailed(url)}
          data-testid="wine-photo"
        />
      ) : (
        <BottleArt
          color={wine.color}
          wineType={wine.wineType}
          shape={bottleShape(wine)}
          height={height}
          decorative={decorative}
        />
      )}
    </span>
  );
}
