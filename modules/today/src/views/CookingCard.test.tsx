// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import {
  cookStateLabel,
  createMockCookingProbes,
  createWsCookingSource,
  formatTemp,
  remainingLabel,
  setCookingSourceFactory,
  useCooking,
  type CookingProbe,
} from '../data/cooking.js';
import { CookingCard } from './CookingCard.js';

afterEach(cleanup);

const probe = (over: Partial<CookingProbe> = {}): CookingProbe => ({
  id: 'probe1',
  name: 'Vepřová plec',
  internal: 48.4,
  ambient: 181.2,
  target: 63,
  peak: 48.4,
  remaining_s: 740,
  elapsed_s: 5700,
  state: 'cooking',
  progress: 0.768,
  ...over,
});

describe('cooking copy', () => {
  it('maps every state to Czech', () => {
    expect(cookStateLabel('cooking')).toBe('Peče se');
    expect(cookStateLabel('remove')).toBe('Sundat z tepla');
    expect(cookStateLabel('resting')).toBe('Odpočívá');
    expect(cookStateLabel('done')).toBe('Hotovo');
    expect(cookStateLabel('underdone')).toBe('Mírně nedodělané');
    expect(cookStateLabel('overdone')).toBe('Mírně přepečené');
    expect(cookStateLabel('overcooked')).toBe('Přepečené');
    expect(cookStateLabel('ready')).toBe('Čeká na start');
    expect(cookStateLabel('něco nového')).toBe('Probíhá');
  });

  it('remaining time: minutes, hours, estimating, none after target', () => {
    expect(remainingLabel(probe({ remaining_s: 740 }))).toBe('za 13 min');
    expect(remainingLabel(probe({ remaining_s: 30 }))).toBe('za chvíli');
    expect(remainingLabel(probe({ remaining_s: 3900 }))).toBe('za 1 h 05 min');
    expect(remainingLabel(probe({ remaining_s: null }))).toBe('odhaduje se…');
    expect(remainingLabel(probe({ state: 'resting', remaining_s: 0 }))).toBeNull();
    expect(remainingLabel(probe({ state: 'ready', remaining_s: null }))).toBeNull();
  });

  it('temperatures are whole degrees, missing = dash', () => {
    expect(formatTemp(48.4)).toBe('48\u00a0°C');
    expect(formatTemp(null)).toBe('—');
  });
});

describe('CookingCard', () => {
  it('renders nothing without an active cook', () => {
    const { container } = render(<CookingCard probes={[]} kiosk={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows name, temperatures, progress and remaining per probe', () => {
    render(<CookingCard probes={[probe()]} kiosk={false} />);
    const card = screen.getByTestId('today-cooking');
    expect(card.getAttribute('aria-label')).toBe('Maso v troubě');
    const row = screen.getByTestId('cooking-probe');
    expect(row.textContent).toContain('Vepřová plec');
    expect(row.textContent).toContain('48');
    expect(row.textContent).toContain('cíl 63\u00a0°C');
    expect(row.textContent).toContain('Trouba 181\u00a0°C');
    expect(row.textContent).toContain('za 13 min');
    expect(screen.getByTestId('cooking-state').textContent).toBe('Peče se');
    expect(screen.getByRole('img', { name: /Propečení 77\s%/ })).toBeTruthy();
  });

  it('highlights „Sundat z tepla“ and announces state changes politely', () => {
    render(
      <CookingCard
        probes={[probe(), probe({ id: 'probe2', name: 'Sonda 2', state: 'remove', progress: 1 })]}
        kiosk
      />,
    );
    const rows = screen.getAllByTestId('cooking-probe');
    expect(rows).toHaveLength(2);
    // The action item leads (left / top), the rest keeps the probe order.
    expect(rows[0]!.getAttribute('data-state')).toBe('remove');
    expect(rows[0]!.getAttribute('data-alert')).toBe('true');
    expect(rows[1]!.getAttribute('data-alert')).toBeNull();
    expect(rows[0]!.textContent).toContain('!');
    expect(screen.getAllByTestId('cooking-state')[0]!.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByTestId('today-cooking').getAttribute('data-count')).toBe('2');
  });

  it('four probes fit as four columns (data-count drives the grid)', () => {
    render(<CookingCard probes={createMockCookingProbes('4')} kiosk />);
    expect(screen.getAllByTestId('cooking-probe')).toHaveLength(4);
  });
});

describe('cooking source', () => {
  it('subscribes over WS and forwards probe lists; failures hide the card', async () => {
    const calls: unknown[] = [];
    let push: ((msg: unknown) => void) | undefined;
    const connection = {
      sendMessagePromise: () => Promise.reject(new Error('unused')),
      subscribeMessage: (cb: (msg: unknown) => void, msg: unknown) => {
        calls.push(msg);
        push = cb;
        return Promise.resolve(() => undefined);
      },
    };
    const seen: CookingProbe[][] = [];
    const stop = createWsCookingSource(connection as never).subscribe((p) => seen.push(p));
    push?.({ probes: [probe()] });
    push?.({ nonsense: true });
    stop();
    expect(calls).toEqual([{ type: 'homebrain/cooking/subscribe' }]);
    expect(seen).toEqual([[probe()], []]);
  });

  it('useCooking returns [] until the source answers, then live lists', () => {
    let emit: ((p: CookingProbe[]) => void) | undefined;
    setCookingSourceFactory(() => ({
      subscribe(on) {
        emit = on;
        return () => undefined;
      },
    }));
    const { result } = renderHook(() => useCooking(undefined));
    expect(result.current).toEqual([]);
    act(() => emit?.([probe()]));
    expect(result.current).toHaveLength(1);
  });
});
