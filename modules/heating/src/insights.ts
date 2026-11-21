import { fmtDuration, fmtNum, fmtT } from './model.js';
import type { HeatingSnapshot, HeatingSolarDay } from './types.js';

/** Key/value row of a read-only card; `note` = short plain-Czech explanation under it. */
export interface InfoRow {
  id: string;
  label: string;
  value: string;
  note?: string;
  /** Visually de-emphasised (setting exists but is not used in the current mode). */
  idle?: boolean;
}

const has = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v);
const flag = (v: boolean | null | undefined): v is boolean => typeof v === 'boolean';

/* ---------- Nastavení regulace ---------- */

/**
 * Regulation settings (heating curve mode, constant / minimum water temperature, season
 * limits). Every row is hidden when its key is not mapped – no `–` placeholders.
 */
export function settingsRows(snap: HeatingSnapshot): InfoRow[] {
  const c = snap.curve;
  const m = snap.mode;
  const rows: InfoRow[] = [];
  const equitherm = c.weather_comp;
  if (flag(equitherm)) {
    rows.push({
      id: 'curve-mode',
      label: 'Teplota nádrže',
      value: equitherm ? 'podle ekvitermní křivky' : 'konstantní',
      note: equitherm
        ? 'Čím je venku chladněji, tím teplejší vodu regulace v nádrži drží.'
        : 'Regulace drží v nádrži stále stejnou teplotu bez ohledu na počasí.',
    });
  }
  if (has(c.constant_target)) {
    rows.push({
      id: 'constant-target',
      label: 'Konstantní teplota nádrže',
      value: fmtT(c.constant_target, 0),
      note: equitherm === true ? 'Teď se nepoužívá – platí ekvitermní křivka.' : undefined,
      idle: equitherm === true,
    });
  }
  if (has(c.min_water)) {
    rows.push({
      id: 'min-water',
      label: 'Minimální teplota topné vody',
      value: fmtT(c.min_water, 0),
      note: 'Pod tuto teplotu nádrž neklesne ani v teplém počasí.',
    });
  }
  if (has(m.winter_limit)) {
    rows.push({
      id: 'winter-limit',
      label: 'Mez zimy',
      value: `venku pod ${fmtT(m.winter_limit, 0)}`,
      note:
        m.auto_season === false
          ? 'Teď se nepoužívá – sezóna je přepnutá ručně.'
          : 'Při nižší venkovní teplotě se regulace sama přepne na zimu a začne topit.',
      idle: m.auto_season === false,
    });
  }
  if (has(m.summer_limit)) {
    rows.push({
      id: 'summer-limit',
      label: 'Mez léta',
      value: `venku nad ${fmtT(m.summer_limit, 0)}`,
      note:
        m.auto_season === false
          ? 'Teď se nepoužívá – sezóna je přepnutá ručně.'
          : 'Při vyšší venkovní teplotě se topení domu vypne, ohřívá se jen teplá voda.',
      idle: m.auto_season === false,
    });
  }
  return rows;
}

/** Manual season: plain-Czech explanation of what it means (null in automatic mode). */
export function manualSeasonNote(snap: HeatingSnapshot): string | null {
  const m = snap.mode;
  if (m.auto_season !== false || m.season === null) return null;
  if (m.season === 'winter') {
    return `Zima je zapnutá ručně: regulace topí bez ohledu na venkovní teplotu${has(m.winter_limit) ? ` (mez zimy ${fmtT(m.winter_limit, 0)} se nepoužívá)` : ''}. Na jaře se sama nepřepne na léto – je potřeba ji přepnout v regulaci, jinak bude topit i v teplých dnech.`;
  }
  return `Léto je zapnuté ručně: dům se netopí, ohřívá se jen teplá voda – i když se venku ochladí${has(m.winter_limit) ? ` pod ${fmtT(m.winter_limit, 0)}` : ''}. Na podzim je potřeba přepnout regulaci na zimu.`;
}

/* ---------- Spínání kompresoru ---------- */

export interface CyclingModel {
  tone: 'ok' | 'warn';
  rows: InfoRow[];
  verdict: string;
}

function dayLine(starts: number, avg: number | null): string {
  const word = starts === 1 ? 'start' : starts >= 2 && starts <= 4 ? 'starty' : 'startů';
  return `${starts}\u00a0${word}${avg !== null ? ` · Ø ${fmtDuration(avg)}` : ''}`;
}

/** Starts per day + average run; `null` when the compressor is not mapped (older backend too). */
export function cyclingModel(snap: HeatingSnapshot): CyclingModel | null {
  const c = snap.heat_pump.cycling;
  if (!c) return null;
  const rows: InfoRow[] = [
    { id: 'today', label: 'Dnes', value: dayLine(c.starts_today, c.avg_run_min_today) },
  ];
  if (has(c.starts_yesterday)) {
    rows.push({
      id: 'yesterday',
      label: 'Včera',
      value: dayLine(c.starts_yesterday, c.avg_run_min_yesterday),
    });
  }
  const limits = `víc než ${c.max_starts} startů za den nebo průměrný běh pod ${fmtNum(c.min_avg_run_min, 0)}\u00a0min`;
  return c.short_cycling
    ? {
        tone: 'warn',
        rows,
        verdict: `Kompresor často spíná (${limits}). Krátké běhy ho opotřebovávají víc než dlouhé – stojí za to probrat se servisem hysterezi nádrže a průtok.`,
      }
    : {
        tone: 'ok',
        rows,
        verdict: `Spínání je v pořádku. Upozorníme, když bude ${limits}.`,
      };
}

/* ---------- Solár – denní souhrn ---------- */

export const SOLAR_NO_ENERGY_NOTE =
  'Solární okruh nemá měřič průtoku ani tepla, takže vyrobené kWh ani účinnost (COP) spočítat nejde – ukazujeme jen čas běhu čerpadla a teploty.';

function solarRows(day: HeatingSolarDay, prefix: string): InfoRow[] {
  const rows: InfoRow[] = [];
  if (has(day.pump_h)) {
    rows.push({
      id: `${prefix}-pump`,
      label: 'Čerpadlo běželo',
      value: day.pump_h > 0 ? fmtDuration(day.pump_h * 60) : 'vůbec',
    });
  }
  if (has(day.max_temp)) {
    rows.push({
      id: `${prefix}-max`,
      label: 'Nejvyšší teplota kolektoru',
      value: fmtT(day.max_temp, 0),
    });
  }
  if (has(day.stagnation_min)) {
    rows.push({
      id: `${prefix}-stag`,
      label: 'Stagnace (přehřátý, čerpadlo stojí)',
      value: day.stagnation_min > 0 ? fmtDuration(day.stagnation_min) : 'žádná',
    });
  }
  return rows;
}

export function solarDayModel(
  snap: HeatingSnapshot,
): { today: InfoRow[]; yesterday: InfoRow[] } | null {
  const solar = snap.extras.solar;
  if (!solar?.today) return null;
  const today = solarRows(solar.today, 'today');
  if (!today.length) return null;
  return { today, yesterday: solar.yesterday ? solarRows(solar.yesterday, 'yesterday') : [] };
}

/* ---------- Bazén a rybárna ---------- */

const onOff = (v: boolean, on = 'zapnuto', off = 'vypnuto') => (v ? on : off);

export function poolRows(snap: HeatingSnapshot): InfoRow[] {
  const p = snap.extras.pool;
  if (!p) return [];
  const rows: InfoRow[] = [];
  if (flag(p.filter_enabled)) {
    rows.push({ id: 'filter-enabled', label: 'Filtrace', value: onOff(p.filter_enabled) });
  }
  if (flag(p.filter_program_active)) {
    rows.push({
      id: 'filter-program',
      label: 'Program filtrace',
      value: p.filter_program_active ? 'právě běží' : 'teď ne',
    });
  }
  if (flag(p.filter_pump)) {
    rows.push({
      id: 'filter-pump',
      label: 'Čerpadlo filtrace',
      value: onOff(p.filter_pump, 'běží', 'stojí'),
    });
  }
  if (flag(p.heating_enabled)) {
    rows.push({ id: 'heating-enabled', label: 'Natápění bazénu', value: onOff(p.heating_enabled) });
  }
  if (flag(p.auto)) {
    rows.push({ id: 'auto', label: 'Režim bazénu', value: p.auto ? 'automaticky' : 'ručně' });
  }
  if (has(p.target)) {
    rows.push({ id: 'target', label: 'Žádaná teplota', value: fmtT(p.target, 0) });
  }
  return rows;
}

export function fishWaterRows(snap: HeatingSnapshot): InfoRow[] {
  const f = snap.extras.fish;
  if (!f) return [];
  const rows: InfoRow[] = [];
  if (has(f.water_temp)) rows.push({ id: 'water-temp', label: 'Voda', value: fmtT(f.water_temp) });
  if (has(f.water_target)) {
    rows.push({
      id: 'water-target',
      label: 'Voda – žádaná',
      value: has(f.water_hysteresis)
        ? `${fmtT(f.water_target)} ± ${fmtNum(f.water_hysteresis)}\u202f°C`
        : fmtT(f.water_target),
    });
  }
  if (flag(f.water_heating_on)) {
    rows.push({
      id: 'water-heating',
      label: 'Ohřev vody',
      value:
        f.water_heating_on && flag(f.water_heating_running)
          ? f.water_heating_running
            ? 'zapnutý · právě hřeje'
            : 'zapnutý · teď nehřeje'
          : onOff(f.water_heating_on, 'zapnutý', 'vypnutý'),
    });
  }
  return rows;
}
