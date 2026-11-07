// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CompareCard } from './CompareCard';
import { createCompareDemo } from '../fixtures';
import { formatCompareValue } from '../compare';

const NOW = Date.parse('2026-11-07T15:23:00Z'); // 7. 11. 16:23 Prague
const NBSP = '\u00a0';
const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/\u00a0/g, ' ');
const num = (s: string | null) => Number((s ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'));

afterEach(cleanup);

describe('CompareCard data correctness', () => {
  it('card values equal the chart bars of the running month (same numbers, same scale)', () => {
    const demo = createCompareDemo('full', NOW);
    render(<CompareCard comparison={demo} />);
    const house = demo.series.house!;
    const nov = screen.getAllByTestId('energy-compare-month')[10]!;
    const bar = nov.querySelector('.en-cmp-bar--this')!;
    const last = nov.querySelector('.en-cmp-bar--last')!;
    const ghost = nov.querySelector('.en-cmp-ghost')!;
    expect(Number(bar.getAttribute('data-value'))).toBe(house.month.current);
    expect(
      num(screen.getByTestId('energy-compare-current').querySelector('.en-cmp-v')!.textContent),
    ).toBe(house.month.current);
    expect(Number(last.getAttribute('data-value'))).toBe(house.month.last_year);
    expect(Number(ghost.getAttribute('data-value'))).toBe(house.monthly.last_year[10]);
    // heights share one scale: bar / ghost height == value ratio
    const h = (el: Element) => parseFloat((el as HTMLElement).style.height);
    expect(h(bar) / h(ghost)).toBeCloseTo(house.month.current! / house.monthly.last_year[10]!, 3);
    const oct = screen
      .getAllByTestId('energy-compare-month')[9]!
      .querySelector('.en-cmp-bar--this')!;
    expect(h(bar) / h(oct)).toBeCloseTo(house.month.current! / house.monthly.this_year[9]!, 3);
  });

  it('previous month is like-for-like and labelled; the full month is context without a delta', () => {
    const demo = createCompareDemo('full', NOW);
    render(<CompareCard comparison={demo} />);
    const prev = text('energy-compare-previous');
    expect(prev).toContain('1.–7. 10. do 16:00');
    expect(prev).toContain('celý říjen 2026');
    const full = demo.series.house!.monthly.this_year[9]!;
    expect(prev).toContain(formatCompareValue(full, 'house').replace(/\u00a0/g, ' '));
    expect(text('energy-compare-last-year')).toContain('1.–7. 11. 2025 do 16:00');
  });

  it('headline states the partial scope of a running month and of the year', () => {
    render(<CompareCard comparison={createCompareDemo('full', NOW)} />);
    expect(text('energy-compare-headline')).toMatch(/než loni za 1\.–7\. 11\.$/);
    fireEvent.click(screen.getByRole('radio', { name: 'Od ledna' }));
    expect(text('energy-compare-headline')).toMatch(/než loni za 1\. 1\.–7\. 11\.$/);
    expect(text('energy-compare-last-year')).toContain('1. 1.–7. 11. 2025 do 16:00');
  });

  it('chart has a value axis with units, a legend for the outline and a tap readout', () => {
    render(<CompareCard comparison={createCompareDemo('full', NOW)} />);
    const axis = screen.getByTestId('energy-compare-yaxis');
    expect(axis.textContent).toContain('kWh');
    expect(within(axis).getAllByTestId('energy-compare-tick').length).toBeGreaterThanOrEqual(3);
    expect(text('energy-compare-legend')).toContain('obrys = celý listopad 2025');
    expect(text('energy-compare-readout')).toContain('Listopad');
    fireEvent.click(screen.getAllByTestId('energy-compare-month')[2]!);
    expect(text('energy-compare-readout')).toMatch(/Březen 2026: [\d ,]+ kWh/);
    fireEvent.click(screen.getByRole('radio', { name: 'Náklady' }));
    expect(screen.getByTestId('energy-compare-yaxis').textContent).toContain('Kč');
    expect(NBSP).toBe('\u00a0');
  });
});
