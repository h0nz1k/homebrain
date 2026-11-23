import { useEffect, useMemo, useState } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { EmptyState, SegmentedControl } from '@homebrain/ui';
import { adaptEnergyEntities, selectEnergyEntityIds } from '../../adapter.js';
import { useEnergyInvoiceList } from '../../useEnergyInvoiceList.js';
import { energyStyles } from '../energyStyles.js';
import { EnergySettingsView } from '../EnergySettingsView.js';
import { InvoicesCard } from '../InvoicesCard.js';
import { OffersCard } from '../OffersCard.js';
import { EnergyScreen } from './EnergyScreen.js';
import { useEntities } from './useEntities.js';
import { useEnergyData } from './useEnergyData.js';

export { EnergyScreen } from './EnergyScreen.js';
export type { CostView } from './CostCard.js';
export { fmt } from './format.js';

export default function EnergyView({
  store,
  bindings,
  connection,
  fetchWithAuth,
  kiosk,
}: ModuleViewProps) {
  const [tab, setTab] = useState<'overview' | 'settings'>('overview');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const ids = selectEnergyEntityIds(bindings);
  const entities = useEntities(store, ids);
  const model = useMemo(
    () =>
      adaptEnergyEntities({
        bindings,
        getState: (id) => entities.find((entity) => entity?.entity_id === id),
        now,
      }),
    [bindings, entities, now],
  );
  const { history, phaseHistory, thermalHistory, cost, comparison, pv, appliances } = useEnergyData(
    { bindings, connection, entities, model, now },
  );
  const invoiceState = useEnergyInvoiceList(connection, !!kiosk);
  return (
    <>
      <style>{energyStyles}</style>
      {!kiosk && (
        <div className="en-tabs" data-tab={tab}>
          <SegmentedControl
            label="Zobrazení energie"
            hideLabel
            value={tab}
            options={[
              ['overview', 'Přehled'],
              ['settings', 'Nastavení'],
            ]}
            onChange={setTab}
          />
        </div>
      )}
      {tab === 'settings' ? (
        <EnergySettingsView connection={connection} />
      ) : ids.length ? (
        <EnergyScreen
          model={model}
          history={history}
          appliances={appliances}
          pv={pv}
          phaseHistory={phaseHistory}
          thermalHistory={thermalHistory}
          cost={cost}
          comparison={comparison}
          invoiceList={invoiceState.list}
          invoices={
            <InvoicesCard
              connection={connection}
              fetchWithAuth={fetchWithAuth}
              kiosk={kiosk}
              now={now}
              list={invoiceState.list}
              setList={invoiceState.setList}
              reload={invoiceState.reload}
            />
          }
          offers={<OffersCard connection={connection} kiosk={kiosk} />}
        />
      ) : (
        <div className="en-root">
          <EmptyState title="Modul Energie nemá nastavené entity.">
            Vazby nastavíte v integraci HomeBrain v Home Assistantu.
          </EmptyState>
        </div>
      )}
    </>
  );
}
