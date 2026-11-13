import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { InfoTip } from './info-tip';
afterEach(cleanup);
it('opens by tap, closes by tap and Escape, supports focus and hover', () => {
  render(<InfoTip label="Rezerva">Energie při výpadku</InfoTip>);
  const button = screen.getByRole('button');
  fireEvent.pointerDown(button);
  fireEvent.focus(button);
  fireEvent.click(button);
  expect(screen.getByRole('tooltip').textContent).toContain('Energie');
  fireEvent.click(button);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.blur(button);
  fireEvent.focus(button);
  expect(screen.getByRole('tooltip')).toBeTruthy();
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.mouseEnter(button.parentElement!);
  expect(screen.getByRole('tooltip')).toBeTruthy();
  fireEvent.mouseLeave(button.parentElement!);
  expect(screen.queryByRole('tooltip')).toBeNull();
});
it('keeps a hovered tip open on click and renders a closable sheet on phones', () => {
  render(<InfoTip label="Rezerva">Energie při výpadku</InfoTip>);
  const button = screen.getByRole('button');
  fireEvent.mouseEnter(button.parentElement!);
  fireEvent.click(button);
  expect(screen.getByRole('tooltip')).toBeTruthy();
  fireEvent.mouseLeave(button.parentElement!);
  cleanup();
  const matchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({ matches: true, media: query })) as never;
  try {
    render(<InfoTip label="Rezerva">Energie při výpadku</InfoTip>);
    fireEvent.click(screen.getByRole('button', { name: 'Nápověda: Rezerva' }));
    fireEvent.blur(screen.getByRole('button', { name: 'Nápověda: Rezerva' }));
    expect(screen.getByRole('tooltip').textContent).toBe('Energie při výpadku');
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít nápovědu' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nápověda: Rezerva' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  } finally {
    window.matchMedia = matchMedia;
  }
});
