import type { ReactElement } from 'react';

/** Line icons (24 px grid, currentColor stroke) shared by modules; decorative by default. */
const PATHS = {
  trash: (
    <>
      <path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 10v7M14 10v7" />
    </>
  ),
  flower: (
    <>
      <path d="M12 21v-7m0 5c-4 0-6-2-6-4 4 0 6 2 6 4m0-2c4 0 6-2 6-4-4 0-6 2-6 4" />
      <circle cx="12" cy="8" r="2" />
      <path d="M10 6C6 2 3 8 8 9c-3 5 4 7 4 2 3 5 8 0 4-2 5-3 0-8-2-4 0-5-6-4-4 1z" />
    </>
  ),
  broom: (
    <>
      <path d="m13 12 6-9M13 12l-5-2-5 8 9 3 4-8-3-1M6 14l7 3M6 19l2-4M9 20l2-4" />
    </>
  ),
  food: (
    <>
      <path d="M5 3v6c0 3 5 3 5 0V3M7.5 3v18M19 3c-4 3-5 9-1 10h1V3Zm0 10v8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.9" r=".6" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  chevron: <path d="m9.5 6 6 6-6 6" />,
  edit: (
    <>
      <path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11m0-11-11 11" />,
  arrow: <path d="M4.5 12h15m-6-6 6 6-6 6" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  swap: <path d="M4.5 8.5h14m-3.5-4 4 4-4 4M19.5 15.5h-14m3.5-4-4 4 4 4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.6 3.4 17a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.9" r=".6" fill="currentColor" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3" />
    </>
  ),
  battery: (
    <>
      <rect x="3.5" y="7.5" width="15" height="9" rx="2.5" />
      <path d="M21 10.5v3M7 10.5v3M10.5 10.5v3" />
    </>
  ),
  grid: (
    <>
      <path d="M8 21 11 4h2l3 17M6 8h12M7 12.5h10M9.3 13l5.4 6M14.7 13l-5.4 6" />
    </>
  ),
  tariff: (
    <>
      <path d="M6.5 3.5h11v17l-2.75-1.75L12 20.5l-2.75-1.75L6.5 20.5z" />
      <path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h3" />
    </>
  ),
  inverter: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="3" />
      <path d="M8 10c1.3-2.7 2.7-2.7 4 0s2.7 2.7 4 0M8.5 16h7" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof PATHS;
export const iconNames = Object.keys(PATHS) as IconName[];

export function Icon({
  name,
  size = 20,
  className = '',
  label,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** Accessible name; without it the icon is hidden from assistive tech. */
  label?: string;
}) {
  return (
    <svg
      className={`hb-svg-icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
