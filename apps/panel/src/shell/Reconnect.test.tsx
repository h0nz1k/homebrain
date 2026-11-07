import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionLostOverlay, RECONNECT_GRACE_MS, retryDelayMs } from './Reconnect';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('retryDelayMs', () => {
  it('backs off 2 → 4 → 8 → 16 s and caps at 30 s', () => {
    expect([0, 1, 2, 3, 4, 9].map(retryDelayMs)).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe('ConnectionLostOverlay (kiosk)', () => {
  it('stays hidden while connected and during the short grace period', () => {
    const { rerender } = render(<ConnectionLostOverlay connected reconnect={vi.fn()} />);
    expect(screen.queryByTestId('kiosk-reconnect')).toBeNull();
    rerender(<ConnectionLostOverlay connected={false} reconnect={vi.fn()} />);
    act(() => vi.advanceTimersByTime(RECONNECT_GRACE_MS - 100));
    expect(screen.queryByTestId('kiosk-reconnect')).toBeNull();
  });

  it('after the grace period shows the overlay and retries automatically with backoff', () => {
    const reconnect = vi.fn();
    render(<ConnectionLostOverlay connected={false} reconnect={reconnect} />);
    act(() => vi.advanceTimersByTime(RECONNECT_GRACE_MS));
    const overlay = screen.getByTestId('kiosk-reconnect');
    expect(overlay.textContent).toContain('Spojení s Home Assistantem se přerušilo');
    expect(
      screen.getByRole('alertdialog', { name: 'Spojení s Home Assistantem se přerušilo' }),
    ).toBeTruthy();
    act(() => vi.advanceTimersByTime(retryDelayMs(0)));
    expect(reconnect).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(retryDelayMs(1)));
    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(overlay.textContent).toContain('pokus 2');
  });

  it('„Zkusit hned“ retries at once; reconnecting removes the overlay without reload', () => {
    const reconnect = vi.fn();
    const { rerender } = render(<ConnectionLostOverlay connected={false} reconnect={reconnect} />);
    act(() => vi.advanceTimersByTime(RECONNECT_GRACE_MS));
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit hned' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    rerender(<ConnectionLostOverlay connected reconnect={reconnect} />);
    expect(screen.queryByTestId('kiosk-reconnect')).toBeNull();
    act(() => vi.advanceTimersByTime(60_000));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});
