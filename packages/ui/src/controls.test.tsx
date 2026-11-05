import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  LiveStatus,
  SegmentedControl,
  Sheet,
  StatusRow,
  Stepper,
  Switch,
  Tile,
} from './index';

afterEach(cleanup);

describe('controls', () => {
  it('Tile is a static slot, or one button for the whole tile with onPress', () => {
    const onPress = vi.fn();
    const { container } = render(
      <>
        <Tile label="Obličej" status="✓ zapsáno" tone="ok" />
        <Tile label="Levá dlaň" status="Přidat" empty onPress={onPress} />
      </>,
    );
    expect(container.querySelector('div.hb-tile[data-tone=ok]')?.textContent).toContain('Obličej');
    const btn = screen.getByRole('button', { name: /Levá dlaň/ });
    expect(btn.hasAttribute('data-empty')).toBe(true);
    fireEvent.click(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('Switch toggles via onChange', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Servisní režim" />);
    const sw = screen.getByRole('switch', { name: 'Servisní režim' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('SegmentedControl is a radiogroup and reports only a changed value', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Akce"
        value="a"
        onChange={onChange}
        options={[
          ['a', 'Odemknout'],
          ['b', 'Otevřít západku'],
        ]}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Akce' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Odemknout' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Otevřít západku' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('radio', { name: 'Odemknout' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });
  it('Sheet is a labelled modal, Esc closes, alert closes on scrim', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Sheet title="Smazat Jan?" variant="alert" onClose={onClose} footer={<Button>Zpět</Button>}>
        Vrátit to nejde.
      </Sheet>,
    );
    expect(screen.getByRole('alertdialog', { name: 'Smazat Jan?' })).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(container.querySelector('.hb-scrim')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('dialog Sheet does not close on scrim by default', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Sheet title="Přidat osobu" onClose={onClose}>
        x
      </Sheet>,
    );
    fireEvent.click(container.querySelector('.hb-scrim')!);
    expect(onClose).not.toHaveBeenCalled();
  });
  it('Stepper marks the active step', () => {
    render(
      <Stepper
        steps={[
          { key: 'a', title: 'Jméno', state: 'done' },
          { key: 'b', title: 'Obličej', state: 'active', detail: 'snímám…' },
          { key: 'c', title: 'Dlaň', state: 'todo' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[1]!.getAttribute('aria-current')).toBe('step');
    expect(items[0]!.textContent).toContain('✓');
  });
  it('LiveStatus is a polite live region', () => {
    render(
      <LiveStatus state="error" title="Snímač nic nezachytil">
        Přistupte blíž.
      </LiveStatus>,
    );
    const s = screen.getByRole('status');
    expect(s.dataset.state).toBe('error');
    expect(s.textContent).toContain('Přistupte blíž.');
  });
  it('StatusRow rich variant renders detail and action instead of time', () => {
    render(
      <StatusRow
        label="Poznal: Jan"
        value=""
        detail="Kterou ruku?"
        time="teď"
        action={<Button size="sm">Levá</Button>}
      />,
    );
    expect(screen.getByText('Kterou ruku?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Levá' })).toBeDefined();
    expect(screen.queryByText('teď')).toBeNull();
  });
});
