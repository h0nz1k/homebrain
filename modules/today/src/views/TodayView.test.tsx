// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rank } from '@homebrain/signals';
import { createMockAdapter } from '../data/adapter.js';
import { filterSignalsForScreen } from '../data/kiosk.js';
import { fixtureFor } from '../data/fixtures.js';
import type { StateKey, TodayData } from '../data/types.js';
import { createTodayAdapter, isKioskRoute, setTodayAdapterFactory } from './runtime.js';
import TodayView from './TodayView.js';

let width = 1440;
let reduced = false;
function show(state: StateKey, kiosk = false) {
  window.history.replaceState({}, '', `/today${kiosk ? '?kiosk=1' : ''}`);
  setTodayAdapterFactory(() => createMockAdapter(state));
  return render(<TodayView />);
}
beforeEach(() => {
  vi.useFakeTimers();
  width = 1440;
  reduced = false;
  window.history.replaceState({}, '', '/today');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('760') ? width <= 760 : reduced,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setTodayAdapterFactory(createTodayAdapter);
  document.getElementById('hb-topbar-slot')?.remove();
});
describe('TodayView', () => {
  it('shows a calm hero and ribbon without an alert hero; station temperature appears once', () => {
    const { container } = show('a');
    expect(screen.getByTestId('today-clock')).toBeTruthy();
    expect(screen.getByTestId('day-ribbon').getAttribute('aria-label')).toBe('Průběh dne');
    expect(container.querySelector('.hb-hero')).toBeNull();
    expect(screen.getAllByText('12,4', { exact: false })).toHaveLength(1);
    expect(container.querySelector('.today-summary')?.textContent).not.toContain('°C');
    expect(container.querySelector('.today-summary')?.textContent).toBe(
      'Klidný den · Přebytek FVE 1,6 kW',
    );
    expect(screen.queryByTestId('today-footer')).toBeNull();
    expect(screen.getByTestId('today').dataset.layout).toBe('desktop');
    expect(screen.getByTestId('today').dataset.stateSeverity).toBe('info');
    expect(screen.getByTestId('today').dataset.night).toBe('false');
    expect(screen.getByTestId('status-chips').textContent).toBe('Plasty v pondělí');
    expect(screen.getAllByText(/^HA ·/)).toHaveLength(1);
    expect(container.querySelector('.today-chips')?.textContent).not.toContain('Večeře');
    for (const hourly of container.querySelectorAll<HTMLElement>('.hb-ribbon-hourly')) {
      const tick = container.querySelector<HTMLElement>(
        `.hb-ribbon-tick[data-hour="${hourly.dataset.hour}"]`,
      );
      expect(hourly.style.left).toBe(tick?.style.left);
    }
  });
  it.each(['mobile', 'desktop', 'kiosk'] as const)(
    'uses ranked %s limits and matching footer',
    (layout) => {
      width = layout === 'mobile' ? 360 : 1440;
      const { container } = show('b', layout === 'kiosk');
      const data = fixtureFor('b');
      // Kiosk is a shared wall display: health/wine/system signals are filtered before ranking.
      const signals = filterSignalsForScreen(data.signals, undefined, layout === 'kiosk');
      const expected = rank(signals, new Date(data.now), { layout });
      expect(container.querySelectorAll('.hb-hero')).toHaveLength(1);
      expect(container.querySelectorAll('.today-cards .hb-signal')).toHaveLength(
        expected.cards.length,
      );
      const link = screen.queryByText(/^Zobrazit vše/);
      const more = screen.queryByTestId('footer-more');
      expect(link).toBeNull();
      if (expected.more) expect(more?.textContent).toBe(`Další ${expected.more} · Zobrazit vše`);
      else expect(more).toBeNull();
    },
  );
  it('renders honest empty states without sun/weather data (no crash, no fake times)', () => {
    const empty: TodayData = {
      ...fixtureFor('a'),
      station: { tempC: NaN, updatedAt: '', condition: 'Počasí není k dispozici', icon: 'cloudy' },
      sun: { sunrise: '', sunset: '' },
      hourly: [],
      ribbon: [],
      signals: [],
      ha: { connected: true, updatedAt: '' },
    };
    setTodayAdapterFactory(() => ({ get: () => empty, subscribe: (cb) => (cb(empty), () => {}) }));
    render(<TodayView />);
    expect(screen.getByTestId('sun-unavailable').textContent).toContain('nejsou k dispozici');
    expect(screen.getByTestId('today-temp').textContent).toContain('—');
    expect(screen.getByTestId('ha-freshness').textContent).toContain('připojeno');
    expect(screen.getByTestId('ha-freshness').textContent).not.toContain('odpojeno');
  });

  it('shows critical severity and portals HA freshness exactly once', () => {
    const slot = document.createElement('div');
    slot.id = 'hb-topbar-slot';
    document.body.append(slot);
    const { container } = show('c');
    expect(container.querySelector('.hb-hero')?.getAttribute('data-severity')).toBe('critical');
    expect(slot.textContent).toBe('HA · odpojeno');
    expect(screen.queryByText(/Zastaralé údaje/)).toBeNull();
    expect(screen.getAllByText(/^HA ·/)).toHaveLength(1);
    expect(container.querySelector('.today-ha')).toBeNull();
  });
  it('shows only clock, temperature and tomorrow in night kiosk', () => {
    const { container } = show('a-night', true);
    expect(container.querySelector('.today-night')).toBeTruthy();
    expect(screen.getByText('23:00')).toBeTruthy();
    expect(screen.getByText(/Zítra/)).toBeTruthy();
    expect(
      container.querySelector(
        '.today-summary,.today-header,.today-footer,.hb-ribbon,.hb-hero,.today-chips',
      ),
    ).toBeNull();
  });
  it('critical at night wakes the kiosk', () => {
    const data = fixtureFor('c');
    data.now = '2026-11-01T23:00:00+01:00';
    window.history.replaceState({}, '', '/today/kiosk');
    setTodayAdapterFactory(() => ({
      get: () => data,
      subscribe: (cb) => {
        cb(data);
        return () => {};
      },
    }));
    const { container } = render(<TodayView />);
    expect(container.querySelector('.today-night')).toBeNull();
    expect(container.querySelector('.hb-hero[data-severity="critical"]')).toBeTruthy();
  });
  it('handles reduced motion and visibility changes', () => {
    reduced = true;
    const { container } = show('a', true);
    expect(container.querySelector('.today-reduced-motion')).toBeTruthy();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(container.querySelector('.today-paused')).toBeTruthy();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    expect(container.querySelector('.today-paused')).toBeNull();
  });
  it.each(['timeout', 'transitionend'])(
    'cross-fades two layers and retires the old scene on %s',
    (finish) => {
      let data = fixtureFor('a');
      let publish: (data: TodayData) => void = () => {};
      window.history.replaceState({}, '', '/today?kiosk=1');
      setTodayAdapterFactory(() => ({
        get: () => data,
        subscribe: (cb) => {
          publish = cb;
          return () => {};
        },
      }));
      const { container } = render(<TodayView />);
      expect(container.querySelectorAll('.scene')).toHaveLength(1);
      act(() => {
        data = fixtureFor('b');
        publish(data);
      });
      expect(container.querySelectorAll('.scene')).toHaveLength(2);
      act(() => vi.advanceTimersByTime(30));
      if (finish === 'timeout') act(() => vi.advanceTimersByTime(3100));
      else
        fireEvent.transitionEnd(container.querySelectorAll('.scene')[1]!, {
          propertyName: 'opacity',
        });
      expect(container.querySelectorAll('.scene')).toHaveLength(1);
    },
  );
  it('reacts to adapter factory replacement and refreshes every 30 seconds', () => {
    const { container } = show('a');
    act(() => setTodayAdapterFactory(() => createMockAdapter('c')));
    expect(container.querySelector('.hb-hero[data-severity="critical"]')).toBeTruthy();
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByTestId('today-clock')).toBeTruthy();
  });
  it('cycles nine pixel shifts without transitions', () => {
    const { container } = show('a', true);
    act(() => vi.advanceTimersByTime(180_000));
    expect((container.querySelector('.today-content') as HTMLElement).style.transform).toBe(
      'translate(2px, 0px)',
    );
    act(() => vi.advanceTimersByTime(8 * 180_000));
    expect((container.querySelector('.today-content') as HTMLElement).style.transform).toBe(
      'translate(0px, 0px)',
    );
  });
  it('shows the exact hidden count when alerts exceed the layout limit', () => {
    const data = fixtureFor('b');
    data.signals.push(
      ...Array.from({ length: 8 }, (_, index) => ({
        ...data.signals[0]!,
        id: `extra-${index}`,
        group: undefined,
        title: `Další upozornění ${index}`,
      })),
    );
    width = 360;
    setTodayAdapterFactory(() => ({
      get: () => data,
      subscribe: (cb) => {
        cb(data);
        return () => {};
      },
    }));
    render(<TodayView />);
    const result = rank(data.signals, new Date(data.now), { layout: 'mobile' });
    expect(result.more).toBeGreaterThan(0);
    // Neutral wording: counts only hidden items, never the visible notices.
    expect(screen.getByTestId('today-footer').textContent).toBe(
      `Další ${result.more} · Zobrazit vše`,
    );
    expect(screen.getByTestId('today-footer').textContent).not.toMatch(/upozornění/);
  });
  it('uses the kiosk route contract and has no fabricated real measurements', () => {
    expect(isKioskRoute('/today/kiosk', '')).toBe(true);
    expect(isKioskRoute('/today', '?kiosk=1')).toBe(true);
    expect(isKioskRoute('/today', '?kiosk=0')).toBe(false);
    expect(createTodayAdapter().get().station.tempC).toBeNaN();
  });
});

it('does not render the sun arc on mobile and hides unavailable kiosk actions', () => {
  width = 360;
  const { container, unmount } = show('c');
  expect(container.querySelector('.today-sun-band')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Zatáhnout markýzu' }).getAttribute('aria-disabled'),
  ).toBe('true');
  unmount();
  width = 1280;
  show('c', true);
  expect(screen.queryByRole('button', { name: 'Zatáhnout markýzu' })).toBeNull();
  expect(
    screen
      .queryAllByRole('button')
      .every((button) => button.getAttribute('aria-disabled') === 'false'),
  ).toBe(true);
  expect(screen.getByTestId('day-ribbon').className).toContain('slim');
  expect(screen.queryByText(/upozornění/)).toBeNull();
  expect(screen.getByTestId('ambient-sky')).toBeTruthy();
});

it('never shows per-person health signals on the kiosk, but keeps them on the desktop', () => {
  for (const state of ['a', 'b', 'c', 'd'] as const) {
    const titles = fixtureFor(state)
      .signals.filter((s) => s.module === 'health')
      .map((s) => s.title);
    if (!titles.length) continue;
    width = 1280;
    const { container, unmount } = show(state, true);
    for (const title of titles) expect(container.textContent).not.toContain(title);
    unmount();
  }
});

it('shows an explicit stale-data status on the kiosk instead of the technical HA pill', () => {
  width = 1280;
  const { unmount } = show('a', true);
  const pill = screen.getByTestId('ha-freshness');
  expect(pill.dataset.freshness).toBe('fresh');
  expect(pill.textContent).toBe('Aktuální');
  unmount();
  show('c', true);
  expect(screen.getByTestId('ha-freshness').textContent).toMatch(/^Bez spojení s domácností/);
  expect(screen.getByTestId('today').className).toContain('today-stale');
});

it('shows only a marker on the ribbon for events that already have a visible card', () => {
  width = 1440;
  const { container } = show('b');
  const shown = new Set(
    Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-testid$="signal"],[data-testid="signal-card"]',
      ),
    ).map((card) => card.dataset.id),
  );
  for (const entry of fixtureFor('b').ribbon) {
    const marker = container.querySelector(`[data-testid="ribbon-marker"][data-id="${entry.id}"]`);
    expect(marker).not.toBeNull();
    const label = container.querySelector(`[data-testid="ribbon-label"][data-id="${entry.id}"]`);
    if (entry.signalId && shown.has(entry.signalId)) expect(label).toBeNull();
  }
  expect(container.querySelector('[data-testid="ribbon-sunrise"]')).not.toBeNull();
});

it('lists calendar events in the agenda row; the ribbon keeps only their marker', () => {
  width = 1440;
  const base = fixtureFor('a');
  const data: TodayData = {
    ...base,
    ribbon: [
      ...base.ribbon,
      {
        id: 'event-0',
        kind: 'event',
        from: '2026-10-31T17:30:00+01:00',
        label: '17:30 Kroužek keramiky',
        agenda: { time: '17:30', title: 'Kroužek keramiky' },
      },
      {
        id: 'event-1',
        kind: 'event',
        from: '2026-10-31T06:00:00+01:00',
        label: 'Podzimní prázdniny',
        agenda: { time: '', title: 'Podzimní prázdniny' },
      },
    ],
  };
  setTodayAdapterFactory(() => ({ get: () => data, subscribe: (cb) => (cb(data), () => {}) }));
  const { container } = render(<TodayView />);
  const items = screen.getAllByTestId('agenda-item').map((item) => item.textContent);
  expect(items).toEqual(['17:30Kroužek keramiky', 'celý denPodzimní prázdniny']);
  expect(
    container.querySelector('[data-testid="ribbon-marker"][data-id="event-0"]'),
  ).not.toBeNull();
  expect(container.querySelector('[data-testid="ribbon-label"][data-id="event-0"]')).toBeNull();
  // Fixture events without an agenda entry are untouched.
  expect(screen.getByTestId('today-agenda').children).toHaveLength(2);
});

it('never shows the calendar agenda on the kiosk', () => {
  window.history.replaceState({}, '', '/today?kiosk=1');
  const base = fixtureFor('a');
  const data: TodayData = {
    ...base,
    ribbon: [
      {
        id: 'event-0',
        kind: 'event',
        from: '2026-10-31T17:30:00+01:00',
        label: '17:30 Kroužek',
        agenda: { time: '17:30', title: 'Kroužek' },
      },
    ],
  };
  setTodayAdapterFactory(() => ({ get: () => data, subscribe: (cb) => (cb(data), () => {}) }));
  render(<TodayView />);
  expect(screen.queryByTestId('today-agenda')).toBeNull();
});
