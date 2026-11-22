import { useEffect, useState } from 'react';
import {
  schoolDateLabel,
  schoolDay,
  schoolLastLoaded,
  schoolToday,
  type SchoolSnapshot,
} from '@homebrain/ha-client';
import { schoolStyles } from './schoolStyles.js';
import type { HomeApi } from '../data/home.js';

export function TodaySchool({
  api,
  now,
  kiosk,
}: {
  api: HomeApi | null;
  now: string;
  kiosk: boolean;
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

  if (!api?.school || !school?.enabled) return null;
  const { lunch, afterLunch, events, tomorrow } = schoolToday(school, current);
  const dates = school.dates.filter((item) => item.date >= date);
  if (!lunch && !events.length && !dates.length) return null;

  return (
    <section
      className="today-school"
      aria-label="Škola"
      data-testid="today-school"
      data-school-kiosk={kiosk || undefined}
    >
      <style>{schoolStyles}</style>
      {lunch && (
        <p data-testid="school-lunch">
          <strong>{afterLunch && 'Zítra · '}Ve škole k obědu:</strong> {lunch.main}
          {lunch.soup && ` · polévka ${lunch.soup}`}
        </p>
      )}
      {events.map((event) => (
        <p key={`event-${event.date}-${event.title}`} data-testid="school-event">
          {event.date === tomorrow ? 'Zítra' : 'Dnes'}:{' '}
          {event.grades?.length && !/tříd|ročník/i.test(event.title)
            ? `${event.grades.map((grade) => `${grade}.`).join(', ')} ročník · `
            : ''}
          {event.title}
        </p>
      ))}
      {dates.map((item) => (
        <p key={`date-${item.date}-${item.title}`} data-testid="school-date">
          {schoolDateLabel(item.date)} · {item.title}
        </p>
      ))}
      {school.updated_at && <small>{schoolLastLoaded(school.updated_at)}</small>}
    </section>
  );
}
