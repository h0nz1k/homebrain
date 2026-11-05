import type { Signal } from '@homebrain/signals';
import type { WeatherSnapshot } from './contract.js';

const SOURCE = 'Počasí · HomeBrain';
const fmt = (v: number, d = 1) => v.toLocaleString('cs-CZ', { maximumFractionDigits: d });
const addMin = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60000).toISOString();

/** Weather → Dnes signals (packages/signals format). Pure; no fixtures substituted. */
export function weatherSignals(
  snapshot: WeatherSnapshot,
  now = Date.parse(snapshot.generated_at),
): Signal[] {
  const nowIso = new Date(now).toISOString();
  const signals: Signal[] = [];
  const source = (updated: string | null, staleAfter: number) => ({
    name: SOURCE,
    updated_at: updated ?? snapshot.generated_at,
    stale_after_s: staleAfter,
  });
  const nc = snapshot.nowcast;
  const radar = nc.source?.includes('radar') ?? false;
  const unsure = nc.confidence === 'uncertain' || nc.confidence === 'low';
  const radarNote = radar
    ? unsure
      ? ' Pohyb srážek je nejistý – odhad se může výrazně lišit.'
      : ' Radar ČHMÚ + extrapolace.'
    : '';
  if (nc.status === 'raining' || nc.status === 'stopping') {
    const stops = nc.status === 'stopping' && nc.end_min != null;
    signals.push({
      id: 'weather.nowcast.rain',
      module: 'weather',
      group: 'weather.rain',
      kind: 'state',
      severity: 'notice',
      tone: 'risk',
      relevance: 0.6,
      valid_from: nowIso,
      valid_to: addMin(nowIso, stops ? nc.end_min! : 30),
      title: stops ? `Přestane pršet za ~${nc.end_min} min` : 'Prší',
      context:
        (nc.source?.startsWith('station') ? 'Stanice měří srážky.' : 'Radar nad domem.') +
        radarNote,
      ...(nc.rate_mm_h != null && {
        value: { v: fmt(nc.rate_mm_h), unit: 'mm/h', label: 'intenzita' },
      }),
      action: { type: 'navigate', label: 'Počasí', href: '/weather' },
      source: source(snapshot.station.updated_at, 900),
    });
  } else if (nc.status === 'soon' && nc.eta_min != null && nc.eta_min <= 120) {
    const approx = radar ? '~' : '';
    signals.push({
      id: 'weather.nowcast.rain',
      module: 'weather',
      group: 'weather.rain',
      kind: 'event',
      // An uncertain radar ETA never escalates beyond a notice.
      severity: nc.eta_min <= 45 && !unsure ? 'warning' : 'notice',
      tone: 'risk',
      relevance: unsure ? 0.5 : 0.7,
      valid_from: addMin(nowIso, nc.eta_min),
      valid_to: addMin(nowIso, nc.eta_min + 60),
      title: nc.eta_min <= 2 ? 'Déšť každou chvíli' : `Déšť za ${approx}${nc.eta_min} min`,
      context: radar
        ? `Podle radaru ČHMÚ${nc.motion?.speed_kmh ? ` (srážky se blíží ~${nc.motion.speed_kmh} km/h)` : ''}.${radarNote.replace(' Radar ČHMÚ + extrapolace.', '')}`
        : 'Podle nowcastu ICON-D2 (15 min); stanice zatím neměří srážky.',
      ...(nc.rate_mm_h != null && { value: { v: fmt(nc.rate_mm_h), unit: 'mm/h', label: 'max' } }),
      action: { type: 'navigate', label: 'Počasí', href: '/weather' },
      source: source(snapshot.generated_at, radar ? 900 : 1800),
    });
  }
  // Frost: blended (bias-corrected) temperature over the next 18 h.
  const next = snapshot.hourly.filter((p) => p.lead_h >= 0 && p.lead_h <= 18 && p.t2m != null);
  const coldest = next.reduce<(typeof next)[number] | null>(
    (min, p) => (min === null || p.t2m! < min.t2m! ? p : min),
    null,
  );
  if (coldest && coldest.t2m! <= 1) {
    signals.push({
      id: 'weather.frost',
      module: 'weather',
      group: 'weather.frost',
      kind: 'event',
      severity: coldest.t2m! <= -2 ? 'warning' : 'notice',
      tone: 'risk',
      relevance: 0.55,
      valid_from: coldest.t,
      valid_to: addMin(coldest.t, 180),
      title: coldest.t2m! <= 0 ? 'Mráz v noci' : 'Riziko přízemního mrazu',
      context: `Nejnižší teplota ${fmt(coldest.t2m!)} °C (mix modelů po korekci).`,
      value: { v: fmt(coldest.t2m!), unit: '°C', label: 'minimum' },
      source: source(snapshot.generated_at, 3 * 3600),
    });
  }
  const windy = snapshot.hourly
    .filter((p) => p.lead_h >= 0 && p.lead_h <= 12 && p.gust != null)
    .reduce((max, p) => Math.max(max, p.gust!), 0);
  const stationGust = snapshot.station.values.gust?.v;
  const gust = Math.max(windy, typeof stationGust === 'number' ? stationGust : 0);
  if (gust >= 15) {
    signals.push({
      id: 'weather.wind',
      module: 'weather',
      group: 'weather.wind',
      kind: 'event',
      severity: gust >= 20 ? 'warning' : 'notice',
      tone: 'risk',
      relevance: 0.5,
      valid_from: nowIso,
      valid_to: addMin(nowIso, 12 * 60),
      title: 'Silné nárazy větru',
      context: `Nárazy až ${fmt(gust, 0)} m/s během 12 h.`,
      value: { v: fmt(gust * 3.6, 0), unit: 'km/h', label: 'nárazy až' },
      source: source(snapshot.generated_at, 3 * 3600),
    });
  }
  for (const w of snapshot.warnings) {
    signals.push({
      id: `weather.chmi.${w.category || 'other'}`,
      module: 'weather',
      group: w.category === 'wind' ? 'weather.wind' : `weather.chmi.${w.category}`,
      kind: 'event',
      severity: warningSeverity(w.level),
      tone: 'risk',
      relevance: 0.6 + w.level * 0.08,
      valid_from: w.onset ?? nowIso,
      valid_to: w.expires ?? addMin(w.onset ?? nowIso, 24 * 60),
      title: `${w.level_label} výstraha: ${w.event}`,
      // expires drives valid_to, so the card disappears exactly when ČHMÚ ends the warning
      context: w.instruction || w.description || 'Výstraha ČHMÚ',
      action: { type: 'navigate', label: 'Detail', href: '/weather#vystrahy' },
      source: { name: 'ČHMÚ výstrahy', updated_at: snapshot.generated_at, stale_after_s: 3600 },
    });
  }
  return signals;
}

/** Owner decision (#27): žlutá → notice, oranžová → warning, červená/fialová → critical. */
export function warningSeverity(level: number): 'notice' | 'warning' | 'critical' {
  return level >= 3 ? 'critical' : level === 2 ? 'warning' : 'notice';
}
