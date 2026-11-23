// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { demoHistory } from '../history.js';
import { HistoryCard } from './HistoryCard.js';

afterEach(cleanup);
const NOW = new Date('2026-11-23T09:00:00Z');
const names = (slot: number) => (slot === 1 ? 'Alfa' : 'Beta');

it('Historie úklidů: poslední běhy se zdrojem, robotem, dobou a plochou', () => {
  render(<HistoryCard history={demoHistory(NOW.getTime())} robotName={names} now={NOW} />);
  const rows = screen.getAllByTestId('robots-history-run');
  expect(rows).toHaveLength(5);
  expect(rows[0]!.textContent).toContain('Kuchyně, Jídelna, Chodba');
  expect(rows[0]!.textContent).toContain('Alfa · 38 min · 32 m²');
  expect(rows[0]!.textContent).toContain('HomeBrain');
  expect(rows[1]!.textContent).toContain('Beta');
  expect(rows[1]!.textContent).toContain('Aplikace');
});

it('Historie úklidů: prázdný stav; bez backendu se karta neukáže', () => {
  const { container, rerender } = render(
    <HistoryCard history={demoHistory(NOW.getTime(), 'empty')} robotName={names} now={NOW} />,
  );
  expect(screen.getByTestId('robots-history-empty')).toBeTruthy();
  rerender(<HistoryCard history={null} robotName={names} now={NOW} />);
  expect(container.textContent).toBe('');
});
