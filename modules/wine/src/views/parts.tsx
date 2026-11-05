import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { deriveQuality, useEntity } from '@homebrain/ha-client';
import type { WineRecord } from '../domain/index.js';
import type { deriveWineSignals } from '../signals.js';
import { humidityRange, temperatureRange } from '../signals.js';

type WineSignal = ReturnType<typeof deriveWineSignals>[number];
import { num1 } from './labels.js';

/* ---------- Icons (own 24px stroke set, currentColor) ---------- */
const PATHS = {
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  glass: 'M8 3h8l-.5 6a3.5 3.5 0 0 1-7 0ZM12 13v7m-4 0h8',
  grape:
    'M12 4c1 0 2-1 2-2M9 9a2 2 0 1 0 0-.1M15 9a2 2 0 1 0 0-.1M12 13a2 2 0 1 0 0-.1M9 17a2 2 0 1 0 0-.1M15 17a2 2 0 1 0 0-.1M12 21a2 2 0 1 0 0-.1',
  calendar: 'M5 6h14v14H5ZM5 10h14M9 3v4m6-4v4',
  pin: 'M12 21s6-6 6-11a6 6 0 0 0-12 0c0 5 6 11 6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  house: 'M4 11l8-6 8 6v9H4Zm6 9v-5h4v5',
  percent: 'M6 18 18 6M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  bottle: 'M10 2h4v5l2 3v12H8V10l2-3Z',
  box: 'M4 8l8-4 8 4v9l-8 4-8-4Zm0 0 8 4 8-4m-8 4v9',
  thermo: 'M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0Z',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z',
  minus: 'M5 12h14',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  upload: 'M12 16V4m-5 5 5-5 5 5M5 20h14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  tag: 'M3 12V4h8l9 9-8 8Zm5-4h.01',
  cart: 'M4 5h2l2 10h10l2-7H7m3 12h.01M17 20h.01',
  plus: 'M12 5v14M5 12h14',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  barcode: 'M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12M3 3h4M17 3h4M3 21h4M17 21h4',
  sparkle:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  pencil: 'M4 20h4L19 9l-4-4L4 16Zm9-13 4 4',
  check: 'M5 12.5l4.5 4.5L19 7',
  chevron: 'M9 5l7 7-7 7',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16m0 4v-4h-4',
} as const;
export type IconName = keyof typeof PATHS;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="wine-ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------- Ratings ---------- */
export function Stars({ value, compact }: { value: number | null; compact?: boolean }) {
  if (value === null) return <span className="wine-muted">bez hodnocení</span>;
  return (
    <span className="wine-stars" aria-label={`Hodnocení ${num1.format(value)} z 5`}>
      <span aria-hidden="true">★</span>
      {compact ? ' ' : ' '}
      {num1.format(value)}
    </span>
  );
}

const STAR_PATH =
  'M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z';

/**
 * Card rating (overview grid): filled stars for the score, outline stars for the rest of the
 * 0–5 scale, half stars when the rating has a half. Unrated wine → nothing (no placeholder).
 */
export function CardStars({ value }: { value: number | null | undefined }) {
  const uid = `wcs${useId().replace(/[^\w-]/g, '')}`;
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const v = Math.max(0, Math.min(5, Math.round(value * 2) / 2));
  return (
    <span
      className="wine-cardstars"
      role="img"
      aria-label={`Hodnocení ${num1.format(v)} z 5`}
      data-testid="wine-card-stars"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const kind = v >= n ? 'full' : v >= n - 0.5 ? 'half' : 'empty';
        const clip = `${uid}-h${n}`;
        return (
          <svg
            key={n}
            className="wine-cardstar"
            data-kind={kind}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            {kind === 'half' && (
              <clipPath id={clip}>
                <rect x="0" y="0" width="12" height="24" />
              </clipPath>
            )}
            <path className="wine-cardstar-o" d={STAR_PATH} />
            {kind !== 'empty' && (
              <path
                className="wine-cardstar-f"
                d={STAR_PATH}
                clipPath={kind === 'half' ? `url(#${clip})` : undefined}
              />
            )}
          </svg>
        );
      })}
    </span>
  );
}

/** Read-only five-star strip with half-star support (gold = rating colour). */
export function StarStrip({ value, size = 18 }: { value: number; size?: number }) {
  return (
    <span className="wine-starstrip" aria-hidden="true" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="wine-starstrip-s"
          style={{ ['--fill' as string]: `${Math.max(0, Math.min(1, value - n + 1)) * 100}%` }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

/**
 * Personal rating input (WIN-022): five 44px star buttons, whole stars;
 * pressing the current value again lowers it by a half star (4 → 3,5).
 */
export function RatingControl({
  value,
  disabled,
  onChange,
  id,
}: {
  value: number | null;
  disabled?: boolean;
  onChange: (next: number | null) => void;
  id?: string;
}) {
  return (
    <div
      className="wine-rate"
      role="group"
      aria-label="Moje hodnocení"
      id={id}
      data-testid="wine-rate"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = value === null ? 0 : Math.max(0, Math.min(1, value - n + 1));
        return (
          <button
            key={n}
            type="button"
            className="wine-rate-star"
            aria-label={`${n} z 5`}
            aria-pressed={value !== null && value >= n}
            disabled={disabled}
            style={{ ['--fill' as string]: `${fill * 100}%` }}
            onClick={() => onChange(value === n ? n - 0.5 : n)}
            data-testid={`wine-rate-${n}`}
          >
            <span aria-hidden="true">★</span>
          </button>
        );
      })}
      {value !== null && (
        <button
          type="button"
          className="wine-link wine-rate-clear"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          Smazat
        </button>
      )}
    </div>
  );
}

/* ---------- Metrics (WIN-017) ---------- */
export function computeMetrics(wines: readonly WineRecord[]) {
  const by = (c: WineRecord['color']) =>
    wines.filter((w) => w.color === c).reduce((s, w) => s + w.quantity, 0);
  const rated = wines.filter((w) => w.personalRating !== null);
  const avg = rated.length
    ? rated.reduce((s, w) => s + (w.personalRating ?? 0), 0) / rated.length
    : null;
  return {
    total: wines.reduce((s, w) => s + w.quantity, 0),
    red: by('red'),
    white: by('white'),
    rose: by('rose'),
    other: by('orange') + by('other'),
    sparkling: wines
      .filter((w) => w.wineType !== 'still' && w.wineType !== 'other')
      .reduce((s, w) => s + w.quantity, 0),
    ratingAvg: avg === null ? null : Math.round(avg * 10) / 10,
    ratingCount: rated.length,
  };
}

function Metric({
  icon,
  tone,
  value,
  label,
  sub,
  testId,
}: {
  icon: ReactNode;
  tone: string;
  value: ReactNode;
  label: string;
  sub?: string;
  testId: string;
}) {
  return (
    <li className="wine-metric" data-tone={tone} data-testid={testId}>
      <span className="wine-metric-ico">{icon}</span>
      <span className="wine-metric-txt">
        <strong>
          {value}
          {sub && <small className="wine-metric-sub"> {sub}</small>}
        </strong>
        <span>{label}</span>
      </span>
    </li>
  );
}

export function MetricsRow({ wines }: { wines: readonly WineRecord[] }) {
  const m = computeMetrics(wines);
  return (
    <ul className="wine-metrics" aria-label="Souhrn vinotéky" data-testid="wine-metrics">
      <Metric
        icon={<Icon name="bottle" />}
        tone="accent"
        value={m.total}
        label="Lahví celkem"
        testId="wine-metric-total"
      />
      <Metric
        icon={<Icon name="glass" />}
        tone="red"
        value={m.red}
        label="Červená"
        testId="wine-metric-red"
      />
      <Metric
        icon={<Icon name="glass" />}
        tone="white"
        value={m.white}
        label="Bílá"
        testId="wine-metric-white"
      />
      <Metric
        icon={<Icon name="glass" />}
        tone="rose"
        value={m.rose}
        label="Růžová"
        sub={m.other ? `+${m.other} jiné` : undefined}
        testId="wine-metric-rose"
      />
      <li className="wine-metric wine-metric--rating" data-testid="wine-metric-rating">
        <span className="wine-metric-lbl">Moje hodnocení</span>
        <span className="wine-metric-rv">
          <strong>{m.ratingAvg === null ? '–' : num1.format(m.ratingAvg)}</strong>
          {m.ratingAvg !== null && <StarStrip value={m.ratingAvg} size={16} />}
        </span>
        <span className="wine-metric-sub">
          {m.ratingCount ? `průměr z ${m.ratingCount} vín` : 'zatím bez hodnocení'}
        </span>
      </li>
    </ul>
  );
}

/* ---------- Cooler zones (WIN-018) ---------- */
type Reading = { value: number | null; quality: string; updatedAt: string } | null;
export const ZONE_KEYS = [1, 2].map((n) => ({
  n,
  temperature: `wine_zone_${n}_temperature`,
  target: `wine_zone_${n}_target`,
  humidity: `wine_zone_${n}_humidity`,
}));

export function useCooler({ store, bindings }: Pick<ModuleViewProps, 'store' | 'bindings'>) {
  const b = (key: string) => bindings[key] ?? '';
  // Fixed hook order: 2 zones × (temperature, target, humidity) + legacy cellar sensors.
  const raw = {
    z1t: useEntity(store, b('wine_zone_1_temperature')),
    z1s: useEntity(store, b('wine_zone_1_target')),
    z1h: useEntity(store, b('wine_zone_1_humidity')),
    z2t: useEntity(store, b('wine_zone_2_temperature')),
    z2s: useEntity(store, b('wine_zone_2_target')),
    z2h: useEntity(store, b('wine_zone_2_humidity')),
    temp: useEntity(store, b('wine_cellar_temperature')),
    hum: useEntity(store, b('wine_cellar_humidity')),
    light: useEntity(store, b('wine_light')),
    error: useEntity(store, b('wine_error')),
  };
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const read = (state: typeof raw.temp): Reading => {
    if (!state) return null;
    const quality = deriveQuality(state, { maxAgeMs: 2 * 3600_000, now });
    const value = Number.parseFloat(state.state);
    return {
      value: quality === 'unavailable' || !Number.isFinite(value) ? null : value,
      updatedAt: state.last_updated,
      quality,
    };
  };
  const zones: Array<{
    key: string;
    label: string;
    reading: Reading;
    target: Reading;
    humidity: Reading;
  }> = [];
  const per = [
    [raw.z1t, raw.z1s, raw.z1h],
    [raw.z2t, raw.z2s, raw.z2h],
  ] as const;
  ZONE_KEYS.forEach((k, i) => {
    if (!bindings[k.temperature]) return;
    const [t, s, h] = per[i]!;
    zones.push({
      key: `z${k.n}`,
      label: k.n === 1 ? 'Zóna 1 · horní' : 'Zóna 2 · dolní',
      reading: read(t),
      target: read(s),
      humidity: read(h),
    });
  });
  if (bindings.wine_cellar_temperature)
    zones.push({
      key: 'cellar',
      label: 'Sklep',
      reading: read(raw.temp),
      target: null,
      humidity: null,
    });
  // Read-only by design: the cooler integration resets both zones when the light is toggled.
  const lightOn = raw.light ? ['on', 'true', '1'].includes(raw.light.state.toLowerCase()) : null;
  const errState = raw.error?.state ?? null;
  const error =
    errState &&
    !['off', 'none', 'ok', '0', '', 'unknown', 'unavailable', 'false'].includes(
      errState.toLowerCase(),
    )
      ? errState
      : null;
  return {
    lightOn,
    error,
    configured: zones.length > 0 || Boolean(bindings.wine_cellar_humidity),
    zones,
    temperature: read(raw.temp),
    humidity: read(raw.hum),
  };
}
export type Cooler = ReturnType<typeof useCooler>;

function zoneTone(z: Cooler['zones'][number]): 'ok' | 'warn' | 'crit' | 'neutral' {
  const v = z.reading?.value;
  if (v == null) return 'neutral';
  const target = z.target?.value;
  if (target != null) {
    const d = Math.abs(v - target);
    return d > 3 ? 'crit' : d > 1.5 ? 'warn' : 'ok';
  }
  const r = temperatureRange(v);
  return r === 'hard' ? 'crit' : r === 'soft' ? 'warn' : 'ok';
}
const RANK = { neutral: 0, ok: 1, warn: 2, crit: 3 } as const;

export function CoolerCard({ cooler, signals }: { cooler: Cooler; signals: WineSignal[] }) {
  const h = cooler.humidity;
  let tone = cooler.zones.reduce<keyof typeof RANK>(
    (acc, z) => (RANK[zoneTone(z)] > RANK[acc] ? zoneTone(z) : acc),
    'neutral',
  );
  if (tone === 'ok' && h?.value != null && humidityRange(h.value) !== 'ok') tone = 'warn';
  if (cooler.error) tone = 'crit';
  const stale = cooler.zones.some((z) => z.reading?.quality === 'stale');
  const t = (r: Reading, unit: string) =>
    r?.value != null ? `${num1.format(r.value)} ${unit}` : `– ${unit}`;
  return (
    <section
      className="wine-cooler"
      data-testid="wine-cellar-chip"
      data-tone={cooler.configured ? tone : 'neutral'}
      aria-label="Chladnička na víno"
    >
      <header className="wine-cooler-head">
        <Icon name="thermo" />
        <strong>Chladnička na víno</strong>
        <span className="wine-cooler-state" data-tone={cooler.configured ? tone : 'neutral'}>
          <span className="wine-dot" aria-hidden="true" />
          {!cooler.configured
            ? 'Nenakonfigurováno'
            : cooler.error
              ? `Chyba: ${cooler.error}`
              : tone === 'crit'
                ? 'Mimo rozsah'
                : tone === 'warn'
                  ? 'Pozor'
                  : tone === 'ok'
                    ? 'V pořádku'
                    : 'Bez dat'}
          {stale && ' · zastaralé'}
        </span>
      </header>
      {cooler.configured ? (
        <ul className="wine-zones">
          {cooler.zones.map((z) => (
            <li key={z.key} data-tone={zoneTone(z)}>
              <span className="wine-zone-l">{z.label}</span>
              <strong>{t(z.reading, '°C')}</strong>
              <span className="wine-zone-m">
                {z.target ? `cíl ${t(z.target, '°C')}` : null}
                {z.target && z.humidity ? ' · ' : null}
                {z.humidity ? `vlhkost ${t(z.humidity, '%')}` : null}
              </span>
            </li>
          ))}
          {cooler.lightOn !== null && (
            <li data-testid="wine-cooler-light">
              <span className="wine-zone-l">Osvětlení</span>
              <strong>{cooler.lightOn ? 'zapnuto' : 'vypnuto'}</strong>
            </li>
          )}
          {h && (
            <li>
              <span className="wine-zone-l">Vlhkost</span>
              <strong>{t(h, '%')}</strong>
            </li>
          )}
        </ul>
      ) : (
        <div className="wine-cooler-empty" data-testid="wine-cooler-unconfigured">
          <p>Chladnička zatím není připojená k Home Assistantu, proto tu nejsou žádné teploty.</p>
          <p className="wine-muted">
            Po integraci (Haier) přiřaďte v nastavení HomeBrain senzory zón (horní a dolní):
            teplotu, cílovou teplotu a vlhkost; volitelně osvětlení a chybový stav. Jen ke čtení.
          </p>
        </div>
      )}
      {signals.length > 0 && (
        <ul className="wine-signals" aria-label="Upozornění vinotéky" data-testid="wine-signals">
          {signals.slice(0, 2).map((s) => (
            <li
              key={s.id}
              data-severity={s.severity}
              data-tone={
                s.tone === 'opportunity'
                  ? 'ok'
                  : s.tone === 'risk' || s.id === 'wine.window.closing'
                    ? 'warn'
                    : 'neutral'
              }
            >
              <strong>{s.title}</strong>
              <span>{s.context}</span>
            </li>
          ))}
          {signals.length > 2 && (
            <li
              data-tone="neutral"
              title={signals
                .slice(2)
                .map((s) => s.title)
                .join(' · ')}
            >
              <strong>+{signals.length - 2} další</strong>
              <span>
                {signals
                  .slice(2)
                  .map((s) => s.title)
                  .join(' · ')}
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
