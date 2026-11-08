/** „Kdo je doma“: one chip per household member with a green (doma) / red (pryč) dot. */

export type PresenceStatus = 'home' | 'away' | 'unknown';

export interface PresencePerson {
  id: string;
  name: string;
  /** Avatar colour token from the server (`blue`, `teal`, …); unknown tokens fall back. */
  color: string;
  status: PresenceStatus;
}

export const PRESENCE_COLORS = [
  'blue',
  'teal',
  'purple',
  'pink',
  'amber',
  'orange',
  'indigo',
  'slate',
] as const;

const LABEL: Record<PresenceStatus, string> = { home: 'doma', away: 'pryč', unknown: 'nevím' };

export function presenceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]!.toLocaleUpperCase('cs'))
    .join('');
}

export interface PresenceStripProps {
  people: readonly PresencePerson[] | null | undefined;
  /** `md` = compact chips (Dnes, Rodina), `lg` = readable from across the room (kiosk). */
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * Renders nothing without people. Status is colour + text + aria label (never colour alone).
 * Deliberately minimal: no places, times or ETA – only doma / pryč / nevím.
 */
export function PresenceStrip({ people, size = 'md', className }: PresenceStripProps) {
  if (!people?.length) return null;
  return (
    <div
      className={`hb-presence${className ? ` ${className}` : ''}`}
      data-size={size}
      data-testid="presence"
    >
      <ul className="hb-presence-list" aria-label="Kdo je doma">
        {people.map((person) => {
          const status: PresenceStatus = LABEL[person.status] ? person.status : 'unknown';
          const color = (PRESENCE_COLORS as readonly string[]).includes(person.color)
            ? person.color
            : 'slate';
          return (
            <li
              key={person.id}
              className="hb-presence-person"
              data-status={status}
              data-color={color}
              data-testid="presence-person"
              aria-label={`${person.name}: ${LABEL[status]}`}
            >
              <span className="hb-presence-avatar" aria-hidden="true">
                {presenceInitials(person.name)}
              </span>
              <span className="hb-presence-text" aria-hidden="true">
                <span className="hb-presence-name">{person.name}</span>
                <span className="hb-presence-state">{LABEL[status]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
