import { Card, Pill, czPlural } from '@homebrain/ui';
import { apLoadModel, glue, UTIL_CRIT, UTIL_WARN, type ApLoadRow } from '../format.js';
import type { NetSnapshot } from '../types.js';

const PILL_TONE = { warn: 'warn', crit: 'crit' } as const;

function ApRow({ r }: { r: ApLoadRow }) {
  const why = r.flags.map((f) => f.why);
  return (
    <li
      className="net-apl"
      data-tone={r.tone}
      data-offline={!r.online || undefined}
      data-testid="network-ap-load"
      data-ap={r.id}
    >
      <div className="net-apl-head">
        <div className="net-apl-title">
          <span className="net-apl-name" title={`${r.name} · ${r.stats}`}>
            {r.name}
          </span>
          {r.flags.map((f) => (
            <Pill
              key={f.id}
              tone={PILL_TONE[f.tone]}
              size="sm"
              dot
              className="net-apl-flag"
              title={f.why}
              data-testid="network-ap-flag"
              data-flag={f.id}
            >
              {glue(f.label)}
            </Pill>
          ))}
        </div>
        <span className="net-apl-count" data-testid="network-ap-clients">
          <strong>{r.online ? r.clients : '–'}</strong>
          <small>
            {r.online ? czPlural(r.clients, 'klient', 'klienti', 'klientů') : 'klientů'}
          </small>
        </span>
      </div>
      <span
        className="net-load-bar"
        role="img"
        aria-label={`${r.clients} ${czPlural(r.clients, 'klient', 'klienti', 'klientů')}`}
      >
        <span style={{ width: r.online ? `${Math.max(3, r.frac * 100)}%` : '0%' }} />
      </span>
      {r.bands.length > 0 && (
        <div className="net-apl-bands" data-testid="network-ap-radios">
          {r.bands.map((b) => (
            <span
              key={b.band}
              className="net-band"
              data-tone={b.tone}
              data-testid="network-ap-band"
              title={b.title}
              aria-label={b.title}
            >
              <span className="net-band-label">{b.label}</span>
              {b.util != null && (
                <>
                  <span className="net-band-meter" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.max(4, b.util))}%` }} />
                  </span>
                  <span className="net-band-pct">{b.util}&nbsp;%</span>
                </>
              )}
            </span>
          ))}
        </div>
      )}
      {why.length > 0 && (
        <p className="net-apl-why" data-testid="network-ap-why">
          {glue(why.join(' '))}
        </p>
      )}
      {r.meta && <small className="net-apl-meta">{glue(r.meta)}</small>}
    </li>
  );
}

/** „Zátěž Wi-Fi bodů“: which AP is loaded or struggling, and why. */
export function ApLoad({ snap }: { snap: NetSnapshot }) {
  const { rows, note, hasBands, summary, flagged } = apLoadModel(snap);
  return (
    <Card className="net-card net-apl-card" data-testid="network-load">
      <header className="net-card-head">
        <h3>Zátěž Wi-Fi bodů</h3>
        <span data-testid="network-load-summary" data-flagged={flagged || undefined}>
          {summary}
        </span>
      </header>
      <ul className="net-apl-list">
        {rows.map((r) => (
          <ApRow key={r.id} r={r} />
        ))}
      </ul>
      {hasBands && (
        <p className="net-note net-apl-legend" data-testid="network-load-legend">
          <span className="net-band-meter" aria-hidden="true" data-tone="ok">
            <i style={{ width: '40%' }} />
          </span>
          {glue(
            `% u pásma = vytížení kanálu: jak velkou část času je vzduch obsazený (vaši klienti i sousední sítě). Do ${UTIL_WARN} % v pohodě, ${UTIL_WARN}–${UTIL_CRIT} % zvýšené, nad ${UTIL_CRIT} % se Wi-Fi zpomaluje.`,
          )}
        </p>
      )}
      {note && <p className="net-note">{glue(note)}</p>}
    </Card>
  );
}
