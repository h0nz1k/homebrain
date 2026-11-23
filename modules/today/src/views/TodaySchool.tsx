import { useEffect, useState } from 'react';
import {
  schoolDateLabel,
  schoolDay,
  schoolLastLoaded,
  schoolSoup,
  schoolToday,
  type SchoolSnapshot,
} from '@homebrain/ha-client';
import { Icon } from '@homebrain/ui';
import { schoolStyles } from './schoolStyles.js';
import type { HomeApi } from '../data/home.js';

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

  const { lunch, afterLunch, events, tomorrow } = school
    ? schoolToday(school, current)
    : { lunch: undefined, afterLunch: false, events: [], tomorrow: '' };
  // Only the next important date: the block sits under the clock and must stay short.
  const next = school?.dates.find((item) => item.date >= date);
  const shown = !!api?.school && !!school?.enabled && !!(lunch || events.length || next);
  useEffect(() => {
    onShown?.(shown);
  }, [onShown, shown]);
  if (!shown || !school) return null;

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
        {school.updated_at && (
          <small className="today-school-loaded">
            {schoolLastLoaded(school.updated_at, current)}
          </small>
        )}
      </header>
      <div className="today-school-body">
        {lunch && (
          <p className="today-school-lunch" data-testid="school-lunch">
            <span className="today-school-label">{afterLunch ? 'Zítra k obědu:' : 'K obědu:'}</span>{' '}
            <strong>{lunch.main}</strong>
            {lunch.soup && ` · ${schoolSoup(lunch.soup)}`}
          </p>
        )}
        {(events.length > 0 || next) && (
          <ul className="today-school-list">
            {events.map((event) => (
              <li key={`event-${event.date}-${event.title}`} data-testid="school-event">
                <span className="today-school-label">
                  {event.date === tomorrow ? 'Zítra:' : 'Dnes:'}
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
