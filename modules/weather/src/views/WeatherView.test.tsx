// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockWeatherAdapter, createWsAdapter, setWeatherAdapterFactory } from '../adapter.js';
import { buildMockSnapshot } from '../fixtures.js';
import WeatherView from './WeatherView.js';

afterEach(() => {
  cleanup();
  setWeatherAdapterFactory((c) => (c ? createWsAdapter(c) : null));
});

describe('WeatherView', () => {
  it('vykreslí stanici, nowcast, výstrahu, 48 h, 10 dní a zdroje', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('default'));
    render(<WeatherView />);
    expect((await screen.findByTestId('weather-now-temp')).textContent).toContain('7,8°C');
    expect(screen.getByTestId('weather-alert-banner').textContent).toContain('Oranžová výstraha');
    // one warning, shown once – inside the hero
    expect(
      screen.getByTestId('weather-hero').contains(screen.getByTestId('weather-warnings')),
    ).toBe(true);
    expect(screen.getAllByText('Silný vítr')).toHaveLength(1);
    expect(screen.getByTestId('weather-hero-sentence').textContent).toMatch(/^Oblačno/);
    // models chart: 3 strongest models by default, the rest behind legend toggles
    const legend = screen.getByTestId('weather-models-legend');
    expect(legend.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Všechny modely' }));
    expect(legend.querySelectorAll('button[aria-pressed="false"]')).toHaveLength(0);
    expect(screen.getByTestId('weather-alert-banner').textContent).toContain('ORP Testov');
    expect(await screen.findByTestId('weather-radar-map')).toBeTruthy();
    expect(screen.getByTestId('weather-radar-headline').textContent).toBe('Déšť za ~35 min, slabý');
    expect(screen.getByTestId('weather-radar-time').textContent).toContain('teď');
    expect(screen.getByTestId('weather-radar-minutes').getAttribute('aria-label')).toContain(
      'do 35 min sucho',
    );
    fireEvent.click(screen.getByTestId('weather-radar-zoom-cesko'));
    expect(screen.getByTestId('weather-radar-map').getAttribute('data-scope')).toBe('cz');
    expect(screen.getByTestId('weather-warnings').textContent).toContain('Silný vítr');
    expect(screen.getByTestId('weather-10d').querySelectorAll('li')).toHaveLength(10);
    // hero "Dnes 2° až 8°" and the 10-day "Dnes" row show the same min/max
    const heroRange = /Dnes (-?\d+)° až (-?\d+)°/.exec(
      screen.getByTestId('weather-hero').textContent ?? '',
    );
    const todayRow = screen.getByTestId('weather-10d').querySelector('li')!;
    expect(heroRange).not.toBeNull();
    expect(todayRow.textContent).toContain('Dnes');
    expect(todayRow.querySelector('.wx-day-min')!.textContent).toBe(`${heroRange![1]}°`);
    expect(todayRow.querySelector('.wx-day-max')!.textContent).toBe(`${heroRange![2]}°`);
    expect(screen.getByTestId('weather-48h').textContent).toContain('pravděpodobnost');
    expect(screen.getByTestId('weather-sources').textContent).toContain(
      'Open-Meteo.com (CC BY 4.0)',
    );
    expect(screen.getByTestId('weather-score').textContent).toContain('Mix je o');
    fireEvent.click(screen.getByRole('tab', { name: 'Srážky' }));
    expect(screen.getByRole('tab', { name: 'Srážky' }).getAttribute('aria-selected')).toBe('true');
  });

  it('bez připojení nezobrazí fixture, ale stav nedostupnosti', async () => {
    render(<WeatherView />);
    expect((await screen.findByRole('status')).textContent).toContain('není připojena');
  });

  it('nedostupná data: pomlčky, ne vymyšlená čísla', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('unavailable'));
    render(<WeatherView />);
    expect((await screen.findByTestId('weather-now-temp')).textContent).toContain('—');
    expect(screen.getByTestId('weather-10d').textContent).toContain('není k dispozici');
  });

  it('WS adaptér volá homebrain/weather/get a validuje odpověď', async () => {
    const snap = buildMockSnapshot('calm');
    const adapter = createWsAdapter({
      sendMessagePromise: <T,>(msg: { type: string }) => {
        expect(msg.type).toBe('homebrain/weather/get');
        return Promise.resolve(snap as T);
      },
    } as never);
    await expect(adapter.fetch()).resolves.toBe(snap);
    const bad = createWsAdapter({ sendMessagePromise: () => Promise.resolve({}) } as never);
    await expect(bad.fetch()).rejects.toThrow('Neplatná');
  });
});
