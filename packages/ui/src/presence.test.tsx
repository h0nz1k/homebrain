import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import {
  PresenceStrip,
  presenceColumns,
  presenceHex,
  presenceInitials,
  type PresencePerson,
} from './presence.js';

const people: PresencePerson[] = [
  { id: 'person.jan', name: 'Jan', color: 'blue', status: 'home' },
  { id: 'person.adamek', name: 'Adámek', color: 'teal', status: 'away' },
  { id: 'person.babi', name: 'Babi Nová', color: 'nonsense', status: 'unknown' },
];

describe('PresenceStrip', () => {
  afterEach(cleanup);

  it('renders nothing without people', () => {
    const { container } = render(<PresenceStrip people={[]} />);
    expect(container.innerHTML).toBe('');
    const { container: nullish } = render(<PresenceStrip people={null} />);
    expect(nullish.innerHTML).toBe('');
  });

  it('shows status as text and aria, not colour alone', () => {
    render(<PresenceStrip people={people} />);
    const strip = screen.getByRole('list', { name: 'Kdo je doma' });
    const items = within(strip).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Jan: doma',
      'Adámek: pryč',
      'Babi Nová: neznámo',
    ]);
    expect(items.map((li) => li.dataset.status)).toEqual(['home', 'away', 'unknown']);
    expect(items[0]!.textContent).toContain('doma');
    expect(items[1]!.textContent).toContain('pryč');
  });

  it('exposes one hex per colour token, kept for away people too', () => {
    expect(presenceHex('teal')).toBe('#0d9488');
    expect(presenceHex('nonsense')).toBe(presenceHex('slate'));
    render(<PresenceStrip people={people} />);
    const items = screen.getAllByTestId('presence-person');
    expect(items[1]!.style.getPropertyValue('--hb-presence-c')).toBe('#0d9488');
  });

  it('accepts only known colour tokens and sizes', () => {
    render(<PresenceStrip people={people} size="lg" />);
    const items = screen.getAllByTestId('presence-person');
    expect(items[0]!.dataset.color).toBe('blue');
    expect(items[2]!.dataset.color).toBe('slate');
    expect(screen.getByTestId('presence').dataset.size).toBe('lg');
  });

  it('builds initials from one or two words', () => {
    expect(presenceInitials('Jan')).toBe('J');
    expect(presenceInitials('babi nová')).toBe('BN');
    expect(presenceInitials('  ')).toBe('?');
  });

  it('balances chips into equal rows instead of a ragged grid', () => {
    expect(presenceColumns(6, 1220)).toBe(6);
    expect(presenceColumns(6, 750)).toBe(3);
    expect(presenceColumns(6, 328)).toBe(2);
    expect(presenceColumns(5, 600)).toBe(3);
    expect(presenceColumns(0, 300)).toBe(1);
  });
});
