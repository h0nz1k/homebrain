import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { Card, EmptyState, ErrorState, Pill, Skeleton, czCount } from '@homebrain/ui';
import { getAgentsApi, type AgentsApi } from '../api.js';
import {
  AGENT_STATE,
  agentState,
  agentsHaveProblem,
  agentsListCounts,
  fmtPct,
  fmtSla,
  heroModel,
  levelTone,
  renewalLabel,
  serviceUnderIdeal,
  servicesHaveProblem,
  sortAgents,
  updatedLabel,
  type BarTone,
} from '../format.js';
import { collapsedSummary, groupQuotas, type QuotaSlot } from '../quotaGroups.js';
import { buildTodoItems } from '../todoItems.js';
import type { AgentsSnapshot } from '../types.js';
import { agentsStyles } from './agentsStyles.js';
import { Bar } from './parts.js';

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

function Hero({ snap, todoCount, now }: { snap: AgentsSnapshot; todoCount: number; now: number }) {
  const hero = heroModel(snap, now, todoCount);
  return (
    <Card
      className="hb-hero agt-hero"
      tone={cardTone(hero.tone)}
      data-testid="agents-hero"
      data-agents-state={hero.tone}
    >
      <div className="agt-state">
        <span className="agt-dot" data-tone={hero.tone} aria-hidden="true" />
        <div className="agt-hero-copy">
          <h2 data-testid="agents-headline">{hero.headline}</h2>
          {hero.subline && (
            <p
              className="agt-subline"
              data-testid="agents-meta"
              data-stale={hero.stale ? 'true' : undefined}
            >
              {hero.subline}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Todos({ snap, now }: { snap: AgentsSnapshot; now: number }) {
  const items = useMemo(() => buildTodoItems(snap, now), [snap, now]);
  if (!items.length) return null;
  return (
    <Card className="agt-panel" data-testid="agents-todos" aria-labelledby="agt-todos-title">
      <div className="agt-panel-head">
        <h3 id="agt-todos-title">K řešení</h3>
        <span className="agt-micro">seřazeno podle naléhavosti</span>
      </div>
      <ul className="agt-todos">
        {items.map((it) => (
          <li key={it.id} data-testid="agents-todo" data-level={it.level} data-tone={it.tone}>
            <Pill tone={it.tone} size="sm" data-testid="agents-todo-tag">
              {it.tag}
            </Pill>
            <div className="agt-todo-body">
              <div className="agt-todo-title">{it.title}</div>
              <div className="agt-todo-detail">{it.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function QuotaSlotView({ slot, now }: { slot: QuotaSlot | null; now: number }) {
  if (!slot) {
    return (
      <div className="agt-q-slot agt-q-empty" data-testid="agents-quota-slot">
        –
      </div>
    );
  }
  const q = slot.quota;
  const tone =
    q.available && (q.level === 'critical' || q.level === 'warning')
      ? levelTone(q.level)
      : 'neutral';
  const renew = renewalLabel(q.reset_at, now);
  return (
    <div
      className="agt-q-slot"
      data-testid="agents-quota-slot"
      data-level={q.level}
      data-tone={tone}
    >
      <div className="agt-q-slot-line">
        <span className="agt-q-slot-label">{slot.label}</span>
        {q.available ? (
          <b data-tone={tone === 'neutral' ? undefined : tone} data-testid="agents-quota-remaining">
            {fmtPct(q.remaining_pct)}
          </b>
        ) : (
          <span data-testid="agents-quota-unavailable">nedostupné</span>
        )}
      </div>
      {q.available && (
        <Bar value={q.remaining_pct ?? 0} tone={tone} label={`${slot.label}: zbývá`} />
      )}
      {renew && <small data-testid="agents-quota-reset">obnova {renew}</small>}
    </div>
  );
}

function Quotas({ snap, now }: { snap: AgentsSnapshot; now: number }) {
  const layout = useMemo(() => groupQuotas(snap.quotas), [snap.quotas]);
  return (
    <Card className="agt-panel" data-testid="agents-quotas" aria-labelledby="agt-quotas-title">
      <div className="agt-panel-head">
        <h3 id="agt-quotas-title">Kvóty</h3>
        <span className="agt-micro">zbývá · obnova</span>
      </div>
      {layout.rows.length ? (
        <ul className="agt-q-rows">
          {layout.rows.map((row) => (
            <li
              key={row.key}
              className="agt-q-row"
              data-testid="agents-quota-row"
              data-provider={row.key}
            >
              <div className="agt-q-name">
                <b>{row.name}</b>
                {row.subtitle && <small>{row.subtitle}</small>}
              </div>
              <QuotaSlotView slot={row.slots[0]} now={now} />
              <QuotaSlotView slot={row.slots[1]} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="agt-note" data-testid="agents-quotas-empty">
          Žádné kvóty nenalezeny.
        </p>
      )}
      {layout.collapsed.length > 0 && (
        <details className="agt-more" data-testid="agents-quotas-collapsed">
          <summary>+ {collapsedSummary(layout.collapsed)}</summary>
        </details>
      )}
    </Card>
  );
}

function Agents({ snap }: { snap: AgentsSnapshot }) {
  const a = snap.agents;
  const counts = agentsListCounts(snap);
  const problem = agentsHaveProblem(snap);
  const [expanded, setExpanded] = useState(problem);
  const [prevProblem, setPrevProblem] = useState(problem);
  if (problem !== prevProblem) {
    setPrevProblem(problem);
    if (problem) setExpanded(true);
  }
  const runningLabel = counts.running != null ? `${counts.running}${'\u00a0'}běží` : null;
  return (
    <Card className="agt-panel" data-testid="agents-agents" aria-labelledby="agt-agents-title">
      <div className="agt-panel-head">
        <h3 id="agt-agents-title">Agenti</h3>
        {a.available && runningLabel && (
          <Pill tone={problem ? 'warn' : 'ok'} size="sm" data-testid="agents-agents-count">
            {runningLabel}
          </Pill>
        )}
      </div>
      {!a.available ? (
        <Unavailable testId="agents-agents-unavailable" />
      ) : a.items.length ? (
        <details
          className="agt-more"
          open={expanded}
          onToggle={(e) => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
          data-testid="agents-agents-details"
        >
          <summary data-testid="agents-agents-toggle">
            {expanded ? 'Skrýt agenty a modely ▴' : 'Zobrazit agenty a modely ▾'}
          </summary>
          <ul className="agt-rows">
            {sortAgents(a.items).map((agent) => {
              const state = agentState(agent);
              return (
                <li key={agent.name} data-testid="agents-agent" data-state={state}>
                  <div className="agt-row-name">
                    <b>{agent.name}</b>
                  </div>
                  <span className="agt-row-meta">{agent.model ?? AGENT_STATE[state].label}</span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : (
        <p className="agt-note">Žádný agent teď neběží.</p>
      )}
    </Card>
  );
}

function Services({ snap }: { snap: AgentsSnapshot }) {
  const problem = servicesHaveProblem(snap);
  const under = snap.services.filter(serviceUnderIdeal);
  const over = snap.services.filter((s) => !serviceUnderIdeal(s));
  const upCount = snap.services.filter((s) => s.available && s.up && s.state !== 'down').length;
  return (
    <Card className="agt-panel" data-testid="agents-services" aria-labelledby="agt-services-title">
      <div className="agt-panel-head">
        <h3 id="agt-services-title">Služby</h3>
        {snap.services.length > 0 && (
          <Pill tone={problem ? 'warn' : 'ok'} size="sm" data-testid="agents-services-count">
            {`${upCount}${'\u00a0'}v provozu`}
          </Pill>
        )}
      </div>
      {snap.services.length === 0 ? (
        <p className="agt-note" data-testid="agents-services-empty">
          Žádné služby nenalezeny.
        </p>
      ) : (
        <>
          {under.length > 0 && (
            <ul className="agt-rows" data-testid="agents-services-under">
              {under.map((s) => {
                const tone = levelTone(s.level);
                return (
                  <li key={s.id} data-testid="agents-service" data-level={s.level} data-tone={tone}>
                    <div className="agt-row-name">
                      <b>{s.name}</b>
                    </div>
                    <span
                      className="agt-sla"
                      data-tone={s.sla_24h != null && s.sla_24h < 99 ? tone : undefined}
                      data-testid="agents-service-sla"
                    >
                      {s.sla_24h != null ? `SLA 24 h ${fmtSla(s.sla_24h)}` : '–'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {over.length > 0 && (
            <details
              className="agt-more"
              open={problem && under.length === 0 ? true : undefined}
              data-testid="agents-services-details"
            >
              <summary>+ {czCount(over.length, 'služba', 'služby', 'služeb')} nad 99 %</summary>
              <ul className="agt-rows">
                {over.map((s) => (
                  <li key={s.id} data-testid="agents-service" data-level={s.level}>
                    <div className="agt-row-name">
                      <b>{s.name}</b>
                    </div>
                    <span className="agt-sla" data-testid="agents-service-sla">
                      {fmtSla(s.sla_24h)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}

function Queue({ snap }: { snap: AgentsSnapshot }) {
  const q = snap.queue;
  if (!q.available) {
    return (
      <Card className="agt-panel" data-testid="agents-queue" aria-labelledby="agt-queue-title">
        <h3 id="agt-queue-title">Fronta úloh</h3>
        <Unavailable testId="agents-queue-unavailable" />
      </Card>
    );
  }
  const main: Array<{ key: string; n: number; label: string }> = [
    { key: 'running', n: q.running ?? 0, label: 'běží' },
    { key: 'pending', n: q.pending ?? 0, label: 'čeká' },
    { key: 'review', n: q.review ?? 0, label: 'ke kontrole' },
  ];
  const blocked = q.blocked ?? 0;
  return (
    <Card className="agt-panel" data-testid="agents-queue" aria-labelledby="agt-queue-title">
      <div className="agt-panel-head">
        <h3 id="agt-queue-title">Fronta úloh</h3>
      </div>
      <p className="agt-queue-line" data-testid="agents-queue-line">
        {/* Separator trails the previous item (inside its nowrap span), so a wrapped
            line never starts with an orphaned „·“ on narrow screens. */}
        {main.map((p, i) => (
          <span key={p.key} data-testid={`agents-queue-${p.key}`}>
            <b>{p.n}</b>
            {` ${p.label}`}
            {i < main.length - 1 || blocked > 0 ? ' ·' : ''}
          </span>
        ))}
        {blocked > 0 && (
          <span data-testid="agents-queue-blocked" data-tone="warn">
            <b>{blocked}</b>
            {` blokováno`}
          </span>
        )}
      </p>
    </Card>
  );
}

function Footer({ snap, now }: { snap: AgentsSnapshot; now: number }) {
  return (
    <Card
      className="agt-panel agt-footer"
      data-testid="agents-footer"
      data-current={snap.data.current == null ? undefined : String(snap.data.current)}
    >
      <p data-testid="agents-updated">{updatedLabel(snap.updated_at ?? snap.data.since, now)}</p>
      {snap.monitor_url && (
        <a
          className="hb-btn agt-monitor-link"
          data-variant="primary"
          href={snap.monitor_url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="agents-monitor-link"
        >
          Detail v AgentsMonitoringu
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
  const todoCount = useMemo(() => (snap ? buildTodoItems(snap, now).length : 0), [snap, now]);
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
        <Hero snap={snap} todoCount={todoCount} now={now} />
        <Todos snap={snap} now={now} />
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
