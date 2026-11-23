import { useEffect, useState } from 'react';
import {
  schoolDateLabel,
  schoolDay,
  schoolLastLoaded,
  schoolSoup,
  schoolToday,
  timetableRow,
  timetableSchoolOver,
  type SchoolSnapshot,
  type TimetableRow,
  type TimetableSnapshot,
} from '@homebrain/ha-client';
import { Icon } from '@homebrain/ui';
import { schoolStyles } from './schoolStyles.js';
import type { HomeApi } from '../data/home.js';

function TimetableLine({ row }: { row: TimetableRow }) {
  return (
    <li data-testid="school-timetable">
      {row.name && <strong>{row.name}</strong>}
      {row.name && ' '}
      {row.text}
      {row.bring && <span className="today-school-bring"> · s sebou: {row.bring}</span>}
    </li>
  );
}

export function TodaySchool({
  api,
  now,
  kiosk,
  onShown,
}: {
  api: HomeApi | null;
  now: string;
  kiosk: boolean;
  /** The wall kiosk makes room for the block (slim ribbon, home tiles step aside). */
  onShown?: (shown: boolean) => void;
}) {
  const current = new Date(now);
  const date = schoolDay(current);
  const [school, setSchool] = useState<SchoolSnapshot | null>(null);
  const [timetable, setTimetable] = useState<TimetableSnapshot | null>(null);
  useEffect(() => {
    // The wall/kitchen kiosk never shows the timetable (owner decision, #173).
    if (kiosk || !api?.timetable) return;
    let active = true;
    const load = () => {
      void api.timetable?.(date).then(
        (next) => {
          if (active) setTimetable(next);
        },
        () => {
          /* Keep the last result during reconnect. */
        },
      );
    };
    load();
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, date, kiosk]);
  useEffect(() => {
    let active = true;
    const load = () => {
      void api?.school?.(date).then(
        (next) => {
          if (active) setSchool(next);
        },
        () => {
          /* Keep the last result during reconnect. */
        },
      );
    };
    if (!api?.school) return;
    load();
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, date]);

  const children = !kiosk && timetable?.enabled ? timetable.children : [];
  // Evening: the children are home, today's school events are over.
  const schoolOver = timetableSchoolOver(children, current);
  const { lunch, afterLunch, events, tomorrow } = school
    ? schoolToday(school, current, schoolOver)
    : { lunch: undefined, afterLunch: false, events: [], tomorrow: '' };
  // Only the next important date: the block sits under the clock and must stay short.
  const next = school?.dates.find((item) => item.date >= date);
  const rows = children.flatMap((child) => timetableRow(child, current) ?? []);
  // Both children free tomorrow share one „volno“ row.
  const groups = (['today', 'tomorrow'] as const)
    .map((when) => ({
      when,
      rows: rows
        .filter((row) => row.when === when)
        .filter(
          (row, i, all) =>
            all.findIndex((other) => other.text === row.text && other.name === row.name) === i,
        ),
    }))
    .filter((group) => group.rows.length > 0);
  const lines = groups.flatMap((group) => group.rows);
  const schoolShown = !!api?.school && !!school?.enabled && !!(lunch || events.length || next);
  const shown = schoolShown || lines.length > 0;
  useEffect(() => {
    onShown?.(shown);
  }, [onShown, shown]);
  if (!shown) return null;

  return (
    <section
      className="today-school"
      aria-label="Škola"
      data-testid="today-school"
      data-school-kiosk={kiosk || undefined}
    >
      <style>{schoolStyles}</style>
      <header className="today-school-head">
        <h3 className="today-school-title">
          <Icon name="school" size={kiosk ? 22 : 18} />
          Škola
        </h3>
        {schoolShown && school?.updated_at && (
          <small className="today-school-loaded">
            {schoolLastLoaded(school.updated_at, current)}
          </small>
        )}
      </header>
      <div className="today-school-body">
        {groups.map((group) => (
          <div className="today-school-timetable" key={group.when}>
            <p className="today-school-label" data-testid="school-timetable-when">
              {group.when === 'today' ? 'Dnes' : 'Zítra'}
            </p>
            <ul className="today-school-list">
              {group.rows.map((row) => (
                <TimetableLine key={`${row.name}-${row.text}`} row={row} />
              ))}
            </ul>
          </div>
        ))}
        {schoolShown && lunch && (
          <p className="today-school-lunch" data-testid="school-lunch">
            <span className="today-school-label">{afterLunch ? 'Zítra k obědu:' : 'K obědu:'}</span>{' '}
            <strong>{lunch.main}</strong>
            {lunch.soup && ` · ${schoolSoup(lunch.soup)}`}
          </p>
        )}
        {schoolShown && (events.length > 0 || next) && (
          <ul className="today-school-list">
            {events.map((event) => (
              <li key={`event-${event.date}-${event.title}`} data-testid="school-event">
                <span className="today-school-label">
                  {event.date === tomorrow || schoolOver ? 'Zítra:' : 'Dnes:'}
                </span>{' '}
                {event.grades?.length && !/tříd|ročník/i.test(event.title)
                  ? `${event.grades.map((grade) => `${grade}.`).join(', ')} ročník · `
                  : ''}
                {event.title}
              </li>
            ))}
            {next && (
              <li data-testid="school-date">
                <span className="today-school-label">{schoolDateLabel(next.date, true)}</span>
                {' · '}
                {next.title}
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
