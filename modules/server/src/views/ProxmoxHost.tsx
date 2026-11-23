import {
  daysAgoLabel,
  fmtBytes,
  fmtPct,
  fmtRate,
  hostConsumers,
  levelTone,
  loadModel,
  SERVER_ANCHORS,
} from '../format.js';
import type { ProxmoxSnapshot, ServerSnapshot } from '../types.js';
import { Bar, revealCard, worst } from './parts.js';

function backupLine(backup: ProxmoxSnapshot['backup']) {
  if (!backup?.last) return { text: 'bez údajů', tone: undefined };
  const stale = backup.age_level === 'warning' || backup.age_level === 'critical';
  const when = backup.age_days != null ? daysAgoLabel(backup.age_days) : null;
  if (stale) return { text: `${when} · zastaralá`, tone: levelTone(backup.age_level!) };
  if (backup.ok === false) return { text: `${when ?? ''} · selhala`.trim(), tone: 'warn' as const };
  return {
    text: [when, backup.ok ? 'úspěšná' : null].filter(Boolean).join(' · '),
    tone: 'ok' as const,
  };
}

/**
 * Proxmox facts inside the host card: Glances already describes this machine (it runs on the
 * hypervisor), so the node adds only what Glances can't see – storages, backup, guests' load.
 */
export function ProxmoxHostFacts({
  snap,
  proxmox,
}: {
  snap: ServerSnapshot;
  proxmox: ProxmoxSnapshot;
}) {
  const load = loadModel(snap);
  const io = snap.diskio?.disks.find((d) => d.name === snap.diskio?.primary);
  const consumers = hostConsumers(snap);
  const backup = backupLine(proxmox.backup);
  const storages = proxmox.storages;
  const manyNodes = new Set(storages.map((s) => s.node)).size > 1;
  const storageLevel = worst(storages.map((s) => s.level));
  const storageTone =
    storageLevel === 'critical' || storageLevel === 'warning' ? levelTone(storageLevel) : undefined;
  return (
    <div className="srv-host" data-testid="server-host-facts">
      <dl className="srv-host-facts">
        {load && (
          <div data-tone={load.tone === 'warn' ? 'warn' : undefined} data-testid="server-host-load">
            <dt>Zátěž</dt>
            <dd>
              {load.value}
              {load.avg && <small title="průměr za 1 / 5 / 15 min">1/5/15 min {load.avg}</small>}
            </dd>
          </div>
        )}
        {io && (
          <div data-testid="server-host-diskio">
            <dt>Disk I/O</dt>
            <dd>
              čtení {fmtRate(io.read_bps)} · zápis {fmtRate(io.write_bps)}
              <small>{io.name}</small>
            </dd>
          </div>
        )}
        <div data-tone={backup.tone === 'ok' ? undefined : backup.tone}>
          <dt>Záloha</dt>
          <dd data-testid="server-host-backup">
            <button
              type="button"
              className="srv-link"
              onClick={() => revealCard(SERVER_ANCHORS.backup)}
            >
              {backup.text}
            </button>
          </dd>
        </div>
      </dl>
      {consumers.length > 0 && (
        <p
          className="srv-consumers"
          id={SERVER_ANCHORS.consumers}
          tabIndex={-1}
          data-testid="server-host-consumers"
        >
          <span className="srv-micro">Kdo vytěžuje hostitele</span>
          {consumers.map((c) => (
            <span key={c.vmid} className="srv-consumer">
              <b>{c.name}</b> {fmtPct(c.share)}
            </span>
          ))}
        </p>
      )}
      {storages.length > 0 && (
        <ul
          className="srv-host-storages"
          id={SERVER_ANCHORS.storage}
          tabIndex={-1}
          aria-label="Úložiště Proxmoxu"
          data-testid="server-proxmox-storages"
          data-tone={storageTone}
        >
          {storages.map((storage) => (
            <li
              key={JSON.stringify([storage.node, storage.name])}
              data-testid="server-proxmox-storage"
              data-tone={levelTone(storage.level)}
            >
              <div className="srv-row-head">
                <b>{storage.name}</b>
                {manyNodes && <small>{storage.node}</small>}
                {storage.active === false && <small>Neaktivní</small>}
                <span className="srv-row-val">{fmtPct(storage.percent)}</span>
              </div>
              {storage.percent != null && (
                <Bar value={storage.percent} tone={levelTone(storage.level)} label={storage.name} />
              )}
              <small>
                {storage.used_bytes != null && storage.total_bytes != null
                  ? `${fmtBytes(storage.used_bytes)} z ${fmtBytes(storage.total_bytes)}`
                  : storage.total_bytes != null
                    ? `${fmtBytes(storage.total_bytes)} celkem`
                    : ''}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
