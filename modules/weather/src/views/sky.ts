import type { Condition, DailyPoint, WeatherSnapshot } from '../contract.js';

/**
 * Hero sky (#64 slice 2): a soft day gradient picked by weather condition and sun elevation.
 * The snapshot carries no coordinates (privacy), and HomeBrain targets Czechia only, so the
 * sun is computed for the geographic centre of Czechia – the error is a few minutes of dawn.
 */
export const CZ_LAT = 49.8;
export const CZ_LON = 15.5;

/** Solar elevation in degrees (NOAA low-precision formula, ±0.5°). */
export function sunElevationDeg(date: Date, lat = CZ_LAT, lon = CZ_LON): number {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(l));
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmst * 15 + lon) * rad - ra;
  const el = Math.asin(
    Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha),
  );
  return el / rad;
}

export type SkyPhase = 'night' | 'twilight' | 'low' | 'day';
export type SkyGroup = 'clear' | 'partly' | 'grey' | 'rain' | 'snow' | 'storm';

export function skyPhase(elevation: number): SkyPhase {
  if (elevation < -6) return 'night';
  if (elevation < 4) return 'twilight';
  if (elevation < 15) return 'low';
  return 'day';
}
export function skyGroup(c: Condition): SkyGroup {
  if (c === 'clear') return 'clear';
  if (c === 'partly') return 'partly';
  if (c === 'rain' || c === 'heavy_rain') return 'rain';
  if (c === 'snow') return 'snow';
  if (c === 'thunder') return 'storm';
  return 'grey';
}

// [top, bottom, glow] – every bottom stop keeps white body text ≥ 3:1 (large text ≥ 4.5:1 at the top).
const PALETTE: Record<SkyPhase, Record<SkyGroup, [string, string, string]>> = {
  day: {
    clear: ['#1d5aa8', '#3f7cc4', 'rgba(255,214,120,.55)'],
    partly: ['#28599a', '#557fb4', 'rgba(255,220,150,.36)'],
    grey: ['#34506f', '#6a809b', 'rgba(255,244,222,.2)'],
    rain: ['#2d3b4f', '#536379', 'rgba(160,190,230,.16)'],
    snow: ['#55698a', '#7d8fa8', 'rgba(255,255,255,.22)'],
    storm: ['#29263f', '#47425f', 'rgba(180,160,255,.18)'],
  },
  low: {
    clear: ['#2a5796', '#c07a55', 'rgba(255,170,90,.6)'],
    partly: ['#32518a', '#a97262', 'rgba(255,170,110,.45)'],
    grey: ['#3c485c', '#74697a', 'rgba(255,190,140,.18)'],
    rain: ['#2b374a', '#585b6a', 'rgba(255,190,140,.12)'],
    snow: ['#4f5f79', '#8a8394', 'rgba(255,210,170,.22)'],
    storm: ['#262438', '#4b3f55', 'rgba(255,150,120,.18)'],
  },
  twilight: {
    clear: ['#1a2446', '#9c5662', 'rgba(255,140,110,.5)'],
    partly: ['#1d2646', '#83536a', 'rgba(255,150,120,.38)'],
    grey: ['#222939', '#504e62', 'rgba(255,170,140,.14)'],
    rain: ['#1c2332', '#3d4454', 'rgba(200,160,160,.1)'],
    snow: ['#2b344e', '#67667c', 'rgba(255,200,180,.16)'],
    storm: ['#181628', '#38304e', 'rgba(220,140,160,.14)'],
  },
  night: {
    clear: ['#070d1f', '#1a2a4d', 'rgba(190,210,255,.16)'],
    partly: ['#0b1224', '#22304d', 'rgba(190,210,255,.12)'],
    grey: ['#11161f', '#262e3b', 'rgba(255,255,255,.05)'],
    rain: ['#0d121b', '#202a38', 'rgba(140,170,220,.08)'],
    snow: ['#151c2a', '#323c50', 'rgba(220,230,255,.1)'],
    storm: ['#0e0c1a', '#26203a', 'rgba(170,150,255,.12)'],
  },
};

/**
 * Light theme (#64 slice 2 r2): a bright day sky so the hero belongs to the light page. Only
 * day and low sun get it – twilight and night stay dark in both themes (it IS dark outside).
 * Body text on these switches to dark ink (≥ 4.5:1 on the bottom stop).
 */
const LIGHT_PALETTE: Partial<Record<SkyPhase, Record<SkyGroup, [string, string, string]>>> = {
  day: {
    clear: ['#6fb3f0', '#cde5fa', 'rgba(255,226,140,.7)'],
    partly: ['#8bbdee', '#d4e7f9', 'rgba(255,232,170,.55)'],
    grey: ['#a2c4ea', '#d9e8f8', 'rgba(255,248,225,.65)'],
    rain: ['#9ab7d9', '#d6e3f2', 'rgba(205,225,250,.5)'],
    snow: ['#c4d3e5', '#eef3f8', 'rgba(255,255,255,.6)'],
    storm: ['#a5a6c4', '#dad9e8', 'rgba(220,210,255,.4)'],
  },
  low: {
    clear: ['#93bdec', '#f7d6bb', 'rgba(255,186,110,.6)'],
    partly: ['#a3c0e3', '#f0d6c6', 'rgba(255,196,140,.5)'],
    grey: ['#b7c4d4', '#e9dfd8', 'rgba(255,214,180,.4)'],
    rain: ['#a9b6c6', '#ddd9dd', 'rgba(255,214,180,.3)'],
    snow: ['#c6d1e1', '#eee6e3', 'rgba(255,224,200,.45)'],
    storm: ['#a6a4c0', '#dacfd8', 'rgba(255,190,170,.35)'],
  },
};

export interface SkyScene {
  phase: SkyPhase;
  group: SkyGroup;
  top: string;
  bottom: string;
  glow: string;
  /** Glow (sun/moon) position in % of the hero box. */
  glowX: number;
  glowY: number;
  night: boolean;
  /** Bright light-theme variant, or null when the sky stays dark (twilight, night). */
  light: { top: string; bottom: string; glow: string } | null;
}

export function skyScene(condition: Condition, at: Date): SkyScene {
  const elevation = sunElevationDeg(at);
  const phase = skyPhase(elevation);
  const group = skyGroup(condition);
  const [top, bottom, glow] = PALETTE[phase][group];
  const h = at.getHours() + at.getMinutes() / 60;
  // Sun travels left → right through the day; the moon simply sits upper right at night.
  const glowX = phase === 'night' ? 82 : Math.min(92, Math.max(48, 48 + ((h - 5) / 16) * 44));
  const glowY = phase === 'night' ? 18 : Math.min(96, Math.max(8, 88 - elevation * 1.3));
  const l = LIGHT_PALETTE[phase]?.[group];
  const light = l ? { top: l[0], bottom: l[1], glow: l[2] } : null;
  return { phase, group, top, bottom, glow, glowX, glowY, night: phase === 'night', light };
}

const CONDITION_PHRASE: Record<Condition, string> = {
  clear: 'Jasno',
  partly: 'Polojasno',
  cloudy: 'Oblačno',
  overcast: 'Zataženo',
  rain: 'Prší',
  heavy_rain: 'Silně prší',
  snow: 'Sněží',
  thunder: 'Bouřky',
  fog: 'Mlha',
  unknown: 'Počasí bez údajů',
};
const fmt0 = (v: number) =>
  (Math.round(v) === 0 ? 0 : Math.round(v)).toLocaleString('cs-CZ').replace(/^-/, '−');

/** One plain-Czech sentence for the hero: condition + wind, nowcast, rest of the day. */
export function conditionSentence(d: WeatherSnapshot, night: boolean): string {
  const c = d.current;
  const parts: string[] = [];
  let first =
    night && c.condition === 'clear' ? 'Jasná noc' : (CONDITION_PHRASE[c.condition] ?? '');
  if (c.gust != null && c.gust >= 12) first += `, nárazy větru až ${fmt0(c.gust)} m/s`;
  else if (c.wind != null && c.wind >= 8) first += ', větrno';
  parts.push(first);
  const n = d.nowcast;
  const intensity = INTENSITY_CS[n.intensity ?? ''] ?? '';
  if (n.status === 'soon' && n.eta_min != null)
    parts.push(`${intensity ? `${intensity} déšť` : 'Déšť'} za\u00a0~${n.eta_min}\u00a0min`);
  else if (n.status === 'stopping' && n.end_min != null)
    parts.push(`Déšť ustane za ~${n.end_min} min`);
  else if (n.status === 'raining' && c.condition !== 'rain' && c.condition !== 'heavy_rain')
    parts.push('Prší');
  const t = c.t2m;
  const r = dayRange(d);
  if (r.restMax != null && r.restMin != null && t != null) {
    const hour = new Date(Date.parse(d.generated_at)).getHours();
    if (r.restMax >= t + 1)
      parts.push(`${hour < 12 ? 'Odpoledne' : 'Později'} až ${fmt0(r.restMax)}°`);
    else if (r.restMin <= t - 1)
      parts.push(`${hour >= 15 ? 'Večer' : 'Během dne'} kolem ${fmt0(r.restMin)}°`);
  }
  return parts.filter(Boolean).join('. ') + '.';
}
const INTENSITY_CS: Record<string, string> = {
  light: 'Slabý',
  moderate: 'Mírný',
  heavy: 'Silný',
  very_heavy: 'Velmi silný',
  extreme: 'Extrémní',
};

/** HomeBrain targets Czechia: day boundaries are always Prague's, never the browser's. */
export const WX_TZ = 'Europe/Prague';
const pragueDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: WX_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
/** Calendar date (YYYY-MM-DD) of an instant in Europe/Prague. */
export const pragueDate = (ms: number) => pragueDay.format(new Date(ms));

/**
 * Today's range from ONE source of truth: measured so far (station) + blend for the rest of
 * the Prague day, so hero, sentence, cells AND the 10-day "Dnes" row never disagree (vision
 * caught hero 2–10° vs. 10-day row 4–11°: the row showed the raw Open-Meteo daily model mean).
 */
export function dayRange(d: WeatherSnapshot): {
  min: number | null;
  max: number | null;
  restMin: number | null;
  restMax: number | null;
} {
  const now = Date.parse(d.generated_at);
  const today = pragueDate(now);
  const rest = d.hourly
    .filter((p) => {
      const t = Date.parse(p.t);
      return t > now && p.t2m != null && pragueDate(t) === today;
    })
    .map((p) => p.t2m!);
  const seen = [
    d.station.derived.today_min?.v,
    d.station.derived.today_max?.v,
    d.current.t2m,
    ...rest,
  ].filter((v): v is number => v != null && Number.isFinite(v));
  return {
    min: seen.length ? Math.min(...seen) : null,
    max: seen.length ? Math.max(...seen) : null,
    restMin: rest.length ? Math.min(...rest) : null,
    restMax: rest.length ? Math.max(...rest) : null,
  };
}

/**
 * Min/max per Prague calendar day from the corrected hourly mix (`d.hourly`, the same series the
 * 48 h strip and hero draw). Only days the hourly horizon covers COMPLETELY (00:00–23:00 Prague,
 * 23/25 h on DST days) are returned, so a half-covered last day never mixes sources.
 */
export function hourlyDayRanges(d: WeatherSnapshot): Map<string, { min: number; max: number }> {
  const byDay = new Map<string, { min: number; max: number; first: number; last: number }>();
  for (const p of d.hourly) {
    if (p.t2m == null || !Number.isFinite(p.t2m)) continue;
    const t = Date.parse(p.t);
    const day = pragueDate(t);
    const cur = byDay.get(day);
    if (!cur) byDay.set(day, { min: p.t2m, max: p.t2m, first: t, last: t });
    else {
      cur.min = Math.min(cur.min, p.t2m);
      cur.max = Math.max(cur.max, p.t2m);
      cur.first = Math.min(cur.first, t);
      cur.last = Math.max(cur.last, t);
    }
  }
  const out = new Map<string, { min: number; max: number }>();
  for (const [day, r] of byDay) {
    // covered = first sample in the first hour and last sample in the last hour of that day
    const covered =
      pragueDate(r.first - 3600000) !== day &&
      pragueDate(r.last + 3600000) !== day &&
      r.last - r.first >= 21 * 3600000;
    if (covered) out.set(day, { min: r.min, max: r.max });
  }
  return out;
}

/**
 * 10-day rows whose min/max agree with the hourly mix: today from {@link dayRange} (station so
 * far + mix for the rest, same as the hero), every later day fully covered by the hourly horizon
 * from {@link hourlyDayRanges}; beyond the horizon the daily model values stay. The model-spread
 * band is widened so it still contains the shown values.
 */
export function dailyWithToday(d: WeatherSnapshot): DailyPoint[] {
  const today = pragueDate(Date.parse(d.generated_at));
  const r = dayRange(d);
  const hourly = hourlyDayRanges(d);
  const lo = (a: number | null, b: number) => (a == null ? a : Math.min(a, b));
  const hi = (a: number | null, b: number) => (a == null ? a : Math.max(a, b));
  return d.daily.map((x) => {
    const v =
      x.date === today
        ? r.min != null && r.max != null
          ? { min: r.min, max: r.max }
          : undefined
        : x.date > today
          ? hourly.get(x.date)
          : undefined;
    if (!v) return x;
    return {
      ...x,
      tmin: v.min,
      tmax: v.max,
      tmin_lo: lo(x.tmin_lo, v.min),
      tmin_hi: hi(x.tmin_hi, v.min),
      tmax_lo: lo(x.tmax_lo, v.max),
      tmax_hi: hi(x.tmax_hi, v.max),
    };
  });
}
