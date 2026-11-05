// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectionDays, daysLabel, fillLevel, WasteBin } from './WasteBin.js';
import { wasteStyles } from './wasteStyles.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([
  ['mixed', 'smesny'],
  ['plastic', 'plast'],
  ['paper', 'papir'],
  ['bio', 'bio'],
  ['glass', 'sklo'],
  ['electro', 'elektro'],
  ['bulky', 'objemny'],
  ['hazardous', 'nebezpecny'],
  ['other', 'smesny'],
] as const)('renders the approved %s sprite with card and hero density variants', (type, key) => {
  const { container, rerender } = render(<WasteBin type={type} days={3} />);
  let image = container.querySelector('img')!;
  expect(image.getAttribute('src')).toContain(`bin-${key}-96.webp`);
  expect(image.getAttribute('srcset')).toContain(`bin-${key}-192.webp`);
  expect(container.querySelector('svg')).toBeNull();
  expect(screen.getByRole('figure').getAttribute('aria-label')).toContain('za 3 dny');
  rerender(<WasteBin type={type} days={3} size="hero" />);
  image = container.querySelector('img')!;
  expect(image.getAttribute('src')).toContain(`bin-${key}-220.webp`);
  expect(image.getAttribute('srcset')).toContain(`bin-${key}-440.webp`);
});
it.each(['hero', 'regular'] as const)('uses open sprites only on pickup day at %s size', (size) => {
  const { container, rerender } = render(<WasteBin type="paper" days={0} size={size} />);
  expect(container.querySelector('.wb-sprite--open')?.getAttribute('src')).toContain(
    'bin-papir-open-',
  );
  for (const props of [
    { days: 1, evening: true },
    { days: 3 },
    { days: 0, collected: true },
    { days: 0, availability: 'cancelled' as const },
    { days: null, availability: 'unavailable' as const },
  ]) {
    rerender(<WasteBin type="paper" size={size} {...props} />);
    expect(container.querySelector('.wb-sprite--open')).toBeNull();
  }
});
it('keeps mini glyphs legible and static even on pickup day', () => {
  const { container } = render(<WasteBin type="mixed" days={0} size="mini" />);
  expect(container.querySelector('.wb-mini-glyph')).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByRole('figure').className).not.toContain('wb-animate');
});
it.each([
  [0, 'dnes'],
  [1, 'zítra'],
  [3, 'za 3 dny'],
  [12, 'za 12 dní'],
  [null, 'Bez termínu'],
] as const)('labels %s days accessibly', (days, label) => {
  render(<WasteBin type="mixed" days={days} />);
  expect(screen.getByRole('figure').getAttribute('aria-label')).toContain(label);
  expect(daysLabel(days)).toBe(label);
});
it('uses the real observed calendar interval across DST and clamps progress', () => {
  expect(collectionDays('2026-10-26', '2026-10-24')).toBe(2);
  expect(collectionDays('2027-01-01', '2026-12-31')).toBe(1);
  expect(fillLevel('2026-10-20', '2026-11-03', '2026-10-27')).toBe(0.5);
  expect(fillLevel('2026-10-20', '2026-11-03', '2026-10-19')).toBe(0);
  expect(fillLevel('2026-10-20', '2026-11-03', '2026-11-04')).toBe(1);
  expect(fillLevel(undefined, '2026-11-03', '2026-11-02')).toBeNull();
  expect(fillLevel('2026-02-30', '2026-11-03', '2026-11-02')).toBeNull();
  expect(fillLevel('2026-11-03', '2026-11-03', '2026-11-02')).toBeNull();
});
it('responds to reduced motion changes while preserving the open pickup-day state', () => {
  let matches = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  const { container } = render(<WasteBin type="paper" days={0} size="hero" />);
  expect(screen.getByRole('figure').className).toContain('wb-animate-today');
  matches = true;
  act(() => listeners.forEach((notify) => notify()));
  expect(screen.getByRole('figure').className).not.toContain('wb-animate');
  expect(container.querySelector('.wb-sprite--open')).not.toBeNull();
  expect(wasteStyles).toContain('@media (prefers-reduced-motion: reduce)');
  expect(wasteStyles).toContain('animation: none !important');
});
it('animates evening and after collection only for active collections', () => {
  const { rerender } = render(<WasteBin type="mixed" days={1} evening size="hero" />);
  expect(screen.getByRole('figure').className).toContain('wb-animate-evening');
  rerender(<WasteBin type="mixed" days={7} collected size="hero" />);
  expect(screen.getByRole('figure').className).toContain('wb-animate-empty');
  rerender(<WasteBin type="mixed" days={0} availability="cancelled" />);
  expect(screen.getByRole('figure').className).not.toContain('wb-animate');
  expect(screen.getByRole('figure').getAttribute('aria-label')).toContain('zrušeno');
});
it('records the generated raster provenance and MIT release', () => {
  const notices = readFileSync(
    join(import.meta.dirname, '../../../../THIRD_PARTY_NOTICES.md'),
    'utf8',
  );
  expect(notices).toContain('Google Gemini image model on Vertex AI');
  expect(notices).toContain('SynthID');
  expect(notices).toContain('repository MIT licence');
});
