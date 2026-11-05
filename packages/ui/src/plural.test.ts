import { describe, expect, it } from 'vitest';

import { czCount, czPlural } from './plural.js';

describe('czPlural', () => {
  it('declines 1 / 2–4 / 0 and 5+', () => {
    const krok = (n: number) => czCount(n, 'krok', 'kroky', 'kroků');
    expect([0, 1, 2, 3, 4, 5, 11, 22].map(krok)).toEqual([
      '0 kroků',
      '1 krok',
      '2 kroky',
      '3 kroky',
      '4 kroky',
      '5 kroků',
      '11 kroků',
      '22 kroků',
    ]);
  });

  it('uses the absolute value and genitive for fractions', () => {
    expect(czPlural(-1, 'minuta', 'minuty', 'minut')).toBe('minuta');
    expect(czPlural(-3, 'minuta', 'minuty', 'minut')).toBe('minuty');
    expect(czPlural(1.5, 'porce', 'porce', 'porcí')).toBe('porcí');
  });
});
