import { localKey } from './format.js';
import type { FamilyMember, PersonHistoryEntry } from './types.js';

export function personActivity(
  member: Pick<FamilyMember, 'missed'>,
  entries: PersonHistoryEntry[],
  now: Date,
) {
  const today = localKey(now);
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  );
  const days = Array.from(
    { length: 7 },
    (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
  const start = localKey(monday);
  const history = [
    ...member.missed.map((row) => ({ ...row, points: 0, missed: true })),
    ...entries.map((row, index) => ({ ...row, id: `credit-${index}`, missed: false })),
  ].sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
  const week = history.filter((row) => {
    const key = row.date ? localKey(new Date(row.date)) : '';
    return key >= start && key <= today;
  });
  return {
    today,
    days,
    history,
    week,
    points: week.reduce((total, row) => total + (row.points ?? 0), 0),
  };
}
