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

function WeekGrid({ snapshot, child }: { snapshot: TimetableSnapshot; child: TimetableChild }) {
  const periods = Math.max(
    0,
    ...child.grid.map((day) => day.reduce((last, subject, i) => (subject ? i + 1 : last), 0)),
  );
  return (
    <div className="fam-tt-week" data-testid="family-timetable-week">
      <table>
        <caption className="fam-sr">Týdenní rozvrh</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="fam-sr">Hodina</span>
            </th>
            {DAYS.map((day, i) => (
              <th scope="col" key={day}>
                {day}
                {child.afternoon_days.includes(i) && <small title="Odpolední zvonění"> odp.</small>}
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
                {DAYS.map((day, i) => (
                  <td
                    key={day}
                    data-double={
                      (child.grid[i]?.[period] &&
                        (child.grid[i]?.[period - 1] === child.grid[i]?.[period] ||
                          child.grid[i]?.[period + 1] === child.grid[i]?.[period])) ||
                      undefined
                    }
                  >
                    {child.grid[i]?.[period] || <span aria-label="volno">·</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {snapshot.afternoon?.lunch && child.afternoon_days.length > 0 && (
        <small>
          Odpolední zvonění ({child.afternoon_days.map((i) => DAYS[i]).join(', ')}): polední
          přestávka {timetableSpan(snapshot.afternoon.lunch)},{' '}
          {snapshot.afternoon.periods
            .map((row) => `${row.period}. ${timetableSpan(row)}`)
            .join(', ')}
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
      {week && <WeekGrid snapshot={snapshot} child={child} />}
    </section>
  );
}
