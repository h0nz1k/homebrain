import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card, EmptyState, Pill } from '@homebrain/ui';
import type { NetworkApi } from '../api.js';
import { edgeLabel, edgeTone, layoutTopology, treeChildren } from '../topoLayout.js';
import type { TopoEdge, TopoGraph, TopoNode } from '../types.js';

const POLL_MS = 30_000;
const PHONE_QUERY = '(max-width: 720px)';

function usePhone(): boolean {
  const query = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(PHONE_QUERY).matches
      : false;
  const [phone, setPhone] = useState(query);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

function useTopology(api: NetworkApi) {
  const [graph, setGraph] = useState<TopoGraph | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api.topology().then(
        (g) => {
          if (!alive) return;
          setGraph(g);
          setError(false);
        },
        () => alive && setError(true),
      );
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [api]);
  return { graph, error };
}

const ms = (v: number | null | undefined) =>
  v == null ? null : `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)} ms`;
const more = (n: number) => `+${n} ${n >= 5 ? 'dalších' : 'další'}`;

function subLabel(n: TopoNode): string | null {
  if (n.status === 'offline') return 'offline';
  switch (n.kind) {
    case 'internet':
      return ms(n.latency_ms) ?? 'stav neznámý';
    case 'gateway':
      return [ms(n.latency_ms), 'mimo UniFi'].filter(Boolean).join(' · ');
    case 'switch':
    case 'ap':
      return n.model_label ?? null;
    case 'client':
      return n.wired ? 'kabel · switch neznámý' : 'Wi-Fi';
    default:
      return null;
  }
}

const GLYPH: Record<TopoNode['kind'], ReactNode> = {
  internet: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.6 5.4 3.6 8.5S14.6 18.1 12 20.5M12 3.5C9.4 5.9 8.4 8.9 8.4 12s1 6.1 3.6 8.5" />
    </>
  ),
  gateway: (
    <>
      <rect x="3.5" y="12" width="17" height="7" rx="2" />
      <path d="M7 15.5h.01M10 15.5h.01M8 12l-2-6M16 12l2-6" />
    </>
  ),
  switch: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M6.5 12h1.5M10 12h1.5M13.5 12h1.5M17 12h.5" />
    </>
  ),
  ap: (
    <>
      <circle cx="12" cy="16" r="1.6" />
      <path d="M8.2 12.6a5.4 5.4 0 0 1 7.6 0M5.3 9.7a9.5 9.5 0 0 1 13.4 0" />
    </>
  ),
  client: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2.5" />
      <path d="M10.5 17.5h3" />
    </>
  ),
  more: <path d="M7 12h.01M12 12h.01M17 12h.01" />,
};

function Glyph({ kind }: { kind: TopoNode['kind'] }) {
  return (
    <svg className="net-topo-ico" viewBox="0 0 24 24" aria-hidden="true">
      {GLYPH[kind]}
    </svg>
  );
}

function NodeButton({
  n,
  onOpen,
  style,
  link,
}: {
  n: TopoNode;
  onOpen: (n: TopoNode) => void;
  style?: React.CSSProperties;
  /** Phone: the uplink chip rides in the sub line (no room beside the node). */
  link?: TopoEdge;
}) {
  const chip = link ? edgeLabel(link) : null;
  const sub = subLabel(n);
  const clickable = n.kind !== 'more' && n.kind !== 'internet';
  const label = n.kind === 'more' ? more(n.count ?? 0) : n.label;
  return (
    <button
      type="button"
      className="net-topo-node"
      data-kind={n.kind}
      data-status={n.status}
      data-severity={n.severity ?? undefined}
      data-node-id={n.id}
      data-testid="network-topo-node"
      disabled={!clickable}
      style={style}
      onClick={() => clickable && onOpen(n)}
      aria-label={[label, sub, n.severity ? 'má problém' : null].filter(Boolean).join(', ')}
    >
      <span className="net-topo-tile">
        <Glyph kind={n.kind} />
        {n.kind !== 'more' && <i className="net-topo-dot" aria-hidden="true" />}
      </span>
      <span className="net-topo-copy">
        <strong>{label}</strong>
        {(sub || chip) && (
          <small>
            {sub}
            {chip && (
              <span
                className="net-topo-inline"
                data-testid="network-topo-chip"
                {...linkAttrs(link!)}
              >
                {sub ? ' · ' : ''}
                {chip}
              </span>
            )}
          </small>
        )}
      </span>
      {n.kind === 'ap' && n.clients != null && n.status !== 'offline' && (
        <span
          className="net-topo-badge"
          title="připojení klienti"
          aria-label={`${n.clients} klientů`}
        >
          {n.clients}
        </span>
      )}
    </button>
  );
}

const isLeafKind = (n: TopoNode) => n.kind === 'client' || n.kind === 'more';

const linkAttrs = (e: TopoEdge) => ({
  'data-type': e.type,
  'data-assumed': e.assumed || undefined,
  'data-tone': edgeTone(e) ?? undefined,
});

function DesktopMap({ graph, onOpen }: { graph: TopoGraph; onOpen: (n: TopoNode) => void }) {
  const { boxes, links, width, height } = useMemo(() => layoutTopology(graph), [graph]);
  return (
    <div className="net-topo-scroll" data-testid="network-topo-desktop">
      <div className="net-topo-canvas" style={{ width, height }}>
        <svg width={width} height={height} className="net-topo-svg" aria-hidden="true">
          {links.map(
            (l) =>
              l.trunk && (
                <path
                  key={`t-${l.edge.to}`}
                  d={l.trunk}
                  className="net-topo-trunk"
                  {...linkAttrs(l.edge)}
                />
              ),
          )}
          {links.map((l) => (
            <path
              key={`b-${l.edge.to}`}
              d={l.branch}
              className="net-topo-line"
              data-testid="network-topo-link"
              data-to={l.edge.to}
              {...linkAttrs(l.edge)}
            />
          ))}
        </svg>
        {links.map(
          (l) =>
            l.label && (
              <span
                key={`l-${l.edge.to}`}
                className="net-topo-chip"
                data-mesh={l.edge.type === 'mesh' || undefined}
                data-testid="network-topo-chip"
                {...linkAttrs(l.edge)}
                style={{ left: l.label.x, top: l.label.y }}
              >
                {l.label.text}
              </span>
            ),
        )}
        {boxes.map((b) => (
          <NodeButton
            key={b.id}
            n={b.node}
            onOpen={onOpen}
            style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          />
        ))}
      </div>
    </div>
  );
}

function PhoneTree({ graph, onOpen }: { graph: TopoGraph; onOpen: (n: TopoNode) => void }) {
  const kids = useMemo(() => treeChildren(graph), [graph]);
  const edgeTo = useMemo(() => new Map(graph.edges.map((e) => [e.to, e])), [graph]);
  // APs start collapsed (only devices); a problem client keeps its AP open.
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        graph.nodes
          .filter((n) => n.kind === 'client' && n.severity && n.parent)
          .map((n) => n.parent as string),
      ),
  );
  const render = (n: TopoNode): ReactNode => {
    const children = kids.get(n.id) ?? [];
    const leaves =
      n.kind === 'ap' ? children.filter((c) => c.kind === 'client' || c.kind === 'more') : [];
    const shown =
      n.kind === 'ap' && !open.has(n.id) ? children.filter((c) => !leaves.includes(c)) : children;
    const e = edgeTo.get(n.id);
    const chip = e ? edgeLabel(e) : null;
    return (
      <li
        key={n.id}
        className="net-tree-item"
        data-leaf={n.kind === 'client' || n.kind === 'more' || undefined}
        {...(e ? linkAttrs(e) : {})}
      >
        <div className="net-tree-row">
          <NodeButton n={n} onOpen={onOpen} link={chip && !isLeafKind(n) ? e : undefined} />
          {leaves.length > 0 && (
            <button
              type="button"
              className="net-tree-toggle"
              aria-expanded={open.has(n.id)}
              aria-label={`${open.has(n.id) ? 'Skrýt' : 'Ukázat'} zařízení u ${n.label}`}
              data-testid="network-topo-toggle"
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(n.id)) next.delete(n.id);
                  else next.add(n.id);
                  return next;
                })
              }
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 10l4 4 4-4" />
              </svg>
            </button>
          )}
        </div>
        {shown.length > 0 && <ul className="net-tree">{shown.map(render)}</ul>}
      </li>
    );
  };
  return (
    // Internet → router is a straight chain: keep both on the root spine to save one indent.
    <ul className="net-tree net-tree-root" data-testid="network-topo-phone">
      {graph.nodes
        .filter((n) => !n.parent)
        .flatMap((root) => [
          <li key={root.id} className="net-tree-item">
            <div className="net-tree-row">
              <NodeButton n={root} onOpen={onOpen} />
            </div>
          </li>,
          ...(kids.get(root.id) ?? []).map(render),
        ])}
    </ul>
  );
}

export function TopologyMap({ api, onOpen }: { api: NetworkApi; onOpen: (n: TopoNode) => void }) {
  const { graph, error } = useTopology(api);
  const phone = usePhone();
  if (error && !graph)
    return <EmptyState title="Mapa se nenačetla">Zkuste to za chvíli.</EmptyState>;
  if (!graph) return null;
  if (!graph.nodes.some((n) => n.kind === 'ap' || n.kind === 'switch'))
    return (
      <EmptyState title="Mapa je prázdná">UniFi v Home Assistantu nehlásí žádné prvky.</EmptyState>
    );
  const { slow_links, mesh, assumed } = graph.meta;
  return (
    <Card className="net-card net-topo" data-testid="network-topo">
      <header className="net-card-head">
        <h3>Mapa sítě</h3>
        <span>klepněte na prvek pro detail</span>
      </header>
      <div className="net-chips" data-testid="network-topo-summary">
        <Pill tone={slow_links ? 'crit' : 'neutral'} dot>
          Linky 100 Mb/s <b>{slow_links}</b>
        </Pill>
        <Pill tone="neutral" dot>
          Mesh <b>{mesh}</b>
        </Pill>
        {assumed > 0 && (
          <Pill tone="neutral">
            Předpoklad <b>{assumed}</b>
          </Pill>
        )}
      </div>
      {phone ? (
        <PhoneTree graph={graph} onOpen={onOpen} />
      ) : (
        <DesktopMap graph={graph} onOpen={onOpen} />
      )}
      <footer className="net-topo-legend" data-testid="network-topo-legend">
        <span data-type="wired">kabel</span>
        <span data-type="wired" data-tone="slow">
          100 Mb/s (umí víc)
        </span>
        <span data-type="mesh">mesh</span>
        <span data-type="wireless">Wi-Fi</span>
        <span data-type="wired" data-assumed="true">
          předpoklad
        </span>
        <small>
          Podle Home Assistantu: rodiče AP a mesh přesně; připojení switchů k bráně a kabelových
          zařízení je předpoklad (brána není UniFi). Porty, rychlosti a signál jen tam, kde jsou
          jisté.
        </small>
      </footer>
    </Card>
  );
}
