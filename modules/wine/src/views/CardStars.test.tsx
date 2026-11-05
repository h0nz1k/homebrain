// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createEntityStore } from '@homebrain/ha-client';
import { createMockWineApi, setWineApiFactory } from '../api.js';
import { createSyntheticWines } from '../mock.js';
import { CardStars } from './parts.js';
import WineView from './WineView.js';

const kinds = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.wine-cardstar')).map((s) => s.getAttribute('data-kind'));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  setWineApiFactory(null);
});

it('rated wine: filled stars for the score, outline stars for the rest of the 5-star scale', () => {
  render(<CardStars value={4} />);
  const stars = screen.getByRole('img', { name: 'Hodnocení 4 z 5' });
  expect(kinds(stars)).toEqual(['full', 'full', 'full', 'full', 'empty']);
});

it('half ratings render a half star', () => {
  render(<CardStars value={3.5} />);
  const stars = screen.getByRole('img', { name: 'Hodnocení 3,5 z 5' });
  expect(kinds(stars)).toEqual(['full', 'full', 'full', 'half', 'empty']);
  // the half star's fill is clipped to its left half via a unique clipPath
  const clip = stars.querySelector('clipPath');
  expect(clip?.id).toMatch(/^wcs[\w-]+$/);
  expect(stars.querySelector('.wine-cardstar-f[clip-path]')?.getAttribute('clip-path')).toBe(
    `url(#${clip?.id})`,
  );
});

it('unrated wine renders nothing (no placeholder)', () => {
  const { container } = render(<CardStars value={null} />);
  expect(container.innerHTML).toBe('');
});

it('overview cards: stars only on rated wines', async () => {
  const wines = createSyntheticWines(2026);
  setWineApiFactory(() => createMockWineApi(wines));
  render(<WineView store={createEntityStore()} bindings={{}} />);
  const cards = await screen.findAllByTestId('wine-card');
  const rated = cards.filter((c) => c.querySelector('[data-testid=wine-card-stars]'));
  const unrated = cards.filter((c) => !c.querySelector('[data-testid=wine-card-stars]'));
  expect(rated.length).toBeGreaterThan(0);
  expect(unrated.length).toBeGreaterThan(0);
  for (const c of unrated) {
    expect(c.textContent).not.toContain('bez hodnocení');
    expect(c.querySelector('.wine-card-foot')).toBeNull();
  }
  for (const c of rated) {
    const label = c.querySelector('[data-testid=wine-card-stars]')?.getAttribute('aria-label');
    expect(label).toMatch(/^Hodnocení \d(,5)? z 5$/);
    expect(c.querySelectorAll('.wine-cardstar')).toHaveLength(5);
  }
});
