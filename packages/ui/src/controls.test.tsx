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
  it('compact Stepper fills only the active step by its progress', () => {
    const { container } = render(
      <Stepper
        compact
        steps={[
          { key: 'a', title: 'Ohřev', state: 'done' },
          { key: 'b', title: 'Pečení', state: 'active', progress: 0.42 },
          { key: 'c', title: 'Hotovo', state: 'todo' },
        ]}
      />,
    );
    const active = container.querySelector<HTMLElement>('[data-testid=hb-step-b]')!;
    expect(active.hasAttribute('data-progress')).toBe(true);
    expect(active.style.getPropertyValue('--hb-step-p')).toBe('42%');
    const done = container.querySelector('[data-testid=hb-step-a]')!;
    expect(done.hasAttribute('data-progress')).toBe(false);
  });
  it('Switch toggles via onChange', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Servisní režim" />);
    const sw = screen.getByRole('switch', { name: 'Servisní režim' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('read-only Switch is a locked, non-focusable switch that names its state', () => {
    render(<Switch checked readOnly size="sm" label="Hlídat rezervu" />);
    const sw = screen.getByRole('switch', { name: 'Hlídat rezervu: zapnuto, jen pro čtení' });
    expect(sw.tagName).toBe('SPAN');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.getAttribute('aria-readonly')).toBe('true');
    expect(sw.hasAttribute('data-locked')).toBe(true);
  });
  it('SegmentedControl tone=accent marks the wrapper (accent thumb like pressed chips)', () => {
    const { container } = render(
      <SegmentedControl
        label="Sání"
        tone="accent"
        value="b"
        onChange={() => {}}
        options={[
          ['a', 'Tiché'],
          ['b', 'Turbo'],
        ]}
      />,
    );
    expect(container.querySelector('.hb-seg-wrap')?.getAttribute('data-tone')).toBe('accent');
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
  it('Sheet stickyFooter pins the footer only when there is one', () => {
    const { rerender } = render(
      <Sheet title="Návod" onClose={() => {}} stickyFooter footer={<button>Hotovo</button>}>
        x
      </Sheet>,
    );
    expect(screen.getByRole('dialog').hasAttribute('data-sticky-foot')).toBe(true);
    rerender(
      <Sheet title="Návod" onClose={() => {}} stickyFooter>
        x
      </Sheet>,
    );
    expect(screen.getByRole('dialog').hasAttribute('data-sticky-foot')).toBe(false);
  });
  it('Stepper instructions variant keeps every step text and its media', () => {
    const { container } = render(
      <Stepper
        variant="instructions"
        label="Jak na to"
        steps={[
          {
            key: '1',
            title: 'Otočte robota',
            state: 'todo',
            media: <img alt="krok 1" src="a.webp" />,
          },
          { key: '2', title: 'Sundejte kryt', state: 'todo' },
        ]}
      />,
    );
    const list = container.querySelector('ol')!;
    expect(list.getAttribute('data-variant')).toBe('instructions');
    expect(list.getAttribute('aria-label')).toBe('Jak na to');
    expect(screen.getAllByRole('listitem')[1]!.textContent).toBe('2Sundejte kryt');
    expect(screen.getByAltText('krok 1').closest('.hb-step-media')).not.toBeNull();
    expect(container.querySelector('.hb-steptrack')).toBeNull();
  });
  it('LiveStatus renders actions inside the status surface', () => {
    render(
      <LiveStatus state="ok" title="Zapsáno" actions={<button>Levá</button>}>
        Která ruka?
      </LiveStatus>,
    );
    const status = screen.getByRole('status');
    expect(status.querySelector('.hb-live-actions button')?.textContent).toBe('Levá');
  });
  it('LiveStatus countdown replaces the spinner and shows compact steps', () => {
    const { container } = render(
      <LiveStatus
        state="busy"
        title="Přibliž se"
        countdown={{ remaining: 12.4, total: 30 }}
        steps={[
          { key: 'a', title: 'Připraveno', state: 'done' },
          { key: 'b', title: 'Vidím', state: 'active' },
        ]}
      />,
    );
    const s = screen.getByRole('status');
    expect(s.hasAttribute('data-countdown')).toBe(true);
    expect(screen.getByTestId('hb-live-secs').textContent).toBe('13');
    const arc = container.querySelector('.hb-live-arc')!;
    const dash = Number(arc.getAttribute('stroke-dasharray'));
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(dash * (1 - 12.4 / 30));
    expect(s.querySelector('.hb-stepper[data-compact]')).not.toBeNull();
    expect(screen.getByTestId('hb-step-b').getAttribute('aria-current')).toBe('step');
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
