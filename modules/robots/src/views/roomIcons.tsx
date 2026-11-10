import type { RoomIconKind } from '../roomIcons.js';
import { roomIconKind } from '../roomIcons.js';

const VB = '0 0 24 24';
const SW = 2;

function Ico({
  children,
  className = 'rb-chip-ico',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg className={className} viewBox={VB} aria-hidden="true" fill="none">
      {children}
    </svg>
  );
}

function G({ children }: { children: React.ReactNode }) {
  return (
    <g stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {children}
    </g>
  );
}

function iconFor(kind: RoomIconKind) {
  switch (kind) {
    case 'sofa':
      return (
        <G>
          <path d="M4.5 14v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14" />
          <path d="M5.5 14V11a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" />
          <path d="M5 17.5h14" />
        </G>
      );
    case 'pot':
      return (
        <G>
          <path d="M7.5 9.5h9v7.5a3 3 0 0 1-3 3h-3a3 3 0 0 1-3-3Z" />
          <path d="M9 6.5h6" />
          <path d="M10.5 6.5V9M13.5 6.5V9" />
        </G>
      );
    case 'dining':
      return (
        <G>
          <ellipse cx="12" cy="10.5" rx="5.5" ry="2.2" />
          <path d="M7.5 15.5v3M10.5 15.5v3M13.5 15.5v3M16.5 15.5v3" />
        </G>
      );
    case 'door':
      return (
        <G>
          <path d="M8.5 5.5h7v13h-7Z" />
          <circle cx="13.8" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </G>
      );
    case 'toilet':
      return (
        <G>
          <path d="M10 6h4v3.5a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6h4" />
          <path d="M12 13.5V17" />
          <path d="M9.5 17h5" />
        </G>
      );
    case 'bath':
      return (
        <G>
          <path d="M5.5 14.5h13a2 2 0 0 0 2-2v-1.5H5.5v3.5" />
          <path d="M7 11V9.5a1.5 1.5 0 0 1 3 0V11" />
          <path d="M8 6.5h3" />
        </G>
      );
    case 'laundry':
      return (
        <G>
          <rect x="7" y="5.5" width="10" height="13" rx="1.5" />
          <circle cx="12" cy="13" r="3.2" />
          <path d="M9.5 5.5V8h5V5.5" />
        </G>
      );
    case 'closet':
      return (
        <G>
          <path d="M9 6.5h6" />
          <path d="M8.5 8.5 11 19M15.5 8.5 13 19" />
        </G>
      );
    case 'bed':
      return (
        <G>
          <path d="M4.5 15h15v3.5H4.5Z" />
          <path d="M5.5 15V11.5a2 2 0 0 1 2-2h4" />
          <path d="M7 17.5v2.5" />
        </G>
      );
    case 'kids':
      return (
        <G>
          <circle cx="12" cy="9" r="2.2" />
          <path d="M9.5 12.5h5l-1 6h-3Z" />
          <rect x="15.5" y="14.5" width="3.5" height="3.5" rx="0.6" />
        </G>
      );
    case 'desk':
      return (
        <G>
          <path d="M5 16.5h14" />
          <path d="M7.5 16.5V11h9v5.5" />
          <rect x="13" y="8.5" width="5" height="3.5" rx="0.6" />
        </G>
      );
    case 'pantry':
      return (
        <G>
          <path d="M8.5 7.5h7v10h-7Z" />
          <path d="M10 10h4M10 13h4" />
        </G>
      );
    case 'garage':
      return (
        <G>
          <path d="M5.5 16.5h13" />
          <path d="M7 16.5 9.5 9h5L17 16.5" />
          <circle cx="9" cy="16.5" r="1.1" fill="currentColor" />
          <circle cx="15" cy="16.5" r="1.1" fill="currentColor" />
        </G>
      );
    case 'plant':
      return (
        <G>
          <path d="M12 18.5V10" />
          <path d="M12 12C9.5 11 8 9 8.5 6.5 11 7.5 12 10 12 10s1-2.5 3.5-3.5C16 9 14.5 11 12 12Z" />
          <path d="M8.5 18.5h7" />
        </G>
      );
    case 'stairs':
      return (
        <G>
          <path d="M6 18.5h12M6 15h9M6 11.5h6" />
        </G>
      );
    default:
      return (
        <G>
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
          <path d="M6.5 12h11M12 6.5v11" />
        </G>
      );
  }
}

export function RoomIcon({
  name,
  kind,
  className,
}: {
  name?: string;
  kind?: RoomIconKind;
  className?: string;
}) {
  const k = kind ?? roomIconKind(name ?? '');
  return <Ico className={className}>{iconFor(k)}</Ico>;
}
