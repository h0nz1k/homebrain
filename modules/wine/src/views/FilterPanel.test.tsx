// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { EMPTY_FILTERS } from '../filters.js';
import type { WineFilters } from '../filters.js';
import { createSyntheticWines } from '../mock.js';
import { FilterPanel } from './panels.js';

afterEach(cleanup);
const wines = createSyntheticWines(2026);

function panel(filters: WineFilters = EMPTY_FILTERS) {
  const set = vi.fn();
  render(<FilterPanel wines={wines} filters={filters} set={set} onClose={() => {}} focus={null} />);
  return set;
}

it('Obsah cukru: 4 zákonné kategorie + Neuvedeno, šumivá vína zvlášť, přívlastek zvlášť', () => {
  const set = panel();
  const sugar = document.getElementById('wine-fg-sugar')!;
  expect(within(sugar).getByText('Obsah cukru')).toBeTruthy();
  for (const name of ['Suché', 'Polosuché', 'Polosladké', 'Sladké', 'Neuvedeno', 'Brut'])
    expect(within(sugar).getByText(name)).toBeTruthy();
  expect(within(sugar).getByText('Šumivá vína')).toBeTruthy();
  // Přívlastek is its own group – no "pozdní sběr" chip among the sugar categories.
  expect(within(sugar).queryByText('Pozdní sběr')).toBeNull();
  const predicate = document.getElementById('wine-fg-predicate')!;
  expect(within(predicate).getByText('Pozdní sběr')).toBeTruthy();
  fireEvent.click(within(sugar).getByTestId('wine-filter-sugar-suche'));
  expect(set.mock.calls[0]![0].sugar).toEqual(['suche']);
});

it('počty na čipech jsou fasetové (respektují ostatní filtry)', () => {
  panel({ ...EMPTY_FILTERS, predicates: ['pozdni_sber'] });
  const chip = document.querySelector('[data-testid=wine-filter-sugar-suche] .wine-tchip-n');
  const all = wines.filter((w) => w.predicate === 'pozdní sběr').length;
  expect(Number(chip!.textContent)).toBeLessThan(all);
  expect(Number(chip!.textContent)).toBeGreaterThan(0);
});
