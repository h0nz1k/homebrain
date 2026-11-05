import type { WeatherIcon as Icon } from '../data/types.js';
export function WeatherIcon({ icon, label }: { icon: Icon; label?: string }) {
  return (
    <svg
      className="today-weather-icon"
      data-icon={icon}
      data-hb-icon=""
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {icon === 'moon' ? (
        <path d="M46 46A23 23 0 0 1 21 10a24 24 0 1 0 33 32 23 23 0 0 1-8 4Z" />
      ) : icon === 'wind' ? (
        <path d="M5 21h37c16 0 12-18 2-12M5 32h48c12 0 9 17 0 15M5 43h24c12 0 10 16 1 13" />
      ) : (
        <>
          {(icon === 'clear' || icon === 'partly') && (
            <>
              <circle cx="27" cy="25" r="12" />
              <path d="M27 3v5m0 34v5M5 25h5m34 0h5M11 9l4 4m24 24 4 4M11 41l4-4M39 13l4-4" />
            </>
          )}
          {icon !== 'clear' && (
            <path d="M19 47a11 11 0 1 1 1-22 16 16 0 0 1 30 4 9 9 0 0 1 1 18Z" />
          )}
          {icon === 'rain' && <path d="m22 53-3 7m16-7-3 7m16-7-3 7" />}
          {icon === 'snow' && <path d="M23 53v8m-4-4h8m13-4v8m-4-4h8" />}
        </>
      )}
    </svg>
  );
}
