import type { ReactElement } from 'react';

const VB = '0 0 24 24';
const SW = 2;

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg className="rb-ico-opt" viewBox={VB} aria-hidden="true" fill="none">
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

/** Základní: wand with a single sparkle (auto / one-tap). */
export function BasicLevelIcon() {
  return (
    <Ico>
      <G>
        <path d="M5.5 18.5 14 10" />
        <path
          d="M15.5 8.2 16.8 9.5 15.5 10.8 14.2 9.5Z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M17.2 7v1.4M18.6 8.4H17.2" />
      </G>
    </Ico>
  );
}

/** Pokročilé: three tune sliders. */
export function AdvancedLevelIcon() {
  const sliders: Array<[number, number]> = [
    [7, 12.5],
    [12, 9],
    [17, 14],
  ];
  return (
    <Ico>
      <G>
        {sliders.map(([x, knob]) => (
          <g key={x}>
            <path d={`M${x} 6.5v11`} />
            <circle cx={x} cy={knob} r={1.55} fill="currentColor" stroke="none" />
          </g>
        ))}
      </G>
    </Ico>
  );
}

export type LevelIconKey = 'basic' | 'advanced';

export function levelIcon(key: LevelIconKey): ReactElement {
  return key === 'basic' ? <BasicLevelIcon /> : <AdvancedLevelIcon />;
}

/** Geometry hints for unit tests (everything inside 0–24). */
export const LEVEL_ICON_RECTS: Record<LevelIconKey, ReadonlyArray<readonly [number, number, number, number]>> =
  {
    basic: [],
    advanced: [],
  };

export const LEVEL_ICON_PATHS: Record<LevelIconKey, string[]> = {
  basic: [
    'M5.5 18.5 14 10',
    'M15.5 8.2 16.8 9.5 15.5 10.8 14.2 9.5Z',
    'M17.2 7v1.4M18.6 8.4H17.2',
  ],
  advanced: ['M7 6.5v11', 'M12 6.5v11', 'M17 6.5v11'],
};

export const LEVEL_ICON_CIRCLES: Record<LevelIconKey, ReadonlyArray<readonly [number, number, number]>> = {
  basic: [],
  advanced: [
    [7, 12.5, 1.55],
    [12, 9, 1.55],
    [17, 14, 1.55],
  ],
};

const NUM = /-?\d*\.?\d+/g;

function parsePathBounds(d: string): { maxX: number; maxY: number; minX: number; minY: number } {
  const nums = d.match(NUM)?.map(Number) ?? [];
  let minX = 24;
  let minY = 24;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i]!;
    const y = nums[i + 1]!;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (d.includes('v')) {
    for (const m of d.matchAll(/M([\d.]+)\s+([\d.]+)v([\d.]+)/g)) {
      const x = Number(m[1]);
      const y0 = Number(m[2]);
      const h = Number(m[3]);
      maxY = Math.max(maxY, y0 + h);
      minY = Math.min(minY, y0);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  return { minX, minY, maxX, maxY };
}

export function levelIconFitsViewBox(key: LevelIconKey): boolean {
  for (const [x, y, w, h] of LEVEL_ICON_RECTS[key]) {
    if (x < 0 || y < 0 || x + w > 24 || y + h > 24) return false;
  }
  for (const d of LEVEL_ICON_PATHS[key]) {
    const b = parsePathBounds(d);
    if (b.maxX > 24.01 || b.maxY > 24.01 || b.minX < -0.01 || b.minY < -0.01) return false;
  }
  for (const [x, cy, r] of LEVEL_ICON_CIRCLES[key]) {
    if (x - r < 0 || x + r > 24 || cy - r < 0 || cy + r > 24) return false;
  }
  return true;
}
