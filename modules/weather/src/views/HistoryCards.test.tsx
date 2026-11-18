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
import { etsGrade } from './rainScore.js';

afterEach(() => {
  cleanup();
  setWeatherAdapterFactory((c) => (c ? createWsAdapter(c) : null));
});

describe('Včera a dnes + Historie', () => {
  it('ukáže včerejší měření, dnešek zatím, rozdíl a dnešní novinku', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('default'));
    render(<WeatherView />);
    const yt = await screen.findByTestId('weather-yt');
    expect(yt.textContent).not.toContain('naměřeno stanicí'); // no station name configured
    expect(screen.getByTestId('weather-yt-today-head').textContent).toMatch(
      /Dnes zatím \(do\u00a0\d\d:\d\d\)/,
    );
    const tMax = screen.getByTestId('weather-yt-t_max');
    expect(within(tMax).getByText('Max. teplota')).toBeTruthy();
    expect(tMax.textContent).toContain('7,9');
    // 7,8 → 7,9 °C is below the 0,5 °C threshold: neutral, not a trend
    expect(tMax.querySelector('.wx-yt-d.is-same')).not.toBeNull();
    expect(screen.getByTestId('weather-yt-rain').textContent).toContain('↑\u00a00,4');
    expect(screen.getByTestId('weather-yt-msl').textContent).toContain('↓');
    expect(screen.getByText('Průměrný tlak')).toBeTruthy();
    // gust ≥ 15 m/s uses the warning colour
    expect(screen.getByTestId('weather-yt-gust').querySelector('.wx-warnc')).not.toBeNull();
    const streak = screen.getByTestId('weather-dry-streak');
    expect(streak.querySelector('b')!.textContent).toBe('Dnes už napršelo 0,4\u00a0mm');
    expect(streak.textContent).toContain('předtím 2\u00a0dny bez deště');
    // elevation from options is shown in the location line, with an explanation
    expect(screen.getByTestId('weather-elevation').textContent).toContain('480 m n. m.');
    expect(screen.getByTestId('weather-elevation').getAttribute('title')).toContain('nastavení');
  });

  it('chybějící hodnota je „–“ s vysvětlením, ne 0,0', async () => {
    const snap = buildMockSnapshot('default');
    const hist = buildMockHistory('default', 7);
    const y = hist.days[hist.days.length - 2]!;
    hist.days[hist.days.length - 2] = { ...y, rain: null, gust_max: null, gaps: ['rain', 'gust'] };
    setWeatherAdapterFactory(() => ({
      pollMs: 0,
      fetch: () => Promise.resolve(snap),
      history: () => Promise.resolve(hist),
    }));
    render(<WeatherView />);
    const rain = await screen.findByTestId('weather-yt-rain');
    const gaps = rain.querySelectorAll('.wx-yt-gap');
    expect(gaps.length).toBe(2); // yesterday + Δ
    expect(gaps[0]!.textContent).toBe('–');
    expect(gaps[0]!.getAttribute('title')).toBe('chybí data');
    expect(rain.textContent).toContain('0,4'); // today still measured
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
  it('karta má záložku Déšť s ETS 0–1, slovním hodnocením a velikostí vzorku', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('default'));
    render(<WeatherView />);
    const score = await screen.findByTestId('weather-score');
    expect(score.textContent).toContain('Mix je o'); // temperature tab by default
    fireEvent.click(screen.getByTestId('weather-score-tab-rain'));
    expect(score.textContent).toContain('0 = náhoda, 1 = dokonalé');
    expect(score.textContent).toContain('předstih 0–24 h');
    const list = within(score).getByTestId('weather-score-rain');
    const names = Array.from(list.querySelectorAll('.wx-rank-name')).map((n) => n.textContent);
    expect(names[0]).toBe('Mix');
    const mix = screen.getByTestId('weather-score-rain-blend');
    expect(mix.textContent).toContain('kombinace');
    expect(mix.textContent).toContain('dobrá'); // ETS ≥ 0,4
    expect(mix.textContent).toContain('zachytí 71\u00a0% hodin s deštěm');
    expect(mix.textContent).toContain('z předpovězených dešťových hodin nepršelo 33\u00a0%');
    expect(mix.textContent).toMatch(/z 86\u00a0deštivých hodin za 40\u00a0dní/);
    // bars on an absolute 0–1 scale, not relative to the leader
    const bar = mix.querySelector<HTMLElement>('.wx-prank-bar i')!;
    expect(bar.style.width).not.toBe('100%');
    expect(screen.getByTestId('weather-score-rain-gfs_seamless').textContent).toContain('slabá');
    // too few pairs: listed as „málo dat“, not ranked
    const metno = screen.getByTestId('weather-score-rain-metno');
    expect(metno.textContent).toContain('málo dat');
    expect(names.at(-1)).toBe('met.no');
    // Brier only in the disclosure, with an explanation
    expect(list.textContent).not.toContain('Brier');
    expect(screen.getByTestId('weather-score-rain-details').textContent).toContain(
      'chyba pravděpodobnosti, nižší = lepší',
    );
    expect(score.textContent).toContain('sbírají se dvojice předpověď–měření');
    expect(score.textContent).not.toContain('teplota podle');
    expect(screen.queryByTestId('weather-score-rain-few')).toBeNull();
  });

  it('hodnocení ETS slovy', () => {
    expect(etsGrade(0.49).word).toBe('dobrá');
    expect(etsGrade(0.4).word).toBe('dobrá');
    expect(etsGrade(0.3).word).toBe('průměrná');
    expect(etsGrade(0.19).word).toBe('slabá');
    expect(etsGrade(null).word).toBe('slabá');
  });

  it('málo deštivých hodin → upozornění pro celou kartu', async () => {
    const snap = buildMockSnapshot('default');
    snap.verification_precip = snap.verification_precip!.map((r) => ({ ...r, wet_hours: 20 }));
    setWeatherAdapterFactory(() => ({ pollMs: 0, fetch: () => Promise.resolve(snap) }));
    render(<WeatherView />);
    fireEvent.click(await screen.findByTestId('weather-score-tab-rain'));
    expect(screen.getByTestId('weather-score-rain-few').textContent).toContain('málo dat');
  });

  it('bez dost párů ukáže prázdný stav', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('calm'));
    render(<WeatherView />);
    fireEvent.click(await screen.findByTestId('weather-score-tab-rain'));
    expect(screen.getByTestId('weather-score-rain-empty').textContent).toContain('240');
  });
});
