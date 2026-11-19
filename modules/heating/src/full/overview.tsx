import type { FullState, Tri } from './fullState.js';
import { FULL_GEOMETRY as G } from './geometry.gen.js';
import { Pump } from './glyphs.js';
import { Pill, estimateW } from './pill.js';
import type { Rect } from './panZoom.js';

/**
 * Overview of the whole drawing (r3, desktop "Celé"). At the scale that fits the whole house on a
 * 1440 px screen (≈ 0.4) the 15-unit detail text is ≈ 6 px, so the overview swaps it for a
 * coarser set at ≥ 13 CSS px: zone titles, the main equipment names and one card of live values
 * per zone, placed in the sky / soil next to the zone. Zooming in (or a preset) brings the
 * detail labels back.
 */
export const OV_FONT = 34;
export const OV_VALUE = 36;
const ROW = 54;
const HEAD = 14;
const PAD = 18;

/** Below this scale the overview set is shown (detail text would be < 9 px). */
export const OVERVIEW_BELOW = 0.6;

export type OvRow =
  | { name: string; value: string | null; missing?: string; kind?: 'value' | 'text' }
  | { name: string; pump: string; on: Tri };

export interface OvCard {
  id: string;
  /** Zone the card belongs to (it sits right above / below that zone's title plate). */
  title: string;
  x: number;
  y: number;
  /** Cards above a zone are placed by their bottom edge. */
  bottom?: number;
  w: number;
  cols: number;
  rows: OvRow[];
}

const RUN = (on: Tri) => (on === null ? 'bez signálu' : on ? 'běží' : 'stojí');

/** Wording shared with the detail drawing and the status panel (one source). */
export const MIX_STATE = (st: FullState) =>
  st.mixer.pct === null ? 'bez signálu' : `A ${st.readings.mixer_pct}`;
export const COOL_STATE = (st: FullState) =>
  st.coolValve.path === 'A'
    ? 'chladí (A)'
    : st.coolValve.path === 'B'
      ? 'nechladí (B)'
      : 'bez signálu';

export function overviewCards(st: FullState): OvCard[] {
  const R = st.readings;
  const solar = G.glyphs.solar.box;
  const pool = G.regions.pool_hall!;
  return [
    {
      id: 'rooms',
      title: 'PATRA',
      x: G.arch.houseL,
      y: -150,
      w: G.arch.blockR - G.arch.houseL,
      bottom: G.arch.roof - 36,
      cols: 1,
      rows: [
        { name: 'T podkroví', value: R.chip_attic ?? null },
        { name: 'T chodba (1. patro)', value: R.chip_floor1 ?? null },
      ],
    },
    {
      id: 'fish',
      title: 'RYBÁRNA',
      x: 40,
      y: -150,
      w: G.arch.houseL - 64,
      bottom: G.regions.rybarna![1]! - 36,
      cols: 1,
      rows: [
        { name: 'T rybárna', value: st.fish ? (R.fish_t ?? null) : null },
        { name: 'Cíl', value: st.fish ? (R.fish_target ?? null) : null },
        { name: 'Temperování', value: st.fish?.label ?? null, kind: 'text' },
        { name: 'Voda rybárna', value: 'mimo provoz', kind: 'text' },
      ],
    },
    {
      id: 'tech',
      title: 'TECHNICKÁ MÍSTNOST',
      x: G.arch.blockR + 24,
      y: -150,
      w: solar[0]! + solar[2]! - G.arch.blockR - 24,
      bottom: solar[1]! - 50,
      cols: 2,
      rows: [
        {
          name: 'TČ',
          value:
            st.compressor === 'on'
              ? 'kompresor běží'
              : st.compressor === 'off'
                ? 'kompresor stojí'
                : null,
          missing: 'bez signálu',
          kind: 'text',
        },
        { name: 'AKN nahoře', value: R.tank_high ?? null },
        { name: 'Výstup do topení', value: R.hp_t_out ?? null },
        { name: 'AKN dole', value: R.tank_low ?? null },
        { name: 'Zpátečka do TČ', value: R.hp_t_in ?? null },
        { name: 'Teplá voda', value: R.tank_dhw ?? null },
        { name: 'T do topení', value: R.t_ut ?? null },
        { name: 'T kolektor (solár)', value: R.solar_temp ?? null },
        { name: 'Směšovací ventil', value: MIX_STATE(st), kind: 'text' },
        { name: 'Ventil chlazení', value: COOL_STATE(st), kind: 'text' },
        { name: 'Čerpadlo topení', pump: 'pump_ut', on: st.pumps.pump_ut ?? null },
        { name: 'Nabíjení nádrže', pump: 'pump_sek', on: st.pumps.pump_sek ?? null },
        { name: 'Čerpadlo solár', pump: 'pump_solar', on: st.pumps.pump_solar ?? null },
      ],
    },
    {
      id: 'pool',
      title: 'BAZÉN',
      x: pool[0]! + 16,
      y: -150,
      w: pool[2]! - 32,
      bottom: pool[1]! - 36,
      cols: 1,
      rows: [
        { name: 'Teplota vody', value: null, missing: 'bez čidla' },
        { name: 'Zpátečka ohřevu bazénu', value: st.pool?.temp ?? null },
        { name: 'Ohřev dna', pump: 'pump_pool', on: st.pool?.heating ?? null },
        { name: 'Filtrace', pump: 'pump_filt', on: st.pool?.filter ?? null },
      ],
    },
    {
      id: 'ground',
      title: 'ZEMNÍ KOLEKTOR',
      x: 40,
      y: BAND_Y,
      w: G.arch.houseL - 64,
      cols: 1,
      rows: [
        { name: 'Z kolektoru', value: R.hp_coll_in ?? null },
        { name: 'Do kolektoru', value: R.hp_coll_out ?? null },
        { name: 'Čerpadlo kolektoru', pump: 'pump_coll', on: st.pumps.pump_coll ?? null },
      ],
    },
  ].map((c) => {
    const card = { ...c, x: Math.round(c.x), w: Math.round(c.w) } as OvCard;
    if (card.bottom !== undefined) card.y = card.bottom - cardHeight(card);
    return card;
  });
}

/** Bottom band of the overview: the on-site questions and a short key of the pipe states. */
export const BAND_Y = 1262;
const KEY: Array<[string, string]> = [
  ['flow', 'Proudí (šipky)'],
  ['still', 'Plné, stojí'],
  ['idle', 'Běžně neaktivní'],
  ['unknown', 'Bez signálu'],
  ['closed', 'Zavřená cesta'],
  ['off', 'Mimo provoz'],
];

function Band({ x, w }: { x: number; w: number }) {
  const qs = G.questions;
  const half = (w - 2 * PAD) / 2;
  const keyY = BAND_Y + 30;
  const step = (w - 2 * PAD) / (KEY.length + 2);
  return (
    <g data-ov-card="band" aria-label="Klíč a otázky k ověření">
      <rect x={x} y={BAND_Y} width={w} height={BAND_H} rx="14" className="fs-ov-card" />
      {KEY.map(([state, text], i) => {
        const kx = x + PAD + i * step;
        return (
          <g key={state} data-ov-key={state}>
            <path d={`M${kx} ${keyY}h70`} className={`fs-pipe fs-c-heat_supply fs-s-${state}`} />
            {state === 'unknown' && <path d={`M${kx} ${keyY}h70`} className="fs-pipe-core" />}
            {state === 'flow' && (
              <path
                d={`M${kx + 27} ${keyY - 9}L${kx + 43} ${keyY}L${kx + 27} ${keyY + 9}`}
                className="fs-chev"
              />
            )}
            <text
              x={kx + 84}
              y={keyY + 10}
              fontSize={OV_FONT}
              className="fs-t fs-t-s"
              data-ov-label={`key_${state}`}
            >
              {text}
            </text>
          </g>
        );
      })}
      {(
        [
          [true, 'Čerpadlo běží'],
          [false, 'Čerpadlo stojí'],
        ] as const
      ).map(([on, text], i) => {
        const kx = x + PAD + (KEY.length + i) * step + 20;
        return (
          <g key={text}>
            <g transform={`translate(${kx} ${keyY}) scale(1.25) translate(${-kx} ${-keyY})`}>
              <Pump c={[kx, keyY]} dir="r" on={on} id={`ov_key_${i}`} label={text} />
            </g>
            <text
              x={kx + 30}
              y={keyY + 10}
              fontSize={OV_FONT}
              className="fs-t fs-t-s"
              data-ov-label={`key_pump_${i}`}
            >
              {text}
            </text>
          </g>
        );
      })}
      {qs.map((q, i) => {
        const qx = x + PAD + (i % 2) * half;
        const qy = BAND_Y + 96 + Math.floor(i / 2) * 58;
        return (
          <g key={q.id} data-ov-question={q.id}>
            <circle cx={qx + 22} cy={qy} r="25" className="fs-badge" />
            <text
              x={qx + 22}
              y={qy + 10}
              fontSize={OV_FONT}
              textAnchor="middle"
              className="fs-t fs-t-badge"
            >
              {q.id}
            </text>
            <text
              x={qx + 56}
              y={qy + 10}
              fontSize={OV_FONT}
              className="fs-t fs-t-s"
              data-ov-label={`q_${q.id}`}
            >
              {q.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
const BAND_H = 96 + 2 * 58 - 14;

export const cardHeight = (c: OvCard) => HEAD + Math.ceil(c.rows.length / c.cols) * ROW + PAD / 2;

let boundsCache: Rect | null = null;
/**
 * Bounding box of the overview: the drawing plus the cards above / below it. The card layout
 * (rows per card) does not depend on the values, so the box is computed once.
 */
export function overviewBounds(st: FullState): Rect {
  if (boundsCache) return boundsCache;
  const cards = overviewCards(st);
  const top = Math.min(...cards.map((c) => c.y)) - 16;
  const bottom = Math.max(BAND_Y + BAND_H + 16, ...cards.map((c) => c.y + cardHeight(c) + 16));
  boundsCache = { x: 16, y: top, w: G.canvas[0]! - 32, h: bottom - top };
  return boundsCache;
}

function Card({ c }: { c: OvCard }) {
  const h = cardHeight(c);
  const colW = (c.w - 2 * PAD) / c.cols;
  const perCol = Math.ceil(c.rows.length / c.cols);
  return (
    <g data-ov-card={c.id} aria-label={c.title}>
      <rect x={c.x} y={c.y} width={c.w} height={h} rx="14" className="fs-ov-card" />
      {c.rows.map((r, i) => {
        const col = c.cols === 1 ? 0 : Math.floor(i / perCol);
        const row = c.cols === 1 ? i : i % perCol;
        const x = c.x + PAD + col * colW;
        const cy = c.y + HEAD + row * ROW + ROW / 2;
        const right = x + colW - (c.cols > 1 && col < c.cols - 1 ? 28 : 0);
        const isPump = 'pump' in r;
        return (
          <g key={r.name} data-ov-row={r.name}>
            {isPump && (
              <g transform={`translate(${x + 20} ${cy}) scale(1.25) translate(${-x - 20} ${-cy})`}>
                <Pump c={[x + 20, cy]} dir="r" on={r.on} id={`ov_${r.pump}`} label={r.name} />
              </g>
            )}
            <text
              x={x + (isPump ? 50 : 0)}
              y={cy + OV_FONT * 0.35}
              fontSize={OV_FONT}
              className="fs-t fs-t-s"
              data-ov-label={`${c.id}_${i}`}
            >
              {r.name}
            </text>
            <Pill
              x={right}
              cy={cy}
              anchor="end"
              font={OV_VALUE}
              value={isPump ? RUN(r.on) : r.value}
              missing={isPump ? 'bez signálu' : (r.missing ?? '–')}
              k={`ov_${c.id}_${i}`}
              className={isPump && r.on ? 'fs-pill-run' : undefined}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Zone titles at overview size: the same plates, same anchor (top-left edge of the zone). */
function OvPlate({ k, x, y, text }: { k: string; x: number; y: number; text: string }) {
  const w = estimateW(text, OV_FONT, true) + 28;
  return (
    <g data-ov-plate={k}>
      <rect x={x - 10} y={y - 4} width={w} height={OV_FONT + 14} rx="8" className="fs-zone-plate" />
      <text
        x={x + 4}
        y={y + OV_FONT * 0.86}
        fontSize={OV_FONT}
        className="fs-t fs-t-zone"
        data-ov-label={k}
      >
        {text}
      </text>
    </g>
  );
}

/** Main equipment names at overview size, at free spots next to the glyph. */
function ovNames(): Array<{
  k: string;
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}> {
  const [hx, hy, hw] = G.glyphs.hp as [number, number, number];
  const [tx, ty, tw] = G.glyphs.tank as [number, number, number];
  const rad = G.glyphs.radiators.box;
  return [
    { k: 'ov_hp', x: hx + hw / 2, y: hy - 22, text: 'Tepelné čerpadlo', anchor: 'middle' },
    { k: 'ov_tank', x: tx + tw + 18, y: ty + 40, text: 'AKN', anchor: 'start' },
    { k: 'ov_rad', x: rad[0]! + rad[2]! + 44, y: rad[1]! + 50, text: 'Radiátory', anchor: 'start' },
  ];
}

/**
 * Zone plates at overview size. The two storeys share one plate (their values are one card), the
 * garden needs none (pit, channel and pool carry their own), long titles are shortened.
 */
const OV_PLATE_SKIP = new Set(['floor1_caption', 'garden_caption', 'channel_caption']);
const OV_PLATE_TEXT: Record<string, string> = { attic_caption: 'PATRA', ryb_caption: 'RYBÁRNA' };
/**
 * At overview size the top-left corner of the technical room is full of risers (the storeys sit
 * on it); its plate takes the top-left corner of the room's own free roof edge instead.
 */
const OV_PLATE_AT: Record<string, [number, number]> = {
  tech_caption: [G.arch.blockR + 12, G.arch.plantTop - 8],
};

export function Overview({ st }: { st: FullState }) {
  const plates = Object.entries(G.labels)
    .filter(([k, l]) => l.zone && !OV_PLATE_SKIP.has(k))
    .map(([k, l]) => [k, { ...l, lines: [OV_PLATE_TEXT[k] ?? l.lines[0] ?? ''] }] as const);
  return (
    <g data-layer="overview" data-testid="heating-full-overview">
      {plates.map(([k, l]) => (
        <OvPlate
          key={k}
          k={k}
          x={OV_PLATE_AT[k]?.[0] ?? l.box[0]! + 12}
          y={OV_PLATE_AT[k]?.[1] ?? l.box[1]! - 14}
          text={l.lines[0] ?? ''}
        />
      ))}
      {ovNames().map((n) => (
        <text
          key={n.k}
          x={n.x}
          y={n.y}
          fontSize={OV_FONT}
          textAnchor={n.anchor}
          className="fs-t fs-t-T"
          stroke="var(--fs-tech)"
          strokeWidth="6"
          data-ov-label={n.k}
        >
          {n.text}
        </text>
      ))}
      {overviewCards(st).map((c) => (
        <Card key={c.id} c={c} />
      ))}
      <Band x={G.arch.houseL} w={G.canvas[0]! - 24 - G.arch.houseL} />
    </g>
  );
}
