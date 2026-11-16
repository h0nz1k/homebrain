import { describe, expect, it } from 'vitest';
import { eventDay } from './format.js';
import { createMockFamilyApi } from './mock.js';

describe('family mock', () => {
  it('never puts school events (or the school run) on a weekend', async () => {
    // Every weekday as „today“, so the 7-day window crosses weekends in all positions.
    for (let d = 2; d <= 8; d += 1) {
      const now = new Date(2026, 10, d, 12, 40);
      const snap = await createMockFamilyApi({ now: () => now }).get();
      const weekend = snap.events.filter((e) => {
        const day = new Date(`${eventDay(e)}T12:00:00`).getDay();
        return (day === 0 || day === 6) && (e.kind === 'school' || /škol/i.test(e.summary));
      });
      expect(weekend.map((e) => `${eventDay(e)} ${e.summary}`)).toEqual([]);
    }
  });
});

it('keeps each child’s complete weekly chart consistent with earned points', async () => {
  const api = createMockFamilyApi();
  for (const kid of (await api.get()).kids) {
    const summary = await api.pointsGet(kid.id);
    const history = await api.pointsHistory(kid.id, 7);
    expect(history.chart.earned.reduce((total, value) => total + value, 0)).toBe(
      summary.earned_week,
    );
    expect(history.chart.earned.at(-1)).toBe(summary.earned_today);
  }
});
