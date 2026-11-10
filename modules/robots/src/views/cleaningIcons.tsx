import type { ReactElement } from 'react';
import type { CleanMode } from '../commands.js';
import { fanChoices, mopRouteChoices, waterChoices } from '../commands.js';
import { fansForMode } from '../presets.js';

export type CleaningIconKind = 'mode' | 'fan' | 'water' | 'mop' | 'passes';

const VB = '0 0 24 24';
const SW = 2;

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

function G({ children }: { children: React.ReactNode }) {
  return (
    <g stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {children}
    </g>
  );
}

/** Signal meter: `count` filled bars of increasing height (2 SVG units wide). */
function levelBars(count: number, slots: number, x0 = 15.5, yFoot = 20) {
  const gap = 3.2;
  const maxH = 11;
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < slots; i++) {
    const h = 4 + (maxH - 4) * ((i + 1) / slots);
    const x = x0 + i * gap;
    const y = yFoot - h;
    if (i < count) {
      bars.push(<rect key={i} x={x} y={y} width={2} height={h} rx={0.4} fill="currentColor" stroke="none" />);
    } else {
      bars.push(
        <rect
          key={i}
          x={x}
          y={yFoot - h}
          width={2}
          height={h}
          rx={0.4}
          fill="none"
          stroke="currentColor"
          strokeWidth={SW}
          opacity={0.35}
        />,
      );
    }
  }
  return bars;
}

function plusMark(x = 20.5, y = 5.5, s = 2.2) {
  return (
    <>
      <path d={`M${x} ${y - s}v${s * 2}`} />
      <path d={`M${x - s} ${y}h${s * 2}`} />
    </>
  );
}

function slashMark() {
  return <path d="M15 5.5 21 18.5" />;
}

function sparkMark() {
  return (
  <path
      d="M20.2 6.2 19.2 9.2h-2.2l3.2 5.2-.8-3.5h2.4Z"
      fill="currentColor"
      stroke="none"
    />
  );
}

function sliderMark() {
  return (
    <>
      <path d="M19 7.5v9" />
      <circle cx="19" cy="11" r="1.6" fill="currentColor" stroke="none" />
    </>
  );
}

/** Three curved fan blades in the left 14 px (centre ≈ 7, 12). */
function fanGlyph(extra?: React.ReactNode) {
  const cx = 7;
  const cy = 12;
  return (
    <Ico>
      <G>
        <circle cx={cx} cy={cy} r="1.4" fill="currentColor" stroke="none" />
        <path d={`M${cx} ${cy} Q10.5 6.5 11.2 9.5`} />
        <path d={`M${cx} ${cy} Q11.5 13 9.5 15.8`} />
        <path d={`M${cx} ${cy} Q3.5 13.5 4.8 11`} />
        {extra}
      </G>
    </Ico>
  );
}

function dropGlyph(
  extra?: React.ReactNode,
  opts?: { fillDrop?: boolean; slash?: boolean },
) {
  const d =
    'M6 5.2c1.8 2.6 3.6 5 3.6 7.5a3.6 3.6 0 1 1-7.2 0c0-2.5 1.8-4.9 3.6-7.5Z';
  return (
    <Ico>
      <G>
        <path d={d} fill={opts?.fillDrop ? 'currentColor' : 'none'} />
        {opts?.slash && slashMark()}
        {extra}
      </G>
    </Ico>
  );
}

const FAN_BARS: Record<string, number> = {
  quiet: 1,
  balanced: 2,
  turbo: 3,
  max: 4,
  max_plus: 4,
};

function fanLevel(
  barCount: number,
  slash = false,
  plus = false,
  extra?: React.ReactNode,
) {
  const n = barCount;
  const cx = 7;
  const cy = 12;
  return (
    <Ico>
      <G>
        <circle cx={cx} cy={cy} r="1.4" fill="currentColor" stroke="none" />
        <path d={`M${cx} ${cy} Q10.5 6.5 11.2 9.5`} />
        <path d={`M${cx} ${cy} Q11.5 13 9.5 15.8`} />
        <path d={`M${cx} ${cy} Q3.5 13.5 4.8 11`} />
        {levelBars(n, 4)}
        {slash && slashMark()}
        {plus && plusMark()}
        {extra}
      </G>
    </Ico>
  );
}

const WATER_BARS: Record<string, { bars: number; fill?: boolean }> = {
  off: { bars: 0 },
  slight: { bars: 1 },
  min: { bars: 1 },
  low: { bars: 2 },
  mild: { bars: 2 },
  medium: { bars: 3 },
  standard: { bars: 3 },
  moderate: { bars: 4 },
  high: { bars: 5 },
  intense: { bars: 5 },
  max: { bars: 5, fill: true },
  extreme: { bars: 5, fill: true },
};

function waterLevel(key: string, slash = false, extra?: React.ReactNode) {
  const spec = WATER_BARS[key] ?? { bars: 0 };
  const d =
    'M6 5.2c1.8 2.6 3.6 5 3.6 7.5a3.6 3.6 0 1 1-7.2 0c0-2.5 1.8-4.9 3.6-7.5Z';
  return (
    <Ico>
      <G>
        <path d={d} fill={spec.fill ? 'currentColor' : 'none'} />
        {levelBars(spec.bars, 5)}
        {(slash || key === 'off') && slashMark()}
        {extra}
      </G>
    </Ico>
  );
}

function mopZigzag(passes: number, dense = false, plus = false, spark = false) {
  const amp = dense ? 1.8 : 2.8;
  const y0 = dense ? 8.5 : 9;
  const step = dense ? 3.2 : 4.5;
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < passes; i++) {
    const y = y0 + i * step;
    const d = `M2.5 ${y} L5.5 ${y - amp} L8.5 ${y} L11.5 ${y + amp} L14.5 ${y} L17.5 ${y - amp} L21 ${y}`;
    lines.push(<path key={i} d={d} />);
  }
  return (
    <Ico>
      <G>
        {lines}
        {plus && plusMark()}
        {spark && sparkMark()}
      </G>
    </Ico>
  );
}

function modeVacuum() {
  return (
    <Ico>
      <G>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="5.2" r="2.5" fill="currentColor" stroke="none" />
        <path d="M6.2 17.2 A6 6 0 0 0 17.8 17.2" />
      </G>
    </Ico>
  );
}

function modeMop() {
  return (
    <Ico>
      <G>
        <path d="M12 4.5c1.2 1.6 2.2 3 2.2 4.4a2.2 2.2 0 1 1-4.4 0c0-1.4 1-2.8 2.2-4.4Z" />
        <rect x="4" y="18" width="16" height="4" rx="1.2" />
      </G>
    </Ico>
  );
}

function modeBoth() {
  return (
    <Ico>
      <G>
        <circle cx="8" cy="13" r="6" />
        <circle cx="8" cy="9.8" r="1.6" fill="currentColor" stroke="none" />
        <path d="M16.5 7.5c.9 1.2 1.5 2.4 1.5 3.6a1.5 1.5 0 1 1-3 0c0-1.2.6-2.4 1.5-3.6Z" />
      </G>
    </Ico>
  );
}

function passLines(n: number) {
  const gap = 4.5;
  const y0 = 12 - ((n - 1) * gap) / 2;
  return (
    <Ico>
      <G>
        {Array.from({ length: n }, (_, i) => (
          <path key={i} d={`M4 ${y0 + i * gap}h16`} />
        ))}
      </G>
    </Ico>
  );
}

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
    if (key === 'off') return fanLevel(0, true);
    if (key === 'smart_mode') return fanGlyph(sparkMark());
    if (key === 'custom') return fanGlyph(sliderMark());
    if (key in FAN_BARS) return fanLevel(FAN_BARS[key]!, false, key === 'max_plus');
    return null;
  }
  if (kind === 'water') {
    if (key === 'smart_mode') return dropGlyph(sparkMark());
    if (key === 'custom' || key === 'custom_water_flow') return dropGlyph(sliderMark());
    if (key === 'off') return waterLevel('off');
    if (key in WATER_BARS) return waterLevel(key);
    return null;
  }
  if (kind === 'mop') {
    if (key === 'fast') return mopZigzag(2, false);
    if (key === 'standard') return mopZigzag(3, false);
    if (key === 'deep') return mopZigzag(4, true);
    if (key === 'deep_plus') return mopZigzag(4, true, true);
    if (key === 'smart_mode') return mopZigzag(3, false, false, true);
    if (key === 'custom') return mopZigzag(2, false);
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
