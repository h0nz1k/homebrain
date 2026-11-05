import type { Signal } from '@homebrain/signals';
import type { TodayData } from './types.js';
import { TIME_ZONE } from './types.js';
import type { NightHours } from './kiosk.js';
import { isNightDimHour, localHourFraction } from './time.js';

export type ScenePhase = 'night' | 'dawn' | 'day' | 'dusk';

export type SceneSeverity = 'warning' | 'critical' | null;

export type ComputedScene = {
  phase: ScenePhase;
  sun: { x: number; y: number; visible: boolean };
  moon: { x: number; y: number; visible: boolean };
  colours: { top: string; mid: string; horizon: string };
  cloudOpacity: number;
  sunGlow: number;
  rainOpacity: number;
  windy: boolean;
  severity: { color: string; opacity: number };
  key: string;
  nightDim: boolean;
};

const PAL = {
  night: ['#04060C', '#070C18', '#0E1628'],
  dawn: ['#0B1328', '#232848', '#5E4150'],
  dusk: ['#0C1430', '#2C2646', '#6A3E36'],
  day: ['#0D2747', '#174069', '#2E5A80'],
} as const;

const OVC = {
  night: ['#07090D', '#0C0F15', '#141922'],
  dawn: ['#12161F', '#212632', '#383540'],
  dusk: ['#12151E', '#222532', '#3A3138'],
  day: ['#18202B', '#25303D', '#384554'],
} as const;

const CLOUD_C = {
  night: '#283040',
  dawn: '#6E6A80',
  dusk: '#6E5E6A',
  day: '#8C9BB0',
} as const;

const SEVC = {
  warning: ['#F5A524', 0.16],
  critical: ['#FF3B41', 0.3],
} as const;

type PhaseBlend = Array<[ScenePhase, number]>;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

function blendPalette(
  table: Record<ScenePhase, readonly [string, string, string]>,
  phases: PhaseBlend,
): [string, string, string] {
  const first = phases[0];
  if (!first) return [...table.day];
  let out: [string, string, string] = [...table[first[0]]];
  const second = phases[1];
  if (second) {
    const t = second[1];
    out = [
      mixHex(out[0], table[second[0]][0], t),
      mixHex(out[1], table[second[0]][1], t),
      mixHex(out[2], table[second[0]][2], t),
    ];
  }
  return out;
}

function phaseAt(nowH: number, riseH: number, setH: number): PhaseBlend {
  if (nowH < riseH - 0.6 || nowH > setH + 0.9) return [['night', 1]];
  if (nowH < riseH + 0.9) {
    const t = Math.max(0, (nowH - (riseH - 0.6)) / 1.5);
    return [
      ['dawn', 1 - Math.max(0, t - 0.5) * 2],
      ['day', Math.max(0, t - 0.5) * 2],
    ];
  }
  if (nowH > setH - 0.9) {
    const t = (nowH - (setH - 0.9)) / 1.8;
    return [
      ['day', Math.max(0, 1 - 2 * t)],
      ['dusk', Math.min(1, 2 * t)],
    ];
  }
  return [['day', 1]];
}

function arcPosition(fraction: number): { x: number; y: number } {
  const f = Math.min(Math.max(fraction, 0), 1);
  const hor = 0.6;
  const apex = 0.58;
  const x = f;
  const y = (1 - f) ** 2 * hor + 2 * (1 - f) * f * (hor - apex) + f ** 2 * hor;
  return { x, y };
}

function highestSceneSeverity(signals: readonly Signal[]): SceneSeverity {
  if (signals.some((s) => s.severity === 'critical')) return 'critical';
  if (signals.some((s) => s.severity === 'warning')) return 'warning';
  return null;
}

function rainOpacity(data: TodayData): number {
  if (data.rain) {
    return data.rain.inMinutes <= 60 ? 0.75 : Math.min(0.75, data.rain.probability);
  }
  if (data.windy && data.cloudCover >= 0.9) return 0.35;
  return 0;
}

function sceneKey(parts: Record<string, string | number | boolean>): string {
  return Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

export function computeScene(
  data: TodayData,
  now: Date | string,
  nightHours?: NightHours,
): ComputedScene {
  const nowIso = typeof now === 'string' ? now : data.now;
  const nowH = localHourFraction(nowIso);
  const riseH = localHourFraction(data.sun.sunrise);
  const setH = localHourFraction(data.sun.sunset);
  const phases = phaseAt(nowH, riseH, setH);
  const primaryPhase = phases[0]?.[0] ?? 'day';
  const isNight = primaryPhase === 'night';

  const clear = blendPalette(PAL, phases);
  const overcast = blendPalette(OVC, phases);
  const cloud = data.cloudCover;
  const sky: [string, string, string] = [
    mixHex(clear[0], overcast[0], 0.78 * cloud),
    mixHex(clear[1], overcast[1], 0.78 * cloud),
    mixHex(clear[2], overcast[2], 0.78 * cloud),
  ];

  const cloudColour = mixHex(CLOUD_C[primaryPhase], '#4C5664', data.windy ? 0.35 : 0);

  const daySpan = Math.max(setH - riseH, 0.01);
  const sunFraction = isNight
    ? (data.moonPhase ?? (data.station.icon === 'moon' ? 0.62 : 0.5))
    : (nowH - riseH) / daySpan;
  const body = arcPosition(sunFraction);

  const sev = highestSceneSeverity(data.signals);
  const severityStyle =
    sev === null
      ? { color: '#3D8BFF', opacity: 0 }
      : { color: SEVC[sev][0], opacity: SEVC[sev][1] };

  const rain = rainOpacity(data);
  const cloudOpacity = isNight ? 0.25 * cloud : 0.12 + 0.7 * cloud;
  const sunGlow = isNight ? 0 : 1 - 0.72 * cloud;
  const hasCritical = sev === 'critical';
  const nightDim = isNightDimHour(nowIso, TIME_ZONE, nightHours) && !hasCritical;

  const key = sceneKey({
    phase: primaryPhase,
    cloud: cloud.toFixed(2),
    rain: rain.toFixed(2),
    windy: data.windy,
    sev: sev ?? 'none',
    top: sky[0],
    mid: sky[1],
    horizon: sky[2],
    cloudC: cloudColour,
    night: isNight,
  });

  return {
    phase: primaryPhase,
    sun: { x: body.x, y: body.y, visible: !isNight },
    moon: { x: body.x, y: body.y, visible: isNight },
    colours: { top: sky[0], mid: sky[1], horizon: sky[2] },
    cloudOpacity,
    sunGlow,
    rainOpacity: rain,
    windy: data.windy,
    severity: severityStyle,
    key,
    nightDim,
  };
}

/** Exposed for tests – symmetric arc height at equal offsets from solar noon. */
export function arcYAtFraction(f: number): number {
  return arcPosition(f).y;
}

export function arcXAtFraction(f: number): number {
  return arcPosition(f).x;
}

export { TIME_ZONE };
