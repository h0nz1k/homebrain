import type { ConnectionLike } from '@homebrain/ha-client';
export interface EnergySetting {
  key: string;
  section: string;
  label: string;
  unit: string;
  explanation: string;
  value: string | number | null;
  editable: boolean;
  assumed?: boolean;
  connected?: boolean;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  binding?: string;
  location: string;
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
