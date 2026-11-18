// Hlídání domu glyphs (same 24 px grid and 1.75 stroke as <Icon> from @homebrain/ui).
import type { Glyph as GlyphName } from '../copy.js';
import type { JSX } from 'react';

const P: Record<GlyphName, JSX.Element> = {
  dishwasher: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M5 8h14M8 6h.01M11 6h.01M8 17h8M9 15v-4m3 4v-4m3 4v-4" />
    </>
  ),
  thermo: <path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0ZM12 9v6" />,
  drop: <path d="M12 3.5c3 4 5.5 7 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 10.5 9 7.5 12 3.5Z" />,
  // sensor with a struck-through signal arc: 'nevysílá'
  sensorOff: (
    <path d="M9 13.5h6v6.5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-6.5ZM12 16.5h.01M8.2 9.7a5.5 5.5 0 0 1 7.6 0M5.6 7a9.3 9.3 0 0 1 12.8 0M4 3.5l16 16" />
  ),
  snow: (
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
  ),
  bolt: <path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12L13 3Z" />,
  washer: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <circle cx="12" cy="13.5" r="4" />
      <path d="M7.5 6.5h3" />
    </>
  ),
  door: <path d="M6 20.5V4.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M4 20.5h16M14.5 12.5h.01" />,
  window: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
      <path d="M12 3.5v17M4.5 12h15" />
    </>
  ),
  bulb: (
    <path d="M9 17.5h6M10 20.5h4M12 3.5a5.5 5.5 0 0 0-3.2 10c.7.5 1.2 1.3 1.2 2.2v.3h4v-.3c0-.9.5-1.7 1.2-2.2A5.5 5.5 0 0 0 12 3.5Z" />
  ),
  plug: <path d="M9 3.5v4M15 3.5v4M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0v-3ZM12 16v4.5" />,
  shield: (
    <path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6l-7-2.5ZM9 12l2.2 2.2L15.5 10" />
  ),
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  wifi: (
    <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0M12 19h.01" />
  ),
  home: (
    <path d="M4 10.5 12 4l8 6.5V20a.5.5 0 0 1-.5.5h-15A.5.5 0 0 1 4 20v-9.5ZM9.5 20.5V14h5v6.5" />
  ),
};

export function Glyph({ name, size = 22 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      className="hb-svg-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
