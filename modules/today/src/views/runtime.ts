import type { ModuleViewProps } from '@homebrain/ha-client';
import type { TodayAdapter } from '../data/adapter.js';
import type { TodayData } from '../data/types.js';

export function isKioskRoute(path: string, search: string): boolean {
  return path.endsWith('/kiosk') || new URLSearchParams(search).get('kiosk') === '1';
}

/**
 * Fallback without a panel-provided factory (the panel registers the live adapter in
 * apps/panel/src/modules.ts): nothing measured, never fixture values.
 */
export function createTodayAdapter(): TodayAdapter {
  const get = (): TodayData => {
    const now = new Date().toISOString();
    return {
      now,
      station: { tempC: NaN, updatedAt: now, condition: 'Počasí není k dispozici', icon: 'cloudy' },
      sun: { sunrise: now, sunset: now },
      cloudCover: 1,
      windy: false,
      hourly: [],
      ribbon: [],
      signals: [],
      ha: { connected: false, updatedAt: '' },
    };
  };
  return {
    get,
    subscribe: (callback) => {
      callback(get());
      return () => {};
    },
  };
}
export type TodayAdapterFactory = (context?: ModuleViewProps) => TodayAdapter;
let factory: TodayAdapterFactory = createTodayAdapter;
const listeners = new Set<() => void>();
export function getTodayAdapterFactory(): TodayAdapterFactory {
  return factory;
}
export function setTodayAdapterFactory(next: TodayAdapterFactory): void {
  factory = next;
  listeners.forEach((notify) => notify());
}
export const adapterFactorySource = {
  get: () => factory,
  subscribe: (notify: () => void) => {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  },
};
