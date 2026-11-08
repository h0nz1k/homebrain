import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { PresenceStrip, presenceInitials, type PresencePerson } from './presence.js';

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
      'Babi Nová: nevím',
    ]);
    expect(items.map((li) => li.dataset.status)).toEqual(['home', 'away', 'unknown']);
    expect(items[0]!.textContent).toContain('doma');
    expect(items[1]!.textContent).toContain('pryč');
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
});
