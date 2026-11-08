import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import {
  Card,
  EmptyState,
  ErrorState,
  Pill,
  ProgressRing,
  Skeleton,
  Sparkline,
  czCount,
} from '@homebrain/ui';
import { getServerApi, type ServerApi } from '../api.js';
import {
  barTone,
  diskName,
  fmtBytes,
  fmtNum,
  fmtPct,
  fmtRate,
  fmtTemp,
  heroModel,
  levelTone,
  uptimeLabel,
  vmRows,
  type BarTone,
} from '../format.js';
import type { Level, SeriesKey, ServerHistory, ServerSnapshot } from '../types.js';
import { serverStyles } from './serverStyles.js';

const POLL_MS = 10_000;
const HISTORY_MS = 5 * 60_000;
const DEFAULT_LIMITS: [number, number] = [85, 95];

function useServer(api: ServerApi | null) {
  const [snap, setSnap] = useState<ServerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ServerHistory | null>(null);
  const load = useCallback(() => {
    if (!api) return;
    api.get().then(
      (s) => {
        setSnap(s);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Server neodpověděl.'),
    );
  }, [api]);
  const loadHistory = useCallback(() => {
    if (!api) return;
    api.history(24).then(setHistory, () => setHistory({ hours: 24, series: {} }));
  }, [api]);
  useEffect(() => {
    load();
    loadHistory();
    // Live only while the panel is open and visible (no background polling of the server).
    const tick = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) load();
    }, POLL_MS);
    const slow = setInterval(loadHistory, HISTORY_MS);
    return () => {
      clearInterval(tick);
      clearInterval(slow);
    };
  }, [load, loadHistory]);
  return { snap, error, history, reload: load };
}

const ringTone = (t: BarTone) => (t === 'neutral' ? 'muted' : t);
const cardTone = (t: BarTone) =>
  t === 'crit' ? 'critical' : t === 'warn' ? 'warning' : t === 'ok' ? 'calm' : 'notice';
const worst = (levels: Level[]): Level =>
  levels.includes('critical')
    ? 'critical'
    : levels.includes('warning')
      ? 'warning'
      : levels.length
        ? 'ok'
        : 'unknown';

function Bar({ value, tone, label }: { value: number; tone: BarTone; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className="srv-bar"
      data-tone={tone}
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(pct) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

function Trend({
  history,
  series,
  format,
}: {
  history: ServerHistory | null;
  series: SeriesKey;
  format: (v: number) => string;
}) {
  const values = (history?.series[series] ?? []).map(([, v]) => v);
  if (!history) return <span className="srv-trend" data-empty="" aria-hidden="true" />;
  if (values.length < 2)
    return (
      <span className="srv-trend" data-empty="">
        <small>Historie zatím není</small>
      </span>
    );
  return (
    <span className="srv-trend" data-testid={`server-trend-${series}`}>
      <Sparkline values={values} width={240} height={44} area />
      <small>
        <span>24 h</span>
        <span>max {format(Math.max(...values))}</span>
      </small>
    </span>
  );
}

function Tile({
  id,
  label,
  tone,
  value,
  sub,
  children,
}: {
  id: string;
  label: string;
  tone: BarTone;
  value: ReactNode;
  sub: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="srv-tile" data-testid={`server-tile-${id}`} data-tone={tone}>
      <h3>{label}</h3>
      <strong className="srv-value">{value}</strong>
      <p className="srv-sub">{sub}</p>
      {children}
    </Card>
  );
}

function Hero({ snap }: { snap: ServerSnapshot }) {
  const hero = heroModel(snap);
  const uptime = uptimeLabel(snap.up_since);
  const limits = snap.thresholds ?? { memory: DEFAULT_LIMITS, disk: DEFAULT_LIMITS };
  const root = snap.disks?.[0];
  const temps = snap.temperatures?.sensors ?? [];
  const tempTone = levelTone(worst(temps.map((t) => t.level)));
  const rings =
    snap.state === 'ok'
      ? [
          { id: 'cpu', label: 'CPU', v: snap.cpu?.percent ?? null, tone: 'ok' as BarTone },
          {
            id: 'ram',
            label: 'RAM',
            v: snap.memory?.percent ?? null,
            tone: barTone(snap.memory?.percent, limits.memory),
          },
          {
            id: 'disk',
            label: 'Disk',
            v: root?.percent ?? null,
            tone: barTone(root?.percent, limits.disk),
          },
        ]
      : [];
  const meta = [
    snap.host?.title,
    uptime,
    snap.processes?.total != null
      ? czCount(snap.processes.total, 'proces', 'procesy', 'procesů')
      : null,
  ].filter(Boolean);
  return (
    <Card
      className="hb-hero srv-hero"
      tone={cardTone(hero.tone)}
      data-testid="server-hero"
      data-server-state={hero.tone}
    >
      <div className="srv-hero-copy">
        <Pill tone={hero.tone === 'neutral' ? 'neutral' : hero.tone} dot>
          {hero.badge}
        </Pill>
        <h2 data-testid="server-headline">{hero.headline}</h2>
        {meta.length > 0 && <p>{meta.join(' · ')}</p>}
        {hero.more.length > 0 && <p className="srv-more">Dále: {hero.more.join(', ')}</p>}
        {snap.state === 'down' && (
          <p>
            Glances teď neposílá data. Panel zkouší znovu každých 10&nbsp;s, nic dalšího není
            potřeba.
          </p>
        )}
      </div>
      {rings.length > 0 && (
        <div className="srv-rings">
          {rings.map((r) => (
            <div key={r.id} className="srv-ring" data-testid={`server-ring-${r.id}`}>
              <ProgressRing
                value={(r.v ?? 0) / 100}
                size={76}
                thickness={7}
                tone={ringTone(r.v == null ? 'neutral' : r.tone)}
                label={`${r.label} ${fmtPct(r.v)}`}
              >
                <b>{fmtPct(r.v)}</b>
              </ProgressRing>
              <span>{r.label}</span>
            </div>
          ))}
          <div className="srv-ring" data-testid="server-ring-temp">
            <ProgressRing
              value={Math.min(1, (snap.temperatures?.cpu_max ?? 0) / 100)}
              size={76}
              thickness={7}
              tone={ringTone(tempTone)}
              label={`Teplota ${fmtTemp(snap.temperatures?.cpu_max)}`}
            >
              <b>{fmtTemp(snap.temperatures?.cpu_max)}</b>
            </ProgressRing>
            <span>Teplota</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function Tiles({ snap, history }: { snap: ServerSnapshot; history: ServerHistory | null }) {
  const limits = snap.thresholds ?? { memory: DEFAULT_LIMITS, disk: DEFAULT_LIMITS };
  const mem = snap.memory;
  const temps = snap.temperatures;
  const cores = (temps?.sensors ?? []).filter((t) => /^core/i.test(t.label));
  const disk = (temps?.sensors ?? []).find((t) => t.kind === 'disk');
  const net = snap.network?.interfaces.find((i) => i.name === snap.network?.primary);
  const memTone = barTone(mem?.percent, limits.memory);
  const cpuCores = snap.cpu?.cores;
  return (
    <div className="srv-tiles">
      <Tile
        id="cpu"
        label="Procesor"
        tone="neutral"
        value={fmtPct(snap.cpu?.percent)}
        sub={
          <>
            zátěž {fmtNum(snap.cpu?.load, 2)}
            {cpuCores ? ` · ${czCount(cpuCores, 'jádro', 'jádra', 'jader')}` : ''}
          </>
        }
      >
        <Trend history={history} series="cpu" format={fmtPct} />
      </Tile>
      <Tile
        id="ram"
        label="Paměť"
        tone={memTone}
        value={fmtPct(mem?.percent)}
        sub={`${fmtBytes(mem?.used_bytes)} z ${fmtBytes(mem?.total_bytes)}`}
      >
        <Bar value={mem?.percent ?? 0} tone={memTone} label="Využití paměti" />
        <Trend history={history} series="memory" format={fmtPct} />
      </Tile>
      <Tile
        id="temp"
        label="Teploty"
        tone={levelTone(worst((temps?.sensors ?? []).map((t) => t.level)))}
        value={fmtTemp(temps?.cpu_max)}
        sub={
          <>
            {disk ? `NVMe ${fmtTemp(disk.value)}` : 'nejteplejší jádro'}
            {cores.length > 0 && (
              <span className="srv-cores">
                {' · jádra '}
                {cores.map((c) => Math.round(c.value)).join(' · ')}
              </span>
            )}
          </>
        }
      >
        <Trend history={history} series="temperature" format={fmtTemp} />
      </Tile>
      <Tile
        id="net"
        label="Síť"
        tone="neutral"
        value={
          <>
            <span aria-label="stahování">↓</span>
            {fmtRate(net?.rx_bps)}
          </>
        }
        sub={
          <>
            ↑ {fmtRate(net?.tx_bps)}
            {net ? ` · ${net.name}` : ''}
          </>
        }
      >
        <Trend history={history} series="rx" format={fmtRate} />
      </Tile>
    </div>
  );
}

function Disks({ snap }: { snap: ServerSnapshot }) {
  const limits = snap.thresholds?.disk ?? DEFAULT_LIMITS;
  const swap = snap.swap;
  return (
    <Card className="srv-panel" data-testid="server-disks">
      <h3>Disky</h3>
      <ul className="srv-list">
        {(snap.disks ?? []).map((d) => {
          const tone = barTone(d.percent, limits);
          return (
            <li key={d.mount} data-testid="server-disk" data-tone={tone}>
              <div className="srv-row-head">
                <b>{diskName(d.mount)}</b>
                {d.mount === '/' ? null : <span className="srv-micro">{d.mount}</span>}
                <span className="srv-row-val">{fmtPct(d.percent)}</span>
              </div>
              <Bar value={d.percent ?? 0} tone={tone} label={`Zaplnění ${diskName(d.mount)}`} />
              <small>
                volno {fmtBytes(d.free_bytes)} z {fmtBytes(d.size_bytes)}
              </small>
            </li>
          );
        })}
        {swap?.total_bytes ? (
          <li data-testid="server-swap">
            <div className="srv-row-head">
              <b>Swap</b>
              <span className="srv-row-val">{fmtPct(swap.percent)}</span>
            </div>
            <Bar value={swap.percent ?? 0} tone="neutral" label="Využití swapu" />
            <small>
              {fmtBytes(swap.used_bytes)} z {fmtBytes(swap.total_bytes)}
            </small>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

function Vms({ snap }: { snap: ServerSnapshot }) {
  const rows = vmRows(snap);
  const status = snap.vms?.status ?? 'off';
  let note: string | null = null;
  if (status === 'off')
    note =
      'Využití jednotlivých VM čte HomeBrain z Glances API (jen čtení). Zapněte v Glances webový server (glances -w) a VM se tu objeví samy.';
  else if (status === 'down')
    note = 'Glances API teď neodpovídá. Seznam VM se vrátí sám, ostatní údaje jsou aktuální.';
  else if (!rows.length) note = 'Na serveru teď neběží žádný virtuální stroj.';
  return (
    <Card className="srv-panel" data-testid="server-vms">
      <div className="srv-panel-head">
        <h3>Virtuální stroje</h3>
        {rows.length > 0 && <span className="srv-micro">podle paměti</span>}
      </div>
      {note && (
        <p className="srv-note" data-testid="server-vms-note">
          {note}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="srv-list srv-vms">
          {rows.map((vm) => (
            <li key={vm.vmid} data-testid="server-vm" data-vmid={vm.vmid}>
              <div className="srv-vm-name">
                <b>{vm.name}</b>
                <span className="srv-micro">VM {vm.vmid}</span>
              </div>
              <div className="srv-vm-metric">
                <span className="srv-micro">CPU</span>
                <Bar value={vm.cpuShare * 100} tone="neutral" />
                <span className="srv-row-val">{vm.cpu}</span>
              </div>
              <div className="srv-vm-metric">
                <span className="srv-micro">RAM</span>
                <Bar value={vm.memShare * 100} tone="ok" />
                <span className="srv-row-val">{vm.memLabel}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function ServerView({ connection }: ModuleViewProps) {
  const api = useMemo(() => getServerApi(connection), [connection]);
  const { snap, error, history, reload } = useServer(api);
  let body: ReactNode;
  if (!api)
    body = (
      <EmptyState title="Server není k dispozici">
        Potřebuje připojení k Home Assistantu.
      </EmptyState>
    );
  else if (error && !snap)
    body = (
      <ErrorState title="Server se nenačetl" onRetry={reload} data-testid="server-error">
        {error}
      </ErrorState>
    );
  else if (!snap)
    body = (
      <div className="srv-loading" data-testid="server-loading">
        <Skeleton variant="block" height="168px" label="Načítám server…" />
        <div className="srv-tiles">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="card" height="88px" lines={2} />
          ))}
        </div>
      </div>
    );
  else if (snap.state === 'unconfigured')
    body = (
      <EmptyState title="Glances nenalezeno">
        Modul čte integraci Glances v Home Assistantu. Přidejte ji pro svůj server a přehled se
        objeví sám.
      </EmptyState>
    );
  else
    body = (
      <>
        <Hero snap={snap} />
        {snap.state === 'ok' && (
          <>
            <Tiles snap={snap} history={history} />
            <div className="srv-columns">
              <Vms snap={snap} />
              <Disks snap={snap} />
            </div>
          </>
        )}
      </>
    );
  return (
    <div className="srv" data-testid="server-view">
      <style>{serverStyles}</style>
      <h1 className="hb-sr-only">Server</h1>
      {body}
    </div>
  );
}
