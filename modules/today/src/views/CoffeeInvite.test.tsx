// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { CoffeeApi, CoffeeStatus } from '../data/coffee.js';
import { CoffeeInvite } from './CoffeeInvite.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('shows confirmation only on the sending panel, then both panels count down to the same time', async () => {
  vi.useFakeTimers();
  let status: CoffeeStatus = { reason: null };
  const listeners = new Set<(status: CoffeeStatus) => void>();
  const api: CoffeeApi = {
    subscribe(listener) {
      listener(status);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async invite() {
      status = {
        reason: 'cooldown',
        cooldown_until: new Date(Date.now() + 30_000).toISOString(),
      };
      listeners.forEach((listener) => listener(status));
      return { ok: true, reason: null };
    },
  };

  render(<CoffeeInvite api={api} />);
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Pozvat na kávu' });
  await act(async () => fireEvent.click(button));
  expect(button.disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toBe('✓ Pozvánka odeslána na TV');

  act(() => vi.advanceTimersByTime(2000));
  render(<CoffeeInvite api={api} />);
  expect(screen.getAllByRole('status').map((node) => node.textContent)).toEqual([
    '✓ Pozvánka odeslána na TV',
    'Znovu za 28 s',
  ]);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getAllByRole('status').map((node) => node.textContent)).toEqual([
    'Znovu za 27 s',
    'Znovu za 27 s',
  ]);
});

it('shows a failed dispatch inline and leaves the button available for retry', async () => {
  const invite = vi
    .fn<CoffeeApi['invite']>()
    .mockResolvedValue({ ok: false, reason: 'send_failed' });
  const api: CoffeeApi = {
    subscribe(listener) {
      listener({ reason: null });
      return () => undefined;
    },
    invite,
  };
  render(<CoffeeInvite api={api} />);
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Pozvat na kávu' });
  await act(async () => fireEvent.click(button));
  expect(screen.getByRole('status').textContent).toBe('Pozvánku se nepodařilo odeslat');
  expect(button.disabled).toBe(false);
  await act(async () => fireEvent.click(button));
  expect(invite).toHaveBeenCalledTimes(2);
});
