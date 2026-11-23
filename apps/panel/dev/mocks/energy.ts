import {
  applyFlowScenario,
  createCompareDemo,
  createEnergyDemo,
  createInvoicesDemo,
  createOffersDemo,
  createPvForecastDemo,
  FLOW_SCENARIOS,
  settingsDemo,
  type CompareScenario,
  type DishwasherScenario,
  type EnergyScenario,
  type FlowScenario,
  type PvForecastScenario,
} from '@homebrain/module-energy';
import { devQuery, type DevHass, type WsHandlers } from './shared.js';

/**
 * Energie: synthetic meters, PV forecast, invoices, offers and settings.
 * `?energy=<scenario>`, `?dishwasher=<scenario>`, `?flow=<scenario>`, `?pv=<scenario>`.
 */
export function addEnergyDemo({ hass, now }: DevHass) {
  const energyDemo = createEnergyDemo(
    now.getTime(),
    (new URLSearchParams(location.search).get('energy') as EnergyScenario | null) ?? 'day',
    'Europe/Prague',
    (new URLSearchParams(location.search).get('dishwasher') as DishwasherScenario | null) ??
      'running',
  );
  const flowScenario = new URLSearchParams(location.search).get('flow') as FlowScenario | null;
  if (flowScenario && flowScenario in FLOW_SCENARIOS)
    energyDemo.states = Object.fromEntries(
      applyFlowScenario(Object.values(energyDemo.states), flowScenario).map((s) => [
        s.entity_id,
        s,
      ]),
    );
  Object.assign(hass.states, energyDemo.states);
  const pvDemo = createPvForecastDemo(
    now.getTime(),
    (new URLSearchParams(location.search).get('pv') as PvForecastScenario | null) ?? 'fallback',
  );
  // Energie „Faktury“: `?faktury=none` (empty list), `?role=adult` (read-only), `?role=kiosk` (hidden).
  const invoiceRole = devQuery.get('role') ?? 'owner';
  const invoicesDemo = createInvoicesDemo(
    Date.now(),
    devQuery.get('faktury') === 'none' ? 'none' : 'one',
  );
  hass.fetchWithAuth = async (path: string, init?: RequestInit) => {
    await new Promise((r) => setTimeout(r, 300));
    if (path === '/api/homebrain/energy/invoices' && init?.method === 'POST') {
      if (invoiceRole !== 'owner') return new Response('{"message":"admin only"}', { status: 403 });
      return new Response(JSON.stringify(invoicesDemo.upload()), { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };
  // Energie „Srovnání nabídek“: `?nabidky=empty|loading`, roles as for invoices.
  const offersDemo = createOffersDemo(
    Date.now(),
    (['empty', 'loading'] as const).find((s) => s === devQuery.get('nabidky')) ?? 'full',
  );
  const invoiceGate = () => {
    if (invoiceRole !== 'owner' && invoiceRole !== 'adult') throw new Error('unauthorized');
  };
  const handlers: WsHandlers = {
    'energy/solar_forecast': pvDemo.ha,
    'homebrain/energy/invoices/list': () => {
      invoiceGate();
      return invoicesDemo.list(invoiceRole === 'owner');
    },
    'homebrain/energy/invoices/compare': (m: { invoice_id: string }) => {
      invoiceGate();
      return invoicesDemo.compare(m.invoice_id);
    },
    'homebrain/energy/invoices/save': (m: { invoice_id: string; fields: never }) =>
      invoicesDemo.save(m.invoice_id, m.fields),
    'homebrain/energy/invoices/delete': (m: { invoice_id: string }) =>
      invoicesDemo.remove(m.invoice_id),
    'homebrain/energy/offers/get': (m: { type: string }) => {
      invoiceGate();
      return offersDemo.handle(m, invoiceRole === 'owner');
    },
    'homebrain/energy/offers/compare': (m: { type: string }) => {
      invoiceGate();
      return offersDemo.handle(m, invoiceRole === 'owner');
    },
    'homebrain/energy/offers/save': (m: { type: string }) =>
      offersDemo.handle(m, invoiceRole === 'owner'),
    'homebrain/energy/offers/delete': (m: { type: string }) =>
      offersDemo.handle(m, invoiceRole === 'owner'),
    'homebrain/energy/settings/get': () => ({
      rows: settingsDemo.rows.map((row) =>
        row.editable && new URLSearchParams(location.search).get('role') === 'adult'
          ? { ...row, editable: false, source: 'Správce', location: 'jen správce v HomeBrainu' }
          : row,
      ),
    }),
    'homebrain/energy/settings/set': (message: { key: string; value: number }) => {
      const row = settingsDemo.rows.find((item) => item.key === message.key);
      if (!row?.editable || new URLSearchParams(location.search).get('role') === 'adult')
        throw new Error('Nepovoleno');
      row.value = message.value;
      return structuredClone(settingsDemo);
    },
    'homebrain/energy/pv_forecast': pvDemo.server,
    // `?srovnani=full|nodata|unconfigured`: Energie period comparison (synthetic).
    'homebrain/energy/compare': () => {
      const s = (new URLSearchParams(location.search).get('srovnani') ?? 'full') as CompareScenario;
      return s === 'unconfigured' ? { status: 'unconfigured' } : createCompareDemo(s, Date.now());
    },
  };
  return {
    demo: energyDemo,
    bindings: energyDemo.bindings,
    handlers,
    /** Tariff edits (`input_number.set_value`) update the invoice comparison. */
    onCallService(message: unknown) {
      const call = message as {
        domain?: string;
        service_data?: { value?: number };
        target?: { entity_id?: string };
      };
      if (call.domain === 'input_number' && call.target?.entity_id)
        invoicesDemo.setTariff(call.target.entity_id, Number(call.service_data?.value));
    },
  };
}
