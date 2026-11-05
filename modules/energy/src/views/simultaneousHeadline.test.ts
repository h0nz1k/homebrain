import { describe, expect, it } from 'vitest';
import { simultaneousHeadline } from './EnergyFlowHero';

describe('simultaneousHeadline', () => {
  it('net import with one exporting phase does not claim a surplus', () => {
    expect(
      simultaneousHeadline({
        mode: 'phases',
        importKw: 2.7,
        exportKw: 0.1,
        phasesKw: [1.9, 0.8, -0.1],
      } as never),
    ).toBe('Dům bere ze sítě, jedna fáze přitom dodává');
  });
  it('net export with two importing phases', () => {
    expect(
      simultaneousHeadline({
        mode: 'phases',
        importKw: 0.4,
        exportKw: 3.1,
        phasesKw: [0.2, 0.2, -3.1],
      } as never),
    ).toBe('Přebytek jde do sítě, dvě fáze přitom odebírají');
  });
  it('separate meters fall back to a neutral sentence', () => {
    expect(simultaneousHeadline({ mode: 'separate', importKw: 1, exportKw: 0.2 } as never)).toBe(
      'Dům bere ze sítě a současně do ní dodává',
    );
  });
});
