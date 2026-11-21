/** Hlídání domu – payload of `homebrain/anomaly/list` and `…/summary` (see anomaly/ws.py). */

export type TierKey = 'observation' | 'suspicion' | 'confirmed';
export type Health = TierKey | 'ok';
export type Detector = 'baseline' | 'silent' | 'unavailable' | 'flapping' | 'dwell';

export interface FindingDetail {
  /** silent: last report (ISO) and the usual report interval. */
  last?: string;
  interval_s?: number;
  expected_since?: string;
  /** silent / unavailable / dwell: duration in minutes (HA downtime excluded). */
  minutes?: number;
  /** unavailable / dwell: start of the state (ISO). */
  since?: string;
  /** baseline: 1 h mean now, usual median for this hour, z-score. */
  value?: number;
  usual?: number;
  z?: number;
  /** baseline: the value is within what the last weeks already showed (no fault). */
  seen_before?: boolean;
  /** dwell: usual (p95) duration in minutes. */
  usual_minutes?: number;
  /** flapping: changes counted, of the state or of the availability. */
  count?: number;
  what?: 'state' | 'availability';
}

export interface Finding {
  detector: Detector;
  tier: TierKey;
  since: string;
  name: string;
  device_class: string | null;
  domain: string;
  unit: string | null;
  detail: FindingDetail;
  /** Only in `list` (owner/adults), never on the kiosk. */
  entity_id?: string;
}

export interface ReportDevice {
  name: string;
  /** Room (HA area) of the device, if assigned: „V obýváku je neobvykle teplo“. */
  area?: string | null;
  /** Watched entities of the device. */
  monitored: number;
  /** Only in `list`. */
  id?: string;
}

export interface Band {
  unit: string | null;
  /** Usual hourly range (lowest/highest hourly mean seen), local hours 0–23. */
  usual: ([number, number] | null)[];
  /** Today's 5-minute means: [minute of the local day, value]. */
  today: [number, number][];
}

export interface Report {
  key: string;
  scope: 'device' | 'integration' | 'system';
  tier: TierKey;
  since: string;
  reached: Partial<Record<TierKey, string>>;
  earliest: Partial<Record<TierKey, string>>;
  integration: string | null;
  devices: ReportDevice[];
  entities: { name: string; device_class: string | null; entity_id?: string }[];
  /** Highest number of affected entities while the report is open (never shrinks). */
  entity_count: number;
  findings: Finding[];
  /** Entities of the same device that still report (e.g. the temperature of a sensor). */
  reporting: { name: string; device_class: string | null; domain: string }[];
  hidden: 'acked' | 'muted' | null;
  ack?: 'resolved' | 'ok' | null;
  muted_until?: string | null;
  band?: Band;
}

export interface WatchedDevice {
  id: string;
  name: string;
  count: number;
  classes: string[];
}

export interface AnomalySnapshot {
  now: string;
  /** Learned at least once (otherwise the page explains that it is learning). */
  ready: boolean;
  learning: boolean;
  learned_at: string | null;
  watched: { devices: number; entities: number; learning: number; known: number };
  counts: Record<TierKey, number>;
  reports: Report[];
  /** `list` only. */
  health?: Health[];
  devices?: WatchedDevice[];
  resolved_7d?: number;
}
