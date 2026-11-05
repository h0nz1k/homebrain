/** Neutral example entity ids (ESPHome device `biolock`); bind the real entities per module key in HA (binding wins). */
export const ENTITY_DEFAULTS = {
  biometric: 'switch.biolock_biometricke_odemykani',
  service: 'switch.biolock_servisni_rezim',
  action: 'select.biolock_akce_pri_rozpoznani',
  sensorState: 'sensor.biolock_stav_snimace',
  sensorOnline: 'binary_sensor.biolock_snimac_online',
  wifi: 'sensor.biolock_wi_fi_signal',
  connected: 'binary_sensor.biolock_stav_pripojeni',
  nukiConnected: 'binary_sensor.biolock_lock_connected',
  nukiPaired: 'binary_sensor.biolock_lock_paired',
  nukiBattery: 'sensor.biolock_lock_battery',
  lock: 'lock.front_door',
  lockout: 'binary_sensor.biolock_blokace_po_neuspesich',
} as const;
