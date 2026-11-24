import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { Button, Card, EmptyState, ErrorState, Pill, Skeleton, czCount } from '@homebrain/ui';
import { getAgentsApi, type AgentsApi } from '../api.js';
import {
  AGENT_STATE,
  AGENTS_ANCHORS,
  agentState,
  dataAgeLabel,
  fmtPct,
  fmtSla,
  heroMeta,
  heroModel,
  levelTone,
  resetLabel,
  serviceStateLabel,
  sortAgents,
  whenLabel,
  type BarTone,
} from '../format.js';
import type { AgentsSnapshot, Quota } from '../types.js';
import { agentsStyles } from './agentsStyles.js';
import { Bar, revealCard } from './parts.js';

const POLL_MS = 30_000;

function useAgents(api: AgentsApi | null) {
  const [snap, setSnap] = useState<AgentsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!api) return;
    api.get().then(
      (s) => {
        setSnap(s);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Home Assistant neodpověděl.'),
    );
  }, [api]);
  useEffect(() => {
    load();
    // Live only while the panel is visible; back from the background = fresh data at once.
    const tick = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) load();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);
  return { snap, error, reload: load };
}

const cardTone = (t: BarTone) =>
  t === 'crit' ? 'critical' : t === 'warn' ? 'warning' : t === 'ok' ? 'calm' : 'notice';

function Unavailable({ testId }: { testId: string }) {
  return (
    <p className="agt-note" data-testid={testId}>
      nedostupné
    </p>
  );
}

function Hero({ snap }: { snap: AgentsSnapshot }) {
  const hero = heroModel(snap);
  const meta = heroMeta(snap);
  const status = snap.status;
  return (
    <Card
      className="hb-hero agt-hero"
      tone={cardTone(hero.tone)}
      data-testid="agents-hero"
      data-agents-state={hero.tone}
    >
      <div className="agt-hero-copy">
        <Pill tone={hero.tone} dot data-testid="agents-badge">
          {hero.badge}
        </Pill>
        <h2 data-testid="agents-headline">{hero.headline}</h2>
        {meta.length > 0 && (
          <p className="agt-meta" data-testid="agents-meta">
            {meta.map((m, i) => (
              <span key={m}>
                {i ? '· ' : ''}
                {m}
              </span>
            ))}
          </p>
        )}
        {hero.more.length > 0 && (
          <ul className="agt-more" data-testid="agents-more" aria-label="Další upozornění">
            {hero.more.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {status.available && (status.critical || status.attention) ? (
          <p className="agt-status-counts" data-testid="agents-status-counts">
            Monitoring:{' '}
            {[
              status.critical ? czCount(status.critical, 'kritické', 'kritické', 'kritických') : '',
              status.attention
                ? czCount(status.attention, 'upozornění', 'upozornění', 'upozornění')
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        {hero.target && (
          <Button
            variant="primary"
            className="agt-hero-fix"
            data-tone={hero.tone}
            data-testid="agents-hero-fix"
            onClick={() => revealCard(hero.target!)}
          >
            Co s tím
          </Button>
        )}
      </div>
    </Card>
  );
}

function QuotaItem({ q, now }: { q: Quota; now: number }) {
  const tone = q.available ? levelTone(q.level) : 'neutral';
  const reset = resetLabel(q.reset_at, now);
  const title = q.provider ?? q.id;
  return (
    <li className="agt-quota" data-testid="agents-quota" data-level={q.level} data-tone={tone}>
      <div className="agt-q-head">
        <b>{title}</b>
        {q.window_label && (
          <Pill size="sm" tone="neutral" className="agt-q-window">
            {q.window_label}
          </Pill>
        )}
      </div>
      {q.available ? (
        <>
          <div className="agt-q-value">
            <strong data-testid="agents-quota-remaining">{fmtPct(q.remaining_pct)}</strong>
            <span>zbývá</span>
          </div>
          <Bar
            value={q.remaining_pct ?? 0}
            tone={tone}
            label={`${title}${q.window_label ? ` (${q.window_label})` : ''}: zbývá`}
          />
          {reset && <small data-testid="agents-quota-reset">{reset}</small>}
          {(q.exhausted || q.exhaust_before_reset) && (
            <div className="agt-q-tags">
              {q.exhausted ? (
                <Pill tone="crit" size="sm" dot data-testid="agents-quota-exhausted">
                  Vyčerpáno
                </Pill>
              ) : (
                <Pill tone="warn" size="sm" dot data-testid="agents-quota-forecast">
                  Dojde před resetem
                </Pill>
              )}
            </div>
          )}
        </>
      ) : (
        <Unavailable testId="agents-quota-unavailable" />
      )}
    </li>
  );
}

function Quotas({ snap, now }: { snap: AgentsSnapshot; now: number }) {
  const forecast = snap.exhaust_forecast;
  return (
    <Card
      className="agt-panel"
      id={AGENTS_ANCHORS.quotas}
      tabIndex={-1}
      data-testid="agents-quotas"
      aria-labelledby="agt-quotas-title"
    >
      <div className="agt-panel-head">
        <h3 id="agt-quotas-title">Kvóty</h3>
        {forecast.active && forecast.items.length > 0 && (
          <span className="agt-micro agt-forecast" data-testid="agents-forecast">
            Před resetem dojde: {forecast.items.join(', ')}
          </span>
        )}
      </div>
      {snap.quotas.length ? (
        <ul className="agt-quotas">
          {snap.quotas.map((q) => (
            <QuotaItem key={q.id} q={q} now={now} />
          ))}
        </ul>
      ) : (
        <p className="agt-note" data-testid="agents-quotas-empty">
          Žádné kvóty nenalezeny.
        </p>
      )}
    </Card>
  );
}

function Agents({ snap }: { snap: AgentsSnapshot }) {
  const a = snap.agents;
  return (
    <Card className="agt-panel" data-testid="agents-agents" aria-labelledby="agt-agents-title">
      <div className="agt-panel-head">
        <h3 id="agt-agents-title">Agenti</h3>
        {a.available && a.active != null && (
          <span className="agt-micro">
            {a.total != null ? `${a.active} z ${a.total} běží` : `${a.active} běží`}
            {a.waiting ? ` · ${a.waiting} čeká` : ''}
          </span>
        )}
      </div>
      {!a.available ? (
        <Unavailable testId="agents-agents-unavailable" />
      ) : a.items.length ? (
        <ul className="agt-rows">
          {sortAgents(a.items).map((agent) => {
            const state = agentState(agent);
            return (
              <li key={agent.name} data-testid="agents-agent" data-state={state}>
                <div className="agt-row-name">
                  <b>{agent.name}</b>
                  {agent.model && <small>{agent.model}</small>}
                </div>
                <Pill tone={AGENT_STATE[state].tone} size="sm" dot>
                  {AGENT_STATE[state].label}
                </Pill>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="agt-note">Žádný agent teď neběží.</p>
      )}
    </Card>
  );
}

function Services({ snap }: { snap: AgentsSnapshot }) {
  return (
    <Card
      className="agt-panel"
      id={AGENTS_ANCHORS.services}
      tabIndex={-1}
      data-testid="agents-services"
      aria-labelledby="agt-services-title"
    >
      <div className="agt-panel-head">
        <h3 id="agt-services-title">Služby</h3>
        <span className="agt-micro">SLA 24 h</span>
      </div>
      {snap.services.length ? (
        <ul className="agt-rows">
          {snap.services.map((s) => {
            const tone = levelTone(s.level);
            return (
              <li key={s.id} data-testid="agents-service" data-level={s.level} data-tone={tone}>
                <div className="agt-row-name">
                  <b>{s.name}</b>
                  <small data-testid="agents-service-state">{serviceStateLabel(s)}</small>
                </div>
                <span
                  className="agt-sla"
                  data-tone={s.sla_24h != null && s.sla_24h < 95 ? tone : undefined}
                >
                  {fmtSla(s.sla_24h)}
                </span>
                <span
                  className="agt-led"
                  data-tone={tone}
                  role="img"
                  aria-label={serviceStateLabel(s)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="agt-note" data-testid="agents-services-empty">
          Žádné služby nenalezeny.
        </p>
      )}
    </Card>
  );
}

const QUEUE: Array<{ key: 'pending' | 'running' | 'blocked' | 'review'; label: string }> = [
  { key: 'pending', label: 'Čeká' },
  { key: 'running', label: 'Běží' },
  { key: 'blocked', label: 'Blokováno' },
  { key: 'review', label: 'Ke kontrole' },
];

function Queue({ snap }: { snap: AgentsSnapshot }) {
  const q = snap.queue;
  return (
    <Card className="agt-panel" data-testid="agents-queue" aria-labelledby="agt-queue-title">
      <h3 id="agt-queue-title">Fronta úkolů</h3>
      {q.available ? (
        <dl className="agt-queue">
          {QUEUE.map(({ key, label }) => {
            const value = q[key];
            const tone = key === 'blocked' && value ? 'warn' : undefined;
            return (
              <div key={key} data-testid={`agents-queue-${key}`} data-tone={tone}>
                <dt>{label}</dt>
                <dd>{value ?? '–'}</dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <Unavailable testId="agents-queue-unavailable" />
      )}
    </Card>
  );
}

function Footer({ snap, now }: { snap: AgentsSnapshot; now: number }) {
  const alert = whenLabel(snap.last_alert, now);
  return (
    <Card
      className="agt-panel agt-footer"
      id={AGENTS_ANCHORS.footer}
      tabIndex={-1}
      data-testid="agents-footer"
      data-current={snap.data.current == null ? undefined : String(snap.data.current)}
    >
      <div className="agt-footer-copy">
        <p data-testid="agents-data-age">{dataAgeLabel(snap.data, now)}</p>
        {alert && <p className="agt-micro">Poslední upozornění {alert}</p>}
      </div>
      {snap.monitor_url && (
        <a
          className="hb-btn agt-monitor-link"
          data-variant="secondary"
          href={snap.monitor_url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="agents-monitor-link"
        >
          Otevřít AgentsMonitoring
          <span aria-hidden="true">↗</span>
        </a>
      )}
    </Card>
  );
}

export default function AgentsView({ connection }: ModuleViewProps) {
  const api = useMemo(() => getAgentsApi(connection), [connection]);
  const { snap, error, reload } = useAgents(api);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);
  let body: ReactNode;
  if (!api)
    body = (
      <EmptyState title="Agenti nejsou k dispozici">
        Potřebuje připojení k Home Assistantu.
      </EmptyState>
    );
  else if (error && !snap)
    body = (
      <ErrorState title="Agenti se nenačetli" onRetry={reload} data-testid="agents-error">
        {error}
      </ErrorState>
    );
  else if (!snap)
    body = (
      <div className="agt-loading" data-testid="agents-loading">
        <Skeleton variant="block" height="150px" label="Načítám agenty…" />
        <Skeleton variant="card" height="200px" lines={3} />
      </div>
    );
  else if (!snap.configured)
    body = (
      <div data-testid="agents-unconfigured">
        <EmptyState title="Modul Agenti není nastavený">
          Správce v Home Assistantu otevře Nastavení → Zařízení a služby → HomeBrain → Konfigurovat
          → Agenti – monitoring a vybere senzor stavu monitoringu (název končí na „_stav“). Kvóty,
          agenty, služby a frontu se stejnou předponou pak HomeBrain najde sám.
        </EmptyState>
      </div>
    );
  else
    body = (
      <>
        <Hero snap={snap} />
        <Quotas snap={snap} now={now} />
        <div className="agt-columns">
          <Agents snap={snap} />
          <Services snap={snap} />
        </div>
        <Queue snap={snap} />
        <Footer snap={snap} now={now} />
      </>
    );
  return (
    <div className="agt" data-testid="agents-view">
      <style>{agentsStyles}</style>
      <h1 className="hb-sr-only">Agenti</h1>
      {body}
    </div>
  );
}
