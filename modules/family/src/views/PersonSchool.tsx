import { useEffect, useState } from 'react';
import {
  schoolDay,
  schoolDateLabel,
  schoolLastLoaded,
  schoolSoup,
  schoolWeek,
  type SchoolSnapshot,
} from '@homebrain/ha-client';
import type { FamilyApi } from '../api.js';

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá'];

export function PersonSchool({
  api,
  member,
  now,
  refreshedAt,
}: {
  api: FamilyApi;
  member: string;
  now: Date;
  refreshedAt: number;
}) {
  const [school, setSchool] = useState<SchoolSnapshot | null>(null);
  useEffect(() => {
    let active = true;
    void api.school?.().then(
      (next) => {
        if (active) setSchool(next);
      },
      () => {
        /* Keep the last result during reconnect. */
      },
    );
    return () => {
      active = false;
    };
  }, [api, refreshedAt]);

  if (!school?.enabled) return null;
  const today = schoolDay(now);
  const events = school.events
    .filter((event) => event.person_ids.includes(member) && (event.end_date ?? event.date) >= today)
    .slice(0, 5);

  return (
    <section className="fam-person-surface fam-school" data-testid="family-school">
      <h2>Škola</h2>
      <h3>Oběd ve škole</h3>
      <ul>
        {schoolWeek(today).map((day, i) => {
          const lunch = school.lunch.find((row) => row.date === day);
          return (
            <li key={day}>
              <time dateTime={day}>
                {DAYS[i]} {schoolDateLabel(day)}
              </time>
              {lunch ? (
                <span>
                  {lunch.main}
                  {lunch.sides.length > 0 && ` · ${lunch.sides.join(', ')}`}
                  {lunch.soup && ` · ${schoolSoup(lunch.soup)}`}
                  {lunch.allergens.length > 0 && (
                    <small>Alergeny: {lunch.allergens.join(', ')}</small>
                  )}
                </span>
              ) : (
                <span>—</span>
              )}
            </li>
          );
        })}
      </ul>
      {events.length > 0 && (
        <>
          <h3>Nejbližší akce</h3>
          <ul>
            {events.map((event) => (
              <li key={`${event.date}-${event.title}`}>
                <time dateTime={event.date}>
                  {schoolDateLabel(event.date, true)}
                  {event.end_date && `–${schoolDateLabel(event.end_date)}`}
                </time>
                <span>{event.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {school.updated_at && <small>{schoolLastLoaded(school.updated_at, now)}</small>}
    </section>
  );
}
