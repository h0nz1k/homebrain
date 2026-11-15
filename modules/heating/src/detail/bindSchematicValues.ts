import { fmtHpPower, fmtT } from '../model.js';
import { solarConfigured } from '../solar.js';
import type { HeatingSnapshot } from '../types.js';
import type { DetailSchematicModel } from './types.js';

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return `${Math.round(v)} %`;
}

function hpState(snap: HeatingSnapshot): string {
  const hp = snap.heat_pump;
  if (snap.mode.main_switch === false) return 'Vypnuto';
  const run =
    hp.compressor_on === null ? '—' : hp.compressor_on ? `Běží · ${fmtHpPower(hp.power_w)}` : 'Stojí · 0 W';
  return run;
}

function heatLabel(snap: HeatingSnapshot): string {
  if (snap.pumps.heating === true) return fmtT(snap.house.supply_temp);
  if (snap.pumps.heating === false) return 'Netopí se';
  return '—';
}

function divValve(snap: HeatingSnapshot): string {
  if (snap.dhw.valve_to_dhw === true) return 'Do TUV';
  if (snap.dhw.valve_to_dhw === false) return 'Do nádrže';
  return '—';
}

/** Map snapshot fields onto schematic chip ids (no invented sensors). */
export function bindSchematicValues(
  model: DetailSchematicModel,
  snap: HeatingSnapshot,
): Record<string, { caption: string; value: string; statusDot?: 'on' | 'off' | 'unknown' }> {
  const solar = snap.extras.solar;
  const pool = snap.extras.pool;
  const fish = snap.extras.fish;
  const showSolar = solarConfigured(snap);
  const hp = snap.heat_pump;

  const values: Record<string, { caption: string; value: string; statusDot?: 'on' | 'off' | 'unknown' }> = {};
  for (const label of model.labels) {
    values[label.id] = { caption: label.caption, value: label.value };
  }

  values.outdoor = { caption: 'Venku', value: fmtT(snap.outdoor.temp) };
  values.tap = { caption: 'Odběr teplé vody', value: fmtT(snap.dhw.temp) };
  values.dhw = { caption: 'Teplá voda', value: fmtT(snap.dhw.temp) };
  values.bottom = { caption: 'Nádrž dole', value: fmtT(snap.tank.bottom) };
  values['tank-top'] = { caption: 'Nádrž nahoře', value: fmtT(snap.tank.top) };
  values.hp = {
    caption: 'Tepelné čerpadlo',
    value: hpState(snap),
    statusDot:
      hp.compressor_on === true ? 'on' : hp.compressor_on === false ? 'off' : 'unknown',
  };
  values.heat = { caption: 'Topení', value: heatLabel(snap) };
  values.div = { caption: 'Přepínací ventil', value: divValve(snap) };
  values.mix = { caption: 'Směšování', value: fmtPct(snap.house.mixing_valve_pct) };
  values.charge = {
    caption: 'Nabíjení',
    value: snap.pumps.secondary === null ? '—' : snap.pumps.secondary ? 'Zapnuto' : 'Stojí',
  };
  if (showSolar && solar) {
    values.solar = { caption: 'Solární kolektor', value: fmtT(solar.temp) };
    values['solar-pump'] = {
      caption: 'Solární čerpadlo',
      value:
        solar.pump_pct !== null
          ? fmtPct(solar.pump_pct)
          : solar.pump === true
            ? '100 %'
            : solar.pump === false
              ? '0 %'
              : '—',
    };
  }
  if (pool) {
    values.pool = { caption: 'Voda v bazénu', value: pool.temp !== null ? fmtT(pool.temp) : '—' };
    values['pool-hall-title'] = { caption: 'Bazén', value: '' };
    values['pool-floor'] = {
      caption: 'Podlahovka haly',
      value: pool.heating_pump === true ? 'Zapnuto' : pool.heating_pump === false ? 'Stojí' : '—',
    };
  }
  if (fish) {
    values.fish = {
      caption: 'Rybárna',
      value: fish.temp !== null ? fmtT(fish.temp) : '—',
    };
  }

  const pair = `${fmtT(hp.condenser_out)} / ${fmtT(hp.return_temp)}`.replace('— / —', '—');
  values['hp-pair'] = { caption: 'Výstup / zpátečka', value: pair };

  return values;
}

/** Scenario index 1–5 for pipe activity highlighting (aligned with mock activities). */
export function schematicScenarioId(snap: HeatingSnapshot): number {
  if (snap.mode.main_switch === false) return 5;
  if (snap.extras.pool?.heating_pump === true) return 4;
  if (snap.activity === 'house_circuit') return 3;
  if (snap.activity === 'heating_dhw' || snap.activity === 'dhw_only') return 2;
  if (snap.extras.solar?.state === 'heating') return 1;
  return 3;
}