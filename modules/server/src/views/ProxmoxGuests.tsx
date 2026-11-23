import { useEffect, useState } from 'react';
import { Card, EmptyState, Icon, Pill, Sheet } from '@homebrain/ui';
import type { ServerApi } from '../api.js';
import {
  fmtBytes,
  fmtPct,
  fmtRate,
  guestAnchor,
  hostShare,
  levelTone,
  sortGuests,
  uptimeLabel,
  uptimeShort,
  type BarTone,
} from '../format.js';
import type { ProxmoxGuest, ServerHistory } from '../types.js';
import { Bar, PctTrend } from './parts.js';

const guestStates: Record<string, { label: string; tone: 'ok' | 'neutral' | 'warn' }> = {
  running: { label: 'Běží', tone: 'ok' },
  stopped: { label: 'Vypnuto', tone: 'neutral' },
  suspended: { label: 'Pozastaveno', tone: 'warn' },
  paused: { label: 'Pozastaveno', tone: 'warn' },
};

const stateOf = (guest: ProxmoxGuest) =>
  guest.status
    ? (guestStates[guest.status] ?? { label: 'Jiný stav', tone: 'neutral' as const })
    : null;

const kindLabel = (guest: ProxmoxGuest) => (guest.kind === 'vm' ? 'VM' : 'CT');
/** Highlight only real problems; a calm metric keeps the neutral colour. */
const metricTone = (level: ProxmoxGuest['cpu_level']): BarTone | undefined =>
  level === 'warning' || level === 'critical' ? levelTone(level) : undefined;

const vcpu = (cpus: number | null | undefined) => (cpus ? `${cpus}${' '}vCPU` : null);

function cpuText(guest: ProxmoxGuest) {
  return [fmtPct(guest.cpu_percent), vcpu(guest.cpus)].filter(Boolean).join(' · ');
}

function memText(guest: ProxmoxGuest) {
  if (guest.mem_bytes != null && guest.mem_max_bytes != null)
    return `${fmtBytes(guest.mem_bytes)} z ${fmtBytes(guest.mem_max_bytes)}`;
  if (guest.mem_max_bytes != null) return `${fmtBytes(guest.mem_max_bytes)} přiděleno`;
  return fmtPct(guest.mem_percent);
}

/** CT: real usage; VM: PVE only knows the allocation (no guest agent → 0 B used). */
function diskText(guest: ProxmoxGuest) {
  if (guest.disk_bytes != null && guest.disk_max_bytes != null)
    return `${fmtBytes(guest.disk_bytes)} z ${fmtBytes(guest.disk_max_bytes)}`;
  if (guest.disk_max_bytes != null) return `přiděleno ${fmtBytes(guest.disk_max_bytes)}`;
  return null;
}

function netText(guest: ProxmoxGuest) {
  if (guest.netin_bps == null && guest.netout_bps == null)
    return guest.netin_bytes != null || guest.netout_bytes != null ? 'měří se…' : null;
  return `↓${' '}${fmtRate(guest.netin_bps)} ↑${' '}${fmtRate(guest.netout_bps)}`;
}

/** Short word next to a highlighted metric: the warning is readable without colour. */
const FLAGS = { cpu: 'vytížený', ram: 'plná', disk: 'plný' } as const;

function Metric({
  label,
  tone,
  value,
  bar,
  flag,
}: {
  label: string;
  tone?: BarTone;
  value: string;
  bar?: number | null;
  flag?: string;
}) {
  const alarm = tone === 'warn' || tone === 'crit';
  return (
    <span className="srv-gm" data-tone={tone}>
      <small>
        {label}
        {alarm && flag && (
          <span className="srv-gm-flag" data-testid="server-guest-flag">
            <Icon name="alert" size={14} />
            {flag}
          </span>
        )}
      </small>
      {bar != null && <Bar value={bar} tone={tone ?? 'ok'} />}
      <span className="srv-gm-val">{value}</span>
    </span>
  );
}

function GuestRow({ guest, onOpen }: { guest: ProxmoxGuest; onOpen: () => void }) {
  const state = stateOf(guest);
  const running = guest.status === 'running';
  const disk = diskText(guest);
  const net = netText(guest);
  const uptime = running ? uptimeShort(guest.up_since) : null;
  const allocated = [
    vcpu(guest.cpus),
    guest.mem_max_bytes != null ? `${fmtBytes(guest.mem_max_bytes)} RAM` : null,
    disk,
  ].filter(Boolean);
  return (
    <li
      data-testid="server-proxmox-guest"
      data-vmid={guest.vmid}
      data-stopped={guest.status === 'stopped' || undefined}
    >
      <button
        type="button"
        className="srv-guest"
        id={guestAnchor(guest)}
        aria-haspopup="dialog"
        aria-label={`${guest.name}, ${kindLabel(guest)} ${guest.vmid}${state ? `, ${state.label}` : ''}`}
        onClick={onOpen}
      >
        <span className="srv-guest-head">
          <b>{guest.name}</b>
          <small>
            {kindLabel(guest)} {guest.vmid}
          </small>
          {uptime && <small className="srv-guest-up">{uptime}</small>}
          {state && (
            <Pill
              tone={state.tone}
              size="sm"
              className="srv-guest-state"
              data-testid="server-guest-state"
            >
              {state.label}
            </Pill>
          )}
        </span>
        {running ? (
          <span className="srv-guest-metrics" data-testid="server-guest-metrics">
            <Metric
              label="CPU"
              tone={metricTone(guest.cpu_level)}
              value={cpuText(guest)}
              flag={FLAGS.cpu}
            />
            <Metric
              label="RAM"
              tone={metricTone(guest.mem_level)}
              value={memText(guest)}
              bar={guest.mem_percent}
              flag={FLAGS.ram}
            />
            {disk && (
              <Metric
                label="Disk"
                flag={FLAGS.disk}
                tone={metricTone(guest.disk_level)}
                value={disk}
                bar={guest.disk_percent}
              />
            )}
            {net && <Metric label="Síť" value={net} />}
          </span>
        ) : (
          allocated.length > 0 && <small className="srv-guest-alloc">{allocated.join(' · ')}</small>
        )}
      </button>
    </li>
  );
}

function useGuestHistory(api: ServerApi | null, guest: ProxmoxGuest | null) {
  const [history, setHistory] = useState<{ key: string; data: ServerHistory } | null>(null);
  const key = guest ? `${guest.kind}-${guest.vmid}` : null;
  const kind = guest?.kind;
  const vmid = guest?.vmid;
  useEffect(() => {
    if (!api || !key || kind == null || vmid == null) return;
    let live = true;
    const done = (data: ServerHistory) => live && setHistory({ key, data });
    api.history(24, { vmid, kind }).then(done, () => done({ hours: 24, series: {} }));
    return () => {
      live = false;
    };
  }, [api, key, kind, vmid]);
  return history?.key === key ? history.data : null;
}

function GuestSheet({
  guest,
  cores,
  api,
  onClose,
}: {
  guest: ProxmoxGuest;
  cores: number | null;
  api: ServerApi | null;
  onClose: () => void;
}) {
  const history = useGuestHistory(api, guest);
  const state = stateOf(guest);
  const running = guest.status === 'running';
  const share = running ? hostShare(guest, cores) : null;
  const disk = diskText(guest);
  const uptime = running ? uptimeLabel(guest.up_since) : null;
  const totals = [
    guest.netin_bytes != null ? `přijato ${fmtBytes(guest.netin_bytes)}` : null,
    guest.netout_bytes != null ? `odesláno ${fmtBytes(guest.netout_bytes)}` : null,
  ].filter(Boolean);
  const memTone = metricTone(guest.mem_level);
  const diskTone = metricTone(guest.disk_level);
  return (
    <Sheet
      title={guest.name}
      onClose={onClose}
      closeLabel="Zavřít"
      dismissOnScrim
      appearance="raised"
      data-testid="server-guest-sheet"
      aside={
        state && (
          <Pill tone={state.tone} size="sm">
            {state.label}
          </Pill>
        )
      }
    >
      <dl className="srv-guest-dl">
        <div>
          <dt>Typ</dt>
          <dd>
            {guest.kind === 'vm' ? 'Virtuální stroj' : 'Kontejner'} · {kindLabel(guest)}{' '}
            {guest.vmid}
          </dd>
        </div>
        {uptime && (
          <div>
            <dt>Doba běhu</dt>
            <dd>{uptime}</dd>
          </div>
        )}
        <div data-tone={running ? metricTone(guest.cpu_level) : undefined}>
          <dt>Procesor</dt>
          <dd data-testid="server-guest-cpu">
            {running ? cpuText(guest) : (vcpu(guest.cpus) ?? '–')}
            {share != null && <small>{fmtPct(share)} celého hostitele</small>}
          </dd>
        </div>
        <div data-tone={memTone}>
          <dt>Paměť</dt>
          <dd>
            {running ? memText(guest) : fmtBytes(guest.mem_max_bytes)}
            {running && guest.mem_percent != null && <small>{fmtPct(guest.mem_percent)}</small>}
          </dd>
          {running && guest.mem_percent != null && (
            <Bar value={guest.mem_percent} tone={memTone ?? 'ok'} label="Využití paměti" />
          )}
        </div>
        {disk && (
          <div data-tone={diskTone}>
            <dt>Disk</dt>
            <dd data-testid="server-guest-disk">
              {disk}
              {guest.disk_percent != null && <small>{fmtPct(guest.disk_percent)}</small>}
            </dd>
            {guest.disk_percent != null && (
              <Bar value={guest.disk_percent} tone={diskTone ?? 'ok'} label="Zaplnění disku" />
            )}
            {guest.kind === 'vm' && guest.disk_bytes == null && (
              <small>Obsazené místo Proxmox u VM bez guest agenta nezná.</small>
            )}
          </div>
        )}
        {running && (
          <div>
            <dt>Síť</dt>
            <dd data-testid="server-guest-net">{netText(guest) ?? '–'}</dd>
            {totals.length > 0 && <small>od startu {totals.join(' · ')}</small>}
          </div>
        )}
      </dl>
      {running ? (
        <div className="srv-guest-charts">
          <section>
            <h3>Procesor za 24 h</h3>
            <PctTrend
              history={history}
              series="cpu"
              current={guest.cpu_percent}
              tone={metricTone(guest.cpu_level)}
              testId="server-guest-trend-cpu"
            />
          </section>
          <section>
            <h3>Paměť za 24 h</h3>
            <PctTrend
              history={history}
              series="memory"
              current={guest.mem_percent}
              tone={memTone}
              testId="server-guest-trend-memory"
            />
          </section>
        </div>
      ) : (
        <p className="srv-note">Vypnutý stroj nemá živé údaje.</p>
      )}
    </Sheet>
  );
}

export function ProxmoxGuests({
  guests,
  cores,
  api,
}: {
  guests: ProxmoxGuest[];
  cores: number | null;
  api: ServerApi | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = sortGuests(guests);
  const selected = rows.find((g) => `${g.kind}-${g.vmid}` === open) ?? null;
  const running = rows.filter((g) => g.status === 'running').length;
  return (
    <Card className="srv-panel srv-proxmox-guests" data-testid="server-proxmox-guests">
      <div className="srv-panel-head">
        <h3>Virtuální stroje a kontejnery</h3>
        {rows.length > 0 && (
          <span className="srv-micro">
            běží {running} z {rows.length} · podle CPU
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Žádné virtuální stroje ani kontejnery" />
      ) : (
        <ul className="srv-list srv-proxmox-rows srv-guests">
          {rows.map((guest) => (
            <GuestRow
              key={`${guest.kind}-${guest.vmid}`}
              guest={guest}
              onOpen={() => setOpen(`${guest.kind}-${guest.vmid}`)}
            />
          ))}
        </ul>
      )}
      {selected && (
        <GuestSheet guest={selected} cores={cores} api={api} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}
