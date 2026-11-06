import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  Button,
  Card,
  Chip,
  DayRibbon,
  HeroSignal,
  Pill,
  SignalCard,
  Sparkline,
  spreadPointMarkers,
  Stat,
  StatusRow,
  layoutRibbonLabels,
} from './index.js';
import type { RibbonLabelInput, Severity } from './index.js';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('renders a polymorphic glass card, stat, pill, chip and status row', () => {
  const { container } = render(
    <>
      <Card as="article" variant="glass" tone="warning">
        Obsah
      </Card>
      <Stat label="Výroba" value="2" unit="kW" />
      <Pill tone="ok" dot icon={<i />}>
        Připojeno
      </Pill>
      <Chip tone="accent">Levné okno</Chip>
      <StatusRow label="Aktualizace" value="Aktuální" tone="ok" time="9:00" />
    </>,
  );
  expect(container.querySelector('article')?.dataset.variant).toBe('glass');
  expect(container.querySelector('article')?.dataset.severity).toBe('warning');
  expect(container.querySelector('.hb-dot')).not.toBeNull();
  expect(container.querySelector('.hb-chip')?.getAttribute('data-tone')).toBe('accent');
  expect(screen.getByText('Výroba')).toBeDefined();
  expect(container.querySelector('time')?.textContent).toBe('9:00');
});
it.each<Severity>(['critical', 'warning', 'notice', 'info', 'calm'])(
  'renders %s signals and hero attributes',
  (severity) => {
    const { container, rerender } = render(
      <SignalCard
        id="signal-test"
        severity={severity}
        title="Signál dne"
        context="Podrobnosti"
        value={{ v: 12, unit: '°C', label: 'Teplota' }}
        icon={<i />}
        stale
        alsoCount={2}
        compact
        enterIndex={2}
      />,
    );
    const card = container.querySelector('article')!;
    expect(card.dataset.severity).toBe(severity);
    expect(card.dataset.stale).toBe('true');
    expect(card.style.getPropertyValue('--hb-enter-index')).toBe('2');
    expect(screen.getByText('Další související: 2')).toBeDefined();
    rerender(
      <HeroSignal id="signal-test" severity={severity} title="Signál dne" variant="kiosk" />,
    );
    expect(container.querySelector('article')?.dataset.variant).toBe('kiosk');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Signál dne');
  },
);
it('invokes actions and explains disabled actions accessibly', () => {
  const onAction = vi.fn();
  const { rerender } = render(
    <SignalCard
      id="action-test"
      severity="info"
      title="Přehled"
      actionLabel="Zobrazit"
      onAction={onAction}
    />,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(onAction).toHaveBeenCalledTimes(1);
  rerender(
    <SignalCard
      id="action-test"
      severity="info"
      title="Přehled"
      actionLabel="Zobrazit"
      actionDisabledReason="Data nejsou dostupná"
      onAction={onAction}
    />,
  );
  const button = screen.getByRole('button') as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Data nejsou dostupná',
  );
  fireEvent.click(button);
  expect(onAction).toHaveBeenCalledTimes(1);
});
it.each([[], [2], [3, 3, 3], [1, 4, 2], [NaN, Infinity, 2]].map((values) => ({ values })))(
  'renders safe sparklines without SVG text: $values',
  ({ values }) => {
    const { container } = render(<Sparkline values={values} area />);
    expect(container.querySelector('text')).toBeNull();
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
    expect(container.querySelector('polyline')?.getAttribute('vector-effect')).toBe(
      'non-scaling-stroke',
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  },
);
const measure = (label: string) => Array.from(label).length * 8;
it('keeps crowded ribbon labels inside bounds with no overlap', () => {
  const items: RibbonLabelInput[] = Array.from({ length: 20 }, (_, i) => ({
    id: `label-${i}`,
    label: `Událost ${i}`,
    x: i / 20,
    priority: i === 19 ? 10 : 0,
  }));
  for (const width of [0, 7, 40, 160, 360, 640, 1280]) {
    const result = layoutRibbonLabels(items, width, measure);
    result.forEach((label, i) => {
      expect(label.left).toBeGreaterThanOrEqual(0);
      expect(label.left + label.width).toBeLessThanOrEqual(width);
      expect(measure(label.text)).toBeLessThanOrEqual(label.width);
      if (i)
        expect(label.left).toBeGreaterThanOrEqual(result[i - 1]!.left + result[i - 1]!.width + 8);
    });
    if (width >= measure('Událost 19'))
      expect(result.some((label) => label.id === 'label-19')).toBe(true);
  }
  expect(items[0]!.label).toBe('Událost 0');
});
it('spreads point markers that share a time so neither hides the other', () => {
  const offsets = spreadPointMarkers([
    { id: 'event', x: 300 },
    { id: 'waste', x: 300 },
    { id: 'sunset', x: 120 },
  ]);
  expect(offsets.get('event')).toBe(-4);
  expect(offsets.get('waste')).toBe(4);
  expect(offsets.has('sunset')).toBe(false);
  // Three markers within the spacing are centred around their mean, 8 px apart.
  const three = spreadPointMarkers([
    { id: 'a', x: 100 },
    { id: 'b', x: 103 },
    { id: 'c', x: 106 },
  ]);
  expect([three.get('a'), three.get('b'), three.get('c')]).toEqual([-5, 0, 5]);
});
it('renders colliding 18:00 markers apart in the DOM', () => {
  const { container } = render(
    <DayRibbon
      {...ribbonProps}
      items={[
        { id: 'ev', kind: 'event', from: 18, label: 'Večeře' },
        { id: 'bin', kind: 'waste', from: 18, label: 'Zítra svoz: papír' },
        // The Dnes model turns point items into 15-min hairline bands; they spread too.
        { id: 'bin2', kind: 'waste', from: 20, to: 20.1, label: 'Svoz' },
        { id: 'ev2', kind: 'event', from: 20, label: 'Trénink' },
      ]}
    />,
  );
  const transforms = Array.from(
    container.querySelectorAll<HTMLElement>('[data-testid="ribbon-marker"]'),
  ).map((marker) => marker.style.transform);
  expect(transforms).toEqual([
    'translateX(calc(-50% + -4px))',
    'translateX(calc(-50% + 4px))',
    'translateX(3px)',
    'translateX(calc(-50% + -3px))',
  ]);
});
it('clamps edge labels and is deterministic for equal anchors', () => {
  const items = [
    { id: 'a', label: 'Východ', x: -1 },
    { id: 'b', label: 'Svoz', x: 1 },
    { id: 'c', label: 'Událost', x: 1 },
  ];
  const result = layoutRibbonLabels(items, 300, measure);
  expect(result[0]!.left).toBe(0);
  expect(result.at(-1)!.left + result.at(-1)!.width).toBe(300);
  expect(
    result.every((label) => label.text.replace('…', '').length >= Math.min(6, label.label.length)),
  ).toBe(true);
  expect(layoutRibbonLabels(items, 300, measure)).toEqual(result);
});
const ribbonProps = {
  start: 6,
  end: 22,
  now: 10.5,
  sunrise: 7,
  sunset: 17,
  items: [
    { id: 'cheap-test', kind: 'cheap' as const, from: 12, to: 14, label: 'Levný proud' },
    { id: 'rain-test', kind: 'rain' as const, from: 10, to: 11, label: 'Déšť' },
    { id: 'waste-test', kind: 'waste' as const, from: 8, label: 'Svoz' },
    { id: 'event-test', kind: 'event' as const, from: 15, label: 'Událost' },
    { id: 'sun-test', kind: 'sun' as const, from: 7, label: 'Východ' },
  ],
  hourly: [
    { h: 9, tempC: 12.5, icon: <i /> },
    { h: 12, tempC: 14 },
  ],
};
it('aligns forecast and ticks exactly and positions sun stops using real times', () => {
  const { container, rerender } = render(<DayRibbon {...ribbonProps} />);
  expect(screen.queryByText('teď')).toBeNull();
  expect(screen.getByText('10:30')).toBeDefined();
  expect(screen.queryByText('Východ')).toBeNull();
  expect(screen.getByText('12,5 °C')).toBeDefined();
  for (const hourly of container.querySelectorAll<HTMLElement>('.hb-ribbon-hourly')) {
    const tick = container.querySelector<HTMLElement>(
      `.hb-ribbon-tick[data-hour="${hourly.dataset.hour}"]`,
    )!;
    expect(hourly.style.left).toBe(tick.style.left);
    expect(hourly.style.transform).toBe(tick.style.transform);
  }
  expect(container.querySelector<HTMLElement>('.hb-ribbon-cheap')!.style.width).toBe('12.5%');
  const gradient = container.querySelector<HTMLElement>('.hb-ribbon-track')!.style.background;
  expect(gradient).toContain('6.25%'); // sunrise (7 - 6) / 16
  rerender(<DayRibbon {...ribbonProps} sunrise={8} slim />);
  expect(container.querySelector('.hb-ribbon-hourly')).toBeNull();
  expect(container.querySelector<HTMLElement>('.hb-ribbon-track')!.style.background).not.toBe(
    gradient,
  );
});
it('observes ribbon width and disconnects on unmount', () => {
  const observe = vi.fn(),
    disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: (entries: unknown[]) => void) {
        callback([{ contentRect: { width: 200 } }]);
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const { unmount } = render(<DayRibbon {...ribbonProps} />);
  expect(observe).toHaveBeenCalledOnce();
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});

it('anchors labels by their left edge and drops cheap before rain before waste', () => {
  expect(
    layoutRibbonLabels([{ id: 'one', label: 'Událost', x: 0.25 }], 400, measure)[0]?.left,
  ).toBe(100);
  const labels = layoutRibbonLabels(
    [
      { id: 'cheap', label: 'Levný proud', x: 0, priority: 1 },
      { id: 'rain', label: 'Déšť ráno', x: 0, priority: 3 },
      { id: 'waste', label: 'Svoz plastů', x: 0, priority: 4 },
    ],
    100,
    measure,
  );
  expect(labels.map((label) => label.id)).toEqual(['waste']);
  expect(labels[0]?.text.replace('…', '').length).toBeGreaterThanOrEqual(6);
});

it('never ellipsizes ribbon labels – shortens, then drops lowest priority', () => {
  const measure = (text: string) => text.length * 8;
  const labels = layoutRibbonLabels(
    [
      { id: 'waste', x: 0.05, label: 'Plasty do 8:00', priority: 4 },
      { id: 'cheap', x: 0.1, label: 'Levně do 9:00', priority: 1 },
      { id: 'rain', x: 0.15, label: 'Déšť od 8:00, pak přeháňky', priority: 3 },
      { id: 'event', x: 0.25, label: '9:30 Porada', priority: 2 },
    ],
    340,
    measure,
  );
  expect(labels.every((label) => !label.text.includes('…'))).toBe(true);
  expect(labels.map((label) => label.id)).toContain('waste');
  expect(labels.find((label) => label.id === 'rain')?.text).toBe('Déšť od 8:00');
  for (const label of labels) expect(label.left + label.width).toBeLessThanOrEqual(340.5);
});

it('centres point-event labels and keeps labels within the max offset of their event', () => {
  const [centred] = layoutRibbonLabels(
    [{ id: 'dinner', label: 'Večeře', x: 0.5, anchor: 'center' }],
    400,
    measure,
  );
  expect(centred!.left + centred!.width / 2).toBe(200);
  const crowded = layoutRibbonLabels(
    [
      { id: 'a', label: 'Plasty do osmi', x: 0.1, priority: 4 },
      { id: 'b', label: 'Porada v devět', x: 0.12, priority: 2, anchor: 'center' },
    ],
    800,
    measure,
    { maxOffset: 48 },
  );
  expect(crowded.map((label) => label.id)).toEqual(['a']);
  for (const label of crowded) expect(Math.abs(label.left - label.x * 800)).toBeLessThanOrEqual(48);
});

it('Pill sm and toggle Chip (aria-pressed button) and Button variants', () => {
  const onPressed = vi.fn();
  render(
    <>
      <Pill size="sm" tone="ok" dot>
        22 °C
      </Pill>
      <Chip pressed={false} onPressedChange={onPressed}>
        notify.demo
      </Chip>
      <Button variant="primary" size="sm" onClick={onPressed}>
        +1 min
      </Button>
    </>,
  );
  expect(screen.getByText('22 °C').getAttribute('data-size')).toBe('sm');
  const chip = screen.getByRole('button', { name: 'notify.demo' });
  expect(chip.getAttribute('aria-pressed')).toBe('false');
  expect(chip.className).toContain('hb-chip');
  fireEvent.click(chip);
  expect(onPressed).toHaveBeenCalledWith(true);
  const btn = screen.getByRole('button', { name: '+1 min' });
  expect(btn.className).toContain('hb-btn');
  expect(btn.getAttribute('data-variant')).toBe('primary');
  expect(btn.getAttribute('type')).toBe('button');
});

it('Button superset API: default secondary, lg/block, loading; Chip onPress + badge', () => {
  const onPress = vi.fn();
  render(
    <>
      <Button>Zpět</Button>
      <Button variant="strong" size="lg" block loading>
        Uložit
      </Button>
      <Chip pressed onPress={onPress} badge={2} badgeLabel="pořadí 2">
        Kuchyně
      </Chip>
      <Chip pressed={false} disabled>
        Sklep
      </Chip>
    </>,
  );
  expect(screen.getByRole('button', { name: 'Zpět' }).getAttribute('data-variant')).toBe(
    'secondary',
  );
  const save = screen.getByRole('button', { name: 'Uložit' }) as HTMLButtonElement;
  expect(save.dataset.size).toBe('lg');
  expect(save.hasAttribute('data-block')).toBe(true);
  expect(save.getAttribute('aria-busy')).toBe('true');
  expect(save.disabled).toBe(true);
  const chip = screen.getByRole('button', { name: /Kuchyně/ });
  expect(chip.hasAttribute('data-toggle')).toBe(true);
  expect(chip.querySelector('.hb-chip-badge')?.textContent).toBe('2');
  fireEvent.click(chip);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button', { name: 'Sklep' }) as HTMLButtonElement).disabled).toBe(true);
});

it('Chip look="soft" marks the shared selection language, solid stays the default', () => {
  render(
    <>
      <Chip pressed look="soft" badge={1} badgeLabel="pořadí 1" onPress={() => undefined}>
        Jídelna
      </Chip>
      <Chip pressed onPress={() => undefined}>
        Filtr
      </Chip>
    </>,
  );
  const soft = screen.getByRole('button', { name: /Jídelna/ });
  expect(soft.dataset.look).toBe('soft');
  expect(soft.querySelector('.hb-chip-badge')?.textContent).toBe('1');
  expect(screen.getByRole('button', { name: 'Filtr' }).hasAttribute('data-look')).toBe(false);
});

it('Button danger variant (extends the canonical Button) keeps type=button', () => {
  render(<Button variant="danger">Smazat</Button>);
  const b = screen.getByRole('button', { name: 'Smazat' });
  expect(b.getAttribute('type')).toBe('button');
  expect(b.dataset.variant).toBe('danger');
});

it('toggle Chip keeps a non-neutral tone (amber maintenance toggle)', () => {
  const { container } = render(
    <>
      <Chip pressed={false} tone="warn" onPress={() => undefined}>
        Údržba
      </Chip>
      <Chip pressed tone="neutral" onPress={() => undefined}>
        Kuchyně
      </Chip>
    </>,
  );
  const [warn, neutral] = Array.from(container.querySelectorAll('button'));
  expect(warn?.getAttribute('data-tone')).toBe('warn');
  expect(neutral?.hasAttribute('data-tone')).toBe(false);
});
