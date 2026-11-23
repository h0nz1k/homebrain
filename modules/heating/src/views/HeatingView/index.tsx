import { useMemo, useState, type ReactNode } from 'react';
import { navigateTab, type ModuleViewProps } from '@homebrain/ha-client';
import { Card, EmptyState, SegmentedControl, Skeleton } from '@homebrain/ui';
import { getHeatingApi } from '../../api.js';
import { activityModel } from '../../model.js';
import { heatingStyles } from '../styles.js';
import { FaultsTab } from './FaultsTab.js';
import { ModesTab } from './ModesTab.js';
import { NowTab } from './NowTab.js';
import { RoomsTab } from './RoomsTab.js';
import { SeasonsTab } from './SeasonsTab.js';
import { TrendsTab } from './TrendsTab.js';
import { TABS, tabFromRoute, type TabId } from './tabs.js';
import { ago, nowMs } from './time.js';
import { useHeating } from './useHeating.js';

export default function HeatingView({ connection, route, kiosk }: ModuleViewProps) {
  const api = useMemo(() => getHeatingApi(connection), [connection]);
  const [tab, setTab] = useState<TabId>(() => tabFromRoute(route?.path));
  const { snap, error } = useHeating(kiosk ? null : api);
  const selectTab = (next: TabId) => {
    setTab(next);
    try {
      navigateTab(next === 'ted' ? '/heating' : `/heating/${next}`, next === 'ted');
    } catch {
      /* outside HA */
    }
  };
  let body: ReactNode;
  if (kiosk)
    body = (
      <EmptyState title="Topení je na nástěnce jen ve Dnes">
        Podrobnosti najdete v telefonu nebo počítači.
      </EmptyState>
    );
  else if (!api)
    body = (
      <EmptyState title="Topení není k dispozici">
        Potřebuje připojení k Home Assistantu.
      </EmptyState>
    );
  else if (error && !snap) body = <EmptyState title="Topení se nenačetlo">{error}</EmptyState>;
  else if (!snap)
    body = (
      <div className="ht-loading">
        <Skeleton variant="block" height="360px" />
        <Skeleton variant="block" height="120px" />
      </div>
    );
  else if (snap.source === 'unconfigured') {
    const act = activityModel(snap, nowMs());
    body = (
      <Card className="ht-card" data-testid="heating-unconfigured">
        <EmptyState title="Topení zatím není připojené">{act.detail}</EmptyState>
      </Card>
    );
  } else
    body =
      tab === 'ted' ? (
        <NowTab snap={snap} api={api} go={selectTab} />
      ) : tab === 'mistnosti' ? (
        <RoomsTab snap={snap} />
      ) : tab === 'trendy' ? (
        <TrendsTab api={api} snap={snap} />
      ) : tab === 'sezony' ? (
        <SeasonsTab api={api} />
      ) : tab === 'rezimy' ? (
        <ModesTab snap={snap} api={api} />
      ) : (
        <FaultsTab snap={snap} />
      );
  const showTabs = !kiosk && snap && snap.source !== 'unconfigured';
  return (
    <div className="ht" data-testid="heating-view">
      <style>{heatingStyles}</style>
      <header className="ht-head">
        <h1 className="hb-sr-only">Topení</h1>
        {showTabs && (
          <SegmentedControl
            label="Sekce"
            hideLabel
            size="sm"
            value={tab}
            options={TABS}
            onChange={selectTab}
            className="ht-tabs"
          />
        )}
        {snap && snap.source !== 'unconfigured' && (
          <span
            className="ht-live"
            data-stale={snap.stale || snap.source !== 'ok' ? '' : undefined}
            data-testid="heating-live"
          >
            <i />
            {snap.stale
              ? `data ${ago(snap.updated_at)} – zastaralá`
              : snap.source !== 'ok'
                ? 'regulace neodpovídá'
                : `živě · ${ago(snap.updated_at)}`}
          </span>
        )}
      </header>
      {snap?.stale && (
        <Card tone="warning" className="ht-note" data-testid="heating-stale">
          <b>Údaje nejsou aktuální</b>
          <p>
            Regulace neposlala data {ago(snap.updated_at)}. Schéma je zastavené, dokud nepřijdou
            nová.
          </p>
        </Card>
      )}
      {body}
    </div>
  );
}
