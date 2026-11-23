import { Themed } from './Themed';
import type { ThemeMode } from './types';

export const tokenGroups: Array<{ id: string; title: string; kind: string; tokens: string[] }> = [
  {
    id: 'colors',
    title: 'Barvy',
    kind: 'color',
    tokens: [
      '--hb-bg',
      '--hb-s1',
      '--hb-s2',
      '--hb-s3',
      '--hb-t1',
      '--hb-t2',
      '--hb-t3',
      '--hb-ac',
      '--hb-ok',
      '--hb-warn',
      '--hb-crit',
      '--hb-edge',
      '--hb-fill',
    ],
  },
  {
    id: 'map-colors',
    title: 'Barvy mapy robotů',
    kind: 'color',
    tokens: [
      '--hb-map-floor',
      '--hb-map-tone2',
      '--hb-map-tone3',
      '--hb-map-seam',
      '--hb-map-rim',
      '--hb-map-shade',
      '--hb-map-wall',
    ],
  },
  {
    id: 'spacing',
    title: 'Mezery',
    kind: 'space',
    tokens: [
      '--hb-sp-1',
      '--hb-sp-2',
      '--hb-sp-3',
      '--hb-sp-4',
      '--hb-sp-5',
      '--hb-sp-6',
      '--hb-sp-7',
      '--hb-sp-8',
    ],
  },
  {
    id: 'radius',
    title: 'Zaoblení',
    kind: 'radius',
    tokens: [
      '--hb-radius-xs',
      '--hb-radius-sm',
      '--hb-radius-md',
      '--hb-radius-lg',
      '--hb-radius-xl',
      '--hb-radius-pill',
    ],
  },
  {
    id: 'type',
    title: 'Typografie',
    kind: 'type',
    tokens: [
      '--hb-type-display',
      '--hb-type-headline',
      '--hb-type-title',
      '--hb-type-lead',
      '--hb-type-body',
      '--hb-type-caption',
      '--hb-type-axis',
    ],
  },
  {
    id: 'motion',
    title: 'Pohyb',
    kind: 'motion',
    tokens: ['--hb-dur-fast', '--hb-dur-base', '--hb-dur-slow', '--hb-ease-out', '--hb-ease'],
  },
];

/** Hodnotu tokenu čte z computed style v daném tématu (ref callback, ne stav). */
function TokenValue({ name }: { name: string }) {
  return (
    <code
      className="cat-val"
      ref={(el) => {
        if (el) el.textContent = getComputedStyle(el).getPropertyValue(name).trim() || '—';
      }}
    />
  );
}

function TokenSample({ kind, name }: { kind: string; name: string }) {
  const v = `var(${name})`;
  if (kind === 'color') return <span className="cat-swatch" style={{ background: v }} />;
  if (kind === 'space') return <span className="cat-bar" style={{ width: v }} />;
  if (kind === 'radius') return <span className="cat-radius" style={{ borderRadius: v }} />;
  if (kind === 'type')
    return (
      <span className="cat-type" style={{ fontSize: v }}>
        Příliš žluťoučký
      </span>
    );
  return <span className="cat-motion" style={{ transitionDuration: v }} />;
}

export function TokenSection({ g, mode }: { g: (typeof tokenGroups)[number]; mode: ThemeMode }) {
  return (
    <section className="cat-section" id={g.id} aria-labelledby={`${g.id}-h`}>
      <h2 id={`${g.id}-h`}>{g.title}</h2>
      <Themed mode={mode}>
        <table className="cat-tokens">
          <thead>
            <tr>
              <th>Token</th>
              <th>Ukázka</th>
              <th>Hodnota</th>
            </tr>
          </thead>
          <tbody>
            {g.tokens.map((t) => (
              <tr key={t}>
                <td>
                  <code>{t}</code>
                </td>
                <td>
                  <TokenSample kind={g.kind} name={t} />
                </td>
                <td>
                  <TokenValue name={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Themed>
    </section>
  );
}
