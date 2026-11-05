export type Modality = 'face' | 'palm';
export type Hand = 'right' | 'left';

/** One ID in the sensor (DFRobot SEN0677): face 1–1000, palm 1001–2000. No biometric data. */
export interface SensorUser {
  id: number;
  type: Modality;
  name: string;
  allowed: boolean;
}
/** HA-side labels (`/config/homebrain/access.json`): which hand, optional person grouping. */
export interface Label {
  hand?: Hand;
  person?: string;
  /** YYYY-MM-DD, stamped by HomeBrain when the enrolment succeeded. */
  enrolled_at?: string;
}
export type ReenrollReason = 'age' | 'retries' | 'success_rate';
export interface EntryHealth {
  attempts: number;
  successes: number;
  success_rate: number | null;
  retries: number;
  worst_attempt: number | null;
  score_trend: 'falling' | 'stable' | null;
}
export interface AccessMeta {
  labels: Labels;
  /** Folded person name → flags. */
  people: Record<string, { child?: boolean }>;
  settings: { notify_reenroll: boolean };
  health: Record<string, EntryHealth>;
  advice: Record<string, ReenrollReason[]>;
}
export type Labels = Record<string, Label>;

export interface AccessEventData {
  user_id?: number;
  type?: string;
  /** Modality HomeBrain asked for (biolock-firmware#8); `type` is what the sensor saw. */
  type_requested?: string;
  name?: string;
  reason?: string;
  decision?: string;
  liveness?: string;
  ok?: boolean;
  admin?: boolean;
  score?: number;
}
export interface HistoryItem extends AccessEventData {
  kind: 'recognized' | 'rejected';
  time: string;
}
export interface AccessState extends AccessMeta {
  users: SensorUser[] | null;
  listed_at: string | null;
  incomplete: boolean;
  history: HistoryItem[];
  entities?: Record<string, string>;
}
export type AccessEvent =
  | { event: 'users'; users: SensorUser[]; listed_at: string; incomplete: boolean }
  | ({ event: 'meta' } & AccessMeta)
  | {
      event: 'recognized' | 'rejected' | 'enrolled' | 'deleted';
      time: string;
      data: AccessEventData;
    };

export type AccessAction =
  | 'enroll_face'
  | 'enroll_palm'
  | 'cancel_enroll'
  | 'list_users'
  | 'set_user_allowed'
  | 'delete_user'
  | 'reset_lockout'
  | 'biometric'
  | 'service_mode'
  | 'recognition_action';

export interface Person {
  key: string;
  name: string;
  ids: number[];
  allowed: boolean;
  /** Some IDs allowed, some not (shown as a warning). */
  mixed: boolean;
  face: SensorUser[];
  right: SensorUser[];
  left: SensorUser[];
  unknown: SensorUser[];
  child: boolean;
}
