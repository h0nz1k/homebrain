import { describe, expect, it } from 'vitest';
import { rank } from '@homebrain/signals';
import { isWeatherSnapshot } from './contract.js';
import { buildMockSnapshot } from './fixtures.js';
import { warningSeverity, weatherSignals } from './signals.js';

describe('weatherSignals', () => {
  it('fixtures odpovídají kontraktu', () => {
    for (const s of ['default', 'stale', 'calm', 'unavailable', 'storm'] as const)
      expect(isWeatherSnapshot(buildMockSnapshot(s))).toBe(true);
    expect(isWeatherSnapshot({ schema_version: 2 })).toBe(false);
  });

  it('vydá déšť, vítr a výstrahu ČHMÚ ve formátu packages/signals', () => {
    const snap = buildMockSnapshot('default');
    const signals = weatherSignals(snap);
    const ids = signals.map((s) => s.id);
    expect(ids).toContain('weather.nowcast.rain');
    expect(ids).toContain('weather.chmi.wind');
    expect(ids).not.toContain('weather.frost');
    const rain = signals.find((s) => s.id === 'weather.nowcast.rain')!;
    expect(rain.title).toBe('Déšť za ~35 min');
    expect(rain.context).toContain('radaru ČHMÚ');
    expect(rain.severity).toBe('warning');
    // Výstraha a nárazy sdílí skupinu weather.wind -> rank je sloučí.
    const ranked = rank(signals, new Date(snap.generated_at), { layout: 'desktop' });
    expect(ranked).toBeDefined();
  });

  it('mráz z blendu a "prší" ze stanice', () => {
    const snap = buildMockSnapshot('calm');
    snap.hourly = snap.hourly.map((p, i) => (i === 6 ? { ...p, t2m: -2.5 } : p));
    snap.nowcast = { ...snap.nowcast, status: 'raining', rate_mm_h: 0.8, source: 'station' };
    const signals = weatherSignals(snap);
    expect(signals.find((s) => s.id === 'weather.frost')?.severity).toBe('warning');
    expect(signals.find((s) => s.id === 'weather.nowcast.rain')?.title).toBe('Prší');
    snap.hourly = snap.hourly.map((p, i) => (i === 3 ? { ...p, gust: 21 } : p));
    expect(weatherSignals(snap).find((s) => s.id === 'weather.wind')?.severity).toBe('warning');
  });

  it('bez dat žádné signály (nic si nevymýšlí)', () => {
    expect(weatherSignals(buildMockSnapshot('unavailable'))).toEqual([]);
  });

  it('závažnost výstrahy ČHMÚ: žlutá notice, oranžová warning, červená/fialová critical', () => {
    expect([1, 2, 3, 4].map(warningSeverity)).toEqual([
      'notice',
      'warning',
      'critical',
      'critical',
    ]);
    const snap = buildMockSnapshot('default');
    const w = weatherSignals(snap).find((s) => s.id === 'weather.chmi.wind')!;
    expect(w.severity).toBe('warning');
    expect(w.valid_to).toBe(snap.warnings[0]!.expires);
    const storm = weatherSignals(buildMockSnapshot('storm'));
    expect(storm.find((s) => s.id === 'weather.chmi.thunderstorm')?.severity).toBe('critical');
  });

  it('nejistý radar: jen notice a poctivé „nejisté“; konec deště ze stanice + radaru', () => {
    const snap = buildMockSnapshot('default');
    snap.nowcast = { ...snap.nowcast, eta_min: 20, confidence: 'uncertain' };
    const rain = weatherSignals(snap).find((s) => s.id === 'weather.nowcast.rain')!;
    expect(rain.severity).toBe('notice');
    expect(rain.context).toContain('nejistý');
    const storm = weatherSignals(buildMockSnapshot('storm'));
    const stop = storm.find((s) => s.id === 'weather.nowcast.rain')!;
    expect(stop.title).toBe('Přestane pršet za ~25 min');
    expect(stop.kind).toBe('state');
  });

  it('nowcast z ICON-D2 zůstává bez vlnovky', () => {
    const snap = buildMockSnapshot('default');
    snap.nowcast = { ...snap.nowcast, source: 'om:icon_d2', confidence: null };
    expect(weatherSignals(snap).find((s) => s.id === 'weather.nowcast.rain')?.title).toBe(
      'Déšť za 35 min',
    );
  });
});
