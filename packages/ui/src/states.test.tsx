import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, ErrorState, Sheet, Skeleton } from './index';

afterEach(cleanup);

describe('ErrorState', () => {
  it('announces the error and offers a retry button', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState title="Počasí není k dispozici" onRetry={onRetry} data-testid="err">
        Server neodpovídá.
      </ErrorState>,
    );
    const root = screen.getByTestId('err');
    expect(root.getAttribute('role')).toBe('alert');
    expect(root.textContent).toContain('Počasí není k dispozici');
    expect(root.textContent).toContain('Server neodpovídá.');
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no button without onRetry and a default title', () => {
    render(<ErrorState data-testid="err" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('err').textContent).toContain('Nepodařilo se načíst');
  });
});

describe('Skeleton', () => {
  it('is a busy status with an accessible label and hidden placeholder lines', () => {
    render(<Skeleton lines={4} label="Načítám recept…" data-testid="sk" />);
    const root = screen.getByTestId('sk');
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Načítám recept…')).toBeTruthy();
    const lines = root.querySelectorAll('.hb-skeleton-line');
    expect(lines).toHaveLength(4);
    for (const line of Array.from(lines)) expect(line.getAttribute('aria-hidden')).toBe('true');
  });

  it('card variant renders a block placeholder before the lines', () => {
    render(<Skeleton variant="card" data-testid="sk" />);
    const root = screen.getByTestId('sk');
    expect(root.dataset.variant).toBe('card');
    expect(root.querySelector('.hb-skeleton-block')).not.toBeNull();
    expect(screen.getByText('Načítám…')).toBeTruthy();
  });
});

describe('Sheet focus trap', () => {
  it('Tab from the last focusable element wraps to the first and Shift+Tab back', () => {
    render(
      <Sheet title="T" onClose={() => {}}>
        <button type="button">A</button>
        <button type="button">B</button>
      </Sheet>,
    );
    const a = screen.getByRole('button', { name: 'A' });
    const b = screen.getByRole('button', { name: 'B' });
    b.focus();
    fireEvent.keyDown(b, { key: 'Tab' });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(b);
  });
});

describe('ConfirmDialog', () => {
  it('is an alertdialog labelled by its title and described by its body', () => {
    render(
      <ConfirmDialog title="Smazat recept?" confirmLabel="Smazat" onConfirm={() => {}} onClose={() => {}}>
        Recept nejde obnovit.
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('alertdialog');
    const labelled = document.getElementById(dialog.getAttribute('aria-labelledby')!);
    const described = document.getElementById(dialog.getAttribute('aria-describedby')!);
    expect(labelled?.textContent).toBe('Smazat recept?');
    expect(described?.textContent).toBe('Recept nejde obnovit.');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('danger dialogs focus the safe cancel button first; Esc closes', () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog title="Smazat?" confirmLabel="Smazat" danger onConfirm={() => {}} onClose={onClose} />,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Zpět' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs onConfirm once even on a double click, then closes', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const onClose = vi.fn();
    render(<ConfirmDialog title="Smazat?" confirmLabel="Smazat" onConfirm={onConfirm} onClose={onClose} />);
    const ok = screen.getByRole('button', { name: 'Smazat' });
    fireEvent.click(ok);
    fireEvent.click(ok);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(ok.getAttribute('aria-busy')).toBe('true');
    await act(async () => resolve());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open with an inline error when onConfirm fails, and can be retried', async () => {
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<ConfirmDialog title="Smazat?" confirmLabel="Smazat" onConfirm={onConfirm} onClose={onClose} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Smazat' })));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Nepodařilo se');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Smazat' })));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open (without inline error) when onConfirm reports { ok: false }', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        title="Smazat?"
        confirmLabel="Smazat"
        onConfirm={async () => ({ ok: false })}
        onClose={onClose}
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Smazat' })));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Smazat' }).hasAttribute('disabled')).toBe(false);
  });
});
