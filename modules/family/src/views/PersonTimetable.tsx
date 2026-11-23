import { useEffect, useState } from 'react';
import {
  schoolDateLabel,
  schoolDay,
  schoolDayOffset,
  timetableBring,
  timetableClock,
  timetableSpan,
  timetableStatus,
  timetableTime,
  type TimetableChild,
  type TimetableDay,
  type TimetableSnapshot,
} from '@homebrain/ha-client';
import type { FamilyApi } from '../api.js';

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá'];

function dayLabel(day: TimetableDay, now: Date): string {
  const today = schoolDay(now);
  if (day.date === today) return 'Dnes';
  if (day.date === schoolDayOffset(today, 1)) return 'Zítra';
  return schoolDateLabel(day.date, true).replace(/^\S+/, (w) => w[0]!.toUpperCase() + w.slice(1));
}

/** Week cell: a double period (same subject twice in a row) is one tall cell. */
interface WeekCell {
  subject: string;
  period: number;
  span: number;
}

function weekCells(day: string[], periods: number): Array<WeekCell | null> {
  const cells: Array<WeekCell | null> = [];
  let prev: WeekCell | undefined;
  for (let period = 0; period < periods; period++) {
    const subject = day[period] ?? '';
    if (subject && prev?.subject === subject) {
      prev.span += 1;
      cells.push(null);
    } else {
      prev = { subject, period, span: 1 };
      cells.push(prev);
    }
  }
  return cells;
}

function WeekGrid({
  snapshot,
  child,
  now,
}: {
  snapshot: TimetableSnapshot;
  child: TimetableChild;
  now: Date;
}) {
  const periods = Math.max(
    0,
    ...child.grid.map((day) => day.reduce((last, subject, i) => (subject ? i + 1 : last), 0)),
  );
  const { today, phase, lesson } = timetableStatus(child, now);
  const todayIndex = today?.school ? (new Date(today.date + 'T00:00:00Z').getUTCDay() + 6) % 7 : -1;
  const clock = timetableClock(now);
  // Afternoon days ring differently from period 6 on: each such cell shows its real start.
  const shifted = new Map(
    (snapshot.afternoon?.periods ?? []).map((row) => [row.period, row.start] as const),
  );
  const columns = DAYS.map((_, i) => weekCells(child.grid[i] ?? [], periods));
  const lunch = child.afternoon_days.length > 0 ? snapshot.afternoon?.lunch : null;
  return (
    <div className="fam-tt-week" data-testid="family-timetable-week">
      <table aria-label="Týdenní rozvrh">
        <thead>
          <tr>
            <th scope="col">
              <span className="fam-sr">Hodina</span>
            </th>
            {DAYS.map((day, i) => (
              <th
                scope="col"
                key={day}
                data-today={i === todayIndex || undefined}
                aria-current={i === todayIndex ? 'date' : undefined}
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: periods }, (_, period) => {
            const bell = snapshot.bells[period];
            return (
              <tr key={period}>
                <th scope="row">
                  {period + 1}.{bell && <small>{timetableTime(bell.start)}</small>}
                </th>
                {DAYS.map((day, i) => {
                  const cell = columns[i]![period];
                  if (!cell) return null;
                  if (!cell.subject)
                    return (
                      <td key={day} data-today={i === todayIndex || undefined}>
                        <span aria-label="volno">·</span>
                      </td>
                    );
                  const first = cell.period + 1;
                  const last = cell.period + cell.span;
                  const isToday = i === todayIndex;
                  const current =
                    isToday &&
                    phase === 'lesson' &&
                    lesson!.period >= first &&
                    lesson!.period <= last;
                  const end = today?.lessons.find((row) => row.period === last)?.end;
                  const done = isToday && !!end && end <= clock;
                  const start = child.afternoon_days.includes(i) ? shifted.get(first) : undefined;
                  return (
                    <td
                      key={day}
                      rowSpan={cell.span > 1 ? cell.span : undefined}
                      data-today={isToday || undefined}
                      data-current={current || undefined}
                      data-done={done || undefined}
                      aria-current={current ? 'time' : undefined}
                    >
                      {cell.subject}
                      {start && <small>{timetableTime(start)}</small>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {lunch && (
        <small>
          {child.afternoon_days.map((i) => DAYS[i]).join(', ')}: polední přestávka{' '}
          {timetableSpan(lunch)}
        </small>
      )}
    </div>
  );
}

/** Rodina person detail: today's lessons (live), the week grid on tap, next school day. */
export function PersonTimetable({
  api,
  member,
  now,
  refreshedAt,
}: {
  api: FamilyApi;
  member: string;
  /** Refreshed with the family snapshot (every minute), enough for the current lesson. */
  now: Date;
  refreshedAt: number;
}) {
  const [snapshot, setSnapshot] = useState<TimetableSnapshot | null>(null);
  const [week, setWeek] = useState(false);
  useEffect(() => {
    let active = true;
    void api.timetable?.().then(
      (next) => {
        if (active) setSnapshot(next);
      },
      () => {
        /* Keep the last result during reconnect. */
      },
    );
    return () => {
      active = false;
    };
  }, [api, refreshedAt]);

  const child = snapshot?.children.find((row) => row.id === member);
  if (!snapshot || !child) return null;
  const { today, phase, lesson } = timetableStatus(child, now);
  const showToday = !!today?.school && phase !== 'after';
  const next = showToday ? null : child.next;
  const shown = showToday ? today : next;
  const clock = timetableClock(now);

  return (
    <section className="fam-person-surface fam-tt" data-testid="family-timetable">
      <button
        type="button"
        className="fam-tt-head"
        aria-expanded={week}
        onClick={() => setWeek((open) => !open)}
      >
        <span>
          <strong data-testid="family-timetable-title">
            {showToday
              ? `Dnes ve škole ${timetableSpan(today)}`
              : next
                ? `${dayLabel(next, now)} do školy ${timetableSpan(next)}`
                : 'Rozvrh'}
          </strong>
          {!showToday && today?.free && <small>Dnes volno · {today.free}</small>}
        </span>
        <span className="fam-tt-toggle">{week ? 'Skrýt týden' : 'Celý týden'}</span>
      </button>
      {shown && (
        <ol className="fam-tt-lessons">
          {shown.lessons.map((row) => {
            const current = showToday && phase === 'lesson' && row.period === lesson?.period;
            const done = showToday && row.end <= clock;
            return (
              <li
                key={row.period}
                data-current={current || undefined}
                data-done={done || undefined}
                aria-current={current ? 'time' : undefined}
              >
                <span>{row.period}.</span>
                <strong>{row.subject}</strong>
                <time>{timetableTime(row.start)}</time>
              </li>
            );
          })}
        </ol>
      )}
      {shown?.lunch && <small>Polední přestávka {timetableSpan(shown.lunch)}</small>}
      {shown && shown.bring.length > 0 && (
        <p className="fam-tt-bring" data-testid="family-timetable-bring">
          S sebou: {timetableBring(shown)}
        </p>
      )}
      {week && <WeekGrid snapshot={snapshot} child={child} now={now} />}
    </section>
  );
}
