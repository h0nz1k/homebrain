import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Icon, iconNames } from './icons';
afterEach(cleanup);
it('renders every icon decorative by default and named when labelled', () => {
  for (const name of iconNames) {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
  }
  render(<Icon name="lock" label="Jen pro čtení" />);
  expect(screen.getByRole('img', { name: 'Jen pro čtení' })).toBeTruthy();
});
