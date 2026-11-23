import { useEffect, useMemo, useState } from 'react';
import type { EntityStateLike, ModuleViewProps } from '@homebrain/ha-client';
import {
  fetchEnergyHistory,
  fetchPhaseHistory,
  fetchThermalHistory,
  PHASE_HISTORY_NONE,
  THERMAL_HISTORY_NONE,
  type PhaseHistory,
  type ThermalHistory,
} from '../../adapter.js';
import {
  adaptAppliances,
  boundApplianceSlots,
  fetchApplianceCycles,
  fetchApplianceToday,
  type ApplianceExtras,
} from '../../appliances.js';
import { fetchComparison, type Comparison } from '../../compare.js';
import type { EnergyHistory, EnergyModel } from '../../contract.js';
import {
  computeCosts,
  fetchCostHours,
  hdoStatus,
  parseHdoSchedule,
  readTariffSettings,
  type CostHour,
} from '../../costs.js';
import { fetchPvForecast, PV_FORECAST_NONE, type PvForecast } from '../../pvForecast.js';
import type { CostView } from './CostCard.js';

const HISTORY_REFRESH_MS = 10 * 60_000;
const APPLIANCE_REFRESH_MS = 60_000;
const PV_REFRESH_MS = 30 * 60_000;

/** History, statistics and forecasts fetched over the HA connection, plus derived cost/appliances. */
export function useEnergyData({
  bindings,
  connection,
  entities,
  model,
  now,
}: {
  bindings: ModuleViewProps['bindings'];
  connection: ModuleViewProps['connection'];
  entities: (EntityStateLike | undefined)[];
  model: EnergyModel;
  now: number;
}) {
  const [history, setHistory] = useState<EnergyHistory>({
    hourly: {},
    daily: {},
    status: 'idle',
  });
  const bindingsKey = JSON.stringify(bindings);
  const historySlot = Math.floor(now / HISTORY_REFRESH_MS);
  useEffect(() => {
    let cancelled = false;
    if (!connection) {
      queueMicrotask(
        () => !cancelled && setHistory({ hourly: {}, daily: {}, status: 'unsupported' }),
      );
      return () => {
        cancelled = true;
      };
    }
    fetchEnergyHistory(connection, JSON.parse(bindingsKey) as Record<string, string>, Date.now())
      .then((next) => !cancelled && setHistory(next))
      .catch(() => !cancelled && setHistory({ hourly: {}, daily: {}, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const [phaseHistory, setPhaseHistory] = useState<PhaseHistory>(PHASE_HISTORY_NONE);
  useEffect(() => {
    let cancelled = false;
    if (!connection) return;
    fetchPhaseHistory(connection, JSON.parse(bindingsKey) as Record<string, string>, Date.now())
      .then((next) => !cancelled && setPhaseHistory(next))
      .catch(() => !cancelled && setPhaseHistory({ ...PHASE_HISTORY_NONE, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const [thermalHistory, setThermalHistory] = useState<ThermalHistory>(THERMAL_HISTORY_NONE);
  useEffect(() => {
    let cancelled = false;
    if (!connection) return;
    fetchThermalHistory(connection, JSON.parse(bindingsKey) as Record<string, string>, Date.now())
      .then((next) => !cancelled && setThermalHistory(next))
      .catch(() => !cancelled && setThermalHistory({ ...THERMAL_HISTORY_NONE, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const [extras, setExtras] = useState<ApplianceExtras>({});
  const applianceSlot = Math.floor(now / APPLIANCE_REFRESH_MS);
  useEffect(() => {
    let cancelled = false;
    const parsed = JSON.parse(bindingsKey) as Record<string, string>;
    if (!connection || !boundApplianceSlots(parsed).length) return;
    const at = Date.now();
    void Promise.all([
      fetchApplianceToday(connection, parsed, at).catch(() => ({})),
      fetchApplianceCycles(connection, parsed, at).catch(() => ({})),
    ]).then(([todayKwh, cycles]) => !cancelled && setExtras({ todayKwh, cycles }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, applianceSlot]);
  const [costHours, setCostHours] = useState<{
    hours: CostHour[] | null;
    status: CostView['status'];
  }>({ hours: null, status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    if (!connection) return;
    fetchCostHours(connection, JSON.parse(bindingsKey) as Record<string, string>, Date.now())
      .then(
        (hours) => !cancelled && setCostHours({ hours, status: hours ? 'ready' : 'unsupported' }),
      )
      .catch(() => !cancelled && setCostHours({ hours: null, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const cost = useMemo<CostView>(() => {
    const getState = (id: string) => entities.find((entity) => entity?.entity_id === id);
    const settings = readTariffSettings(bindings, getState);
    const hdoId = bindings.energy_tariff_hdo?.trim();
    const nextId = bindings.energy_tariff_next_change?.trim();
    const hdoState = hdoId ? getState(hdoId) : undefined;
    const hdo = hdoStatus(hdoState, now, model.timeZone, nextId ? getState(nextId) : null);
    const costs = costHours.hours
      ? computeCosts({
          hours: costHours.hours,
          settings,
          schedule: parseHdoSchedule(hdoState?.attributes),
          now,
          timeZone: model.timeZone,
          liveTodayImportKwh: model.today.gridImport.value,
          liveSpot: model.price.now.value,
        })
      : null;
    return { costs, settings, hdo, status: connection ? costHours.status : 'unsupported' };
  }, [bindings, entities, now, model, costHours, connection]);
  const [comparison, setComparison] = useState<Comparison>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    void fetchComparison(connection ?? null).then((next) => !cancelled && setComparison(next));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const [pv, setPv] = useState<PvForecast>(PV_FORECAST_NONE);
  const pvSlot = Math.floor(now / PV_REFRESH_MS);
  useEffect(() => {
    let cancelled = false;
    void fetchPvForecast(connection).then((next) => !cancelled && setPv(next));
    return () => {
      cancelled = true;
    };
  }, [connection, pvSlot]);
  const appliances = useMemo(
    () =>
      adaptAppliances({
        bindings,
        getState: (id) => entities.find((entity) => entity?.entity_id === id),
        now,
        houseTodayKwh: model.today.house.value,
        extras,
      }),
    [bindings, entities, now, model.today.house.value, extras],
  );
  return { history, phaseHistory, thermalHistory, cost, comparison, pv, appliances };
}
