import { describe, expect, it } from 'vitest';
import { consumableInfo, czDays, sortConsumables } from './consumables.js';

describe('consumables', () => {
  it('converts hours left to percent of service life and days', () => {
    expect(consumableInfo('main_brush', 279)).toMatchObject({
      percent: 93,
      daysLeft: 279,
      action: 'Vyměnit za 279 dní',
      tone: 'ok',
    });
    expect(consumableInfo('filter', 75, 2.5)).toMatchObject({
      percent: 50,
      daysLeft: 30,
      action: 'Vyměnit za 30 dní',
    });
  });
  it('sensors are cleaned, not replaced, and warn when nearly due', () => {
    expect(consumableInfo('sensors', 2.9)).toMatchObject({
      percent: 10,
      daysLeft: 2,
      action: 'Vyčistit za 2 dny',
      tone: 'warn',
    });
    expect(consumableInfo('sensors', 0.5).action).toBe('Vyčistit zítra');
  });
  it('overdue (negative hours) means now', () => {
    expect(consumableInfo('sensors', -5.9)).toMatchObject({
      percent: 0,
      daysLeft: 0,
      action: 'Vyčistit teď',
      tone: 'crit',
    });
    expect(consumableInfo('side_brush', Number.NaN).tone).toBe('crit');
  });
  it('Czech plural of days', () => {
    expect([1, 2, 4, 5, 21].map(czDays)).toEqual(['1 den', '2 dny', '4 dny', '5 dní', '21 dní']);
  });
  it('sorts the most urgent first', () => {
    const sorted = sortConsumables([
      consumableInfo('main_brush', 200),
      consumableInfo('sensors', -1),
      consumableInfo('filter', 20),
    ]);
    expect(sorted.map((item) => item.kind)).toEqual(['sensors', 'filter', 'main_brush']);
  });
});
