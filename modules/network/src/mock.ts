import type { NetworkApi } from './api.js';
import type {
  GuestQr,
  NetClient,
  NetDevice,
  NetProblem,
  NetRole,
  NetSettings,
  NetSnapshot,
  TopoEdge,
  TopoGraph,
  TopoNode,
} from './types.js';

/** Dev/e2e scenarios (`?sit=`): synthetic house, 7 APs, 3 switches – no real data. */
export type NetworkScenario = 'problems' | 'ok' | 'down' | 'empty';
export const NETWORK_SCENARIOS: NetworkScenario[] = ['problems', 'ok', 'down', 'empty'];

const FLOORS = [
  { id: 'f2', name: '2. patro', level: 2 },
  { id: 'f1', name: '1. patro', level: 1 },
  { id: 'f0', name: 'Přízemí', level: 0 },
  { id: 'fm1', name: '-1. patro', level: -1 },
  { id: 'outdoor', name: 'Venku', level: null },
];

const dev = (over: Partial<NetDevice> & Pick<NetDevice, 'id' | 'name'>): NetDevice => ({
  model: 'U7PRO',
  model_label: 'U7 Pro',
  area: null,
  floor_id: 'f0',
  state: 'connected',
  state_since: null,
  clients: 0,
  cpu_pct: 5,
  mem_pct: 55,
  uplink: { id: 'sw-lite', name: 'USW Lite 16' },
  fw: { installed: '8.7.11', latest: '8.7.11', update: false },
  flaps_24h: 0,
  ports: [],
  ...over,
});

function snapshotFor(scenario: NetworkScenario, now: number): NetSnapshot {
  const h = 3600;
  const aps: NetDevice[] = [
    dev({
      id: 'ap-pracovna',
      name: 'Pracovna',
      floor_id: 'f1',
      clients: 8,
      cpu_pct: 9,
      mem_pct: 71,
    }),
    dev({ id: 'ap-obyvak', name: 'Obývák', floor_id: 'f0', clients: 6, cpu_pct: 7, mem_pct: 58 }),
    dev({ id: 'ap-kuchyn', name: 'Kuchyň', floor_id: 'f0', clients: 5, cpu_pct: 5, mem_pct: 55 }),
    dev({
      id: 'ap-terasa',
      name: 'Terasa',
      floor_id: 'outdoor',
      model: 'UKPW',
      model_label: 'U7 Outdoor',
      clients: 4,
      cpu_pct: 2,
      mem_pct: 62,
      flaps_24h: scenario === 'problems' ? 3 : 0,
    }),
    dev({
      id: 'ap-podkrovi',
      name: 'Podkroví',
      floor_id: 'f2',
      model: 'UAP6MP',
      model_label: 'U6 Pro',
      clients: 3,
      cpu_pct: 4,
      mem_pct: 49,
      fw: { installed: '6.8.2', latest: '6.8.3', update: scenario === 'problems' },
    }),
    dev({ id: 'ap-loznice', name: 'Ložnice', floor_id: 'f1', clients: 3, cpu_pct: 3, mem_pct: 52 }),
    dev({ id: 'ap-dilna', name: 'Dílna', floor_id: 'fm1', clients: 2, cpu_pct: 6, mem_pct: 44 }),
  ];
  const port = (n: number, speed: number | null, poe: number | null = null) => ({
    n,
    speed_mbps: speed,
    poe_w: poe,
  });
  const switches: NetDevice[] = [
    dev({
      id: 'sw-lite',
      name: 'USW Lite 16',
      model: 'USL16LP',
      model_label: 'USW Lite 16 PoE',
      floor_id: 'fm1',
      clients: 9,
      uplink: null,
      ports: [
        port(1, 1000),
        port(2, 1000, 7.3),
        port(3, 1000, 6.1),
        port(4, 1000, 5.9),
        port(5, 1000, 5.6),
        port(6, scenario === 'problems' ? 100 : 1000, 6.4),
        port(7, 1000, 5.2),
        port(8, null, null),
        port(9, 1000),
        port(10, 1000),
      ],
      poe: { used_w: scenario === 'problems' ? 36.9 : 30.1, budget_w: 45 },
    }),
    dev({
      id: 'sw-ultra',
      name: 'USW Ultra',
      model: 'USM8P',
      model_label: 'USW Ultra',
      floor_id: 'fm1',
      clients: 4,
      uplink: null,
      ports: [port(1, 1000, 7.7), port(2, 1000), port(3, 100), port(8, 1000)],
      poe: { used_w: 12, budget_w: 42 },
    }),
    dev({
      id: 'sw-flex',
      name: 'USW Flex',
      model: 'USWED35',
      model_label: 'USW Flex 2.5G 5',
      floor_id: 'fm1',
      clients: 2,
      mem_pct: 77,
      uplink: null,
      ports: [port(1, 2500), port(2, 1000), port(3, 1000)],
      fw: { installed: '2.1.8', latest: '2.1.9', update: scenario === 'problems' },
      poe: { used_w: 0, budget_w: null },
    }),
  ];
  const names = [
    'Telefon A',
    'Telefon B',
    'Telefon C',
    'Notebook',
    'Televize',
    'Reproduktor',
    'Termostat',
    'Kamera vchod',
    'Hodinky',
    'Čtečka',
    'Pračka',
    'Myčka',
  ];
  const wifiAps = ['ap-pracovna', 'ap-obyvak', 'ap-kuchyn', 'ap-terasa', 'ap-podkrovi'];
  const clients: NetClient[] = names.map((label, i) => ({
    id: `c${String(i).padStart(2, '0')}`,
    label,
    wired: i >= 10,
    ssid: i >= 10 ? null : 'Domov',
    ap_id: i >= 10 ? null : wifiAps[i % wifiAps.length]!,
    area: null,
    floor_id: null,
    online: true,
    since: now - (i + 2) * h,
    important: false,
    expected_floor_id: null,
  }));
  clients.unshift(
    {
      id: 'c-tablet',
      label: 'Tablet Kuchyň',
      wired: false,
      ssid: 'Domov',
      ap_id: scenario === 'problems' ? 'ap-pracovna' : 'ap-kuchyn',
      area: 'Kuchyň',
      floor_id: 'f0',
      online: true,
      since: now - 20 * h,
      important: true,
      expected_floor_id: 'f0',
    },
    {
      id: 'c-robot',
      label: 'Robotický vysavač',
      wired: false,
      ssid: 'Domov',
      ap_id: 'ap-obyvak',
      area: null,
      floor_id: null,
      online: true,
      since: now - 30 * h,
      important: true,
      expected_floor_id: null,
    },
    {
      id: 'c-server',
      label: 'Domácí server',
      wired: true,
      ssid: null,
      ap_id: null,
      area: null,
      floor_id: null,
      online: true,
      since: now - 300 * h,
      important: false,
      expected_floor_id: null,
    },
  );
  const problems: NetProblem[] = [];
  const p = (over: Partial<NetProblem> & Pick<NetProblem, 'id' | 'rule' | 'severity' | 'title'>) =>
    problems.push({
      target: { kind: 'ap', id: over.id },
      context: '',
      fix: '',
      since: null,
      important: false,
      actions: [],
      ...over,
    });
  let internet: NetSnapshot['internet'] = {
    online: true,
    since: now - 50 * h,
    latency_ms: 14,
    jitter_ms: 1.2,
    loss_pct: null,
  };
  if (scenario === 'down') {
    internet = { ...internet, online: false, since: now - 7 * 60, latency_ms: null };
    p({
      id: 'internet',
      rule: 'internet_down',
      severity: 'critical',
      title: 'Internet nefunguje',
      target: { kind: 'internet', id: 'internet' },
      context: 'Bez připojení 7 min.',
      fix: 'Restartujte router a optický převodník (ONT). Když výpadek trvá přes 15 min, volejte poruchovou linku poskytovatele.',
      since: now - 7 * 60,
    });
  }
  if (scenario === 'problems') {
    p({
      id: 'ap-terasa',
      rule: 'ap_flapping',
      severity: 'warning',
      title: 'Terasa vypadává',
      context: '3× odpojeno za 24 h.',
      fix: 'Zkontrolujte kabel a PoE na switchi USW Lite 16. Když výpadky trvají, přesuňte AP na port s rezervou.',
      actions: [{ label: 'Detail AP', route: 'ap/ap-terasa' }],
    });
    p({
      id: 'c-tablet',
      rule: 'important_wrong_ap',
      severity: 'warning',
      title: 'Tablet Kuchyň drží vzdálený bod',
      target: { kind: 'client', id: 'c-tablet' },
      context: 'Připojený na AP Pracovna – 1. patro, očekávané patro: Přízemí, 41 min.',
      fix: 'Vypněte a zapněte Wi-Fi na zařízení. Opakuje se to? Povolte rychlý roaming (802.11r).',
      since: now - 41 * 60,
      important: true,
    });
    p({
      id: 'sw-lite:6',
      rule: 'port_slow',
      severity: 'warning',
      title: 'USW Lite 16, port 6: jen 100 Mb/s',
      target: { kind: 'port', id: 'sw-lite:6' },
      context: 'Port umí 1 Gb/s, linka jede jen na zlomek.',
      fix: 'Vyměňte patch kabel nebo zkontrolujte konektor; 100 Mb/s bývá vadný pár v kabelu.',
    });
    p({
      id: 'sw-lite',
      rule: 'poe_near_budget',
      severity: 'notice',
      title: 'PoE na USW Lite 16 je na 82 %',
      target: { kind: 'switch', id: 'sw-lite' },
      context: '36.9 W z 45 W.',
      fix: 'Nové PoE zařízení zapojte do USW Ultra (zbývá 30 W).',
    });
    p({
      id: 'all',
      rule: 'firmware_available',
      severity: 'info',
      title: 'Firmware pro 2 přístroje',
      target: { kind: 'firmware', id: 'all' },
      context: 'Podkroví, USW Flex.',
      fix: 'Aktualizujte v noci v UniFi; Wi-Fi bod se na ~2 min odpojí.',
    });
  }
  const serious = problems.filter((x) => x.severity === 'critical' || x.severity === 'warning');
  const empty = scenario === 'empty';
  return {
    updated_at: now - 20,
    internet: empty ? null : internet,
    floors: empty ? [] : FLOORS,
    aps: empty ? [] : aps,
    switches: empty ? [] : switches,
    ssids: empty
      ? []
      : [
          { name: 'Domov', clients: 24, guest: false },
          { name: 'Zařízení', clients: 9, guest: false },
        ],
    clients: empty ? [] : clients,
    problems,
    summary: {
      status: serious.length ? 'problem' : 'ok',
      headline: serious[0]?.title ?? 'Síť v pořádku',
      severity: serious[0]?.severity ?? null,
      problems_count: serious.length,
      tips_count: problems.length - serious.length,
      internet_online: empty ? null : (internet?.online ?? null),
      updated_at: now - 20,
    },
  };
}

export interface MockNetworkOptions {
  scenario?: NetworkScenario;
  role?: NetRole;
  /** `false` = guest Wi-Fi not set up yet (hint instead of the QR). */
  guest?: boolean;
  now?: () => number;
}

export function createMockNetworkApi(opts: MockNetworkOptions = {}): NetworkApi & {
  calls: Array<{ type: string; payload?: unknown }>;
} {
  const now = () => (opts.now ? opts.now() : Date.now() / 1000);
  const role = opts.role ?? 'owner';
  let settings: NetSettings = {
    important: [{ id: 'c-tablet', expected_floor_id: 'f0' }, { id: 'c-robot' }],
    guest:
      opts.guest === false
        ? null
        : { ssid: 'Host demo', password: 'synthetic-pass', security: 'WPA' },
  };
  const calls: Array<{ type: string; payload?: unknown }> = [];
  const admin = () => {
    if (role !== 'owner')
      return Promise.reject(Object.assign(new Error('unauthorized'), { code: 'unauthorized' }));
    return null;
  };
  const snapshot = () => {
    const snap = snapshotFor(opts.scenario ?? 'problems', now());
    const important = new Map(settings.important.map((i) => [i.id, i]));
    snap.clients = snap.clients.map((c) => ({
      ...c,
      important: important.has(c.id),
      expected_floor_id: important.get(c.id)?.expected_floor_id ?? null,
    }));
    return snap;
  };
  return {
    calls,
    role: async () => role,
    get: () => admin() ?? Promise.resolve(snapshot()),
    topology: () => admin() ?? Promise.resolve(mockTopology(opts.scenario ?? 'problems', now())),
    summary: async () => snapshot().summary,
    guestQr: async (): Promise<GuestQr> => {
      const g = settings.guest;
      if (!g) return { configured: false, ssid: null, qr_payload: null };
      return {
        configured: true,
        ssid: g.ssid,
        open: !g.password,
        qr_payload: g.password
          ? `WIFI:T:WPA;S:${g.ssid};P:${g.password};;`
          : `WIFI:T:nopass;S:${g.ssid};;`,
      };
    },
    settings: () => admin() ?? Promise.resolve(settings),
    saveSettings: (patch) => {
      calls.push({ type: 'settings/set', payload: patch });
      return (
        admin() ??
        Promise.resolve(
          (settings = {
            important: patch.important ?? settings.important,
            guest: patch.guest !== undefined ? patch.guest : settings.guest,
          }),
        )
      );
    },
  };
}

/**
 * Synthetic map for `?sit=` (same shape as the real HA-only graph): gateway outside UniFi,
 * 3 switches (uplink assumed), 5 APs incl. one mesh AP, important devices, `+N` per AP.
 */
export function mockTopology(scenario: NetworkScenario, now = Date.now() / 1000): TopoGraph {
  if (scenario === 'empty')
    return { nodes: [], edges: [], meta: { source: 'ha', slow_links: 0, mesh: 0, assumed: 0 } };
  const snap = snapshotFor(scenario, now);
  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];
  const add = (
    id: string,
    kind: TopoNode['kind'],
    label: string,
    parent: string | null,
    over: Partial<TopoNode> = {},
    link: Partial<TopoEdge> = {},
  ) => {
    nodes.push({ id, kind, label, parent, status: 'ok', severity: null, problem_ids: [], ...over });
    if (parent)
      edges.push({
        from: parent,
        to: id,
        type: 'wired',
        assumed: false,
        port: null,
        speed_mbps: null,
        max_mbps: null,
        poe_w: null,
        signal_dbm: null,
        slow: false,
        ...link,
      });
  };
  const net = snap.internet;
  add('internet', 'internet', 'Internet', null, {
    status: net?.online === false ? 'offline' : 'ok',
    latency_ms: net?.latency_ms ?? null,
  });
  add('gateway', 'gateway', 'Router', 'internet', { latency_ms: 0.6 });
  const sw = (id: string, label: string, model: string) =>
    add(
      id,
      'switch',
      label,
      'gateway',
      { model_label: model, ref: { kind: 'switch', id } },
      { assumed: true },
    );
  sw('sw-flex', 'USW Flex', 'USW Flex 2.5G 5');
  sw('sw-lite', 'USW Lite 16', 'USW Lite 16 PoE');
  sw('sw-ultra', 'USW Ultra', 'USW Ultra');
  const apDev = new Map(snap.aps.map((a) => [a.id, a]));
  const ap = (id: string, parent: string, link: Partial<TopoEdge>) => {
    const a = apDev.get(id);
    add(
      id,
      'ap',
      a?.name ?? id,
      parent,
      {
        model_label: a?.model_label ?? null,
        clients: a?.clients ?? null,
        status: a?.state === 'connected' ? 'ok' : 'offline',
        ref: { kind: 'ap', id },
      },
      { max_mbps: a?.max_link_mbps ?? 1000, ...link },
    );
  };
  ap('ap-terasa', 'sw-flex', { max_mbps: 2500 });
  ap('ap-obyvak', 'sw-lite', {});
  ap('ap-pracovna', 'sw-lite', { speed_mbps: 100, max_mbps: 2500, slow: true });
  ap('ap-kuchyn', 'sw-ultra', { port: 1, speed_mbps: 1000, poe_w: 7.5 });
  ap('ap-podkrovi', 'ap-kuchyn', { type: 'mesh', max_mbps: null });
  const where: Record<string, string> = {
    'c-tablet': 'ap-kuchyn',
    'c-robot': 'ap-obyvak',
    'c-tv': 'ap-obyvak',
    'c-printer': 'ap-pracovna',
    'c-camera': 'ap-terasa',
    'c-heatpump': 'ap-podkrovi',
  };
  const extra: Array<[string, string]> = [
    ['c-tv', 'Televize'],
    ['c-printer', 'Tiskárna'],
    ['c-camera', 'Kamera zahrada'],
    ['c-heatpump', 'Tepelné čerpadlo'],
  ];
  const important = [
    ...snap.clients
      .filter((c) => c.id === 'c-tablet' || c.id === 'c-robot' || c.id === 'c-server')
      .map((c) => ({ id: c.id, label: c.label, wired: c.wired, online: c.online })),
    ...extra.map(([id, label]) => ({ id, label, wired: false, online: true })),
  ];
  const drawn = new Map<string, number>();
  for (const c of important) {
    const parent = c.wired ? 'gateway' : (where[c.id] ?? 'gateway');
    add(
      `client:${c.id}`,
      'client',
      c.label,
      parent,
      { status: c.online ? 'ok' : 'offline', wired: c.wired, ref: { kind: 'client', id: c.id } },
      { type: c.wired ? 'wired' : 'wireless', assumed: parent === 'gateway' },
    );
    if (c.online) drawn.set(parent, (drawn.get(parent) ?? 0) + 1);
  }
  for (const id of ['ap-terasa', 'ap-obyvak', 'ap-pracovna', 'ap-kuchyn', 'ap-podkrovi']) {
    const rest = (apDev.get(id)?.clients ?? 0) - (drawn.get(id) ?? 0);
    if (rest > 0) add(`more:${id}`, 'more', `+${rest}`, id, { count: rest }, { type: 'wireless' });
  }
  const rank = { critical: 0, warning: 1, notice: 2, info: 3 } as const;
  for (const p of snap.problems) {
    const t = p.target;
    const id =
      t.kind === 'internet'
        ? 'internet'
        : t.kind === 'port'
          ? t.id.split(':')[0]
          : t.kind === 'client'
            ? `client:${t.id}`
            : t.id;
    const n = nodes.find((x) => x.id === id);
    if (!n) continue;
    n.problem_ids.push(p.id);
    if (!n.severity || rank[p.severity] < rank[n.severity]) n.severity = p.severity;
  }
  return {
    nodes,
    edges,
    meta: {
      source: 'ha',
      slow_links: edges.filter((e) => e.slow).length,
      mesh: edges.filter((e) => e.type === 'mesh').length,
      assumed: edges.filter((e) => e.assumed).length,
    },
  };
}
