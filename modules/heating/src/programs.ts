import type { HeatingClock, HeatingSchedule, HeatingSnapshot } from './types.js';

/** Monday-first short day names (`week[].day` 1 = Monday). */
export const DAY_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const;
export const DAY_LONG = [
  'Pondělí',
  'Úterý',
  'Středa',
  'Čtvrtek',
  'Pátek',
  'Sobota',
  'Neděle',
] as const;

const DAY_MIN = 24 * 60;
const DRIFT_HINT_MIN = 2;

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface WeekSegment {
  /** Minutes from local midnight of this row. */
  from: number;
  to: number;
  /** The slot started the day before (overflow past midnight). */
  carried: boolean;
}

export interface WeekRow {
  day: number;
  short: string;
  long: string;
  today: boolean;
  segments: WeekSegment[];
  /** `05:00–20:00`, `11:00 · 1 h 30 min` (duration programs). */
  texts: string[];
}

function fmtRun(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}\u00a0min`;
  return m ? `${h}\u00a0h ${m}\u00a0min` : `${h}\u00a0h`;
}

/**
 * Weekly program → 7 ribbon rows in local time. A slot running past midnight is drawn up to
 * 24:00 on its own row and continues at the start of the next row (Sunday → Monday, the
 * program repeats weekly). `todayIso` = local weekday 1–7 of today.
 */
export function weekRows(schedule: HeatingSchedule, todayIso: number): WeekRow[] | null {
  const week = schedule.week;
  if (!week || week.length !== 7) return null;
  const rows: WeekRow[] = week.map((d, i) => ({
    day: d.day,
    short: DAY_SHORT[i]!,
    long: DAY_LONG[i]!,
    today: d.day === todayIso,
    segments: [],
    texts: [],
  }));
  week.forEach((d, i) => {
    for (const slot of d.slots) {
      const from = minutesOf(slot.start);
      const to = from + slot.minutes;
      rows[i]!.segments.push({ from, to: Math.min(DAY_MIN, to), carried: false });
      if (to > DAY_MIN) {
        rows[(i + 1) % 7]!.segments.push({
          from: 0,
          to: Math.min(DAY_MIN, to - DAY_MIN),
          carried: true,
        });
      }
      rows[i]!.texts.push(
        schedule.format === 'start_duration'
          ? `${slot.start} · ${fmtRun(slot.minutes)}`
          : `${slot.start}–${slot.end}`,
      );
    }
  });
  for (const r of rows) r.segments.sort((a, b) => a.from - b.from);
  return rows;
}

/** Same slots every day → one line instead of seven (`texts` of Monday). */
export function sameEveryDay(rows: WeekRow[]): boolean {
  const first = JSON.stringify(rows[0]?.segments);
  return rows.every((r) => JSON.stringify(r.segments) === first);
}

/** ISO weekday (1 = Monday) of a local date. */
export function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Plain-Czech note on the PLC clock: summer-time shift of program times and the clock drift.
 * Returns `null` when there is nothing worth saying.
 */
export function clockNotes(clock: HeatingClock | undefined): {
  shift: string | null;
  drift: string | null;
} {
  if (!clock) return { shift: null, drift: null };
  let shift: string | null = null;
  if (clock.local_shift_min !== 0) {
    const h = Math.abs(clock.local_shift_min) / 60;
    const amount = Number.isInteger(h)
      ? `${h}\u00a0${h === 1 ? 'hodinu' : h < 5 ? 'hodiny' : 'hodin'}`
      : `${Math.abs(clock.local_shift_min)}\u00a0min`;
    shift = `Hodiny regulace neznají letní čas. Časy jsou přepočtené na skutečný čas – regulace sama je ukazuje o ${amount} ${clock.local_shift_min > 0 ? 'dřív' : 'později'}.`;
  }
  let drift: string | null = null;
  if (clock.drift_min !== null && Math.abs(clock.drift_min) > DRIFT_HINT_MIN) {
    const n = Math.abs(clock.drift_min);
    const word = n === 1 ? 'minutu' : n < 5 ? 'minuty' : 'minut';
    drift = `Hodiny regulace jdou o ${n}\u00a0${word} ${clock.drift_min > 0 ? 'napřed' : 'pozadu'}${clock.plc_time ? ` (ukazují ${clock.plc_time})` : ''}, takže programy se spouštějí o tolik ${clock.drift_min > 0 ? 'dřív' : 'později'}. Seřídit je může servis.`;
  }
  return { shift, drift };
}

/**
 * Setback effectiveness: the program can run while the configured drop is 0 °C – then the
 * house never cools down and the setback saves nothing. `null` when the drop is unknown
 * (not mapped) or non-zero. With two drop registers, both must be 0.
 */
export function setbackHint(snap: HeatingSnapshot): string | null {
  const drops = [snap.house.setback_drop, snap.house.setback_drop_alt].filter(
    (v): v is number => v !== null && v !== undefined && Number.isFinite(v),
  );
  if (!drops.length || drops.some((v) => Math.abs(v) >= 0.05)) return null;
  const running = snap.mode.setback_active === true;
  return `${running ? 'Útlum právě běží' : 'Útlum podle programu běží'}, ale pokles je nastaven na 0\u202f°C – teplota doma se nesníží a útlum nic neušetří.`;
}

export function isSetbackSchedule(s: HeatingSchedule): boolean {
  return s.key === 'setback' || s.key.startsWith('setback_');
}
