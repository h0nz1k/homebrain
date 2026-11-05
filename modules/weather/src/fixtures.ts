import { CHMI_PALETTE } from './views/radarRender.js';
import type {
  BlendPoint,
  Condition,
  DailyPoint,
  ModelSeries,
  RadarBlock,
  RadarFrame,
  SourceMeta,
  WeatherSnapshot,
} from './contract.js';

/** Synthetic, deterministic snapshot for dev server, tests and screenshots. Not real data. */
export type WeatherScenario = 'default' | 'stale' | 'calm' | 'unavailable' | 'storm';
export const MOCK_NOW = '2026-10-31T09:40:00Z';

const MODELS: [string, string, string, number, number][] = [
  ['chmi_aladin_cz_1km', 'ALADIN', 'ČHMÚ · 1 km', 0.4, 72],
  ['icon_d2', 'ICON-D2', 'DWD · 2 km', -0.3, 48],
  ['geosphere_arome_austria', 'AROME-AT', 'GeoSphere · 2,5 km', 0.8, 60],
  ['icon_eu', 'ICON-EU', 'DWD · 7 km', -0.6, 120],
  ['ecmwf_ifs', 'ECMWF IFS', 'ECMWF · 9 km', 0.1, 360],
  ['ecmwf_aifs025_single', 'ECMWF AIFS', 'ECMWF · 25 km', -0.9, 360],
  ['gfs_seamless', 'GFS', 'NOAA · 13 km', 1.4, 384],
  ['ukmo_seamless', 'UKMO', 'Met Office · 2–10 km', -0.2, 168],
  ['metno', 'met.no', 'MET Norway · z HA', 0.3, 216],
];
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function baseTemp(ms: number): number {
  const hourLocal = (new Date(ms).getUTCHours() + 1) % 24;
  const days = (ms - Date.parse(MOCK_NOW)) / 86400000;
  return 6.5 - days * 1.1 + 4 * Math.sin(((hourLocal - 9) / 24) * 2 * Math.PI);
}
function basePrecip(ms: number): number {
  const h = (ms - Date.parse(MOCK_NOW)) / 3600000;
  const front = Math.exp(-(((h - 1.5) / 1.2) ** 2)) * 1.6 + Math.exp(-(((h - 20) / 4) ** 2)) * 2.4;
  return front < 0.05 ? 0 : round(front, 1);
}

export function buildMockSnapshot(scenario: WeatherScenario = 'default'): WeatherSnapshot {
  const now = Date.parse(MOCK_NOW);
  const start = now - (now % 3600000);
  const unavailable = scenario === 'unavailable';
  const calm = scenario === 'calm';
  const storm = scenario === 'storm';
  const models: ModelSeries[] = unavailable
    ? []
    : MODELS.map(([id, label, detail, offset, horizon], i) => ({
        id,
        label,
        detail,
        weight: [0.22, 0.2, 0.12, 0.08, 0.14, 0.06, 0.05, 0.08, 0.05][i]!,
        corrected: i < 3,
        points: Array.from({ length: Math.min(49, horizon) }, (_, h) => {
          const ms = start + h * 3600000;
          const t2m = round(baseTemp(ms) + offset * (0.4 + h / 40) + Math.sin(h / 5 + i) * 0.3);
          const p = calm ? 0 : Math.max(0, basePrecip(ms) + (i % 3 === 0 ? 0.3 : -0.2));
          return {
            t: iso(ms),
            t2m,
            t2m_raw: round(t2m + (i < 3 ? 0.4 : 0)),
            precip: round(p, 1),
            wind: round(4 + Math.sin(h / 6) * 2 + i * 0.2 + (h > 14 && h < 30 ? 4 : 0)),
            msl: round(1016 - h * 0.25 + i * 0.3),
          };
        }),
      }));
  const hourly: BlendPoint[] = unavailable
    ? []
    : Array.from({ length: 49 }, (_, h) => {
        const ms = start + h * 3600000;
        const temps = models.map((m) => m.points[h]?.t2m).filter((v): v is number => v != null);
        const sorted = [...temps].sort((a, b) => a - b);
        const t2m = round(baseTemp(ms) + 0.1);
        const precip = calm ? 0 : basePrecip(ms);
        const pop = calm ? 0.05 : Math.min(0.95, precip > 0 ? 0.55 + precip / 4 : 0.1);
        const hourLocal = (new Date(ms).getUTCHours() + 1) % 24;
        const night = hourLocal < 7 || hourLocal >= 17;
        const condition: Condition =
          precip >= 2.5
            ? 'heavy_rain'
            : precip >= 0.1
              ? 'rain'
              : h % 9 < 3
                ? 'partly'
                : night
                  ? 'clear'
                  : 'cloudy';
        const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? t2m;
        const p90 = sorted[Math.ceil(sorted.length * 0.9) - 1] ?? t2m;
        return {
          t: iso(ms),
          lead_h: h,
          t2m,
          p10: round(Math.min(p10, t2m - 0.3 - h / 40)),
          p90: round(Math.max(p90, t2m + 0.3 + h / 40)),
          spread: round(0.4 + h / 50, 2),
          td2m: round(t2m - 2.5),
          precip,
          pop: round(pop, 2),
          wind: round(4 + Math.sin(h / 6) * 2 + (h > 14 && h < 30 ? 4.5 : 0)),
          gust: round(8 + Math.sin(h / 6) * 3 + (h > 14 && h < 30 ? 9 : 0)),
          wind_dir: 230,
          msl: round(1016 - h * 0.25),
          cloud: 70,
          condition,
          confidence: h < 18 ? 'high' : h < 36 ? 'medium' : 'low',
          contributors: models.map((m) => ({ source: m.id, weight: m.weight })),
        };
      });
  const daily: DailyPoint[] = unavailable
    ? []
    : Array.from({ length: 10 }, (_, d) => {
        const tmax = round(11 - d * 0.6 + (d % 3) * 0.8);
        const tmin = round(3.5 - d * 0.5 + (d % 2) * 1.2);
        const spread = 0.6 + d * 0.45;
        const pop = calm ? 0.05 : [0.65, 0.85, 0.3, 0.1, 0.05, 0.15, 0.45, 0.6, 0.35, 0.2][d]!;
        const conds: Condition[] = [
          'rain',
          'rain',
          'cloudy',
          'partly',
          'clear',
          'partly',
          'cloudy',
          'rain',
          'cloudy',
          'partly',
        ];
        return {
          date: iso(Date.parse('2026-10-31T12:00:00Z') + d * 86400000).slice(0, 10),
          tmax,
          tmin,
          tmax_lo: round(tmax - spread),
          tmax_hi: round(tmax + spread),
          tmin_lo: round(tmin - spread),
          tmin_hi: round(tmin + spread),
          precip: pop > 0.5 ? round(pop * 6) : round(pop),
          pop,
          wind: [5, 11, 6, 3, 2, 3, 5, 7, 5, 4][d]!,
          gust: [9, 19, 11, 6, 4, 6, 9, 13, 9, 7][d]!,
          condition: calm ? 'partly' : conds[d]!,
          confidence: d < 3 ? 'high' : d < 6 ? 'medium' : 'low',
        };
      });
  const stale = scenario === 'stale';
  const stationAt = iso(now - (stale ? 47 * 60000 : 40000));
  const v = (
    value: number | boolean | null,
    unit: string | null,
    qc = stale ? ['stale'] : ['ok'],
  ) => ({
    v: unavailable ? null : value,
    unit,
    qc: unavailable ? ['unavailable'] : qc,
    updated_at: stationAt,
  });
  const fetched = (minutes: number) => iso(now - minutes * 60000);
  const sources: SourceMeta[] = [
    {
      id: 'station',
      label: 'Stanice',
      detail: 'měření',
      provider: 'lokální',
      license: 'local',
      status: unavailable ? 'unavailable' : stale ? 'stale' : 'fresh',
      fetched_at: stationAt,
      age_s: stale ? 2820 : 40,
    },
    ...MODELS.slice(0, 8).map(([id, label, detail], i): SourceMeta => ({
      id: `om:${id}`,
      label,
      detail,
      provider: 'Open-Meteo.com',
      license: 'CC-BY-4.0',
      status: unavailable
        ? 'unavailable'
        : id === 'icon_d2'
          ? 'partial'
          : stale && id === 'gfs_seamless'
            ? 'stale'
            : 'fresh',
      fetched_at: unavailable ? null : fetched(12 + (i % 2)),
      age_s: unavailable ? null : 720,
      error: stale && id === 'gfs_seamless' ? 'HTTP 503' : null,
    })),
    {
      id: 'metno',
      label: 'met.no',
      detail: 'MET Norway · z HA',
      provider: 'MET Norway',
      license: 'CC-BY-4.0',
      status: unavailable ? 'unavailable' : 'fresh',
      fetched_at: fetched(9),
      age_s: 540,
    },
    {
      id: 'om:daily',
      label: '10 dní',
      detail: 'ECMWF IFS · AIFS · ICON · GFS',
      provider: 'Open-Meteo.com',
      license: 'CC-BY-4.0',
      status: unavailable ? 'unavailable' : 'fresh',
      fetched_at: fetched(64),
      age_s: 3840,
    },
    {
      id: 'om:nowcast',
      label: 'Nowcast srážek',
      detail: 'ICON-D2 · 15 min',
      provider: 'Open-Meteo.com',
      license: 'CC-BY-4.0',
      status: unavailable ? 'unavailable' : 'fresh',
      fetched_at: fetched(4),
      age_s: 240,
    },
    {
      id: 'chmi:alerts',
      label: 'ČHMÚ výstrahy',
      detail: 'kraj nastaven',
      provider: 'ČHMÚ',
      license: 'CC-BY-4.0',
      status: unavailable ? 'unavailable' : 'fresh',
      fetched_at: fetched(6),
      age_s: 360,
    },
  ];
  return {
    schema_version: 1,
    generated_at: MOCK_NOW,
    location: {
      elevation_m: 480,
      region: 'CZ000',
      area: unavailable
        ? null
        : { cisorp: '0000', name: 'Testov', kraj: 'Testovací kraj', method: 'polygon' },
    },
    station: {
      status: sources[0]!.status,
      updated_at: unavailable ? null : stationAt,
      values: {
        t2m: v(7.8, '°C'),
        rh: v(84, '%'),
        td2m: v(5.3, '°C'),
        feels_like: v(5.9, '°C'),
        msl: v(1016.4, 'hPa'),
        wind: v(3.6, 'm/s'),
        gust: v(7.9, 'm/s'),
        wind_dir: v(225, null),
        rain_rate: v(0, 'mm/h'),
        rain_today: v(0.4, 'mm'),
        raining: v(false, null),
        uv: v(1, null),
        solar: v(142, null),
        indoor_t: v(21.6, '°C'),
        indoor_rh: v(47, '%'),
      },
      derived: unavailable
        ? { temp_trend_c_h: null, pressure_tendency: null, today_max: null, today_min: null }
        : {
            temp_trend_c_h: 0.6,
            pressure_tendency: { delta_hpa: -1.8, class: 'moderate', arrow: '↘' },
            today_max: { v: 7.9, at: iso(now - 5 * 60000) },
            today_min: { v: 2.4, at: '2026-10-31T05:10:00Z' },
          },
    },
    current: {
      t2m: unavailable ? null : 7.8,
      rh: unavailable ? null : 84,
      td2m: unavailable ? null : 5.3,
      wind: unavailable ? null : 3.6,
      gust: unavailable ? null : 7.9,
      wind_dir: unavailable ? null : 225,
      msl: unavailable ? null : 1016.4,
      feels_like: unavailable ? null : 5.9,
      rain_today: unavailable ? null : 0.4,
      condition: unavailable ? 'unknown' : 'cloudy',
      provenance: {
        t2m: 'station',
        rh: 'station',
        td2m: 'station',
        wind: 'station',
        msl: 'station',
        feels_like: 'station',
      },
    },
    nowcast: unavailable
      ? { status: 'unknown', eta_min: null, source: null, slots: [] }
      : {
          status: calm ? 'dry' : storm ? 'stopping' : 'soon',
          eta_min: calm ? null : storm ? 0 : 35,
          end_min: storm ? 25 : null,
          rate_mm_h: calm ? 0 : storm ? 12 : 1.8,
          intensity: calm ? 'none' : storm ? 'heavy' : 'light',
          source: calm ? 'om:icon_d2' : storm ? 'station+radar' : 'radar:chmi',
          confidence: calm ? null : storm ? 'uncertain' : 'medium',
          motion: calm
            ? undefined
            : storm
              ? { speed_kmh: null, from_deg: null, quality: 0.1, reliable: false }
              : { speed_kmh: 42, from_deg: 250, quality: 0.62, reliable: true },
          radar_profile: calm
            ? undefined
            : Array.from({ length: 13 }, (_, i) => ({
                lead_min: i * 5,
                dbz: storm ? Math.max(0, 44 - i * 8) : i * 5 >= 35 ? 24 + (i % 3) * 2 : 0,
              })),
          slots: Array.from({ length: 12 }, (_, i) => ({
            t: iso(now - (now % 900000) + (i + 1) * 900000),
            mmh: calm
              ? 0
              : round(
                  (storm
                    ? [9.5, 2.4, 0, 0, 0, 0, 0.3, 0.8, 0.4, 0, 0, 0]
                    : [0, 0, 0.4, 1.2, 1.8, 1.5, 0.9, 0.4, 0.1, 0, 0, 0])[i]!,
                  1,
                ),
          })),
        },
    hourly,
    observed: unavailable
      ? []
      : Array.from({ length: 12 }, (_, i) => {
          const ms = start - (12 - i) * 3600000;
          return { t: iso(ms), t2m: round(baseTemp(ms) - 0.3 + Math.sin(i) * 0.2) };
        }),
    models,
    daily,
    radar: unavailable || stale ? undefined : mockRadarBlock(now, storm),
    warnings: storm
      ? [
          {
            id: 'thunderstorm|Velmi silné bouřky|2026-10-31T08:00:00+00:00',
            category: 'thunderstorm',
            event: 'Velmi silné bouřky',
            level: 3,
            level_label: 'Červená',
            headline: '',
            description: 'Velmi silné bouřky s přívalovým deštěm kolem 50 mm a kroupami.',
            instruction: 'Vyhledejte úkryt v budově, nevstupujte do koryt potoků.',
            onset: '2026-10-31T08:00:00+00:00',
            expires: '2026-10-31T13:00:00+00:00',
            region_filtered: true,
            area: 'Testov',
            source: 'chmi:cap',
          },
        ]
      : scenario === 'default' || stale
        ? [
            {
              id: 'wind|wind-strong|2026-11-01T02:00:00+00:00',
              category: 'wind',
              event: 'Silný vítr',
              level: 2,
              level_label: 'Oranžová',
              headline: 'Silný vítr',
              description: 'Očekávají se nárazy větru 15 až 20 m/s, ojediněle i vyšší.',
              instruction: 'Zajistěte volně uložené předměty, nezdržujte se pod stromy.',
              onset: '2026-11-01T02:00:00+00:00',
              expires: '2026-11-01T14:00:00+00:00',
              region_filtered: true,
              area: 'Testov',
              source: 'chmi:cap',
            },
          ]
        : [],
    verification: unavailable
      ? []
      : [
          { source: 'blend', var: 't2m', lead: '0-24', n: 312, mae: 0.82, bias: 0.1, enough: true },
          {
            source: 'icon_d2',
            var: 't2m',
            lead: '0-24',
            n: 298,
            mae: 0.94,
            bias: 0.2,
            enough: true,
          },
          {
            source: 'chmi_aladin_cz_1km',
            var: 't2m',
            lead: '0-24',
            n: 312,
            mae: 1.02,
            bias: 0.4,
            enough: true,
          },
          {
            source: 'ecmwf_ifs',
            var: 't2m',
            lead: '0-24',
            n: 312,
            mae: 1.11,
            bias: -0.3,
            enough: true,
          },
          {
            source: 'metno',
            var: 't2m',
            lead: '0-24',
            n: 288,
            mae: 1.27,
            bias: -0.5,
            enough: true,
          },
          {
            source: 'gfs_seamless',
            var: 't2m',
            lead: '0-24',
            n: 312,
            mae: 1.68,
            bias: 0.9,
            enough: true,
          },
        ],
    sources,
    attribution: [
      {
        label: 'Open-Meteo.com',
        license: 'CC-BY-4.0',
        text: 'Data: Open-Meteo.com (CC BY 4.0), modely ČHMÚ, DWD, GeoSphere Austria, ECMWF, NOAA, Met Office',
        url: 'https://open-meteo.com/',
      },
      {
        label: 'MET Norway',
        license: 'CC-BY-4.0',
        text: 'Data: MET Norway (CC BY 4.0)',
        url: 'https://api.met.no/',
      },
      {
        label: 'ČHMÚ',
        license: 'CC-BY-4.0',
        text: 'Výstrahy: ČHMÚ (CC BY 4.0)',
        url: 'https://www.chmi.cz/',
      },
    ],
  };
}

/** Radar block: 12 observed frames (-55…0 min) + ČHMÚ extrapolation +10…+60 min. */
function mockRadarBlock(now: number, storm = false): RadarBlock {
  const latest = now - (now % 300000) - 300000;
  const frames: RadarFrame[] = [
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `obs-${(i - 11) * 5}`,
      t: iso(latest + (i - 11) * 300000),
      kind: 'obs' as const,
      offset_min: (i - 11) * 5,
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `fct-${(i + 1) * 10}`,
      t: iso(latest + (i + 1) * 600000),
      kind: 'fct' as const,
      offset_min: (i + 1) * 10,
    })),
  ];
  return {
    available: true,
    frames,
    available_offsets: frames.map((f) => f.offset_min),
    latest: iso(latest),
    image_path: `/api/homebrain/weather/radar/{id}${storm ? '?s=storm' : ''}`,
    size_px: 160,
    km_per_px: 0.88,
    radius_km: 3,
    legend_dbz: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60],
    origin_px: MOCK_ORIGIN,
    home_px: MOCK_HOME,
    composite_px: [460, 680],
    cz_factor: 2,
    cz_image_path: `/api/homebrain/weather/radar/cz-{id}${storm ? '?s=storm' : ''}`,
  };
}

/** Mock home (Praha centre, never the owner's home) in ČHMÚ composite px [row, col]. */
const MOCK_HOME: [number, number] = [189.8, 256.6];
const MOCK_ORIGIN: [number, number] = [110, 177];

// ---------- synthetic radar (dev mock) ----------
// Realistic-looking rain without concentric discs: value-noise fBm, domain-warped and shaped by
// a frontal band envelope + a few convective cells, advected with the motion vector, then
// quantised to the ČHMÚ 4-dBZ palette classes and encoded as a real RGBA PNG (like ČHMÚ).
const hash2 = (x: number, y: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 5): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    s += vnoise(x, y) * amp;
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    amp *= 0.5;
  }
  return s / norm;
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Synthetic reflectivity (dBZ) at composite px (x, y), `offset` minutes from now. */
export function mockDbz(x: number, y: number, offset: number, storm: boolean): number {
  // Advection ~42 km/h from WSW: sample the pattern upstream.
  const X = x - offset * 0.8;
  const Y = y + offset * 0.22;
  // Domain warp breaks up any regular shape.
  const wx = X + 14 * (fbm(X * 0.02 + 3.1, Y * 0.02) - 0.5);
  const wy = Y + 14 * (fbm(X * 0.02, Y * 0.02 + 7.7) - 0.5);
  const n = fbm(wx * 0.045, wy * 0.045);
  const fine = fbm(wx * 0.11 + 40 + offset * 0.01, wy * 0.11 - 20);
  // Flow-aligned streaks (stretched along the band) + speckle: radar texture, not airbrush.
  const streak = fbm(wx * 0.07 + wy * 0.015 + 90, wy * 0.22 - wx * 0.04, 4);
  const speck = fbm(wx * 0.32 + offset * 0.03, wy * 0.32 + 5, 3);
  // Embedded convective cores (ridged noise) inside the stratiform shield.
  const ridge = 1 - Math.abs(2 * fbm(wx * 0.07 + 11, wy * 0.07 - 3, 4) - 1);
  const cores = sstep(0.72, 0.92, ridge) * sstep(0.45, 0.65, n);
  // Front SSW-NNE west of home; s > 0 = ahead of the leading edge (east).
  const hx = MOCK_HOME[1] + (storm ? 10 : -25);
  const hy = MOCK_HOME[0];
  const len = Math.hypot(22, 120);
  const [ax, ay] = [22 / len, 120 / len];
  const s = (wx - hx) * ay - (wy - hy) * ax;
  const along = (wx - hx) * ax + (wy - hy) * ay;
  const ends = 1 - sstep(55, 95, Math.abs(along + 10 * (n - 0.5)));
  const shield =
    sstep(-62, -22, s + 30 * (n - 0.5) + 16 * (fine - 0.5)) *
    (1 - sstep(-4, 3, s + 16 * (fine - 0.5) + 10 * (streak - 0.5)));
  const line = Math.exp(-(((s + 6) / (storm ? 7 : 5)) ** 2)) * sstep(0.42, 0.7, n);
  const tex = 0.35 + 0.65 * fine + 0.35 * (streak - 0.5) + 0.12 * (speck - 0.5);
  let dbz =
    ends *
    (shield * (4 + 34 * n * tex + 12 * cores) * (0.4 + 1.2 * speck) +
      line * (storm ? 30 : 12) * (0.6 + 0.8 * streak));
  // Scattered showers elsewhere (visible at Kraj / Česko zoom).
  for (const [cx, cy, r, peak] of [
    [540, 270, 26, 46],
    [470, 120, 18, 34],
    [150, 330, 16, 30],
    [610, 330, 12, 38],
  ] as const) {
    const d = Math.hypot(wx - cx, (wy - cy) * 1.3) / r;
    dbz = Math.max(dbz, peak * Math.exp(-d * d * 1.6) * (0.45 + 0.75 * fine) - 4);
  }
  return dbz < 8 ? 0 : Math.min(62, dbz);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** Minimal RGBA PNG encoder (stored deflate blocks) - dev mock only, no dependencies. */
export function encodePng(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const blocks = Math.ceil(raw.length / 65535) || 1;
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78;
  z[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const part = raw.subarray(b * 65535, Math.min(raw.length, (b + 1) * 65535));
    z[o++] = b === blocks - 1 ? 1 : 0;
    z[o++] = part.length & 255;
    z[o++] = part.length >>> 8;
    z[o++] = ~part.length & 255;
    z[o++] = (~part.length >>> 8) & 255;
    z.set(part, o);
    o += part.length;
  }
  let a = 1;
  let b2 = 0;
  for (const v of raw) {
    a = (a + v) % 65521;
    b2 = (b2 + a) % 65521;
  }
  const ad = ((b2 << 16) | a) >>> 0;
  z.set([ad >>> 24, (ad >>> 16) & 255, (ad >>> 8) & 255, ad & 255], o);
  const chunk = (type: string, data: Uint8Array) => {
    const c = new Uint8Array(12 + data.length);
    const dv = new DataView(c.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i);
    c.set(data, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < 8 + data.length; i++) crc = CRC[(crc ^ c[i]!) & 255]! ^ (crc >>> 8);
    dv.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
    return c;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', z),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Synthetic radar frame (PNG data URL, ČHMÚ palette classes): a rain band drifting ENE. */
export function mockRadarImage(path: string): string {
  const [file = '', query = ''] = (path.split('/').pop() ?? '').split('?');
  const whole = file.startsWith('cz-');
  const offset = Number(file.replace(/^cz-/, '').replace(/^(obs|fct)-/, '')) || 0;
  const storm = query.includes('storm');
  const [w, h, k] = whole ? [340, 230, 2] : [160, 160, 1];
  const rgba = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = whole ? i * k + k / 2 : i + MOCK_ORIGIN[1] + 0.5;
      const y = whole ? j * k + k / 2 : j + MOCK_ORIGIN[0] + 0.5;
      const dbz = mockDbz(x, y, offset, storm);
      if (dbz < 4) continue;
      const cls = Math.min(CHMI_PALETTE.length - 1, Math.max(0, Math.floor(dbz / 4) - 1));
      const [r, g, b] = CHMI_PALETTE[cls]!;
      rgba.set([r, g, b, 255], (j * w + i) * 4);
    }
  return `data:image/png;base64,${toBase64(encodePng(rgba, w, h))}`;
}
