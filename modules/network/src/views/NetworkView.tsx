import { useCallback, useEffect, useMemo, useState } from 'react';
import { navigateTab, type ModuleViewProps } from '@homebrain/ha-client';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Pill,
  QrCode,
  SegmentedControl,
  StatusRow,
  czCount,
} from '@homebrain/ui';
import { getNetworkApi, type NetworkApi } from '../api.js';
import {
  floorRows,
  heroModel,
  isOnline,
  loadRows,
  poeShare,
  sinceLabel,
  speedLabel,
  splitProblems,
  statTiles,
} from '../format.js';
import type {
  GuestQr,
  NetProblem,
  NetRole,
  NetSettings,
  NetSnapshot,
  NetSummary,
} from '../types.js';
import { networkStyles } from './networkStyles.js';

type TabId = 'prehled' | 'zarizeni' | 'switche' | 'hoste';
const TABS: ReadonlyArray<readonly [TabId, string]> = [
  ['prehled', 'Přehled'],
  ['zarizeni', 'Zařízení'],
  ['switche', 'Switche a PoE'],
  ['hoste', 'Wi-Fi pro hosty'],
];
const POLL_MS = 30_000;
const SEV_LABEL: Record<string, string> = {
  critical: 'Problém',
  warning: 'Upozornění',
  notice: 'Tip',
  info: 'Info',
};
const SEV_TONE = { critical: 'crit', warning: 'warn', notice: 'accent', info: 'neutral' } as const;

const nowS = () => Date.now() / 1000;

function tabFromRoute(path: string | undefined): TabId {
  const seg = (path ?? '').split('/').filter(Boolean).pop();
  return TABS.some(([id]) => id === seg) ? (seg as TabId) : 'prehled';
}

function useNetwork(api: NetworkApi | null, admin: boolean) {
  const [snap, setSnap] = useState<NetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!api || !admin) return;
    api.get().then(
      (s) => {
        setSnap(s);
        setError(null);
      },
      () => setError('Data sítě se nepodařilo načíst.'),
    );
  }, [api, admin]);
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  return { snap, error, reload: load };
}

/* ---------- Přehled ---------- */

function Hero({ snap, onTab }: { snap: NetSnapshot; onTab: (t: TabId) => void }) {
  const hero = heroModel(snap);
  const tiles = statTiles(snap);
  return (
    <Card
      className="hb-hero net-hero"
      tone={hero.severity === 'ok' ? 'calm' : hero.severity}
      data-testid="network-hero"
      data-net-state={hero.severity}
    >
      <div className="net-hero-copy">
        <Pill
          tone={hero.severity === 'ok' ? 'ok' : hero.severity === 'critical' ? 'crit' : 'warn'}
          dot
        >
          {hero.badge}
        </Pill>
        <h2 data-testid="network-headline">{hero.headline}</h2>
        <p>{hero.context}</p>
        <div className="net-hero-actions">
          <Button variant="ghost" size="sm" onClick={() => onTab('zarizeni')}>
            Zařízení
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onTab('hoste')}>
            Wi-Fi pro hosty
          </Button>
        </div>
      </div>
      <div className="net-stats">
        {tiles.map((t) => (
          <div
            key={t.id}
            className="net-stat"
            data-tone={t.tone}
            data-testid={`network-stat-${t.id}`}
          >
            <span className="net-stat-label">{t.label}</span>
            <strong>{t.value}</strong>
            <small>{t.detail}</small>
          </div>
        ))}
      </div>
    </Card>
  );
}

function House({ snap }: { snap: NetSnapshot }) {
  const rows = floorRows(snap);
  return (
    <Card className="net-card" data-testid="network-house">
      <header className="net-card-head">
        <h3>Dům</h3>
        <span>Wi-Fi body podle pater</span>
      </header>
      <div className="net-floors">
        {rows.map((f) => (
          <div key={f.id} className="net-floor" data-outdoor={f.id === 'outdoor' || undefined}>
            <span className="net-floor-name">{f.name}</span>
            <div className="net-floor-aps">
              {f.aps.map((a) => (
                <span
                  key={a.id}
                  className="net-ap"
                  data-problem={a.problem ?? undefined}
                  data-testid="network-ap"
                >
                  <span className="net-ap-dot" aria-hidden="true" />
                  <span className="net-ap-name">{a.name}</span>
                  <span className="net-ap-n">{isOnline(a) ? (a.clients ?? 0) : 'offline'}</span>
                </span>
              ))}
              {f.switches > 0 && (
                <span className="net-ap net-sw">
                  <span className="net-sw-glyph" aria-hidden="true" />
                  <span className="net-ap-name">
                    {czCount(f.switches, 'switch', 'switche', 'switchů')}
                  </span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Load({ snap }: { snap: NetSnapshot }) {
  const { rows, note } = loadRows(snap);
  return (
    <Card className="net-card" data-testid="network-load">
      <header className="net-card-head">
        <h3>Zátěž Wi-Fi bodů</h3>
        <span>klienti teď</span>
      </header>
      <ul className="net-load">
        {rows.map((r) => (
          <li key={r.id} data-problem={r.problem || undefined}>
            <span className="net-load-name">{r.name}</span>
            <span className="net-load-bar">
              <span style={{ width: `${Math.max(4, r.frac * 100)}%` }} />
            </span>
            <strong>{r.clients}</strong>
            <small>
              CPU {r.cpu != null ? Math.round(r.cpu) : '–'} % · RAM{' '}
              {r.mem != null ? Math.round(r.mem) : '–'} %
            </small>
          </li>
        ))}
      </ul>
      {note && <p className="net-note">{note}</p>}
    </Card>
  );
}

function ProblemCard({ p, now }: { p: NetProblem; now: number }) {
  return (
    <Card
      className="net-problem"
      tone={p.severity === 'critical' ? 'critical' : 'warning'}
      data-testid="network-problem"
      data-rule={p.rule}
    >
      <div className="net-problem-head">
        <Pill tone={SEV_TONE[p.severity]} size="sm">
          {SEV_LABEL[p.severity]}
        </Pill>
        {p.important && <small>důležité zařízení</small>}
        {p.since != null && <small>{sinceLabel(p.since, now)}</small>}
      </div>
      <h4>{p.title}</h4>
      {p.context && <p>{p.context}</p>}
      <div className="net-fix">
        <span>Co s tím</span>
        <p>{p.fix}</p>
      </div>
    </Card>
  );
}

function Overview({ snap, onTab }: { snap: NetSnapshot; onTab: (t: TabId) => void }) {
  const { serious, tips } = splitProblems(snap.problems);
  const now = nowS();
  const okAreas = [
    !snap.problems.some((p) => p.rule.startsWith('internet')) && 'internet',
    !snap.problems.some((p) => p.rule === 'client_imbalance' || p.rule.startsWith('device_high')) &&
      'zátěž',
    !snap.problems.some((p) => p.target.kind === 'switch' || p.target.kind === 'port') && 'switche',
    !snap.problems.some((p) => p.rule.startsWith('important')) && 'důležitá zařízení',
  ].filter(Boolean);
  return (
    <>
      <Hero snap={snap} onTab={onTab} />
      <div className="net-grid">
        <div className="net-col">
          <House snap={snap} />
          <Load snap={snap} />
        </div>
        <div className="net-col">
          <header className="net-section-head">
            <h3>Co řešit</h3>
            <span>od nejdůležitějšího</span>
          </header>
          {serious.length === 0 && (
            <Card className="net-card net-calm" data-testid="network-no-problems">
              <p>Nic nehoří. Síť běží bez problémů.</p>
            </Card>
          )}
          {serious.map((p) => (
            <ProblemCard key={p.id} p={p} now={now} />
          ))}
          {tips.length > 0 && (
            <Card className="net-card" data-testid="network-tips">
              <header className="net-card-head">
                <h3>Tipy</h3>
                <span>{czCount(tips.length, 'tip', 'tipy', 'tipů')} · nic nehoří</span>
              </header>
              {tips.map((t) => (
                <StatusRow
                  key={t.id}
                  label={t.title}
                  value={null}
                  detail={t.fix}
                  tone={t.severity === 'notice' ? 'accent' : 'neutral'}
                  data-testid="network-tip"
                />
              ))}
            </Card>
          )}
          {okAreas.length > 0 && (
            <p className="net-ok-strip">Ostatní v pořádku: {okAreas.join(', ')}.</p>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- Zařízení ---------- */

type Filter = 'vse' | 'dulezita' | 'offline';

function Devices({
  snap,
  api,
  onSaved,
}: {
  snap: NetSnapshot;
  api: NetworkApi;
  onSaved: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('vse');
  const [busy, setBusy] = useState(false);
  const apName = new Map([...snap.aps].map((a) => [a.id, a.name]));
  const floors = snap.floors.filter((f) => f.id !== 'outdoor');
  const shown = snap.clients.filter((c) =>
    filter === 'dulezita' ? c.important : filter === 'offline' ? !c.online : true,
  );
  const save = async (next: NetSettings['important']) => {
    setBusy(true);
    try {
      await api.saveSettings({ important: next });
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  const current = () =>
    snap.clients
      .filter((c) => c.important)
      .map((c) => ({
        id: c.id,
        ...(c.expected_floor_id ? { expected_floor_id: c.expected_floor_id } : {}),
      }));
  const toggle = (id: string, on: boolean) =>
    save(on ? [...current(), { id }] : current().filter((i) => i.id !== id));
  const setFloor = (id: string, floor: string) =>
    save(
      current().map((i) => (i.id === id ? (floor ? { id, expected_floor_id: floor } : { id }) : i)),
    );
  if (!snap.clients.length)
    return (
      <EmptyState title="Žádná zařízení">
        UniFi v Home Assistantu nehlásí žádné klienty (trackery jsou vypnuté).
      </EmptyState>
    );
  return (
    <Card className="net-card" data-testid="network-devices">
      <header className="net-card-head">
        <h3>Zařízení</h3>
        <span>
          {czCount(snap.clients.filter((c) => c.online).length, 'online', 'online', 'online')} ·
          hvězdička = hlídat
        </span>
      </header>
      <div className="net-chips">
        {(
          [
            ['vse', 'Vše'],
            ['dulezita', 'Důležitá'],
            ['offline', 'Offline'],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} pressed={filter === id} look="soft" onPress={() => setFilter(id)}>
            {label}
          </Chip>
        ))}
      </div>
      <ul className="net-devices">
        {shown.map((c) => (
          <li key={c.id} data-testid="network-device" data-online={c.online}>
            <span className="net-dev-dot" data-online={c.online} aria-hidden="true" />
            <span className="net-dev-copy">
              <strong>{c.label}</strong>
              <small>
                {c.online
                  ? c.wired
                    ? 'kabel'
                    : `Wi-Fi${c.ap_id ? ` · ${apName.get(c.ap_id) ?? 'bod'}` : ''}`
                  : `offline ${sinceLabel(c.since, nowS())}`}
              </small>
            </span>
            {c.important && floors.length > 0 && (
              <select
                className="net-select"
                aria-label={`Patro pro ${c.label}`}
                value={c.expected_floor_id ?? ''}
                disabled={busy}
                onChange={(e) => void setFloor(c.id, e.target.value)}
              >
                <option value="">kdekoli</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            <Chip
              pressed={c.important}
              look="soft"
              disabled={busy}
              aria-label={`${c.important ? 'Nehlídat' : 'Hlídat'} ${c.label}`}
              onPressedChange={(on: boolean) => void toggle(c.id, on)}
            >
              {c.important ? '★' : '☆'}
            </Chip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Switche a PoE ---------- */

function Switches({ snap }: { snap: NetSnapshot }) {
  if (!snap.switches.length)
    return <EmptyState title="Žádné switche">UniFi nehlásí žádné switche.</EmptyState>;
  return (
    <div className="net-switches">
      {snap.switches.map((sw) => {
        const share = poeShare(sw);
        const slow = new Set(
          snap.problems
            .filter((p) => p.rule === 'port_slow' && p.target.id.startsWith(`${sw.id}:`))
            .map((p) => Number(p.target.id.split(':').pop())),
        );
        return (
          <Card key={sw.id} className="net-card" data-testid="network-switch">
            <header className="net-card-head">
              <h3>{sw.name}</h3>
              <span>{sw.model_label}</span>
            </header>
            {share != null && sw.poe && (
              <div
                className="net-budget"
                data-level={share >= 0.95 ? 'crit' : share >= 0.8 ? 'warn' : 'ok'}
              >
                <div className="net-budget-head">
                  <span>PoE</span>
                  <strong>
                    {Math.round(sw.poe.used_w)} W z {sw.poe.budget_w} W
                  </strong>
                </div>
                <span className="net-budget-bar">
                  <span style={{ width: `${share * 100}%` }} />
                  <i style={{ left: '80%' }} aria-hidden="true" />
                </span>
              </div>
            )}
            {sw.ports.length > 0 && (
              <ul className="net-ports" aria-label="Porty">
                {sw.ports.map((p) => (
                  <li key={p.n} data-slow={slow.has(p.n) || undefined} data-testid="network-port">
                    <span>{p.n}</span>
                    <strong>{speedLabel(p.speed_mbps)}</strong>
                    <small>{p.poe_w ? `${p.poe_w.toFixed(1).replace('.', ',')} W` : ' '}</small>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- Wi-Fi pro hosty ---------- */

function GuestWifi({
  api,
  admin,
  compact,
}: {
  api: NetworkApi;
  admin: boolean;
  compact?: boolean;
}) {
  const [qr, setQr] = useState<GuestQr | null>(null);
  const [form, setForm] = useState<{ ssid: string; password: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    api.guestQr().then(setQr, () => setQr({ configured: false, ssid: null, qr_payload: null }));
  }, [api]);
  useEffect(load, [load]);
  const startEdit = async () => {
    const s = await api.settings();
    setForm({ ssid: s.guest?.ssid ?? '', password: s.guest?.password ?? '' });
  };
  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.saveSettings({
        guest: form.ssid.trim()
          ? {
              ssid: form.ssid.trim(),
              password: form.password || null,
              security: form.password ? 'WPA' : 'nopass',
            }
          : null,
      });
      setForm(null);
      load();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card
      className="net-card net-guest"
      data-testid="network-guest"
      data-compact={compact || undefined}
    >
      <header className="net-card-head">
        <h3>Wi-Fi pro hosty</h3>
        <span>naskenujte fotoaparátem</span>
      </header>
      {qr?.configured && qr.qr_payload ? (
        <div className="net-guest-body">
          <QrCode
            value={qr.qr_payload}
            label={`QR kód Wi-Fi ${qr.ssid}`}
            size={compact ? 168 : 220}
          />
          <div className="net-guest-copy">
            <span className="net-stat-label">Síť</span>
            <strong data-testid="network-guest-ssid">{qr.ssid}</strong>
            <small>{qr.open ? 'bez hesla' : 'heslo je v QR kódu'}</small>
          </div>
        </div>
      ) : (
        qr && (
          <p className="net-note" data-testid="network-guest-hint">
            {admin
              ? 'Hostovská Wi-Fi zatím není nastavená. Vytvořte hostovskou síť v UniFi a sem zadejte její název a heslo – QR uvidí celá rodina i tablet v kuchyni.'
              : 'Hostovská Wi-Fi zatím není nastavená. Požádejte správce domácnosti.'}
          </p>
        )
      )}
      {admin && !form && (
        <Button size="sm" onClick={() => void startEdit()} data-testid="network-guest-edit">
          {qr?.configured ? 'Upravit' : 'Nastavit'}
        </Button>
      )}
      {admin && form && (
        <form
          className="net-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Název sítě (SSID)
            <input
              value={form.ssid}
              maxLength={32}
              onChange={(e) => setForm({ ...form, ssid: e.target.value })}
            />
          </label>
          <label>
            Heslo
            <input
              type="password"
              value={form.password}
              maxLength={63}
              autoComplete="off"
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <div className="net-form-actions">
            <Button variant="primary" size="sm" type="submit" loading={saving}>
              Uložit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setForm(null)}>
              Zrušit
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/* ---------- Summary (adults, kiosk) ---------- */

function SummaryView({ api }: { api: NetworkApi }) {
  const [summary, setSummary] = useState<NetSummary | null>(null);
  useEffect(() => {
    const load = () => api.summary().then(setSummary, () => setSummary(null));
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [api]);
  const problem = summary?.status === 'problem';
  return (
    <>
      {summary && (
        <Card
          className="hb-hero net-hero net-summary"
          tone={problem ? (summary.severity === 'critical' ? 'critical' : 'warning') : 'calm'}
          data-testid="network-summary"
          data-net-state={summary.status}
        >
          <div className="net-hero-copy">
            <Pill tone={problem ? 'warn' : 'ok'} dot>
              {problem
                ? czCount(summary.problems_count, 'problém', 'problémy', 'problémů')
                : 'Vše v pořádku'}
            </Pill>
            <h2 data-testid="network-headline">{summary.headline}</h2>
            <p>
              {summary.internet_online === false
                ? 'Internet teď nejde.'
                : problem
                  ? 'Správce domácnosti už o tom ví – detail vidí v modulu Síť.'
                  : 'Internet i Wi-Fi běží.'}
            </p>
          </div>
        </Card>
      )}
      <GuestWifi api={api} admin={false} compact />
    </>
  );
}

/* ---------- View ---------- */

export default function NetworkView({ connection, route, kiosk }: ModuleViewProps) {
  const api = useMemo(() => getNetworkApi(connection), [connection]);
  const [role, setRole] = useState<NetRole | null>(null);
  const [tab, setTab] = useState<TabId>(() => tabFromRoute(route?.path));
  useEffect(() => {
    if (!api) return;
    void api.role().then(setRole, () => setRole('guest'));
  }, [api]);
  // A shared wall screen never gets more than the summary, even when signed in as admin.
  const admin = role === 'owner' && !kiosk;
  const { snap, error, reload } = useNetwork(api, admin);
  const selectTab = (next: TabId) => {
    setTab(next);
    try {
      navigateTab(next === 'prehled' ? '/network' : `/network/${next}`, next === 'prehled');
    } catch {
      /* outside HA */
    }
  };
  let body;
  if (!api)
    body = (
      <EmptyState title="Síť není k dispozici">Potřebuje připojení k Home Assistantu.</EmptyState>
    );
  else if (!role) body = null;
  else if (!admin) body = <SummaryView api={api} />;
  else if (error && !snap) body = <EmptyState title="Síť se nenačetla">{error}</EmptyState>;
  else if (!snap) body = null;
  else if (!snap.aps.length && !snap.switches.length && tab !== 'hoste')
    body = (
      <EmptyState title="UniFi nenalezeno">
        Modul čte integraci UniFi Network a ping v Home Assistantu. Přidejte je a zařízení se objeví
        samy.
      </EmptyState>
    );
  else
    body =
      tab === 'prehled' ? (
        <Overview snap={snap} onTab={selectTab} />
      ) : tab === 'zarizeni' ? (
        <Devices snap={snap} api={api} onSaved={reload} />
      ) : tab === 'switche' ? (
        <Switches snap={snap} />
      ) : (
        <GuestWifi api={api} admin />
      );
  return (
    <div className="net" data-testid="network-view" data-role={role ?? undefined}>
      <style>{networkStyles}</style>
      <header className="net-head">
        <h1>Síť</h1>
        {admin && snap && (
          <span className="net-updated">
            aktualizováno{' '}
            {sinceLabel(snap.updated_at, nowS()) === 'právě teď'
              ? 'teď'
              : `před ${sinceLabel(snap.updated_at, nowS())}`}
          </span>
        )}
        {admin && (
          <SegmentedControl
            label="Sekce"
            hideLabel
            size="sm"
            value={tab}
            options={TABS}
            onChange={selectTab}
            className="net-tabs"
          />
        )}
      </header>
      {body}
    </div>
  );
}
