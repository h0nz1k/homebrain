// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  SaveState,
  TOAST_DURATION_MS,
  TOAST_EXIT_MS,
  TOAST_LONG_DURATION_MS,
  Toaster,
  createToastStore,
  toast,
  toastStore,
  useSaveState,
} from './index.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  toastStore.reset();
  vi.useRealTimers();
});

const visible = () => screen.queryAllByTestId('hb-toast').map((el) => el.textContent ?? '');

it('keeps at most 3 toasts and closes the oldest first', () => {
  render(<Toaster />);
  act(() => {
    toast.success('Jedna');
    toast.success('Dvě');
    toast.info('Tři');
    toast.success('Čtyři');
  });
  const states = screen.getAllByTestId('hb-toast').map((el) => el.dataset.state);
  expect(states).toEqual(['closing', 'open', 'open', 'open']);
  act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
  expect(visible()).toEqual(['Dvě', 'Tři', 'Čtyři']);
});

it('replaces a toast with the same id instead of stacking', () => {
  render(<Toaster />);
  act(() => {
    toast.success('Hodnocení uloženo: 2 z 5', { id: 'wine' });
    toast.success('Hodnocení uloženo: 3 z 5', { id: 'wine' });
  });
  expect(visible()).toEqual(['Hodnocení uloženo: 3 z 5']);
});

it('auto-dismisses after 4 s, errors after 6 s', () => {
  render(<Toaster />);
  act(() => {
    toast.success('Uloženo');
    toast.error('Nepodařilo se uložit');
  });
  act(() => vi.advanceTimersByTime(TOAST_DURATION_MS + TOAST_EXIT_MS));
  expect(visible()).toEqual(['Nepodařilo se uložit']);
  act(() => vi.advanceTimersByTime(TOAST_LONG_DURATION_MS - TOAST_DURATION_MS + TOAST_EXIT_MS));
  expect(visible()).toEqual([]);
});

it('pauses the countdown on hover and resumes on leave', () => {
  render(<Toaster />);
  act(() => {
    toast.success('Uloženo');
  });
  const el = screen.getByTestId('hb-toast');
  act(() => vi.advanceTimersByTime(1000));
  fireEvent.mouseEnter(el);
  expect(el.dataset.paused).toBe('true');
  act(() => vi.advanceTimersByTime(10_000));
  expect(visible()).toEqual(['Uloženo']);
  fireEvent.mouseLeave(screen.getByTestId('hb-toast'));
  act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1000 + TOAST_EXIT_MS));
  expect(visible()).toEqual([]);
});

it('announces info politely and errors assertively', () => {
  render(<Toaster />);
  const polite = document.querySelector<HTMLElement>('[data-hb-live="polite"]')!;
  const assertive = document.querySelector<HTMLElement>('[data-hb-live="assertive"]')!;
  expect(screen.queryByRole('alert')).toBeNull();
  expect(polite.getAttribute('aria-live')).toBe('polite');
  expect(assertive.getAttribute('aria-live')).toBe('assertive');
  act(() => {
    toast.success('Uloženo');
  });
  expect(polite.textContent).toBe('Uloženo');
  expect(assertive.textContent).toBe('');
  act(() => {
    toast.error('Nepodařilo se uložit – zkusit znovu');
  });
  expect(assertive.textContent).toBe('Nepodařilo se uložit – zkusit znovu');
  expect(screen.getByRole('region', { name: 'Oznámení' })).toBeTruthy();
});

it('undo runs the handler, dismisses and shows progress', () => {
  const onUndo = vi.fn();
  render(<Toaster />);
  act(() => {
    toast.undo('Lahev odepsána', onUndo);
  });
  const el = screen.getByTestId('hb-toast');
  expect(el.dataset.kind).toBe('undo');
  expect(el.querySelector('.hb-toast-track .hb-toast-progress')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Vrátit' }));
  expect(onUndo).toHaveBeenCalledOnce();
  expect(screen.getByTestId('hb-toast').dataset.state).toBe('closing');
});

it('close button has a Czech accessible name', () => {
  render(<Toaster />);
  act(() => {
    toast.info('Import dokončen');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Zavřít oznámení' }));
  act(() => vi.advanceTimersByTime(TOAST_EXIT_MS));
  expect(visible()).toEqual([]);
});

it('stores are independent (tests / previews can use their own)', () => {
  const store = createToastStore();
  render(<Toaster store={store} />);
  act(() => {
    store.show('success', 'Jen tady');
    toast.success('Globální');
  });
  expect(visible()).toEqual(['Jen tady']);
});

function SaveDemo({ fn }: { fn: () => Promise<void> }) {
  const { status, run } = useSaveState(2000);
  return (
    <>
      <button type="button" onClick={() => void run(fn).catch(() => undefined)}>
        Uložit
      </button>
      <SaveState status={status} onRetry={() => void run(fn).catch(() => undefined)} />
    </>
  );
}

it('SaveState: Ukládám… → Uloženo → idle, and error offers retry', async () => {
  let resolve: () => void = () => undefined;
  const fn = vi.fn(() => new Promise<void>((r) => (resolve = r)));
  render(<SaveDemo fn={fn} />);
  const state = screen.getByTestId('hb-save-state');
  fireEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  expect(state.textContent).toBe('Ukládám…');
  await act(async () => resolve());
  expect(state.textContent).toBe('Uloženo');
  act(() => vi.advanceTimersByTime(2000));
  expect(state.dataset.status).toBe('idle');

  fn.mockImplementationOnce(() => Promise.reject(new Error('x')));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  });
  expect(state.textContent).toContain('Nepodařilo se uložit');
  fireEvent.click(screen.getByRole('button', { name: 'zkusit znovu' }));
  expect(fn).toHaveBeenCalledTimes(3);
});
