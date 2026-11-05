import type { ReactNode } from 'react';

/*
 * Custom pictogram set of the Energie hero: 24×24 grid, round caps/joins, one stroke weight
 * (the caller sets strokeWidth so the rendered weight is identical at every size).
 */
export type PictogramName =
  | 'sun'
  | 'pylon'
  | 'inverter'
  | 'battery'
  | 'house'
  | 'heat_pump'
  | 'dishwasher'
  | 'coffee_maker'
  | 'dehumidifier'
  | 'plug';

const PATHS: Record<Exclude<PictogramName, 'battery'>, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.35 5.35l1.6 1.6M17.05 17.05l1.6 1.6M5.35 18.65l1.6-1.6M17.05 6.95l1.6-1.6" />
    </>
  ),
  pylon: (
    <>
      <path d="M10.7 5.4 12 2.2l1.3 3.2M10.7 5.4 6.6 21.6M13.3 5.4l4.1 16.2" />
      <path d="M3.2 6.8h17.6M5 11.6h14" />
      <path d="M3.9 6.8v2.6M20.1 6.8v2.6M5.7 11.6v2.6M18.3 11.6v2.6" />
      <path d="M10.4 6.8 13.4 11.6 9.6 16.4 14.6 21.6M13.6 6.8 10.6 11.6l3.8 4.8-5 5.2M8.6 16.4h6.8" />
    </>
  ),

  inverter: (
    <>
      {/* DC → AC without the box: DC bars top-left, a soft slash, a sine wave bottom-right. */}
      <path d="M4.2 7.6h6.6" />
      <path d="M4.2 10.6h1.7M7.15 10.6h1.7M10.1 10.6h.7" />
      <path d="M17.4 6.6 6.6 17.4" opacity=".5" />
      <path d="M12.4 15.8c1.05-2.1 2.1-2.1 3.15 0s2.1 2.1 3.15 0" />
    </>
  ),

  house: (
    <>
      <path d="M3.4 11.2 12 4l8.6 7.2" />
      <path d="M5.6 9.6V20.4h12.8V9.6" />
      <path d="M10 20.4v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
    </>
  ),
  heat_pump: (
    <>
      <rect x="2.4" y="5" width="19.2" height="13.4" rx="2.8" />
      <circle cx="9.2" cy="11.7" r="4.4" />
      <path d="M9.2 7.3v8.8M4.8 11.7h8.8M6.1 8.6l6.2 6.2M12.3 8.6l-6.2 6.2" strokeOpacity="0.55" />
      <path d="M16.2 8.6h2.6M16.2 11.7h2.6M16.2 14.8h2.6M6 18.4v2.2M18 18.4v2.2" />
    </>
  ),

  dishwasher: (
    <>
      <rect x="4" y="2.8" width="16" height="18.4" rx="2.8" />
      <path d="M4 7h16M7.4 4.9h.01M10 4.9h.01M14 4.9h2.6" />
      <path d="M12 10.2c1.7 2.2 2.4 3.4 2.4 4.5a2.4 2.4 0 0 1-4.8 0c0-1.1.7-2.3 2.4-4.5Z" />
      <path d="M7.6 12.4v.01M16.4 12.4v.01M7.2 16.6v.01M16.8 16.6v.01" />
    </>
  ),

  coffee_maker: (
    <>
      <path d="M5 9.6h11v4.6a4.6 4.6 0 0 1-4.6 4.6H9.6A4.6 4.6 0 0 1 5 14.2Z" />
      <path d="M16 11.2h1.4a2.3 2.3 0 0 1 0 4.6H16" />
      <path d="M8.4 2.8c-1 1.3 1 2.1 0 3.6M12.4 2.8c-1 1.3 1 2.1 0 3.6M4 21.4h13" />
    </>
  ),
  dehumidifier: (
    <>
      <rect x="5.4" y="2.8" width="13.2" height="18.4" rx="3.2" />
      <path d="M12 7.8c1.9 2.5 2.7 3.8 2.7 5a2.7 2.7 0 0 1-5.4 0c0-1.2.8-2.5 2.7-5Z" />
      <path d="M9.4 18.2h5.2" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v4.4M15 3v4.4M6.4 7.4h11.2v3.4a5.6 5.6 0 0 1-11.2 0Z" />
      <path d="M12 16.4v4.8" />
    </>
  ),
};

/** Battery outline with an SoC fill level (0–100). */
function Battery({ soc }: { soc: number | null }) {
  const level = soc === null ? 0 : Math.max(0, Math.min(100, soc)) / 100;
  const h = 12.6 * level;
  return (
    <>
      <rect x="6.2" y="4.6" width="11.6" height="16.8" rx="2.8" />
      <path d="M10 2.6h4" />
      {soc !== null && (
        <rect
          className="ef-soc"
          x="8.3"
          y={19.3 - h}
          width="7.4"
          height={Math.max(h, 0.01)}
          rx="1.2"
          stroke="none"
        />
      )}
    </>
  );
}

export function Pictogram(props: {
  name: PictogramName;
  /** Scale from the 24 grid (e.g. 1.5 = 36 units). */
  scale: number;
  /** Rendered stroke weight in parent units (identical across sizes). */
  weight?: number;
  x?: number;
  y?: number;
  soc?: number | null;
}) {
  const { name, scale, weight = 2.2, x = 0, y = 0 } = props;
  return (
    <g
      className={`ef-pic ef-pic--${name}`}
      transform={`translate(${x - 12 * scale} ${y - 12 * scale}) scale(${scale})`}
      fill="none"
      stroke="currentColor"
      strokeWidth={weight / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'battery' ? <Battery soc={props.soc ?? null} /> : PATHS[name]}
    </g>
  );
}
