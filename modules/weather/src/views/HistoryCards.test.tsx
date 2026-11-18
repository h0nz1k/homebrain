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
    // provisional marker + today's date + time of the last measurement
    const head = screen.getByTestId('weather-yt-today-head');
    expect(head.querySelector('.wx-yt-prov')!.textContent).toBe('zatím');
    // date and time on one line, non-breaking inside the date
    const now = head.querySelector('.wx-yt-hd--now')!;
    expect(now.textContent).toMatch(/^so\u00a031\.\u00a010\., do\u00a0\d\d:\d\d$/);
    const tMax = screen.getByTestId('weather-yt-t_max');
    expect(within(tMax).getByText('Max. teplota')).toBeTruthy();
    expect(tMax.textContent).toContain('7,9');
    // 7,8 → 7,9 °C is below the 0,5 °C threshold: neutral, not a trend
    expect(tMax.querySelector('.wx-yt-d.is-same')).not.toBeNull();
    expect(screen.getByTestId('weather-yt-rain').textContent).toContain('↑\u00a00,4');
    expect(screen.getByTestId('weather-yt-msl').textContent).toContain('↓');
    expect(screen.getByText('Průměrný tlak')).toBeTruthy();
    // gust ≥ 15 m/s and a pressure change ≥ 10 hPa: ⚠ + weight, not colour only
    const gustHi = screen.getByTestId('weather-yt-gust').querySelector('.wx-yt-hi')!;
    expect(gustHi.textContent).toContain('⚠');
    expect(gustHi.textContent).toContain('silný náraz');
    expect(screen.getByTestId('weather-yt-msl').querySelector('.wx-yt-hi')).not.toBeNull();
    expect(screen.getByTestId('weather-yt-t_max').querySelector('.wx-yt-hi')).toBeNull();
    // ⚠ pressure change / gust takes priority over the rain callout
    expect(screen.queryByTestId('weather-dry-streak')).toBeNull();
    const alert = screen.getByTestId('weather-yt-alert');
    expect(alert.className).toContain('wx-info--warn');
    expect(alert.textContent).toMatch(
      /^⚠ Tlak je dnes zatím o \d+\u00a0hPa (nižší|vyšší) než včera; náraz větru až \d+,\d\u00a0m\/s$/,
    );
    // 10:40 local: today's max can still rise → muted „zatím“ on its Δ only
    expect(within(tMax).getByTestId('weather-yt-dprov').textContent).toBe('zatím');
    expect(screen.getByTestId('weather-yt-t_min').querySelector('.wx-yt-dz')).toBeNull();
    // „≈ stejně“ carries no empty unit slot (right-aligned)
    expect(tMax.querySelector('.wx-yt-d.is-same .wx-yt-u')).toBeNull();
    expect(yt.textContent).toContain('⚠ = náraz ≥\u00a015\u00a0m/s nebo změna tlaku ≥\u00a010');
    expect(yt.textContent).toContain(
      '≈\u00a0stejně = rozdíl menší než 0,5\u00a0°C, 0,2\u00a0mm, 1\u00a0m/s, 1\u00a0hPa',
    );
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

  it('Historie: stopová srážka má viditelný sloupec, zvýraznění je v ploše grafu', async () => {
    const snap = buildMockSnapshot('default');
    const hist = buildMockHistory('default', 7);
    const k = hist.days.length - 3;
    hist.days[k] = { ...hist.days[k]!, rain: 0.05 };
    setWeatherAdapterFactory(() => ({
      pollMs: 0,
      fetch: () => Promise.resolve(snap),
      history: () => Promise.resolve(hist),
    }));
    render(<WeatherView />);
    const chart = await screen.findByTestId('weather-history-chart');
    const bars = chart.querySelectorAll('rect.wx-hist-r');
    const heights = Array.from(bars).map((b) => Number(b.getAttribute('height')));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(2.4);
    const plot = screen.getByTestId('weather-history-plot');
    expect(plot.contains(screen.getByTestId('weather-history-cursor'))).toBe(true);
    const card = screen.getByTestId('weather-history');
    expect(card.textContent).toContain('světlejší = dnes (zatím)');
    expect(screen.getByTestId('weather-records').textContent).toContain('Nejteplejší den');
  });

  it('Historie: 0,0 mm = žádný sloupec, dnešek s neutrálním obrysem', async () => {
    const snap = buildMockSnapshot('default');
    const hist = buildMockHistory('default', 7);
    const n = hist.days.length;
    hist.days[n - 1] = { ...hist.days[n - 1]!, rain: 0.03 }; // today so far, shown as 0,0 mm
    setWeatherAdapterFactory(() => ({
      pollMs: 0,
      fetch: () => Promise.resolve(snap),
      history: () => Promise.resolve(hist),
    }));
    render(<WeatherView />);
    const chart = await screen.findByTestId('weather-history-chart');
    const groups = chart.querySelectorAll('svg > g');
    expect(groups).toHaveLength(n);
    expect(groups[n - 1]!.querySelector('rect.wx-hist-r')).toBeNull();
    const wet = hist.days.filter((d) => d.rain != null && Math.round(d.rain * 10) > 0).length;
    expect(chart.querySelectorAll('rect.wx-hist-r')).toHaveLength(wet);
    const css = document.querySelector('style')?.textContent ?? '';
    if (css)
      expect(css).toContain(
        '.wx-hist-chart .is-partial .wx-hist-t,.wx-hist-chart .is-partial .wx-hist-r{stroke:var(--hb-t2)}',
      );
  });

  it('Historie: rozsah okna je vidět, rekord z dneška je „zatím“', async () => {
    const snap = buildMockSnapshot('default');
    const hist = buildMockHistory('default', 400);
    const n = hist.days.length;
    // today so far is the coldest day of the whole history
    hist.days[n - 1] = { ...hist.days[n - 1]!, t_min: -30 };
    setWeatherAdapterFactory(() => ({
      pollMs: 0,
      fetch: () => Promise.resolve(snap),
      history: () => Promise.resolve(hist),
    }));
    render(<WeatherView />);
    await screen.findByTestId('weather-history-chart');
    expect(screen.getByTestId('weather-history-range').textContent).toBe(
      '25.\u00a010. – 31.\u00a010.\u00a02026 (dnes zatím)',
    );
    fireEvent.click(screen.getByRole('tab', { name: '30\u00a0dní' }));
    expect(screen.getByTestId('weather-history-range').textContent).toBe(
      '2.\u00a010. – 31.\u00a010.\u00a02026 (dnes zatím)',
    );
    fireEvent.click(screen.getByRole('tab', { name: '365\u00a0dní' }));
    expect(screen.getByTestId('weather-history-range').textContent).toBe(
      '1.\u00a011.\u00a02025 – 31.\u00a010.\u00a02026 (dnes zatím)',
    );
    const recs = screen.getByTestId('weather-records');
    const coldest = Array.from(recs.querySelectorAll('li')).filter((li) =>
      li.textContent!.startsWith('Nejchladnější den'),
    );
    expect(coldest).toHaveLength(2);
    for (const li of coldest) expect(li.querySelector('em')!.textContent).toBe('dnes\u00a0(zatím)');
    // select today: the badge is provisional
    fireEvent.keyDown(screen.getByTestId('weather-history-chart'), { key: 'End' });
    const badge = screen.getByTestId('weather-history-record-badge').textContent!;
    expect(badge).toContain('rekord: zatím nejchladnější den za 365 dní');
    expect(badge).not.toMatch(/rekord: nejchladnější/);
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
    // plain words first, acronyms only in the disclosure
    const head = score.querySelector('.wx-ch')!.textContent!;
    expect(head).toContain('Jak často model správně trefil, jestli bude pršet');
    expect(head).toContain('předpověď na příští den');
    expect(head).not.toMatch(/ETS|Brier|mm\/h/);
    // sample once in the header, not on every row
    expect(screen.getByTestId('weather-score-rain-sample').textContent).toBe(
      '· hodnoceno 86\u00a0hodin s deštěm za 40\u00a0dní',
    );
    const list = within(score).getByTestId('weather-score-rain');
    expect(list.textContent).not.toContain('za 40');
    const names = Array.from(list.querySelectorAll('.wx-rank-name')).map((n) => n.textContent);
    expect(names[0]).toBe('Mix');
    const mix = screen.getByTestId('weather-score-rain-blend');
    expect(mix.textContent).toContain('kombinace');
    expect(mix.textContent).toContain('vážený průměr ICON-D2, ALADIN');
    // a real ellipsis right after the last name, never three dots
    expect(mix.textContent).toMatch(/ECMWF IFS…/);
    expect(score.textContent).not.toContain('...');
    expect(mix.textContent).toContain('dobré'); // ETS ≥ 0,4, neuter like „skóre“
    expect(mix.textContent).toContain('zachytil 7\u00a0z\u00a010 hodin s deštěm');
    // short visible label (one line on a phone); the full meaning stays for screen readers
    const fa = mix.querySelector('.wx-prank-fa')!;
    expect(fa.textContent).toBe('planý poplach 3\u00a0z\u00a010 ohlášených dešťových hodin');
    expect(fa.querySelector('.wx-sr')!.textContent).toBe(' ohlášených dešťových hodin');
    // within noise: tied ranks, no clear #1 vs #2
    const ranks = Array.from(list.querySelectorAll('.wx-rank-n')).map((n) => n.textContent);
    expect(ranks).toEqual(['1.–3.', '1.–3.', '1.–3.', '4.–5.', '4.–5.', '–']);
    // the tie sentence says exactly what rankPrecip does: members vs. their group's leader
    expect(mix.textContent).toContain('≈ srovnatelné s ICON-D2, ALADIN');
    const aladin = screen.getByTestId('weather-score-rain-chmi_aladin_cz_1km');
    expect(within(aladin).getByTestId('weather-score-rain-tie').textContent).toBe(
      '≈ srovnatelné s Mixem',
    );
    // GFS 0,19 vs. ECMWF IFS 0,30: 0,11 < the stated 0,13 → tied, exactly as the sentence says
    const gfs = screen.getByTestId('weather-score-rain-gfs_seamless');
    expect(within(gfs).getByTestId('weather-score-rain-tie').textContent).toBe(
      '≈ srovnatelné s ECMWF IFS',
    );
    expect(screen.getByTestId('weather-score-rain-noise').textContent).toBe(
      'Rozdíl skóre menší než 0,13 není spolehlivý – modely tak blízko nejlepšímu ze skupiny sdílí jeho pořadí (např. 1.–3.).',
    );
    // grade legend in one line, bars on an absolute 0–1 scale
    expect(screen.getByTestId('weather-score-rain-key').textContent).toContain(
      'dobré ≥\u00a00,4 · průměrné 0,2–0,39 · slabé <\u00a00,2',
    );
    const bar = mix.querySelector<HTMLElement>('.wx-prank-bar i')!;
    expect(bar.style.width).toBe('49%');
    expect(screen.getByTestId('weather-score-rain-gfs_seamless').textContent).toContain('slabé');
    // too few pairs: the actual blocker with numbers, not ranked
    const metno = screen.getByTestId('weather-score-rain-metno');
    expect(metno.textContent).toContain('zatím málo dat: 100 z 240 potřebných porovnání');
    expect(metno.textContent).not.toContain('s deštěm'); // 14 wet comparisons are enough
    expect(names.at(-1)).toBe('met.no');
    // acronyms, CI and Brier only in the disclosures
    expect(list.textContent).not.toMatch(/Brier|ETS/);
    expect(screen.getByTestId('weather-score-rain-how').textContent).toContain(
      'pod 0 = horší než náhoda',
    );
    expect(screen.getByTestId('weather-score-rain-details').textContent).toContain(
      'Jak přesná je pravděpodobnost deště',
    );
    expect(score.textContent).toContain('Kombinaci hodnotíme jen na dnech, ze kterých se neučila.');
    expect(score.textContent).not.toContain('nevznikly');
    expect(score.textContent).not.toContain('teplota podle');
    expect(screen.queryByTestId('weather-score-rain-few')).toBeNull();
  });

  it('hodnocení ETS slovy', () => {
    expect(etsGrade(0.49).word).toBe('dobré');
    expect(etsGrade(0.4).word).toBe('dobré');
    expect(etsGrade(0.3).word).toBe('průměrné');
    expect(etsGrade(0.395).word).toBe('dobré'); // shown as 0,40
    expect(etsGrade(0.394).word).toBe('průměrné'); // shown as 0,39
    expect(etsGrade(0.19).word).toBe('slabé');
    expect(etsGrade(null).word).toBe('slabé');
  });

  it('málo deštivých hodin → upozornění pro celou kartu', async () => {
    const snap = buildMockSnapshot('default');
    snap.verification_precip = snap.verification_precip!.map((r) => ({ ...r, wet_hours: 20 }));
    setWeatherAdapterFactory(() => ({ pollMs: 0, fetch: () => Promise.resolve(snap) }));
    render(<WeatherView />);
    fireEvent.click(await screen.findByTestId('weather-score-tab-rain'));
    expect(screen.getByTestId('weather-score-rain-few').textContent).toContain(
      'nejvíc 20 z 40 hodin s deštěm',
    );
  });

  it('bez dost párů ukáže prázdný stav', async () => {
    setWeatherAdapterFactory(() => createMockWeatherAdapter('calm'));
    render(<WeatherView />);
    fireEvent.click(await screen.findByTestId('weather-score-tab-rain'));
    const empty = screen.getByTestId('weather-score-rain-empty').textContent!;
    expect(empty).toContain('240');
    expect(empty).toMatch(/^Zatím málo dat: \d+ z 240/);
  });
});
