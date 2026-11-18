// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMockWeatherAdapter,
  createWsAdapter,
  setWeatherAdapterFactory,
  type WeatherAdapter,
} from '../adapter.js';
import { buildMockHistory, buildMockSnapshot } from '../fixtures.js';
import WeatherView from './WeatherView.js';

afterEach(() => {
  cleanup();
  setWeatherAdapterFactory((c) => (c ? createWsAdapter(c) : null));
});

describe('Včera a dnes + Historie', () => {
  it('ukáže včerejší měření, dnešek zatím a počet dní bez deště', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('default'));
    render(<WeatherView />);
    const yt = await screen.findByTestId('weather-yt');
    expect(yt.textContent).toContain('Včera');
    expect(yt.textContent).toContain('Dnes zatím');
    expect(within(yt).getByText('Nejvíc').closest('tr')!.textContent).toContain('7,9');
    expect(screen.getByTestId('weather-dry-streak').textContent).toContain(
      'napršelo 0,4 mm – předtím 2 dny bez deště',
    );
    // elevation from options is shown in the location line, with an explanation
    expect(screen.getByTestId('weather-elevation').textContent).toContain('480 m n. m.');
    expect(screen.getByTestId('weather-elevation').getAttribute('title')).toContain('nastavení');
  });

  it('historie přepíná 7/30/365 dní a mezeru v datech ukáže, ne dopočítá', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('default'));
    render(<WeatherView />);
    const card = await screen.findByTestId('weather-history');
    const chart = await within(card).findByTestId('weather-history-chart');
    expect(chart.querySelectorAll('.wx-hist-t')).toHaveLength(7);
    expect(within(card).queryByTestId('weather-history-gaps')).toBeNull();
    fireEvent.click(within(card).getByRole('tab', { name: '30 dní' }));
    expect(chart.querySelectorAll('.wx-hist-t')).toHaveLength(29); // one gap day
    expect(within(card).getAllByTestId('weather-history-gap')).toHaveLength(1);
    expect(within(card).getByTestId('weather-history-gaps').textContent).toContain('1 den');
    fireEvent.click(within(card).getByRole('tab', { name: '365 dní' }));
    expect(chart.querySelectorAll('g')).toHaveLength(365);
    // default selection = last complete day (yesterday)
    expect(within(card).getByTestId('weather-history-detail').textContent).toMatch(/30\. 10\./);
    expect(within(card).getByTestId('weather-records').textContent).toContain('Rekordy – říjen');
    expect(within(card).getByTestId('weather-records').textContent).toContain('Rekordy – 2026');
  });

  it('bez navázaných senzorů vysvětlí, co chybí', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('unavailable'));
    render(<WeatherView />);
    expect((await screen.findByTestId('weather-history')).textContent).toContain(
      'navázané senzory stanice',
    );
  });

  it('adapter bez history karty nevykreslí', async () => {
    const adapter: WeatherAdapter = {
      pollMs: 0,
      fetch: () => Promise.resolve(buildMockSnapshot('default')),
    };
    setWeatherAdapterFactory(() => adapter);
    render(<WeatherView />);
    await screen.findByTestId('weather-now-temp');
    expect(screen.queryByTestId('weather-history')).toBeNull();
    expect(screen.queryByTestId('weather-yt')).toBeNull();
  });

  it('chybu načtení historie ukáže jen v kartě, zbytek stránky běží', async () => {
    const adapter: WeatherAdapter = {
      pollMs: 0,
      fetch: () => Promise.resolve(buildMockSnapshot('default')),
      history: () => Promise.reject(new Error('recorder timeout')),
    };
    setWeatherAdapterFactory(() => adapter);
    render(<WeatherView />);
    expect((await screen.findByTestId('weather-yt')).textContent).toBeDefined();
    expect(
      (await screen.findAllByText(/Historii se nepodařilo načíst: recorder timeout/)).length,
    ).toBe(2);
    expect(screen.getByTestId('weather-now-temp').textContent).toContain('7,8');
  });

  it('mock historie se dá vyžádat i pro 400 dní', () => {
    expect(buildMockHistory('default', 400).days).toHaveLength(400);
  });
});

describe('Kdo se trefuje – déšť', () => {
  it('karta má záložku Déšť s pořadím podle ETS a vysvětlením', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('default'));
    render(<WeatherView />);
    const score = await screen.findByTestId('weather-score');
    expect(score.textContent).toContain('Mix je o'); // temperature tab by default
    fireEvent.click(screen.getByTestId('weather-score-tab-rain'));
    const list = within(score).getByTestId('weather-score-rain');
    const names = Array.from(list.querySelectorAll('.wx-rank-name')).map((n) => n.textContent);
    expect(names[0]).toBe('Mix (vážený)');
    expect(names.at(-1)).toBe('GFS'); // over-forecasts drizzle → worst ETS
    expect(names).not.toContain('met.no'); // too few pairs → hidden, not ranked
    expect(score.textContent).toContain('zachytí');
    expect(score.textContent).toContain('vlastní váhy');
    expect(score.textContent).toContain('se zatím kalibruje');
  });

  it('bez dost párů ukáže prázdný stav', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('calm'));
    render(<WeatherView />);
    fireEvent.click(await screen.findByTestId('weather-score-tab-rain'));
    expect(screen.getByTestId('weather-score-rain-empty').textContent).toContain('240');
  });
});
