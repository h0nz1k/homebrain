import { describe, expect, it } from 'vitest';
import {
  barScale,
  compareDelta,
  compareHeadline,
  niceTicks,
  scopeLabel,
  deltaTone,
  fetchComparison,
  formatCompareValue,
  formatDelta,
  partialRangeLabel,
  ytdRangeLabel,
  monthName,
  type ComparisonResult,
} from './compare.js';
import { createCompareDemo } from './fixtures.js';

const NBSP = '\u00a0';

describe('period comparison formatting', () => {
  it('percent delta against the baseline, Czech minus sign, none without baseline', () => {
    expect(compareDelta(260, 227.4)).toEqual({ diff: 32.6, pct: 14.3 });
    expect(formatDelta(compareDelta(260, 227.4))).toBe('+14\u00a0%');
    expect(formatDelta(compareDelta(92, 100))).toBe('\u22128\u00a0%');
    expect(formatDelta(compareDelta(100.2, 100))).toBe('±0\u00a0%');
    expect(compareDelta(260, null)).toBeNull();
    expect(compareDelta(null, 100)).toBeNull();
    // from zero there is no meaningful percentage
    expect(compareDelta(5, 0)).toEqual({ diff: 5, pct: null });
    expect(formatDelta(compareDelta(5, 0))).toBe('');
  });

  it('tone: less consumption/cost is good, more production is good, tiny changes neutral', () => {
    expect(deltaTone('house', compareDelta(90, 100))).toBe('ok');
    expect(deltaTone('cost', compareDelta(120, 100))).toBe('warn');
    expect(deltaTone('pv', compareDelta(120, 100))).toBe('ok');
    expect(deltaTone('pv', compareDelta(80, 100))).toBe('warn');
    expect(deltaTone('import', compareDelta(100.5, 100))).toBe('flat');
  });

  it('values: kWh with one decimal below 1000, whole Kč, grouped thousands', () => {
    expect(formatCompareValue(259.94, 'house')).toBe(`259,9${NBSP}kWh`);
    expect(formatCompareValue(11872.1, 'pv')).toBe(`11${NBSP}872${NBSP}kWh`);
    expect(formatCompareValue(880, 'cost')).toBe(`880${NBSP}Kč`);
    expect(formatCompareValue(12880.4, 'cost')).toBe(`12${NBSP}880${NBSP}Kč`);
    expect(formatCompareValue(null, 'house')).toBe('–');
  });

  it('partial month label = the compared day and hour range', () => {
    expect(partialRangeLabel({ day: 7, hour: 16, days_in_month: 30 }, 11)).toBe(
      `1.–7.${NBSP}11. do 16:00`,
    );
    expect(partialRangeLabel({ day: 7, hour: 0, days_in_month: 30 }, 11)).toBe(`1.–6.${NBSP}11.`);
    expect(partialRangeLabel({ day: 2, hour: 0, days_in_month: 30 }, 11)).toBe(`1.${NBSP}11.`);
    expect(partialRangeLabel({ day: 1, hour: 9, days_in_month: 31 }, 1)).toBe(
      `1.${NBSP}1. do 9:00`,
    );
    expect(partialRangeLabel({ day: 1, hour: 0, days_in_month: 31 }, 1)).toBeNull();
    expect(ytdRangeLabel({ day: 7, hour: 16, days_in_month: 30 }, 11)).toBe(
      `1.${NBSP}1.–7.${NBSP}11. do 16:00`,
    );
    expect(ytdRangeLabel({ day: 1, hour: 0, days_in_month: 31 }, 1)).toBeNull();
    expect(monthName(11)).toBe('listopad');
    expect(monthName(3, 'short')).toBe('bře');
  });

  it('bar scale uses the larger of both years, ignoring missing months', () => {
    expect(
      barScale([
        [null, 10, 40],
        [null, null, 20],
      ]),
    ).toBe(40);
    expect(barScale([[null], [null]])).toBe(1);
  });

  it('fetchComparison asks the integration and degrades without a connection', async () => {
    const demo = createCompareDemo('full', new Date('2026-11-07T15:23:00Z').getTime());
    const sent: unknown[] = [];
    const connection = {
      sendMessagePromise: <T>(msg: unknown) => {
        sent.push(msg);
        return Promise.resolve(demo as T);
      },
    };
    const res = (await fetchComparison(connection as never)) as ComparisonResult;
    expect(sent).toEqual([{ type: 'homebrain/energy/compare' }]);
    expect(res.status).toBe('ok');
    expect(res.series.house?.month.last_year).not.toBeNull();
    expect(await fetchComparison(null)).toEqual({ status: 'unsupported' });
    const missing = createCompareDemo('nodata', Date.now());
    expect(missing.series.house?.month.last_year).toBeNull();
    expect(missing.series.house?.monthly.last_year.every((v) => v === null)).toBe(true);
  });
});

describe('period comparison scope + axis', () => {
  it('range label can carry the year; days-only scope for headlines', () => {
    const p = { day: 7, hour: 16, days_in_month: 30 };
    expect(partialRangeLabel(p, 11, 2025)).toBe(`1.–7.${NBSP}11. 2025 do 16:00`);
    expect(ytdRangeLabel(p, 11, 2025)).toBe(`1.${NBSP}1.–7.${NBSP}11. 2025 do 16:00`);
    expect(scopeLabel(p, 11, 'month')).toBe(`1.–7.${NBSP}11.`);
    expect(scopeLabel({ ...p, hour: 0 }, 11, 'month')).toBe(`1.–6.${NBSP}11.`);
    expect(scopeLabel(p, 11, 'ytd')).toBe(`1.${NBSP}1.–7.${NBSP}11.`);
  });

  it('headline names the scope', () => {
    expect(compareHeadline('Spotřeba', compareDelta(92, 100), `1.–7.${NBSP}11.`)).toBe(
      `Spotřeba o 8${NBSP}% nižší než loni za 1.–7.${NBSP}11.`,
    );
    expect(compareHeadline('Výroba', compareDelta(100.2, 100), null)).toBe(
      'Výroba stejně jako loni',
    );
    expect(compareHeadline('Výroba', null, null)).toBeNull();
  });

  it('nice axis ticks cover the maximum with round steps', () => {
    expect(niceTicks(1371)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(283)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(9120)).toEqual([0, 2500, 5000, 7500, 10000]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('synthetic comparison mock is internally consistent and realistic', () => {
  const demo = createCompareDemo('full', new Date('2026-11-07T15:23:00Z').getTime());
  const sum = (a: Array<number | null>) => a.reduce<number>((s, v) => s + (v ?? 0), 0);
  for (const [key, s] of Object.entries(demo.series)) {
    it(`${key}: card values == chart months, YTD == sum of months, like-for-like previous`, () => {
      const tol = key === 'cost' ? 12 : 1.2;
      expect(s.month.current).toBe(s.monthly.this_year[10]);
      expect(Math.abs(s.ytd.current! - sum(s.monthly.this_year.slice(0, 11)))).toBeLessThan(tol);
      expect(
        Math.abs(s.ytd.last_year! - sum(s.monthly.last_year.slice(0, 10)) - s.month.last_year!),
      ).toBeLessThan(tol);
      // 1.–7. 10. do 16:00 is a fraction of the whole October, never more
      expect(s.month.previous!).toBeLessThan(s.monthly.this_year[9]!);
      expect(s.month.last_year!).toBeLessThan(s.monthly.last_year[10]!);
    });
  }
  it('daily rates are plausible: running month ≈ the same days last year, house 25–60 kWh/day', () => {
    const h = demo.series.house!;
    const days = 6 + 16 / 24;
    expect(h.month.current! / days).toBeGreaterThan(25);
    expect(h.month.current! / days).toBeLessThan(60);
    expect(h.month.current! / h.month.last_year!).toBeGreaterThan(0.8);
    expect(h.month.current! / h.month.last_year!).toBeLessThan(1.1);
    expect(h.month.previous! / days).toBeGreaterThan(20);
  });
});
