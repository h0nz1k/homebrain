import type { ReactNode } from 'react';
import type { HeatingSnapshot } from '../types.js';
import type { FullState, PipeState } from './fullState.js';
import { FULL_GEOMETRY as G } from './geometry.gen.js';
import { Chevron, FaultIcon, Phe, Sensor, ValveBody } from './glyphs.js';

/**
 * Legend + live status of the full schematic as HTML (docked under the drawing on wide screens,
 * a panel on phones). Samples are tiny SVGs with the drawing's own classes, so every encoding in
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
  [pipe('heat_supply', 'still'), 'Plné, voda stojí'],
  [pipe('cool', 'idle'), 'Čárkovaně = běžně neaktivní'],
  [pipe('heat_supply', 'unknown'), 'Bledě = bez signálu'],
  [pipe('heat_return', 'closed'), 'Šedě = zavřená cesta ventilu'],
  [pipe('heat_return', 'off'), 'Šedé tečky = mimo provoz'],
];

const SYMBOLS: Array<[ReactNode, string]> = [
  [
    <g transform="translate(22 12) scale(.6)">
      <circle r="15" className="fs-metal fs-ring" />
      <circle r="10.5" className="fs-motor" />
      <path d="M-4.6 -6.2L7.2 0L-4.6 6.2Z" className="fs-tri" />
    </g>,
    'Čerpadlo (zelený kruh běží)',
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
      <rect x="18" y="4" width="8" height="16" rx="2.5" className="fs-sleeve" />
    </>,
    'Průchod zdí',
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

const VALVE: Record<string, string> = { A: 'na TUV (A)', B: 'na nádrž (B)', unknown: '–' };

/** A fact row: label, value (null = no data) and whether the value is a muted "no data" text. */
export type Fact = [string, string | null, boolean?];

/** The live values that belong to a focus preset (phone: listed under the framed drawing). */
export function focusFacts(id: string, st: FullState): Fact[] {
  const r = st.readings;
  const pump = (k: string) => RUN(st.pumps[k] ?? null);
  // Same rows as the pool card: the return of the floor heating is the only pool temperature.
  const pool: Fact[] = [
    ['Zpátečka ohřevu bazénu', st.pool?.temp ?? null],
    ['Voda v bazénu', st.pool ? 'neměřeno' : null, true],
    ['Ohřev dna (čerpadlo)', st.pool ? RUN(st.pool.heating) : null],
    ['Filtrace (čerpadlo)', st.pool ? RUN(st.pool.filter) : null],
  ];
  switch (id) {
    case 'valves':
      return [
        ['T do topení', r.t_ut ?? null],
        ['Směšovací ventil', st.mixer.pct === null ? null : `A ${r.mixer_pct}`],
        [
          'Ventil chlazení',
          st.coolValve.path === 'unknown'
            ? null
            : st.coolValve.path === 'A'
              ? 'chladí (A)'
              : 'nechladí (B)',
        ],
        ['Čerpadlo topení', pump('pump_ut')],
      ];
    case 'hp':
      return [
        ['Kompresor', st.compressor === 'on' ? 'běží' : st.compressor === 'off' ? 'stojí' : null],
        ['Výstup TČ', r.hp_t_out ?? null],
        ['Zpátečka do TČ', r.hp_t_in ?? null],
        [
          'Z kolektoru / do kolektoru',
          r.hp_coll_in || r.hp_coll_out ? `${r.hp_coll_in ?? '–'} / ${r.hp_coll_out ?? '–'}` : null,
        ],
        ['Čerpadlo kolektoru', pump('pump_coll')],
      ];
    case 'tank':
      return [
        ['Teplá voda', r.tank_dhw ?? null],
        ['AKN nahoře', r.tank_high ?? null],
        ['AKN dole', r.tank_low ?? null],
        ['Přepínání TUV / nádrž', st.dhwValve === 'unknown' ? null : VALVE[st.dhwValve]!],
        ['Nabíjení nádrže', pump('pump_sek')],
      ];
    case 'basin':
    case 'pit':
    case 'pool':
      return pool;
    case 'fish':
      return [
        ['Rybárna', r.chip_fish ?? null],
        ['Temperování', st.fish?.label ?? null],
        ['Ventil topení', st.fishValve === null ? null : st.fishValve ? 'otevřen' : 'zavřen'],
      ];
    case 'rooms':
      return [
        ['Podkroví', r.chip_attic ?? null],
        ['Chodba (1. patro)', r.chip_floor1 ?? null],
      ];
    default:
      return [];
  }
}

export function LegendPanel({ st, snap }: { st: FullState; snap: HeatingSnapshot }) {
  const status: Array<[string, string | null]> = [
    ['Venku', st.readings.outdoor ?? null],
    ['TČ', HP[st.compressor]!],
    ['AKN nahoře', st.readings.tank_high ?? null],
    ['AKN dole', st.readings.tank_low ?? null],
    ['Ohřev bazénu', st.pool ? RUN(st.pool.heating) : null],
    ['Filtrace', st.pool ? RUN(st.pool.filter) : null],
    ['Rybárna', st.fish?.label ?? null],
    ['Data', st.live ? 'živě z regulace' : snap.source === 'ok' ? 'neaktuální' : 'nedostupná'],
  ];
  return (
    <div className="fs-lg" data-testid="heating-full-legend">
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          <radialGradient id="fs-lg-halo" cx=".5" cy=".5" r=".5">
            <stop stopColor="var(--fs-glow-halo)" stopOpacity=".5" />
            <stop offset="1" stopColor="var(--fs-glow-halo)" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      <section className="fs-lg-status" data-testid="heating-full-status" aria-label="Stav">
        <h3>Stav</h3>
        <dl>
          {status.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className={v ? undefined : 'fs-lg-nodata'}>{v ?? '–'}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Okruhy" className="fs-lg-2">
        <h3>Okruhy</h3>
        <ul>
          {CIRCUITS.map(([c, name]) => (
            <li key={c}>
              <Sample>{pipe(c, 'still')}</Sample>
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
  );
}

export const legendStyles = `
.ht-fs.fs-facts { position:absolute; left:12px; right:12px; margin:0; padding:8px 12px; display:grid; gap:4px; border:1px solid var(--fs-wallc); border-radius:10px; background:var(--fs-room); color:var(--fs-t1); font-size:15px; line-height:1.3; pointer-events:none; }
.ht-fs.fs-facts div { display:flex; justify-content:space-between; gap:12px; }
.ht-fs.fs-facts dt { color:var(--fs-t2); }
.ht-fs.fs-facts dd { margin:0; font-weight:600; text-align:right; }
.ht-fs.fs-dock { position:relative; flex:none; border-top:1px solid var(--hb-edge, #2a3038); background:var(--fs-room); color:var(--fs-t1); }
.ht-fs .fs-lg { position:relative; display:grid; grid-template-columns:minmax(210px, .9fr) minmax(300px, 1.3fr) minmax(220px, 1fr) minmax(400px, 1.8fr) minmax(220px, 1.2fr); gap:0 20px; padding:8px 16px; font-size:12px; line-height:1.25; color:var(--fs-t1); }
.ht-fs .fs-lg section { min-width:0; }
.ht-fs .fs-lg h3 { margin:0 0 3px; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--fs-t2); }
.ht-fs .fs-lg ul { margin:0; padding:0; list-style:none; display:grid; gap:0 12px; }
.ht-fs .fs-lg-2 ul { grid-template-columns:1fr 1fr; }
.ht-fs .fs-lg li { display:flex; align-items:center; gap:6px; min-height:20px; }
.ht-fs .fs-lg li[data-question] { align-items:flex-start; min-height:0; padding:1px 0; }
.ht-fs .fs-lg-svg { flex:none; overflow:visible; width:36px; height:20px; }
.ht-fs .fs-lg dl { margin:0; display:grid; gap:1px; }
.ht-fs .fs-lg dl div { display:flex; justify-content:space-between; gap:10px; white-space:nowrap; }
.ht-fs .fs-lg dt { color:var(--fs-t2); }
.ht-fs .fs-lg dd { margin:0; font-weight:600; text-align:right; }
.ht-fs .fs-lg-nodata { font-style:italic; font-weight:500 !important; color:var(--fs-muted); }
.ht-fs .fs-lg-status { background:var(--fs-tech); border:1px solid var(--fs-wallc); border-radius:8px; padding:4px 8px; align-self:start; }
.ht-fs .fs-lg-badge { flex:none; display:inline-grid; place-items:center; width:20px; height:20px; border-radius:10px; background:var(--fs-badge); border:1.5px solid var(--fs-badge-edge); color:#fff; font-size:10px; font-weight:700; margin:0 2px; }
.ht-fs .fs-lg-abbr { flex:none; width:36px; text-align:center; font-weight:700; }
.ht-fs .fs-lg .fs-pipe { stroke-width:5; }
@media (max-width: 1279px) {
  .ht-fs .fs-lg { grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px 16px; }
}
@media (max-width: 699px) {
  .ht-fs .fs-lg { grid-template-columns:1fr; font-size:14px; max-height:46vh; overflow:auto; }
  .ht-fs .fs-lg-svg { width:44px; height:24px; }
}
`;
