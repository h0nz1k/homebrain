/** Inline action glyphs (same pattern as PauseIcon / HomeIcon in RobotsView). */

export function PlayIcon() {
  return (
    <svg className="rb-ico" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="rb-ico" aria-hidden="true" fill="currentColor">
      <rect x="5" y="4" width="3.4" height="12" rx="1.2" />
      <rect x="11.6" y="4" width="3.4" height="12" rx="1.2" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="rb-ico" aria-hidden="true" fill="currentColor">
      <path d="M3.5 9.2 10 3.8l6.5 5.4V16a1 1 0 0 1-1 1h-3.3v-4.4H7.8V17H4.5a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="rb-ico" aria-hidden="true" fill="none">
      <path
        d="M5 10.2 8.4 14 15 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="rb-ico" aria-hidden="true" fill="none">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="rb-ico" aria-hidden="true" fill="none">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.2V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="5.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg className="rb-ico" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 11.5V13h1.5l7-7L10 4.5l-7 7zm9.7-6.2a.8.8 0 000-1.1l-.9-.9a.8.8 0 00-1.1 0l-.7.7 2 2 .7-.7z"
        fill="currentColor"
      />
    </svg>
  );
}

export function RouteIcon() {
  return (
    <svg className="rb-ico" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 13.5a2 2 0 1 1 0-4h7a2 2 0 1 0 0-4H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12.5" cy="13.5" r="1.6" fill="currentColor" />
      <circle cx="3.5" cy="5.5" r="1.6" fill="currentColor" />
    </svg>
  );
}
