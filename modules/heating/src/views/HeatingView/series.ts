import type { HistoryKey } from '../../types.js';

export const SERIES: Record<HistoryKey, { label: string; color: string }> = {
  tank_bottom: { label: 'Nádrž dole', color: 'var(--ht-c-tank)' },
  tank_top: { label: 'Nádrž nahoře', color: 'var(--ht-c-top)' },
  dhw_temp: { label: 'Teplá voda', color: 'var(--ht-c-dhw)' },
  house_supply_temp: { label: 'Do domu', color: 'var(--ht-c-supply)' },
  outdoor_temp: { label: 'Venku', color: 'var(--ht-c-out)' },
  house_ref_temp: { label: 'Doma', color: 'var(--ht-c-home)' },
  compressor_runtime_h: { label: 'Běh kompresoru', color: 'var(--ht-c-tank)' },
};
export const OVERLAYS: HistoryKey[] = [
  'tank_bottom',
  'dhw_temp',
  'house_supply_temp',
  'outdoor_temp',
];
export const DAY_KEYS: HistoryKey[] = ['tank_bottom', 'dhw_temp', 'outdoor_temp'];
export const EFF_KEYS: HistoryKey[] = ['outdoor_temp', 'compressor_runtime_h'];
