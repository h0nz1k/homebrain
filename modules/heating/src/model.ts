import { czCount } from '@homebrain/ui';
import { SOLAR_WARN_COPY, solarConfigured, solarStateOf } from './solar.js';
import type {
  HeatingAlert,
  HeatingChangeEntry,
  HeatingRoom,
  HeatingSeason,
  HeatingSnapshot,
  HistoryPoint,
  HistoryRange,
} from './types.js';

/* ---------- Czech number formatting ---------- */

const NBSP = '\u00a0';
const MINUS = '\u2212';

/** `22,6` / `−2,9` / `1 888` (NBSP thousands), `–` for null. */
export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const s = new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: Math.abs(v) >= 10_000 ? true : Math.abs(v) >= 1000,
  })
    .format(Math.abs(v) < 10 ** -digits / 2 ? 0 : v)
    .replace(/\s/g, NBSP)
    .replace('-', MINUS);
  return s;
}

export const fmtT = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '–' : `${fmtNum(v, digits)}\u202f°C`;

/** Heat-pump meter: watts below 1 kW, otherwise kW with Czech decimal comma. */
export function fmtHpPower(w: number | null | undefined): string {
  if (w === null || w === undefined || !Number.isFinite(w)) return '–';
  if (w < 1000) return `${fmtNum(w, w < 10 ? 1 : 0)}\u00a0W`;
  return `${fmtNum(w / 1000, w < 10_000 ? 2 : 1)}\u00a0kW`;
}

export function hpElectricityVisible(snap: HeatingSnapshot): boolean {
  const hp = snap.heat_pump;
  return hp.power_w !== null || hp.energy_today_kwh !== null;
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}${NBSP}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m ? `${h}${NBSP}h ${m}${NBSP}min` : `${h}${NBSP}h`;
}

/* ---------- Plain-Czech activity sentence ---------- */

export type HeroState =
  | 'heating'
  | 'dhw'
  | 'house'
  | 'idle'
  | 'off'
  | 'dhw_only'
  | 'cooling'
  | 'blocked'
  | 'fault'
  | 'offline'
  | 'unconfigured';

export interface ActivityModel {
  state: HeroState;
  tone: 'ok' | 'warn' | 'crit' | 'accent' | 'neutral';
  pill: string;
  /** Sentence split so the verb phrase can be emphasised: [before, bold, after]. */
  headline: [string, string, string];
  detail: string;
  /** Solar thermal warning (no_gain / stagnation). */
  solarWarn?: string;
}

function runningFor(since: string | null, nowMs: number): string | null {
  if (!since) return null;
  const min = (nowMs - Date.parse(since)) / 60_000;
  return Number.isFinite(min) && min >= 0 ? fmtDuration(min) : null;
}

/** Why the house circuit runs or stands (reference room thermostat). */
const ALERT_ORDER: Record<HeatingAlert['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Highest-severity alert for the Teď banner (warning+ only). */
export function bannerAlert(snap: HeatingSnapshot): HeatingAlert | null {
  const alerts = snap.alerts ?? [];
  const top = [...alerts]
    .filter((a) => a.severity !== 'info')
  .sort((a, b) => ALERT_ORDER[a.severity] - ALERT_ORDER[b.severity])[0];
  return top ?? null;
}

export function formatChangeValue(value: unknown, key: string): string {
  if (typeof value === 'boolean') return value ? 'zapnuto' : 'vypnuto';
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return key.includes('hysteresis') ? `${value} °C` : `${value}`;
  if (Array.isArray(value)) return 'změna programu';
  return String(value);
}

/** `dnes 08:51 · Solár zapnut: zapnuto → vypnuto` */
export function formatChangeLine(entry: HeatingChangeEntry, now = Date.now()): string {
  const d = new Date(entry.ts);
  const sameDay = d.toDateString() === new Date(now).toDateString();
  const when = sameDay
    ? `dnes ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  const line = `${entry.label}: ${formatChangeValue(entry.old, entry.key)} → ${formatChangeValue(entry.new, entry.key)}`;
  return `${when} · ${line}`;
}

export function houseReason(snap: HeatingSnapshot): string {
  const h = snap.house;
  const target = h.ref_target_effective ?? h.ref_target;
  if (h.circuit_on)
    return h.supply_temp !== null
      ? `Do radiátorů teče ${fmtT(h.supply_temp)}.`
      : 'Čerpadlo topení domu běží.';
  if (h.ref_temp !== null && target !== null)
    return h.ref_temp >= target
      ? `Do domu teď neteče: v referenční místnosti je ${fmtT(h.ref_temp)}, cíl ${fmtT(target)}.`
      : `Okruh domu stojí, i když referenční místnost má ${fmtT(h.ref_temp)} (cíl ${fmtT(target)}).`;
  return 'Okruh domu stojí.';
}

export function activityModel(snap: HeatingSnapshot, nowMs: number): ActivityModel {
  const hp = snap.heat_pump;
  const tank = snap.tank;
  if (snap.source === 'unconfigured')
    return {
      state: 'unconfigured',
      tone: 'neutral',
      pill: 'Nenastaveno',
      headline: ['Topení zatím ', 'není připojené', '.'],
      detail:
        'Správce domácnosti zadá v nastavení HomeBrain adresu regulace tepelného čerpadla. Pak se tu objeví, co čerpadlo dělá.',
    };
  if (snap.source === 'auth' || snap.source === 'unreachable')
    return {
      state: 'offline',
      tone: 'warn',
      pill: snap.source === 'auth' ? 'Přihlášení selhalo' : 'Regulace neodpovídá',
      headline: ['Regulace tepelného čerpadla ', 'neodpovídá', '.'],
      detail:
        snap.source === 'auth'
          ? 'Regulace odmítla přihlášení. Topení běží dál samo, jen ho teď nevidíme – správce zkontroluje heslo.'
          : 'Topení běží dál samo podle své regulace, jen ho teď nevidíme. Zkusíme to znovu za chvíli.',
    };
  const since = runningFor(hp.running_since, nowMs);
  const bottom = tank.bottom;
  const goal =
    tank.target !== null ? tank.target + (tank.hysteresis ?? 0) : (tank.curve_target ?? null);
  switch (snap.activity) {
    case 'fault': {
      const first = snap.faults.active[0];
      return {
        state: 'fault',
        tone: 'crit',
        pill: snap.faults.fatal ? 'Porucha – stojí' : 'Porucha',
        headline: [
          'Tepelné čerpadlo ',
          'hlásí poruchu',
          first ? `: ${first.label.charAt(0).toLowerCase()}${first.label.slice(1)}.` : '.',
        ],
        detail: snap.faults.compressor_block
          ? `Kompresor je zablokovaný.${snap.backup_heater.available && snap.backup_heater.on ? ' Dům teď hřeje záložní elektrické topení.' : ''} Neresetujte – zavolejte servis.`
          : 'Regulace si s tím zatím poradí sama. Pokud porucha nezmizí do hodiny, zavolejte servis.',
      };
    }
    case 'heating_dhw':
      return {
        state: 'dhw',
        tone: 'accent',
        pill: since ? `Ohřev vody ${since}` : 'Ohřev vody',
        headline: [
          'Tepelné čerpadlo ',
          'ohřívá teplou vodu',
          snap.dhw.temp !== null ? ` – nahoře v nádrži je ${fmtT(snap.dhw.temp)}.` : '.',
        ],
        detail: `Trojcestný ventil posílá teplo do horní části nádrže${snap.dhw.target !== null ? ` až na ${fmtT(snap.dhw.target, 0)}` : ''}. ${houseReason(snap)}`,
      };
    case 'heating_tank':
      return finishActivity(
        {
          state: 'heating',
          tone: 'accent',
          pill: since ? `Kompresor běží ${since}` : 'Kompresor běží',
          headline: [
            'Tepelné čerpadlo ',
            'nahřívá nádrž',
            bottom !== null ? ` – dole má ${fmtT(bottom)}.` : '.',
          ],
          detail: `${snap.outdoor.temp !== null ? `Venku ${fmtT(snap.outdoor.temp)} → ekviterm chce ${fmtT(tank.curve_target ?? tank.target, 0)}` : 'Ekviterm chce'}${goal !== null ? `, nahřeje do ${fmtT(goal, 0)}` : ''}. ${houseReason(snap)}`,
        },
        snap,
      );
    case 'house_circuit':
      return finishActivity(
        {
          state: 'house',
          tone: 'ok',
          pill: 'Topí dům',
          headline: ['Kompresor stojí, ', 'dům topí z nádrže', '.'],
          detail: `${houseReason(snap)}${bottom !== null ? ` Nádrž má dole ${fmtT(bottom)}${tank.target !== null ? `, kompresor naskočí pod ${fmtT(tank.target, 0)}` : ''}.` : ''}`,
        },
        snap,
      );
    case 'cooling':
      return {
        state: 'cooling',
        tone: 'accent',
        pill: 'Chlazení',
        headline: ['Tepelné čerpadlo ', 'chladí', ' dům.'],
        detail: houseReason(snap),
      };
    case 'blocked_hdo':
      return {
        state: 'blocked',
        tone: 'neutral',
        pill: 'Vysoký tarif',
        headline: ['Tepelné čerpadlo ', 'čeká na nízký tarif', '.'],
        detail: `Distributor teď blokuje kompresor (HDO). ${houseReason(snap)}`,
      };
    case 'off':
      return {
        state: 'off',
        tone: 'neutral',
        pill: 'Vypnuto',
        headline: ['Tepelné čerpadlo je ', 'vypnuté', ' hlavním vypínačem na regulaci.'],
        detail: 'Regulace neběží – neohřívá se nádrž ani teplá voda, dokud vypínač nezapnete.',
      };
    case 'dhw_only':
      return {
        state: 'dhw_only',
        tone: 'warn',
        pill: 'Jen teplá voda',
        headline: ['Topení domu je na regulaci ', 'vypnuté', ' – ohřívá se jen teplá voda.'],
        detail: houseReason(snap),
      };
    default: {
      const pre = hp.primary_prerun
        ? ' Rozbíhá se čerpadlo primáru – kompresor naskočí za chvíli.'
        : '';
      return finishActivity(
        {
          state: 'idle',
          tone: 'ok',
          pill: snap.mode.season === 'summer' ? 'Léto' : 'Odpočívá',
          headline: [
            'Tepelné čerpadlo ',
            'odpočívá',
            bottom !== null ? ` – nádrž má dole ${fmtT(bottom)}, to zatím stačí.` : '.',
          ],
          detail: `${houseReason(snap)}${pre}`,
        },
        snap,
      );
    }
  }
}

function finishActivity(base: ActivityModel, snap: HeatingSnapshot): ActivityModel {
  const state = solarStateOf(snap);
  if (state === 'no_gain' || state === 'stagnation') {
    const warn = SOLAR_WARN_COPY[state];
    const pill = state === 'no_gain' ? 'Solár bez účinku' : 'Solár · stagnace';
    return {
      ...base,
      tone: 'warn',
      pill,
      headline:
        state === 'stagnation'
          ? ['Kolektor ', 'přehříván bez čerpání', '.']
          : ['Solár ', 'čerpá bez ohřevu nádrže', '.'],
      detail: warn,
      solarWarn: warn,
    };
  }
  return applySolarHero(base, snap);
}

/** Collector + pump line for the solar hero detail (e.g. „kolektor 54,8 °C · čerpadlo 78 %“). */
export function solarHeroDetail(snap: HeatingSnapshot): string | null {
  const solar = snap.extras.solar;
  if (!solar) return null;
  const parts: string[] = [];
  if (solar.temp !== null) parts.push(`kolektor ${fmtT(solar.temp)}`);
  if (solar.pump_pct !== null) parts.push(`čerpadlo ${fmtNum(solar.pump_pct, 0)}${NBSP}%`);
  return parts.length ? parts.join(' · ') : null;
}

/** Portrait / landscape chip when the secondary loop charges from solar thermal. */
export function tankSecondaryChipLabel(snap: HeatingSnapshot): string {
  if (solarStateOf(snap) === 'heating') return 'nádrž · nabíjí solár';
  if (snap.pumps.secondary === null) return 'nádrž · —';
  if (!snap.pumps.secondary) return 'nádrž · stojí';
  return snap.activity === 'heating_dhw' ? 'Teplá voda · ohřev' : 'nádrž · běží';
}

/** Overlay solar heating / warnings on the compressor-centric hero copy. */
export function applySolarHero(base: ActivityModel, snap: HeatingSnapshot): ActivityModel {
  const state = solarStateOf(snap);
  const solar = snap.extras.solar;
  if (!solar || state !== 'heating') return base;
  const detail = solarHeroDetail(snap);
  const compressorRuns = snap.heat_pump.compressor_on === true && snap.source === 'ok' && !snap.stale;
  if (compressorRuns) {
    return {
      ...base,
      detail: detail ? `${base.detail} Solár: ${detail}.` : base.detail,
    };
  }
  return {
    ...base,
    tone: 'accent',
    pill: 'Solár nabíjí nádrž',
    headline: ['Slunce ', 'nahřívá akumulační nádrž', '.'],
    detail: detail ?? 'Solární okruh běží.',
  };
}

/* ---------- Schematic state ---------- */

export interface SchematicState {
  compressor: 'off' | 'on' | 'prerun';
  /** 0 = still, otherwise relative flow speed 0.35…1 (scales particle speed). */
  brine: number;
  charge: number;
  house: number;
  circulation: number;
  valve: 'tank' | 'dhw';
  pumps: { primary: boolean; charge: boolean; house: boolean; circulation: boolean };
  /** The circulation pump state is not mapped (null) → the pump is not drawn at all. */
  circulationKnown: boolean;
  /** Backup heater is drawn only on a fault/compressor block (never for primary_prerun). */
  backup: 'hidden' | 'standby' | 'on';
  hdo: 'low' | 'high' | null;
  fault: boolean;
  tankTop: number | null;
  tankBottom: number | null;
}

export function schematicState(snap: HeatingSnapshot): SchematicState {
  const hp = snap.heat_pump;
  const live = snap.source === 'ok' && !snap.stale;
  const running = live && hp.compressor_on === true;
  const prerun = live && !running && hp.primary_prerun === true;
  // Compressor load 2–6 kW → 0.55…1; unknown power = medium.
  const load =
    hp.power_w === null ? 0.75 : Math.max(0.55, Math.min(1, 0.4 + (hp.power_w / 6000) * 0.6));
  const valve: 'tank' | 'dhw' =
    snap.dhw.valve_to_dhw || snap.activity === 'heating_dhw' ? 'dhw' : 'tank';
  const supply = snap.house.supply_temp ?? 35;
  const fault = snap.activity === 'fault' || snap.faults.fatal || snap.faults.compressor_block;
  return {
    compressor: running ? 'on' : prerun ? 'prerun' : 'off',
    brine: running ? load : prerun ? 0.35 : 0,
    charge: running ? load : 0,
    house:
      live && snap.house.circuit_on === true
        ? Math.max(0.4, Math.min(0.85, (supply - 20) / 30))
        : 0,
    circulation: live && snap.pumps.circulation === true ? 0.35 : 0,
    valve,
    pumps: {
      primary: running || prerun,
      charge: running || (live && snap.pumps.secondary === true),
      house: live && snap.pumps.heating === true,
      circulation: live && snap.pumps.circulation === true,
    },
    circulationKnown: snap.pumps.circulation !== null,
    backup: !snap.backup_heater.available
      ? 'hidden'
      : fault
        ? snap.backup_heater.on
          ? 'on'
          : 'standby'
        : live && snap.backup_heater.on === true && hp.primary_prerun !== true
          ? 'on'
          : 'hidden',
    hdo: snap.mode.hdo_low_tariff === null ? null : snap.mode.hdo_low_tariff ? 'low' : 'high',
    fault,
    tankTop: snap.tank.top,
    tankBottom: snap.tank.bottom,
  };
}

/** Temperature → colour (cold brine blue … warm tank orange … hot red), oklch. */
export function tempColor(t: number | null): string {
  if (t === null) return 'oklch(0.6 0.02 250)';
  const f = Math.max(0, Math.min(1, (t + 5) / 60));
  // hue 235 (blue) → 60 (amber) → 25 (red-orange); chroma rises with heat.
  const hue = f < 0.5 ? 235 - (235 - 60) * (f / 0.5) : 60 - 35 * ((f - 0.5) / 0.5);
  const chroma = 0.1 + 0.08 * f;
  const light = 0.72 - 0.06 * f;
  return `oklch(${light.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
}

/** Water colour for the tank gradient (25 °C amber … 55 °C red-orange) – shows stratification. */
export function waterColor(t: number | null): string {
  if (t === null) return 'oklch(0.6 0.02 250)';
  const f = Math.max(0, Math.min(1, (t - 25) / 30));
  return `oklch(${(0.8 - 0.14 * f).toFixed(3)} ${(0.12 + 0.05 * f).toFixed(3)} ${(88 - 64 * f).toFixed(1)})`;
}

/** Particle loop length (s) for a pipe: calm, never faster than 1.6 s per 100 units. */
export function particleDuration(length: number, speed: number): number {
  if (speed <= 0) return 0;
  const unitsPerS = 40 + 70 * speed;
  return Math.max(2, +(length / unitsPerS).toFixed(2));
}

export type Pt = [number, number];
export function polylineLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return len;
}

/** CSS keyframes that move an element along a polyline at constant speed (transform only). */
export function polylineKeyframes(name: string, pts: Pt[]): string {
  const total = polylineLength(pts) || 1;
  let acc = 0;
  const frames = pts.map((p, i) => {
    if (i > 0) acc += Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]);
    return `${((acc / total) * 100).toFixed(2)}%{transform:translate(${p[0]}px,${p[1]}px)}`;
  });
  return `@keyframes ${name}{${frames.join('')}}`;
}

/* ---------- Charts ---------- */

/** Bucket to ≤ max points: mean of means, min of mins, max of maxes; the last point stays exact. */
export function downsample(points: HistoryPoint[], max: number): HistoryPoint[] {
  if (points.length <= max || max < 3) return points.slice();
  const out: HistoryPoint[] = [];
  const body = points.slice(0, -1);
  const size = body.length / (max - 1);
  for (let b = 0; b < max - 1; b++) {
    const chunk = body.slice(Math.floor(b * size), Math.floor((b + 1) * size));
    if (!chunk.length) continue;
    const mean = chunk.reduce((s, p) => s + p[1], 0) / chunk.length;
    const ts = chunk[Math.floor(chunk.length / 2)]![0];
    out.push([ts, mean, Math.min(...chunk.map((p) => p[2])), Math.max(...chunk.map((p) => p[3]))]);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Round axis ticks covering [min, max]; the same values drive gridlines and labels. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.999; v += step)
    out.push(+v.toFixed(6));
  return out;
}

export const RANGE_LABELS: ReadonlyArray<readonly [HistoryRange, string]> = [
  ['day', 'Den'],
  ['week', 'Týden'],
  ['month', 'Měsíc'],
  ['season', 'Sezóna'],
  ['all', '10 let'],
];

const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const MONTHS = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
/** Axis label for a timestamp at the given range (local time). */
export function timeLabel(ts: number, range: HistoryRange): string {
  const d = new Date(ts);
  if (range === 'day')
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (range === 'week') return `${DOW[d.getDay()]} ${d.getDate()}.`;
  if (range === 'month') return `${d.getDate()}. ${d.getMonth() + 1}.`;
  if (range === 'season')
    return `${d.getDate() === 1 ? MONTHS[d.getMonth()] : `${d.getDate()}. ${d.getMonth() + 1}.`}`;
  return String(d.getFullYear());
}

/** Round calendar ticks for a time domain (local time): hours, days, weeks, months or years. */
export function timeTicks(from: number, to: number): { ticks: number[]; unit: HistoryRange } {
  const span = to - from;
  const H = 3_600_000;
  const out: number[] = [];
  const d = new Date(from);
  let unit: HistoryRange;
  if (span <= 1.5 * 24 * H) {
    unit = 'day';
    const step = span <= 12 * H ? 3 : 6;
    d.setMinutes(0, 0, 0);
    d.setHours(Math.ceil(d.getHours() / step) * step);
    for (let t = d.getTime(); t <= to; t += step * H) out.push(t);
  } else if (span <= 45 * 24 * H) {
    unit = span <= 9 * 24 * H ? 'week' : 'month';
    const stepDays = span <= 9 * 24 * H ? 1 : 7;
    d.setHours(24, 0, 0, 0);
    for (; d.getTime() <= to; d.setDate(d.getDate() + stepDays)) out.push(d.getTime());
  } else if (span <= 400 * 24 * H) {
    unit = 'season';
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    for (; d.getTime() <= to; d.setMonth(d.getMonth() + (span > 200 * 24 * H ? 2 : 1)))
      out.push(d.getTime());
  } else {
    unit = 'all';
    const y0 = d.getFullYear() + 1;
    for (let y = y0 + (y0 % 2); new Date(y, 0, 1).getTime() <= to; y += 2)
      out.push(new Date(y, 0, 1).getTime());
  }
  return { ticks: out, unit };
}

/* ---------- Rooms ---------- */

export interface RoomRow extends HeatingRoom {
  delta: number | null;
}
export interface RoomsModel {
  rows: RoomRow[];
  coldest: RoomRow | null;
  insight: string | null;
  throttle: string | null;
}

export function roomsModel(snap: HeatingSnapshot): RoomsModel {
  const rows: RoomRow[] = snap.rooms
    .map((r) => ({
      ...r,
      delta: r.temp !== null && r.target !== null ? +(r.temp - r.target).toFixed(1) : null,
    }))
    .sort((a, b) => (a.delta ?? 99) - (b.delta ?? 99) || a.name.localeCompare(b.name, 'cs'));
  const coldest = rows.find((r) => r.delta !== null) ?? null;
  const h = snap.house;
  const target = h.ref_target_effective ?? h.ref_target;
  let insight: string | null = null;
  if (coldest && coldest.delta !== null && coldest.delta <= -1) {
    const refWarm = h.ref_temp !== null && target !== null && h.ref_temp >= target;
    insight =
      refWarm && !h.circuit_on
        ? `${coldest.name} je o ${fmtNum(-coldest.delta)}\u202f°C pod cílem, ale okruh domu stojí – referenční místnost (chodba) už má ${fmtT(h.ref_temp)}.`
        : `Nejchladnější je ${coldest.name}: ${fmtT(coldest.temp)}, o ${fmtNum(-coldest.delta)}\u202f°C pod cílem.`;
    if (coldest.window_open) insight += ' Má otevřené okno.';
    else if (coldest.valve_pct !== null && coldest.valve_pct >= 90)
      insight += ' Hlavice je otevřená naplno.';
  }
  const trvs = rows.filter((r) => r.valve_pct !== null);
  const closed = trvs.filter((r) => (r.valve_pct ?? 100) < 20);
  const throttle =
    trvs.length >= 2 && closed.length / trvs.length >= 0.6 && snap.heat_pump.compressor_on === true
      ? `${closed.length} z ${czCount(trvs.length, 'hlavice', 'hlavic', 'hlavic')} je otevřeno pod 20 % – přiškrcují průtok a kompresor pak častěji startuje. Na chodbě nechte hlavici naplno.`
      : null;
  return { rows, coldest, insight, throttle };
}

/* ---------- Seasons ---------- */

/**
 * Owner annotations shown by the frontend (the backend sends none yet): the heated area
 * shrank from the 2018/19 season on, which explains the step change in run hours.
 */
export const SEASON_NOTES: Readonly<Record<string, string>> = {
  '2018/19': 'Druhá budova se přestala vytápět',
};
/** Start of the 2018/19 season (local) = the efficiency break between `before` and `after`. */
export const HEATING_BREAK_TS = new Date(2018, 6, 1).getTime();

/** Heating season (July–June) of a timestamp, e.g. `2025/26`. */
export function seasonOf(ts: number): string {
  const d = new Date(ts);
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

export interface SeasonCard extends HeatingSeason {
  /** Owner annotation for this season (`SEASON_NOTES`). */
  note: string | null;
  /** h per 100 degree-days vs. previous season (fraction, −0.1 = 10 % less), null if unknown. */
  vsPrev: number | null;
  share: number;
}

export function seasonsModel(rows: HeatingSeason[]): { cards: SeasonCard[]; maxH: number } {
  const sorted = rows.slice().sort((a, b) => b.season.localeCompare(a.season));
  const maxH = Math.max(1, ...sorted.map((r) => r.compressor_h));
  const cards = sorted.map((r, i) => {
    const prev = sorted[i + 1];
    const vsPrev =
      prev && r.h_per_100dd !== null && prev.h_per_100dd
        ? // from the DISPLAYED (rounded) values so the card arithmetic adds up
          +(Math.round(r.h_per_100dd) / Math.max(1, Math.round(prev.h_per_100dd)) - 1).toFixed(3)
        : null;
    return { ...r, vsPrev, share: r.compressor_h / maxH, note: SEASON_NOTES[r.season] ?? null };
  });
  return { cards, maxH };
}

export const fmtSeasonEnergy = (s: HeatingSeason) =>
  s.energy_kwh === null
    ? '–'
    : `${s.energy_measured ? '' : '≈\u00a0'}${fmtNum(s.energy_kwh / 1000, 1)}\u00a0MWh`;

export const fmtPctChange = (f: number) =>
  `${f > 0 ? '+' : f < 0 ? '\u2212' : ''}${fmtNum(Math.abs(f) * 100, 0)}\u00a0%`;

/* ---------- Efficiency (run hours vs. outdoor) ---------- */

export type EfficiencyGroup = 'before' | 'after' | 'current';
export const EFFICIENCY_GROUPS: readonly EfficiencyGroup[] = ['before', 'after', 'current'];

export interface EfficiencyModel {
  points: Array<{ x: number; y: number; group: EfficiencyGroup }>;
  /** Run hours a day at 0 °C outside, per group (linear fit), null when too few days. */
  at0: Record<EfficiencyGroup, number | null>;
  /** Fitted trend line per group over its own outdoor range (null when too few days). */
  fits: Record<EfficiencyGroup, { x0: number; y0: number; x1: number; y1: number } | null>;
  /** Legend rows: season range covered by each group, days in it. */
  legend: Array<{ group: EfficiencyGroup; label: string; days: number }>;
  insight: string | null;
}

function fit(pts: Array<{ x: number; y: number }>): { a: number; b: number } | null {
  if (pts.length < 10) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const b = sxx ? pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx : 0;
  return { a: my - b * mx, b };
}

function fitAt0(pts: Array<{ x: number; y: number }>): number | null {
  const f = fit(pts);
  return f ? Math.max(0, f.a) : null;
}

function fitLine(pts: Array<{ x: number; y: number }>) {
  const f = fit(pts);
  if (!f) return null;
  // 5th–95th percentile of x so one odd day does not stretch the line
  const xs = pts.map((p) => p.x).sort((a, b) => a - b);
  const x0 = xs[Math.floor(xs.length * 0.05)]!;
  const x1 = xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]!;
  const at = (x: number) => Math.max(0, f.a + f.b * x);
  return { x0, y0: at(x0), x1, y1: at(x1) };
}

/** Heating days (outdoor < 16 °C) grouped before/after a break and the running season. */
export function efficiencyModel(
  outdoor: HistoryPoint[],
  runtime: HistoryPoint[],
  nowMs: number,
  breakTs: number | null,
  maxPoints = 700,
): EfficiencyModel {
  const byTs = new Map(outdoor.map((p) => [p[0], p[1]]));
  const now = new Date(nowMs);
  const seasonStart = new Date(now.getFullYear() - (now.getMonth() < 6 ? 1 : 0), 6, 1).getTime();
  const seasons: Record<EfficiencyGroup, Set<string>> = {
    before: new Set(),
    after: new Set(),
    current: new Set(),
  };
  const all = runtime
    .filter((p) => byTs.has(p[0]) && (byTs.get(p[0]) ?? 99) < 16 && Number.isFinite(p[1]))
    .map((p) => {
      const group: EfficiencyGroup =
        p[0] >= seasonStart ? 'current' : breakTs !== null && p[0] < breakTs ? 'before' : 'after';
      seasons[group].add(seasonOf(p[0]));
      return { x: byTs.get(p[0])!, y: p[1], group };
    });
  const pick = (g: string) => all.filter((p) => p.group === g);
  const at0 = {
    before: fitAt0(pick('before')),
    after: fitAt0(pick('after')),
    current: fitAt0(pick('current')),
  };
  const older = all.filter((p) => p.group !== 'current');
  const step = Math.max(
    1,
    Math.ceil(older.length / Math.max(1, maxPoints - pick('current').length)),
  );
  const points = [...older.filter((_, i) => i % step === 0), ...pick('current')];
  const fits = {
    before: fitLine(pick('before')),
    after: fitLine(pick('after')),
    current: fitLine(pick('current')),
  };
  const range = (g: EfficiencyGroup) => {
    const list = [...seasons[g]].sort();
    if (!list.length) return '';
    return list.length === 1 ? list[0]! : `${list[0]}\u2009–\u2009${list.at(-1)}`;
  };
  const legend = EFFICIENCY_GROUPS.filter((g) => seasons[g].size > 0).map((g) => ({
    group: g,
    label: g === 'current' ? `letos ${range(g)}` : range(g),
    days: pick(g).length,
  }));
  let insight: string | null = null;
  const ref = at0.after;
  if (at0.current !== null && ref) {
    const d = at0.current / ref - 1;
    insight =
      Math.abs(d) < 0.08
        ? `Letos běží kompresor při stejné venkovní teplotě stejně dlouho jako v minulých sezónách – žádné známky zhoršování.`
        : d > 0
          ? `Letos běží kompresor při stejné venkovní teplotě o ${fmtNum(d * 100, 0)}\u00a0% déle než v minulých sezónách. Stojí za kontrolu kolektoru a hlavic.`
          : `Letos běží kompresor při stejné venkovní teplotě o ${fmtNum(-d * 100, 0)}\u00a0% kratší dobu než v minulých sezónách.`;
  }
  if (at0.before && ref) {
    const drop = 1 - ref / at0.before;
    if (drop > 0.2)
      insight =
        `Od sezóny 2018/19 běží kompresor při stejné venkovní teplotě o ${fmtNum(drop * 100, 0)}\u00a0% kratší dobu. ${insight ?? ''}`.trim();
  }
  return { points, at0, fits, legend, insight };
}

/* ---------- Ekviterm ---------- */

/** Linear interpolation on the heating curve, clamped to its end points. */
export function curveAt(points: Array<[number, number]>, x: number): number | null {
  if (!points.length) return null;
  const p = points.slice().sort((a, b) => a[0] - b[0]);
  if (x <= p[0]![0]) return p[0]![1];
  if (x >= p[p.length - 1]![0]) return p[p.length - 1]![1];
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]!;
    const [x1, y1] = p[i]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  }
  return null;
}

/** Minutes since midnight for "HH:MM". */
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** C3 routing follows activity; device indicators always follow their own measured bits. */
export function heroScene(snap: HeatingSnapshot) {
  const scenario = ['heating_tank', 'heating_dhw', 'house_circuit'].includes(snap.activity)
    ? snap.activity
    : 'idle';
  const charge = scenario === 'heating_tank' || scenario === 'heating_dhw';
  const house = scenario === 'house_circuit';
  const activePipes: string[] = [];
  if (charge)
    activePipes.push(
      'compressor-outlet',
      scenario === 'heating_dhw' ? 'dhw-inlet' : 'tank-inlet',
      'tank-return',
    );
  if (house)
    activePipes.push('mixing-hot', 'radiator-supply', 'radiator-return', 'house-tank-return');
  if (
    house &&
    snap.pumps.heating === true &&
    snap.house.mixing_valve_pct !== null &&
    snap.house.mixing_valve_pct < 100
  )
    activePipes.push('mixing-bypass');
  if (snap.heat_pump.compressor_on === true) activePipes.push('collector');
  if (solarConfigured(snap) && solarStateOf(snap) === 'heating') {
    activePipes.push('solar-supply', 'solar-return');
  }
  return {
    scenario,
    activePipes,
    port:
      snap.dhw.valve_to_dhw === null
        ? null
        : snap.dhw.valve_to_dhw
          ? ('dhw' as const)
          : ('tank' as const),
    hpMuted: snap.heat_pump.compressor_on !== true,
    supplyMuted: snap.pumps.heating !== true || snap.house.supply_temp === null,
    mixingPct: snap.pumps.heating === true ? snap.house.mixing_valve_pct : null,
  };
}
