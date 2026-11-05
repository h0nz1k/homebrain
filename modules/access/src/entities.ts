/** Neutral example entity ids (ESPHome device `biolock`); bind the real entities per module key in HA (binding wins). */
export const ENTITY_DEFAULTS = {
  biometric: 'switch.biolock_biometricke_odemykani',
  service: 'switch.biolock_servisni_rezim',
  action: 'select.biolock_akce_pri_rozpoznani',
  sensorState: 'sensor.biolock_stav_snimace',
  sensorOnline: 'binary_sensor.biolock_snimac_online',
  wifi: 'sensor.biolock_wi_fi_signal',
  connected: 'binary_sensor.biolock_stav_pripojeni',
  // BioLock firmware entity names (ESPHome device `biolock`, Czech names from common.yaml)
  nukiConnected: 'binary_sensor.biolock_nuki_pripojeno',
  nukiPaired: 'binary_sensor.biolock_nuki_sparovano',
  nukiBattery: 'sensor.biolock_nuki_baterie',
  lockout: 'binary_sensor.biolock_blokace_po_neuspesich',
  lastError: 'sensor.biolock_posledni_chyba',
  lastUser: 'sensor.biolock_posledni_uzivatel',
  // biolock-firmware#9 live enrolment progress (missing on older firmware)
  enrollProgress: 'sensor.biolock_prubeh_zapisu',
  enrollHint: 'sensor.biolock_napoveda_zapisu',
  enrollRemaining: 'sensor.biolock_zapis_zbyva',
  // Smart lock: the integration resolves the real lock device (Nuki) – these are only fallbacks.
  lock: 'lock.front_door',
  lockBattery: 'sensor.front_door_battery',
  lockBatteryCritical: 'binary_sensor.front_door_battery_critical',
  lockAction: 'event.front_door_action',
} as const;
