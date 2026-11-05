import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Breakdown } from './index';

afterEach(cleanup);

it('renders labelled rows with details and an optional total', () => {
  render(
    <Breakdown
      label="Rozpis"
      items={[
        { key: 'vt', label: 'Vysoký tarif', detail: '2,0 kWh × 5,00 Kč', value: '10 Kč' },
        { key: 'fixed', label: 'Stálé platby', value: '28 Kč' },
      ]}
      total={{ label: 'Celkem', value: '38 Kč' }}
    />,
  );
  const list = screen.getByLabelText('Rozpis');
  expect(list.tagName).toBe('DL');
  expect(list.querySelectorAll('.hb-breakdown-row')).toHaveLength(3);
  expect(screen.getByText('2,0 kWh × 5,00 Kč').tagName).toBe('SMALL');
  expect(list.querySelector('[data-key="fixed"] small')).toBeNull();
  expect(list.querySelector('.hb-breakdown-total dd')!.textContent).toBe('38 Kč');
});

it('draws a proportion bar when items carry colours', () => {
  render(
    <Breakdown
      label="Podíl"
      items={[
        { key: 'a', label: 'A', value: '1', amount: 1, color: 'red' },
        { key: 'b', label: 'B', value: '3', amount: 3, color: 'blue' },
        { key: 'c', label: 'C', value: '0', amount: 0, color: 'green' },
      ]}
    />,
  );
  const bar = screen.getByLabelText('Podíl').querySelector('.hb-breakdown-bar')!;
  expect(bar.querySelectorAll('span')).toHaveLength(2);
  expect((bar.querySelector('[data-key="b"]') as HTMLElement).style.flexGrow).toBe('3');
});
