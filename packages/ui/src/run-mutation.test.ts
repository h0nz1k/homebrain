import { describe, expect, it, vi } from 'vitest';
import { createToastStore, runMutation } from './index';

function setup() {
  const store = createToastStore();
  const messages = () => store.getSnapshot().toasts.map((t) => `${t.kind}:${t.message}`);
  return { store, messages };
}

describe('runMutation', () => {
  it('shows a pending toast, replaces it with success and returns the value', async () => {
    const { store, messages } = setup();
    let resolve!: (v: number) => void;
    const p = runMutation(() => new Promise<number>((r) => (resolve = r)), {
      pending: 'Ukládám…',
      success: 'Uloženo',
      error: 'Nepodařilo se uložit',
      store,
    });
    expect(messages()).toEqual(['info:Ukládám…']);
    resolve(7);
    await expect(p).resolves.toEqual({ ok: true, value: 7 });
    expect(messages()).toEqual(['success:Uloženo']);
  });

  it('on error shows an error toast with a retry action that re-runs the mutation', async () => {
    const { store, messages } = setup();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce('ok');
    const onSuccess = vi.fn();
    const result = await runMutation(fn, {
      success: 'Hotovo',
      error: 'Nepodařilo se',
      store,
      onSuccess,
    });
    expect(result.ok).toBe(false);
    const errorToast = store.getSnapshot().toasts.find((t) => t.kind === 'error');
    expect(errorToast?.message).toBe('Nepodařilo se');
    expect(errorToast?.action?.label).toBe('Zkusit znovu');
    errorToast!.action!.onAction();
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith('ok'));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(messages()).toContain('success:Hotovo');
  });

  it('error text may be derived from the thrown error; retry can be disabled', async () => {
    const { store } = setup();
    await runMutation(() => Promise.reject(new Error('DRAWER_OPEN')), {
      error: (err) => (err instanceof Error && err.message === 'DRAWER_OPEN' ? 'Zavřete zásuvku' : 'Chyba'),
      retry: false,
      store,
    });
    const t = store.getSnapshot().toasts[0]!;
    expect(t.message).toBe('Zavřete zásuvku');
    expect(t.action).toBeUndefined();
  });

  it('prevents double submit: a second call with the same key while pending is not run', async () => {
    const { store } = setup();
    let resolve!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const first = runMutation(fn, { key: 'save', store });
    const second = runMutation(fn, { key: 'save', store });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    resolve();
    await first;
    const third = runMutation(fn, { key: 'save', store });
    expect(fn).toHaveBeenCalledTimes(2);
    resolve();
    await third;
  });

  it('does not throw synchronously when the mutation throws before returning a promise', async () => {
    const { store } = setup();
    const result = await runMutation(
      () => {
        throw new Error('sync');
      },
      { store },
    );
    expect(result).toMatchObject({ ok: false });
    expect(store.getSnapshot().toasts[0]?.message).toBe('Akci se nepodařilo dokončit');
  });
});
