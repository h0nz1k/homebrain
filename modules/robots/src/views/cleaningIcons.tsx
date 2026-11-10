import type { ReactElement } from 'react';
import type { CleanMode } from '../commands.js';
import { fanChoices, mopRouteChoices, waterChoices } from '../commands.js';
import { fansForMode } from '../presets.js';

export type CleaningIconKind = 'mode' | 'fan' | 'water' | 'mop' | 'passes';

const VB = '0 0 20 20';
const S = 1.6;

function Ico({
  children,
  className = '',
  fill = 'none',
}: {
  children: React.ReactNode;
  className?: string;
  fill?: string;
}) {
  return (
    <svg
      className={`rb-ico-opt ${className}`.trim()}
      viewBox={VB}
      aria-hidden="true"
      fill={fill}
    >
      {children}
    </svg>
  );
}

function stroke(children: React.ReactNode) {
  return (
    <Ico>
      <g stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </Ico>
  );
}

function fanArcs(n: number, slash = false, plus = false) {
  const arcs = [
    'M10 10 V4.2',
    'M10 10 l4.8-2.8',
    'M10 10 l3 4.2',
    'M10 10 l-3 4.2',
    'M10 10 l-4.8-2.8',
  ];
  return (
    <Ico>
      <g stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="2.1" fill="currentColor" stroke="none" />
        {arcs.slice(0, n).map((d) => (
          <path key={d} d={d} fill="none" />
        ))}
        {slash && <path d="M5.5 5.5 14.5 14.5" fill="none" />}
        {plus && (
          <>
            <path d="M16.2 4.5v2.4" fill="none" />
            <path d="M15 5.7h2.4" fill="none" />
          </>
        )}
      </g>
    </Ico>
  );
}

function waterDrop(level: number, slash = false, clipKey = 'w') {
  const fillY = 4 + (1 - level) * 11;
  const clipId = `rb-water-${clipKey}`;
  return (
    <Ico>
      <path
        d="M10 3.2c2.8 3.6 5.2 6.4 5.2 9.3a5.2 5.2 0 1 1-10.4 0c0-2.9 2.4-5.7 5.2-9.3Z"
        stroke="currentColor"
        strokeWidth={S}
        fill="none"
      />
      {level > 0 && (
        <path
          d="M10 3.2c2.8 3.6 5.2 6.4 5.2 9.3a5.2 5.2 0 1 1-10.4 0c0-2.9 2.4-5.7 5.2-9.3Z"
          fill="currentColor"
          clipPath={`url(#${clipId})`}
          opacity={0.85}
        />
      )}
      {slash && (
        <path
          d="M5.8 5.8 14.2 14.2"
          stroke="currentColor"
          strokeWidth={S}
          strokeLinecap="round"
        />
      )}
      <defs>
        <clipPath id={clipId}>
          <rect x="4" y={fillY} width="12" height={16 - fillY} />
        </clipPath>
      </defs>
    </Ico>
  );
}

const WATER_LEVEL: Record<string, number> = {
  off: 0,
  slight: 0.15,
  min: 0.15,
  low: 0.32,
  mild: 0.32,
  medium: 0.48,
  standard: 0.48,
  moderate: 0.62,
  high: 0.78,
  intense: 0.78,
  max: 0.95,
  extreme: 0.95,
};

function mopPath(density: 'sparse' | 'normal' | 'dense', plus = false) {
  const y = density === 'sparse' ? 11 : density === 'normal' ? 10 : 9;
  const amp = density === 'sparse' ? 2.2 : density === 'normal' ? 3.2 : 4.4;
  const d = `M3.5 ${y} Q6 ${y - amp} 8.5 ${y} T13.5 ${y} T18 ${y}`;
  return stroke(
    <>
      <path d={d} />
      {plus && (
        <>
          <path d="M16.5 4.8v2.2" />
          <path d="M15.4 5.9h2.2" />
        </>
      )}
    </>,
  );
}

function smartSpark() {
  return stroke(
    <>
      <path d="M11.2 3.5 9.5 8.8H6.2l4.8 7.5-1-5.5h3.5Z" fill="currentColor" stroke="none" />
    </>,
  );
}

function slidersIcon() {
  return stroke(
    <>
      <path d="M4 6h12" />
      <path d="M4 10h12" />
      <path d="M4 14h12" />
      <circle cx="7.5" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="14" r="1.6" fill="currentColor" stroke="none" />
    </>,
  );
}

function modeVacuum() {
  return stroke(
    <>
      <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none" />
      <path d="M10 10V5" />
      <path d="M10 10l3.5-2" />
      <path d="M10 10l2.2 2.8" />
    </>,
  );
}

function modeMop() {
  return stroke(
    <>
      <rect x="5.5" y="8" width="9" height="7" rx="2.2" />
      <path d="M7 8V6.2a3 3 0 0 1 6 0V8" />
      <path d="M8.2 12.2h3.6" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    </>,
  );
}

function modeBoth() {
  return stroke(
    <>
      <circle cx="7.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M7.5 9.5V6" />
      <path d="M7.5 9.5l2.2-1.3" />
      <rect x="10.5" y="9" width="6" height="5.5" rx="1.6" />
      <path d="M12 9V7.8a2 2 0 0 1 3.5 0V9" />
    </>,
  );
}

function passLines(n: number) {
  return stroke(
    <>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M4 ${7 + i * 3.5}h12`} />
      ))}
    </>,
  );
}

const FAN_LEVEL: Record<string, number> = {
  quiet: 1,
  balanced: 2,
  turbo: 3,
  max: 4,
  max_plus: 4,
};

export function cleaningOptionIcon(kind: CleaningIconKind, key: string): ReactElement | null {
  if (kind === 'mode') {
    const m = key as CleanMode;
    if (m === 'vacuum') return modeVacuum();
    if (m === 'mop') return modeMop();
    if (m === 'both') return modeBoth();
    return null;
  }
  if (kind === 'passes') {
    const n = Number(key);
    if (n >= 1 && n <= 3) return passLines(n);
    return null;
  }
  if (kind === 'fan') {
    if (key === 'off') return fanArcs(2, true);
    if (key === 'smart_mode') return smartSpark();
    if (key === 'custom') return slidersIcon();
    if (key in FAN_LEVEL) return fanArcs(FAN_LEVEL[key]!, false, key === 'max_plus');
    return null;
  }
  if (kind === 'water') {
    if (key === 'smart_mode') return smartSpark();
    if (key === 'custom' || key === 'custom_water_flow') return slidersIcon();
    if (key === 'off') return waterDrop(0, true, key);
    const level = WATER_LEVEL[key];
    if (level !== undefined) return waterDrop(level, false, key);
    return null;
  }
  if (kind === 'mop') {
    if (key === 'fast') return mopPath('sparse');
    if (key === 'standard') return mopPath('normal');
    if (key === 'deep') return mopPath('dense');
    if (key === 'deep_plus') return mopPath('dense', true);
    if (key === 'smart_mode') return smartSpark();
    if (key === 'custom') return slidersIcon();
    return null;
  }
  return null;
}

/** Keys shown for demo robot 1 (Kraken-like fixture). */
export function krakenDisplayedOptionKeys(): { kind: CleaningIconKind; key: string }[] {
  const fanKraken = [
    'quiet',
    'balanced',
    'turbo',
    'max',
    'max_plus',
    'off',
    'smart_mode',
    'custom',
  ];
  const waterKraken = ['off', 'slight', 'low', 'medium', 'moderate', 'high', 'extreme'];
  const mopKraken = ['standard', 'deep', 'deep_plus', 'fast', 'smart_mode', 'custom'];
  const modes: CleanMode[] = ['vacuum', 'mop', 'both'];
  const out: { kind: CleaningIconKind; key: string }[] = [];
  for (const key of modes) out.push({ kind: 'mode', key });
  for (const key of fansForMode(fanChoices(fanKraken, 'balanced'), 'both'))
    out.push({ kind: 'fan', key });
  for (const key of waterChoices(waterKraken, 'moderate')) out.push({ kind: 'water', key });
  for (const key of mopRouteChoices(mopKraken, 'standard')) out.push({ kind: 'mop', key });
  for (const key of ['1', '2', '3']) out.push({ kind: 'passes', key });
  return out;
}
