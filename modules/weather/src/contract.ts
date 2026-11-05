/** Contract of `homebrain/weather/get` (custom_components/homebrain/weather/coordinator.py). */
export type SourceStatus = 'fresh' | 'stale' | 'partial' | 'unavailable' | 'unbound';
export type Condition =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'overcast'
  | 'rain'
  | 'heavy_rain'
  | 'snow'
  | 'thunder'
  | 'fog'
  | 'unknown';
export type Confidence = 'high' | 'medium' | 'low';

export interface StationValue {
  v: number | boolean | null;
  unit: string | null;
  qc: string[];
  updated_at?: string;
}
export interface PressureTendency {
  delta_hpa: number;
  class: string;
  arrow: string;
}
export interface Extreme {
  v: number;
  at: string;
}
export interface StationBlock {
  status: SourceStatus;
  updated_at: string | null;
  values: Record<string, StationValue>;
  derived: {
    temp_trend_c_h: number | null;
    pressure_tendency: PressureTendency | null;
    today_max: Extreme | null;
    today_min: Extreme | null;
  };
}
export interface CurrentConditions {
  t2m: number | null;
  rh: number | null;
  td2m: number | null;
  wind: number | null;
  gust: number | null;
  wind_dir: number | null;
  msl: number | null;
  feels_like: number | null;
  rain_today: number | null;
  condition: Condition;
  provenance: Record<string, 'station' | 'blend' | 'derived'>;
}
export interface NowcastSlot {
  t: string;
  mmh: number | null;
}
export type NowcastConfidence = 'high' | 'medium' | 'low' | 'uncertain';
export interface RadarMotion {
  speed_kmh: number | null;
  /** Direction the echoes come from (0 = north), null when unreliable. */
  from_deg: number | null;
  quality: number;
  reliable: boolean;
}
export interface Nowcast {
  status: 'raining' | 'stopping' | 'soon' | 'dry' | 'unknown';
  eta_min: number | null;
  /** Minutes until rain stops (status 'stopping'). */
  end_min?: number | null;
  confidence?: NowcastConfidence | null;
  motion?: RadarMotion;
  radar_profile?: { lead_min: number; dbz: number }[];
  radar_method?: string;
  rate_mm_h?: number | null;
  intensity?: string | null;
  source: string | null;
  slots: NowcastSlot[];
}
export interface Contributor {
  source: string;
  weight: number;
}
export interface BlendPoint {
  t: string;
  lead_h: number;
  t2m: number | null;
  p10: number | null;
  p90: number | null;
  spread: number | null;
  td2m: number | null;
  precip: number | null;
  pop: number | null;
  wind: number | null;
  gust: number | null;
  wind_dir: number | null;
  msl: number | null;
  cloud: number | null;
  condition: Condition;
  confidence: Confidence;
  contributors: Contributor[];
}
export interface ModelPoint {
  t: string;
  t2m: number | null;
  t2m_raw: number | null;
  precip: number | null;
  wind: number | null;
  msl: number | null;
}
export interface ModelSeries {
  id: string;
  label: string;
  detail: string;
  weight: number;
  corrected: boolean;
  points: ModelPoint[];
}
export interface DailyPoint {
  date: string;
  tmax: number | null;
  tmin: number | null;
  tmax_lo: number | null;
  tmax_hi: number | null;
  tmin_lo: number | null;
  tmin_hi: number | null;
  precip: number | null;
  pop: number | null;
  wind: number | null;
  gust: number | null;
  condition: Condition;
  confidence: Confidence;
}
export interface WeatherWarning {
  id: string;
  category: string;
  event: string;
  level: 1 | 2 | 3 | 4;
  level_label: string;
  headline: string;
  description: string;
  instruction: string;
  onset: string | null;
  expires: string | null;
  region_filtered: boolean;
  /** ORP name the warning was filtered for (CAP feed). */
  area?: string | null;
  source?: string;
}
export interface RadarFrame {
  id: string;
  t: string;
  kind: 'obs' | 'fct';
  offset_min: number;
}
export interface RadarBlock {
  available: boolean;
  frames: RadarFrame[];
  /** WEA-014: offsets (min vs. newest observed frame) the UI may play. */
  available_offsets: number[];
  latest: string | null;
  /** Authenticated HA view; `{id}` is replaced by the frame id. */
  image_path: string;
  size_px: number;
  km_per_px: number;
  radius_km: number;
  legend_dbz: number[];
  /** Crop top-left [row, col] in ČHMÚ composite px (bundled basemap alignment). */
  origin_px?: [number, number];
  /** Home [row, col] in composite px. */
  home_px?: [number, number];
  /** Composite size [rows, cols]. */
  composite_px?: [number, number];
  /** Whole-composite frames are max-pooled by this factor. */
  cz_factor?: number;
  /** Authenticated whole-composite ("Česko" zoom) frames; `{id}` = frame id. */
  cz_image_path?: string;
}
export interface HomeArea {
  cisorp: string;
  name: string;
  kraj: string | null;
  method: 'polygon' | 'nearest' | 'option';
}
export interface VerificationRow {
  source: string;
  var: 't2m';
  lead: string;
  n: number;
  mae: number;
  bias: number;
  enough: boolean;
}
export interface SourceMeta {
  id: string;
  label: string;
  detail: string;
  provider: string;
  license: string;
  status: SourceStatus;
  fetched_at: string | null;
  age_s: number | null;
  horizon_h?: number | null;
  error?: string | null;
}
export interface Attribution {
  label: string;
  license: string;
  text: string;
  url: string;
}
export interface WeatherSnapshot {
  schema_version: 1;
  generated_at: string;
  location: { elevation_m: number | null; region: string | null; area?: HomeArea | null };
  station: StationBlock;
  current: CurrentConditions;
  nowcast: Nowcast;
  hourly: BlendPoint[];
  observed: { t: string; t2m: number }[];
  models: ModelSeries[];
  daily: DailyPoint[];
  warnings: WeatherWarning[];
  radar?: RadarBlock;
  verification: VerificationRow[];
  sources: SourceMeta[];
  attribution: Attribution[];
}

export function isWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WeatherSnapshot>;
  return (
    v.schema_version === 1 &&
    typeof v.generated_at === 'string' &&
    Array.isArray(v.hourly) &&
    Array.isArray(v.daily) &&
    Array.isArray(v.sources) &&
    typeof v.station === 'object' &&
    typeof v.current === 'object'
  );
}
