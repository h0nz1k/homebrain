import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { EmptyState, StatusBadge } from './index';
import type { DataQuality } from '@homebrain/contracts';
afterEach(cleanup);
it.each<[DataQuality, string]>([
  ['ok', 'Aktuální'],
  ['stale', 'Zastaralé'],
  ['unavailable', 'Nedostupné'],
  ['invalid_unit', 'Chybná jednotka'],
  ['unverified_polarity', 'Neověřená polarita'],
])('labels %s', (quality, label) => {
  render(<StatusBadge quality={quality} />);
  expect(screen.getByText(label)).toBeDefined();
});
it('shows an empty state with description', () => {
  render(<EmptyState title="Žádná data">Vyberte entity v nastavení.</EmptyState>);
  expect(screen.getByRole('heading', { name: 'Žádná data' })).toBeDefined();
  expect(screen.getByText('Vyberte entity v nastavení.')).toBeDefined();
});
