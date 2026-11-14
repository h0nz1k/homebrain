import type { ConnectionLike } from '@homebrain/ha-client';
export interface EnergySetting {
  key: string;
  section: string;
  label: string;
  unit: string;
  /** Visible one-line subtitle. */
  summary: string;
  /** Tooltip: meaning, practical consequence, recommended range (never repeats `summary`). */
  explanation: string;
  value: string | number | null;
  editable: boolean;
  assumed?: boolean;
  connected?: boolean;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  binding?: string;
  /** Binding rows: whether an entity is assigned (admin assigns it in HA). */
  assigned?: boolean;
  /** Bound entity id; sent to the admin only. */
  entity_id?: string | null;
  /** Read-only rows: where the value is changed (chip text and sentence). */
  source?: string | null;
  location?: string | null;
}
export interface EnergySettings {
  rows: EnergySetting[];
}
export function getEnergySettings(connection: ConnectionLike) {
  return connection.sendMessagePromise<EnergySettings>({ type: 'homebrain/energy/settings/get' });
}
export function setEnergySetting(connection: ConnectionLike, key: string, value: number) {
  const message = { type: 'homebrain/energy/settings/set', key, value };
  return connection.sendMessagePromise<EnergySettings>(message);
}
