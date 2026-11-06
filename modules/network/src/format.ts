import { czCount } from '@homebrain/ui';
import type { NetDevice, NetProblem, NetSeverity, NetSnapshot, NetSummary } from './types.js';

export const SERIOUS: ReadonlySet<NetSeverity> = new Set(['critical', 'warning']);
export const isOnline = (d: NetDevice) => d.state === null || d.state === 'connected';

export function splitProblems(problems: NetProblem[]) {
  return {
    serious: problems.filter((p) => SERIOUS.has(p.severity)),
    tips: problems.filter((p) => !SERIOUS.has(p.severity)),
  };
}

/** Badge text of the hero: „2 problémy · 2 tipy“, „Vše v pořádku“, „1 tip“. */
export function countLabel(summary: Pick<NetSummary, 'problems_count' | 'tips_count'>): string {
  const parts = [];
  if (summary.problems_count)
    parts.push(czCount(summary.problems_count, 'problém', 'problémy', 'problémů'));
  if (summary.tips_count) parts.push(czCount(summary.tips_count, 'tip', 'tipy', 'tipů'));
  return parts.join(' · ') || 'Vše v pořádku';
}

export interface HeroModel {
  severity: 'critical' | 'warning' | 'ok';
  badge: string;
  headline: string;
  context: string;
}

/** The hero answers „Je v síti problém?“ in one sentence. */
export function heroModel(snap: NetSnapshot): HeroModel {
  const { serious } = splitProblems(snap.problems);
  const internetOk = snap.internet?.online !== false;
  const top = serious[0];
  const badge = countLabel(snap.summary);
  if (!top)
    return {
      severity: 'ok',
      badge,
      headline: 'Síť v pořádku',
      context: internetOk
        ? `Internet běží, ${czCount(snap.aps.filter(isOnline).length, 'Wi-Fi bod', 'Wi-Fi body', 'Wi-Fi bodů')} online.`
        : 'Stav internetu neznáme.',
    };
  const rest = serious.length > 1 ? ` A ještě ${serious.length - 1}× další.` : '';
  return {
    severity: top.severity === 'critical' ? 'critical' : 'warning',
    badge,
    headline: top.title,
    context:
      (top.rule.startsWith('internet') ? '' : internetOk ? 'Internet je v pořádku. ' : '') +
      top.context +
      rest,
  };
}

export interface StatTile {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'ok' | 'warn' | 'crit' | 'neutral';
}

export function statTiles(snap: NetSnapshot): StatTile[] {
  const net = snap.internet;
  const apsOn = snap.aps.filter(isOnline).length;
  const swOn = snap.switches.filter(isOnline).length;
  const badAp = snap.problems.find((p) => p.target.kind === 'ap' && SERIOUS.has(p.severity));
  const wifi = snap.clients.filter((c) => c.online && !c.wired).length;
  const wired = snap.clients.filter((c) => c.online && c.wired).length;
  const clientTotal = snap.aps.reduce((n, a) => n + (a.clients ?? 0), 0);
  return [
    {
      id: 'internet',
      label: 'Internet',
      value:
        net?.online === false
          ? 'Výpadek'
          : net?.latency_ms != null
            ? `${Math.round(net.latency_ms)} ms`
            : net
              ? 'Online'
              : '—',
      detail: net ? (net.online === false ? 'bez připojení' : 'odezva teď') : 'chybí ping',
      tone: net?.online === false ? 'crit' : net ? 'ok' : 'neutral',
    },
    {
      id: 'aps',
      label: 'Wi-Fi body',
      value: `${apsOn} / ${snap.aps.length}`,
      detail: badAp ? badAp.title : apsOn === snap.aps.length ? 'vše online' : 'některé offline',
      tone: badAp || apsOn < snap.aps.length ? 'warn' : 'ok',
    },
    {
      id: 'switches',
      label: 'Switche',
      value: `${swOn} / ${snap.switches.length}`,
      detail: swOn === snap.switches.length ? 'vše online' : 'některé offline',
      tone: swOn === snap.switches.length ? 'ok' : 'crit',
    },
    {
      id: 'clients',
      label: 'Zařízení',
      value: String(Math.max(clientTotal, wifi + wired)),
      detail: snap.clients.length ? `${wifi} Wi-Fi, ${wired} kabel` : 'připojených teď',
      tone: 'ok',
    },
  ];
}

export interface FloorRow {
  id: string;
  name: string;
  aps: Array<NetDevice & { problem: NetSeverity | null }>;
  switches: number;
}

/** Floors top-down with their APs (problem severity attached); empty floors are skipped. */
export function floorRows(snap: NetSnapshot): FloorRow[] {
  const worst = (id: string) =>
    snap.problems.find((p) => p.target.kind === 'ap' && p.target.id === id)?.severity ?? null;
  const rows = snap.floors.map((f) => ({
    id: f.id,
    name: f.name,
    aps: snap.aps
      .filter((a) => a.floor_id === f.id)
      .map((a) => ({ ...a, problem: isOnline(a) ? worst(a.id) : ('critical' as const) })),
    switches: snap.switches.filter((s) => s.floor_id === f.id).length,
  }));
  const unplaced = snap.aps.filter((a) => !snap.floors.some((f) => f.id === a.floor_id));
  if (unplaced.length)
    rows.push({
      id: 'unplaced',
      name: 'Bez patra',
      aps: unplaced.map((a) => ({ ...a, problem: worst(a.id) })),
      switches: 0,
    });
  return rows.filter((r) => r.aps.length || r.switches);
}

/** Load bars: AP clients share; the busiest AP's share drives the footer sentence. */
export function loadRows(snap: NetSnapshot) {
  const total = snap.aps.reduce((n, a) => n + (a.clients ?? 0), 0);
  const max = Math.max(1, ...snap.aps.map((a) => a.clients ?? 0));
  const rows = [...snap.aps]
    .sort((a, b) => (b.clients ?? 0) - (a.clients ?? 0))
    .map((a) => ({
      id: a.id,
      name: a.name,
      clients: a.clients ?? 0,
      frac: (a.clients ?? 0) / max,
      cpu: a.cpu_pct,
      mem: a.mem_pct,
      problem: snap.problems.some((p) => p.target.kind === 'ap' && p.target.id === a.id),
    }));
  const top = rows[0];
  const share = top && total ? Math.round((top.clients / total) * 100) : 0;
  const imbalance = snap.problems.some((p) => p.rule === 'client_imbalance');
  const note = top
    ? imbalance
      ? `Nevyvážené – ${top.name} má ${share} % klientů.`
      : `Rozložení je v normě – nejvíc má ${top.name} (${share} %).`
    : '';
  return { rows, note };
}

export function poeShare(sw: NetDevice): number | null {
  if (!sw.poe?.budget_w) return null;
  return Math.min(1, sw.poe.used_w / sw.poe.budget_w);
}

export function sinceLabel(since: number | null, now: number): string {
  if (since == null) return '';
  const min = Math.max(0, Math.round((now - since) / 60));
  if (min < 1) return 'právě teď';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export function speedLabel(mbps: number | null): string {
  if (mbps == null) return '—';
  return mbps >= 1000 ? `${String(mbps / 1000).replace('.', ',')} G` : `${mbps} M`;
}
