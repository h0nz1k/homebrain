/** Inline action glyphs (hero / sheet controls). */

const VB = '0 0 24 24';
const SW = 2;

export function PlayIcon() {
  return (
    <svg className="rb-ico" viewBox={VB} aria-hidden="true">
      <path
        d="M8 6.2v11.6L18.5 12 8 6.2Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox={VB} className="rb-ico" aria-hidden="true" fill="currentColor">
      <rect x="7" y="5.5" width="3.8" height="13" rx="1.2" />
      <rect x="13.2" y="5.5" width="3.8" height="13" rx="1.2" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg viewBox={VB} className="rb-ico" aria-hidden="true" fill="none">
      <path
        d="M4.5 11.5 12 5.5l7.5 6V18.5a1.2 1.2 0 0 1-1.2 1.2h-4.1v-5.2H9.8v6.4H5.7a1.2 1.2 0 0 1-1.2-1.2Z"
        stroke="currentColor"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox={VB} className="rb-ico" aria-hidden="true" fill="none">
      <path
        d="M6.5 12.2 10.2 16.2 17.8 7.8"
        stroke="currentColor"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox={VB} className="rb-ico" aria-hidden="true" fill="none">
      <path d="M12 6.5v11M6.5 12h11" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg viewBox={VB} className="rb-ico" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={SW} />
      <path d="M12 11v6" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg className="rb-ico" viewBox={VB} aria-hidden="true" fill="none">
      <path
        d="M5 17.5V19h1.5l8.8-8.8-1.5-1.5-8.8 8.8zm11.2-7.3a1.1 1.1 0 0 0 0-1.6l-1.1-1.1a1.1 1.1 0 0 0-1.6 0l-.9.9 2.7 2.7.9-.9z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function RouteIcon() {
  return (
    <svg className="rb-ico" viewBox={VB} aria-hidden="true" fill="none">
      <path
        d="M5 17.5a2.5 2.5 0 1 1 0-5h8.5a2.5 2.5 0 1 0 0-5H6.5"
        stroke="currentColor"
        strokeWidth={SW}
        strokeLinecap="round"
      />
      <circle cx="18.5" cy="17.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="7.5" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
