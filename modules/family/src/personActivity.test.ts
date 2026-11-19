import { describe, expect, it } from 'vitest';
import { createMockFamilyApi } from './mock.js';
import { personActivity } from './personActivity.js';

describe('personActivity', () => {
  it('reconciles the mock badge with the current week’s credited history', async () => {
    const now = new Date(2026, 10, 19, 16, 5);
    const api = createMockFamilyApi({ now: () => now });
    const { members } = await api.get();
    const member = members!.find((row) => row.id === 'tata')!;
    const { entries } = await api.personHistory(member.id);
    const activity = personActivity(
      member,
      [
        ...entries,
        { date: new Date(2026, 10, 15, 12).toISOString(), name: 'Nákup', points: 10 },
        { date: new Date(2026, 10, 20, 12).toISOString(), name: 'Budoucí', points: 10 },
      ],
      now,
    );

    expect(activity.points).toBe(18);
    expect(activity.week.filter((row) => !row.missed).map((row) => row.points)).toEqual([5, 8, 5]);
    expect(activity.history.find((row) => row.missed)?.points).toBe(0);
    expect(activity.history.some((row) => row.name === 'Nákup')).toBe(true);
    expect(activity.history.some((row) => row.name === 'Odvézt papír')).toBe(false);
  });
});
