import type { ReactNode } from 'react';
import type { HeatingSnapshot } from '../types.js';
import type { FullState, PipeState } from './fullState.js';
import { FULL_GEOMETRY as G } from './geometry.gen.js';
import { Chevron, FaultIcon, Phe, Pump, Sensor, ValveBody } from './glyphs.js';
import { COOL_STATE, MIX_STATE } from './overview.js';

/**
 * Legend + live status of the full schematic as HTML (r3: a side drawer, closed by default; the
 * status is its own panel above the legend). Samples are tiny SVGs with the drawing's own classes, so every encoding in
 * the drawing has exactly one legend entry.
 */
const CIRCUITS: Array<[string, string]> = [
  ['heat_supply', 'Topení · přívod'],
  ['heat_return', 'Topení · zpátečka'],
  ['solar', 'Solární okruh'],
  ['coll', 'Zemní kolektor'],
  ['dhw', 'Teplá voda (TUV)'],
  ['cold_water', 'Studená voda (SV)'],
  ['pool', 'Bazénová voda · filtrace'],
  ['cool', 'Chlazení · voda'],
];

function Sample({ children, w = 44 }: { children: ReactNode; w?: number }) {
  return (
    <svg viewBox={`0 0 ${w} 24`} width={w} height="24" aria-hidden="true" className="fs-lg-svg">
      {children}
    </svg>
  );
}

const pipe = (colour: string, state: PipeState) => (
  <path d="M4 12H40" className={`fs-pipe fs-c-${colour} fs-s-${state}`} />
);

const STATES: Array<[ReactNode, string]> = [
  [
    <>
      {pipe('heat_supply', 'flow')}
      <Chevron x={22} y={12} />
    </>,
    'Proudí (šipky ve směru toku)',
  ],
  [pipe('heat_supply', 'still'), 'Klidnější barva, bez šipek = plné, voda stojí'],
  [pipe('cool', 'idle'), 'Čárkovaně = běžně neaktivní'],
  [
    <>
      {pipe('heat_supply', 'unknown')}
      <path d="M4 12H40" className="fs-pipe-core" />
    </>,
    'Dutá čára = bez signálu',
  ],
  [pipe('heat_return', 'closed'), 'Šedě = zavřená cesta ventilu'],
  [pipe('heat_return', 'off'), 'Šedé tečky = mimo provoz'],
];

const SYMBOLS: Array<[ReactNode, string]> = [
  [
    <g transform="translate(22 12) scale(.62) translate(-22 -12)">
      <Pump c={[22, 12]} dir="r" on id="lg_on" label="běží" />
    </g>,
    'Čerpadlo běží (zelené)',
  ],
  [
    <g transform="translate(22 12) scale(.62) translate(-22 -12)">
      <Pump c={[22, 12]} dir="r" on={false} id="lg_off" label="stojí" />
    </g>,
    'Čerpadlo stojí (šedé)',
  ],
  [
    <g transform="translate(22 10) scale(.5)">
      <path d="M-40 0H40" className="fs-pipe fs-neutral-pipe" />
      <path d="M0 0V30" className="fs-pipe fs-s-closed" />
      <ValveBody ports={['l', 'r', 'd']} act="u" closed={['d']} bar={false} />
      <path d="M-17 0H17" className="fs-open-channel-key" />
      <path d="M-17 0H17" className="fs-open-channel" />
    </g>,
    'Ventil: světle otevřená cesta',
  ],
  [<Sensor c={[22, 12]} />, 'Čidlo teploty'],
  [
    <g transform="translate(22 12) scale(.22)">
      <Phe r={[-33, -45, 66, 90]} />
    </g>,
    'Výměník (deskový)',
  ],
  [<path d="M8 8H34a4 4 0 0 1 0 8H8" className="fs-ek-rod" />, 'Elektrický dohřev v nádrži'],
  [
    <g transform="translate(22 12) scale(.42)" className="fs-comp fs-comp-on">
      <ellipse rx="30" ry="31" className="fs-comp-halo" fill="url(#fs-lg-halo)" />
      <rect x="-19.5" y="-23.5" width="39" height="47" rx="17" className="fs-comp-body" />
    </g>,
    'TČ: kompresor běží = žhne',
  ],
  [
    <>
      <path d="M22 1V23" className="fs-pipe fs-c-heat_return" />
      <path d="M14 12A8 8 0 0 1 30 12" className="fs-halo" stroke="var(--fs-bg)" />
      <path d="M4 12H14A8 8 0 0 1 30 12H40" className="fs-pipe fs-c-coll" />
    </>,
    'Oblouček = bez spojení',
  ],
  [
    <>
      <path d="M4 12H40M22 12V23" className="fs-pipe fs-c-heat_return" />
      <circle cx="22" cy="12" r="4.6" className="fs-dot" />
    </>,
    'Tečka = spojení potrubí',
  ],
  [
    <>
      <path d="M22 1V23" className="fs-wallband" />
      <path d="M4 12H40" className="fs-pipe fs-c-heat_return" />
      <path d="M17 3V21M27 3V21" className="fs-sleeve-bar" />
    </>,
    'Dvě čárky = průchod zdí',
  ],
  [
    <g transform="translate(22 12)">
      <circle r="9" className="fs-valve-fault" />
      <FaultIcon x={0} y={0} s={0.7} />
    </g>,
    'Porucha (hlášení regulace)',
  ],
];

const RUN = (v: boolean | null) => (v === null ? null : v ? 'běží' : 'stojí');
const HP: Record<string, string> = {
  on: 'kompresor běží',
  off: 'kompresor stojí',
  unknown: 'stav neznámý',
};

export function LegendPanel({ st, snap }: { st: FullState; snap: HeatingSnapshot }) {
  const status: Array<[string, string | null]> = [
    ['Venku', st.readings.outdoor ?? null],
    ['TČ', HP[st.compressor]!],
    ['AKN nahoře', st.readings.tank_high ?? null],
    ['AKN dole', st.readings.tank_low ?? null],
    ['Teplá voda', st.readings.tank_dhw ?? null],
    ['Směšovací ventil', `poloha: ${MIX_STATE(st)}`],
    ['Ventil chlazení', COOL_STATE(st)],
    ['Ohřev bazénu', st.pool ? (RUN(st.pool.heating) ?? 'bez signálu') : null],
    ['Filtrace', st.pool ? (RUN(st.pool.filter) ?? 'bez signálu') : null],
    ['Rybárna', st.fish?.label ?? null],
    ['Data', st.live ? 'živě z regulace' : snap.source === 'ok' ? 'neaktuální' : 'nedostupná'],
  ];
  return (
    <div className="fs-lg-wrap">
      <section className="fs-status" data-testid="heating-full-status" aria-label="Stav">
        <h3>Stav · živé hodnoty</h3>
        <dl>
          {status.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className={v && !v.includes('bez signálu') ? undefined : 'fs-lg-nodata'}>
                {v ?? '–'}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="fs-lg" data-testid="heating-full-legend">
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <defs>
            <radialGradient id="fs-lg-halo" cx=".5" cy=".5" r=".5">
              <stop stopColor="var(--fs-glow-halo)" stopOpacity=".5" />
              <stop offset="1" stopColor="var(--fs-glow-halo)" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>
        <section aria-label="Okruhy" className="fs-lg-2">
          <h3>Okruhy</h3>
          <ul>
            {CIRCUITS.map(([c, name]) => (
              <li key={c}>
                <Sample>{pipe(c, 'flow')}</Sample>
                {name}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Stavy potrubí">
          <h3>Stavy potrubí</h3>
          <ul>
            {STATES.map(([svg, name]) => (
              <li key={name}>
                <Sample>{svg}</Sample>
                {name}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Značky" className="fs-lg-2">
          <h3>Značky</h3>
          <ul>
            {SYMBOLS.map(([svg, name]) => (
              <li key={name}>
                <Sample>{svg}</Sample>
                {name}
              </li>
            ))}
            <li>
              <span className="fs-lg-abbr">AKN</span>akumulační nádrž
            </li>
            <li>
              <span className="fs-lg-abbr">AB</span>společný port ventilu
            </li>
          </ul>
        </section>
        <section aria-label="Ověřit na místě">
          <h3>Ověřit na místě</h3>
          <ul>
            {G.questions.map((q) => (
              <li key={q.id} data-question={q.id}>
                <span className="fs-lg-badge">{q.id}</span>
                {q.text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export const legendStyles = `
.ht-fs.fs-drawer { position:absolute; top:0; right:0; bottom:0; width:min(400px, 100%); z-index:3; overflow:auto; overscroll-behavior:contain; background:var(--fs-bg); color:var(--fs-t1); border-left:1px solid var(--fs-wallc); box-shadow:-12px 0 32px rgb(0 0 0 / .28); padding:16px 24px 24px 16px; }
.ht-fs .fs-lg-wrap { display:grid; gap:16px; }
.ht-fs .fs-status { background:var(--fs-tech); border:1.5px solid var(--fs-card-edge); border-radius:12px; padding:10px 14px 12px; }
.ht-fs .fs-status h3 { margin:0 0 6px; font-size:13px; font-weight:700; letter-spacing:.04em; color:var(--fs-t1); }
.ht-fs .fs-status dl { margin:0; display:grid; gap:3px; font-size:15px; line-height:1.35; }
.ht-fs .fs-status dl div { display:flex; justify-content:space-between; gap:12px; }
.ht-fs .fs-status dt { color:var(--fs-t2); }
.ht-fs .fs-status dd { margin:0; font-weight:700; text-align:right; }
.ht-fs .fs-lg { display:grid; gap:14px; font-size:14px; line-height:1.3; color:var(--fs-t1); }
.ht-fs .fs-lg section { min-width:0; }
.ht-fs .fs-lg h3 { margin:0 0 6px; font-size:12px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--fs-t2); }
.ht-fs .fs-lg ul { margin:0; padding:0; list-style:none; display:grid; gap:4px; }
.ht-fs .fs-lg li { display:grid; grid-template-columns:48px 1fr; align-items:center; column-gap:10px; min-height:24px; }
.ht-fs .fs-lg li[data-question] { align-items:start; }
.ht-fs .fs-lg-svg { overflow:visible; width:44px; height:24px; }
.ht-fs .fs-lg-nodata { font-style:italic; font-weight:600 !important; color:var(--fs-muted); }
.ht-fs .fs-lg-badge { justify-self:center; display:inline-grid; place-items:center; width:24px; height:24px; border-radius:12px; background:var(--fs-badge); border:1.5px solid var(--fs-badge-edge); color:#fff; font-size:11px; font-weight:700; }
.ht-fs .fs-lg-abbr { text-align:center; font-weight:700; }
.ht-fs .fs-lg .fs-pipe { stroke-width:5; }
@media (max-width: 699px) {
  .ht-fs.fs-drawer { top:auto; left:0; width:auto; max-height:72%; border-left:0; border-top:1px solid var(--fs-wallc); border-radius:16px 16px 0 0; padding:14px 16px 24px; }
}
`;
