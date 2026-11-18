import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSession, navigatePanel, type ModuleViewProps } from '@homebrain/ha-client';
import {
  Button,
  Card,
  ErrorState,
  Icon,
  SegmentedControl,
  Skeleton,
  StatusRow,
  Stepper,
  Tile,
} from '@homebrain/ui';
import { getAnomalyApi, type AckKind, type AnomalyApi } from '../api.js';
import {
  RESOLVED_DONE,
  RESOLVED_HINT,
  TIER_LABEL,
  TIER_RANK,
  TIER_TONE,
  TIERS,
  affectedNames,
  byUrgency,
  glyphFor,
  headline,
  hm,
  inventory,
  lastReport,
  meta,
  nextStep,
  openDeviceLabel,
  overview,
  reportGlyph,
  stepDetail,
  values,
  why,
} from '../copy.js';
import type { AnomalySnapshot, Report, TierKey } from '../types.js';
import { BaselineBand, HealthStrip, SilenceTimeline } from './charts.js';
import { Glyph } from './glyphs.js';
import { anomalyStyles } from './styles.js';
import { TierPill } from './TierPill.js';

const POLL_MS = 60_000;

function useAnomaly(api: AnomalyApi | null) {
  const [snap, setSnap] = useState<AnomalySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!api) return;
    api.list().then(
      (s) => {
        setSnap(s);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Hlídání domu neodpovědělo.'),
    );
  }, [api]);
  useEffect(() => {
    load();
    const tick = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) load();
    }, POLL_MS);
    return () => clearInterval(tick);
  }, [load]);
  return { snap, error, reload: load };
}

function Chevron() {
  return (
    <svg className="aw-chevron" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <path
        d="m6 9 6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Actions {
  ack: (r: Report, kind: AckKind) => Promise<void>;
  mute: (r: Report) => Promise<void>;
  unmute: (r: Report) => Promise<void>;
  /** HA device page; only for HA admins (adults cannot open HA settings). */
  openDevice?: (deviceId: string) => void;
  busy: string | null;
}

function IssueCard({
  r,
  now,
  wide,
  actions,
}: {
  r: Report;
  now: string;
  wide?: boolean;
  actions: Actions;
}) {
  const top = r.findings[0];
  const last = lastReport(r);
  const deviceId = r.scope === 'device' ? r.devices[0]?.id : undefined;
  const open = openDeviceLabel(r.devices[0]?.name ?? '');
  const busy = actions.busy === r.key;
  const step = nextStep(r);
  return (
    <article
      className="hb-card aw-issue"
      data-tier={r.tier}
      data-wide={wide || undefined}
      data-testid="aw-issue"
      data-key={r.key}
    >
      <header className="aw-issue-head">
        <span className="aw-orb" data-tone={TIER_TONE[r.tier]}>
          <Glyph name={reportGlyph(r)} size={22} />
        </span>
        <div className="aw-issue-copy">
          <h3 data-testid="aw-issue-title">{headline(r)}</h3>
          <p data-testid="aw-issue-meta">{meta(r, now)}</p>
        </div>
        <TierPill tier={r.tier} />
      </header>
      <p className="aw-why" data-testid="aw-issue-why">
        {why(r, now)}
      </p>
      {step && (
        <p className="aw-next" data-testid="aw-next-step">
          <Glyph name="arrow" size={18} />
          <span>{step}</span>
        </p>
      )}
      {r.band && <BaselineBand band={r.band} now={now} />}
      {last && top && (
        <SilenceTimeline last={last} intervalS={top.detail.interval_s ?? 600} now={now} />
      )}
      {r.entities.length > 1 && (
        <details className="aw-affected">
          <summary>
            Dotčené hodnoty ({r.entities.length})
            <Chevron />
          </summary>
          <div className="aw-entities" aria-label="Dotčené hodnoty">
            {r.entities.map((e) => (
              <span key={e.entity_id ?? e.name} className="aw-entity">
                <i className="aw-entity-dot" />
                {e.name}
              </span>
            ))}
          </div>
        </details>
      )}
      <Stepper
        label="Vývoj upozornění"
        steps={TIERS.map((key) => ({
          key,
          title: TIER_LABEL[key],
          detail: stepDetail(r, key),
          state: r.tier === key ? 'active' : r.reached[key] ? 'done' : 'todo',
        }))}
      />
      <footer className="aw-issue-foot">
        {/* Owner: at most three actions. The diagnostic step is primary (an unchecked problem
            is not „solved“ by default), Vyřešeno secondary with its caption, Skrýt a link. */}
        <div className="aw-actions" data-testid="aw-actions">
          {deviceId && actions.openDevice && (
            <Button
              variant="primary"
              size="sm"
              className="aw-open"
              aria-label={open.aria}
              onClick={() => actions.openDevice!(deviceId)}
              disabled={busy}
            >
              {open.text}
            </Button>
          )}
          <div className="aw-resolve-group">
            <Button
              variant="secondary"
              size="sm"
              className="aw-resolve"
              loading={busy}
              aria-describedby={`${r.key}-hint`}
              onClick={() => void actions.ack(r, 'resolved')}
            >
              Vyřešeno
            </Button>
            <small className="aw-hint" id={`${r.key}-hint`} data-testid="aw-resolve-hint">
              {RESOLVED_HINT}
            </small>
          </div>
          <button
            type="button"
            className="aw-link"
            onClick={() => void actions.mute(r)}
            disabled={busy}
          >
            Skrýt na 7 dní
          </button>
        </div>
      </footer>
    </article>
  );
}

function PhoneCard() {
  return (
    <Card className="aw-side" data-testid="aw-phone">
      <h2 className="aw-h2">Na telefon</h2>
      <p className="aw-muted aw-pad">
        Upozornění na telefon zatím nejsou zapnutá. Upozornění jsou jen tady a na obrazovce Dnes.
      </p>
    </Card>
  );
}

function HowCard() {
  return (
    <Card className="aw-side">
      <h2 className="aw-h2">Jak hlídání funguje</h2>
      <ol className="aw-how" data-testid="aw-how">
        <li>
          <TierPill tier="observation" size="sm" />
          <span>
            Hodnota se odchyluje od obvyklého průběhu. Pozorování je vidět jen na této stránce.
          </span>
        </li>
        <li>
          <TierPill tier="suspicion" size="sm" />
          <span>Odchylka trvá déle nebo se opakuje. Podezření se ukáže i na obrazovce Dnes.</span>
        </li>
        <li>
          <TierPill tier="confirmed" size="sm" />
          <span>
            Výpadek nebo odchylka je dlouhá či jednoznačná. Porucha je na obrazovce Dnes nahoře.
          </span>
        </li>
      </ol>
      <p className="aw-privacy">
        <Icon name="lock" size={16} /> Vyhodnocuje se doma, z historie Home Assistantu. Nic se
        neodesílá ven a do Home Assistantu se nic nezapisuje.
      </p>
    </Card>
  );
}

function DevicesCard({ snap, visible }: { snap: AnomalySnapshot; visible: Report[] }) {
  const devices = snap.devices ?? [];
  const affected = new Map<string, TierKey>();
  for (const r of visible)
    for (const d of r.devices)
      if (d.id && TIER_RANK[r.tier] > TIER_RANK[affected.get(d.id) ?? 'ok'])
        affected.set(d.id, r.tier);
  const sorted = devices
    .slice()
    .sort((a, b) => TIER_RANK[affected.get(b.id) ?? 'ok'] - TIER_RANK[affected.get(a.id) ?? 'ok']);
  return (
    <Card className="aw-side aw-devices" data-testid="aw-devices">
      <h2 className="aw-h2">Hlídaná zařízení</h2>
      <p className="aw-muted aw-pad">
        {sorted.length - affected.size} v pořádku
        {affected.size > 0 && ` · ${affected.size} s upozorněním`}
        {snap.watched.learning > 0 && ` · učí se ${values(snap.watched.learning)}`}
      </p>
      <div className="aw-tiles">
        {sorted.map((d) => {
          const tier = affected.get(d.id);
          return (
            <Tile
              key={d.id}
              tone={tier ? TIER_TONE[tier] : 'neutral'}
              icon={<Glyph name={glyphFor(d.classes[0], d.classes[0])} size={18} />}
              label={d.name}
              status={tier ? TIER_LABEL[tier] : values(d.count)}
              detail={tier ? values(d.count) : undefined}
            />
          );
        })}
      </div>
    </Card>
  );
}

function HiddenCard({ hidden, actions }: { hidden: Report[]; actions: Actions }) {
  if (!hidden.length) return null;
  return (
    <Card className="aw-side" data-testid="aw-hidden">
      <h2 className="aw-h2">Skrytá upozornění ({hidden.length})</h2>
      <div className="aw-hidden-list">
        {hidden.map((r) => (
          <StatusRow
            key={r.key}
            icon={<Glyph name={reportGlyph(r)} size={18} />}
            tone={TIER_TONE[r.tier]}
            label={headline(r)}
            detail={
              r.hidden === 'muted' && r.muted_until
                ? `Skryto do ${new Date(r.muted_until).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}`
                : r.ack === 'resolved'
                  ? RESOLVED_DONE
                  : 'Označeno jako v pořádku – hlídá se s větší tolerancí'
            }
            value={null}
            action={
              r.hidden === 'muted' ? (
                <button type="button" className="aw-link" onClick={() => void actions.unmute(r)}>
                  Zobrazit znovu
                </button>
              ) : undefined
            }
          />
        ))}
      </div>
    </Card>
  );
}

/** A half-width card alone in the last grid row takes the full width instead. */
function lone(list: Report[], r: Report) {
  const half = list.filter((x) => x.tier !== 'confirmed');
  return half.length % 2 === 1 && half.at(-1) === r;
}

export default function AnomalyView(context: Partial<ModuleViewProps> = {}) {
  const api = useMemo(() => getAnomalyApi(context.connection), [context.connection]);
  const { snap, error, reload } = useAnomaly(api);
  const [filter, setFilter] = useState<'all' | TierKey>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    if (context.connection)
      void getSession(context.connection).then((s) => alive && setAdmin(!!s?.isAdmin));
    return () => {
      alive = false;
    };
  }, [context.connection]);

  const run = useCallback(
    async (r: Report, action: () => Promise<void>) => {
      setBusy(r.key);
      try {
        await action();
      } finally {
        setBusy(null);
        reload();
      }
    },
    [reload],
  );
  const actions: Actions = {
    busy,
    ack: (r, kind) => run(r, () => api!.ack(r.key, kind)),
    mute: (r) => run(r, () => api!.mute(r.key, 7)),
    unmute: (r) => run(r, () => api!.unmute(r.key)),
    openDevice: admin
      ? (id) => navigatePanel(`/config/devices/device/${encodeURIComponent(id)}`)
      : undefined,
  };

  const body = () => {
    if (!api)
      return (
        <ErrorState title="Hlídání domu není dostupné">
          Panel nemá spojení s Home Assistantem.
        </ErrorState>
      );
    if (error && !snap) return <ErrorState onRetry={reload}>{error}</ErrorState>;
    if (!snap) return <Skeleton lines={6} />;
    // most urgent first: soonest escalation to Porucha, then the higher tier
    const open = snap.reports.filter((r) => r.hidden === null).sort(byUrgency);
    const hidden = snap.reports.filter((r) => r.hidden !== null);
    const visible = filter === 'all' ? open : open.filter((r) => r.tier === filter);
    const h = overview(snap.counts);
    const learning = !snap.ready;
    return (
      <div className="aw-layout">
        <main className="aw-main">
          <section
            className="hb-card aw-status"
            data-variant="glass"
            data-tone={learning ? 'observation' : h.tone}
            data-testid="aw-status"
          >
            <span
              className="aw-orb aw-orb-lg"
              data-tone={h.tone === 'ok' ? 'ok' : TIER_TONE[h.tone]}
            >
              <Glyph
                name={h.tone === 'ok' || h.tone === 'observation' ? 'shield' : 'pulse'}
                size={30}
              />
            </span>
            <div className="aw-status-copy">
              <h2 data-testid="aw-headline">
                {learning ? 'Hlídání se učí, jak dům běží' : h.title}
              </h2>
              <p>
                {learning
                  ? 'Prvních 7 dní se sbírá historie. Výpadky se hlídají hned, odchylky od obvyklých hodnot až potom.'
                  : h.sub}
              </p>
              {!learning && open.length > 0 && (
                <p className="aw-status-names" data-testid="aw-status-names">
                  {affectedNames(open)}
                </p>
              )}
              <p className="aw-muted">
                {learning ? `Učí se ${values(snap.watched.learning)}` : inventory(snap.watched)}
              </p>
            </div>
            {snap.health && <HealthStrip health={snap.health} now={snap.now} />}
          </section>

          {open.length > 1 && (
            <SegmentedControl
              label="Filtr"
              hideLabel
              size="sm"
              value={filter}
              onChange={(v) => setFilter(v as 'all' | TierKey)}
              options={[
                ['all', `Vše ${open.length}`],
                ...TIERS.slice()
                  .reverse()
                  .filter((tier) => snap.counts[tier])
                  .map((tier): [TierKey, string] => [
                    tier,
                    `${tier === 'confirmed' ? 'Poruchy' : TIER_LABEL[tier]} ${snap.counts[tier]}`,
                  ]),
              ]}
            />
          )}

          {open.length === 0 ? (
            <DevicesCard snap={snap} visible={open} />
          ) : (
            <div className="aw-issues">
              {visible.map((r) => (
                <IssueCard
                  key={r.key}
                  r={r}
                  now={snap.now}
                  wide={lone(visible, r)}
                  actions={actions}
                />
              ))}
            </div>
          )}
        </main>
        <aside className="aw-rail">
          {open.length > 0 && <DevicesCard snap={snap} visible={open} />}
          <HiddenCard hidden={hidden} actions={actions} />
          <PhoneCard />
          <HowCard />
        </aside>
      </div>
    );
  };

  return (
    <div className="aw aw-page" data-testid="anomaly">
      <style>{anomalyStyles}</style>
      <header className="aw-top">
        <div>
          <h1 className="hb-sr-only">Hlídání domu</h1>
          <p className="aw-muted">
            {snap ? `Aktualizováno ${hm(snap.now)} · z historie Home Assistantu` : 'Načítám…'}
          </p>
        </div>
      </header>
      {body()}
    </div>
  );
}
