// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createEntityStore } from '@homebrain/ha-client';
import EnergyView, { EnergyScreen } from './EnergyView';
import { adaptEnergyEntities } from '../adapter';
import { applyFlowScenario, createEnergyDemo, type FlowScenario } from '../fixtures';

const NOW = Date.parse('2026-10-31T10:40:00+01:00');
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup(scenario: Parameters<typeof createEnergyDemo>[1] = 'day', withConnection = true) {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  const demo = createEnergyDemo(NOW, scenario);
  const store = createEntityStore();
  store.update(demo.states);
  const sendMessagePromise = vi.fn(async (message: { type: string }) =>
    demo.statistics(message as never),
  );
  const connection = withConnection
    ? { sendMessagePromise: sendMessagePromise as never }
    : undefined;
  render(<EnergyView store={store} bindings={demo.bindings} connection={connection} />);
  return { sendMessagePromise, store, demo };
}

describe('EnergyView', () => {
  it('explains an unbalanced daily balance instead of hiding it', async () => {
    const { store, demo } = setup();
    await act(async () => {});
    const houseId = demo.bindings.energy_house_energy_today!;
    act(() => store.update({ [houseId]: { ...demo.states[houseId]!, state: '1.0' } }));
    expect(screen.getByTestId('energy-balance-gap').textContent).toMatch(
      /^Šrafovaná část: rozdíl \d+,\d kWh/,
    );
    expect(screen.getByTestId('energy-balance').textContent).toContain('Do baterie');
  });

  it('keeps the live spot price in its card when the price series is missing', () => {
    const demo = createEnergyDemo(NOW);
    const model = adaptEnergyEntities({
      bindings: demo.bindings,
      getState: (id) => demo.states[id],
      now: NOW,
    });
    model.price.series = [];
    render(<EnergyScreen model={model} history={{ hourly: {}, daily: {}, status: 'ready' }} />);
    expect(screen.getByTestId('energy-price').textContent).toContain('Ceny nejsou k dispozici');
    expect(screen.getByTestId('energy-kpi-price').textContent).toContain('2,40');
  });

  it('renders KPIs, flows, prices and Czech labels read-only (ENE-001)', async () => {
    const { sendMessagePromise } = setup();
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Energie', level: 1 })).toBeTruthy();
    expect(screen.getByTestId('energy-kpi-price').textContent).toContain('2,40');
    expect(
      screen.getByTestId('energy-price').contains(screen.getByTestId('energy-kpi-price')),
    ).toBe(true);
    expect(document.querySelectorAll('.en-kpi')).toHaveLength(4);
    expect(screen.getByRole('meter', { name: 'Soběstačnost' })).toBeTruthy();
    expect(screen.queryByTestId('energy-cheap-today')).toBeNull();
    expect(screen.queryByTestId('energy-advice')).toBeNull();
    expect(screen.getByTestId('energy-flow-battery').textContent).toContain('58');
    expect(screen.getByTestId('energy-flow-battery').textContent).toContain('nabíjí');
    expect(within(screen.getByTestId('energy-price')).getByText('teď')).toBeTruthy();
    expect(screen.getByText('Aktuální')).toBeTruthy();
    // Read-only: the only buttons open detail sheets of the flow hero (no device controls).
    const flow = screen.getByTestId('energy-flow');
    expect(screen.queryAllByRole('button').filter((b) => !flow.contains(b))).toHaveLength(0);
    expect(
      sendMessagePromise.mock.calls.filter(([m]) => m.type === 'recorder/statistics_during_period'),
    ).toHaveLength(6); // hourly + daily energy, 5-minute phase means, hourly temperatures, costs (energy + spot)
    expect(screen.getByTestId('energy-7d').querySelectorAll('.en-bar-day')).toHaveLength(7);
    expect(screen.queryByText(/Levný proud/)).toBeNull();
    // Costs: own tariff, PV+battery savings and the spot comparison (informative only).
    expect(screen.getByTestId('energy-cost-total').textContent).toContain('Kč');
    expect(screen.getByTestId('energy-cost-savings').textContent).toContain(
      'FVE a baterie ušetřily',
    );
    expect(screen.getByTestId('energy-cost-spot').textContent).toContain('Se spotovým tarifem');
  });

  it('shows the statistics empty state without a connection', async () => {
    setup('day', false);
    await act(async () => {});
    expect(screen.getByTestId('energy-24h').textContent).toContain('Statistiky nejsou k dispozici');
  });

  it('shows quality badges for unavailable data and never a silent zero', async () => {
    setup('unavailable');
    await act(async () => {});
    expect(screen.getAllByText('Nedostupné').length).toBeGreaterThan(0);
    expect(screen.getByTestId('energy-flow-pv').textContent).toContain('–');
  });

  it('renders an empty state without bindings', () => {
    render(<EnergyView store={createEntityStore()} bindings={{}} />);
    expect(screen.getByText('Modul Energie nemá nastavené entity.')).toBeTruthy();
  });

  it('shows the Spotřebiče card only for bound appliances, never controlling switches', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const demo = createEnergyDemo(NOW, 'day', 'Europe/Prague', 'finished');
    const store = createEntityStore();
    store.update(demo.states);
    const sendMessagePromise = vi.fn(async (message: { type: string }) =>
      message.type === 'recorder/statistic_during_period'
        ? demo.statistic(message as never)
        : message.type === 'history/history_during_period'
          ? demo.history(message as never)
          : demo.statistics(message as never),
    );
    render(
      <EnergyView
        store={store}
        bindings={demo.bindings}
        connection={{ sendMessagePromise } as never}
      />,
    );
    await act(async () => {});
    const card = screen.getByTestId('energy-appliances');
    expect(within(card).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByTestId('energy-appliance-dishwasher').dataset.state).toBe('finished');
    expect(screen.getByTestId('energy-appliance-heat_pump').textContent).toContain('% domu');
    expect(screen.getByTestId('energy-signals').textContent).toContain('Myčka dokončila');
    expect(sendMessagePromise.mock.calls.every(([m]) => !m.type.includes('call_service'))).toBe(
      true,
    );
    cleanup();
    const bindings = Object.fromEntries(
      Object.entries(demo.bindings).filter(([k]) => !k.startsWith('energy_appliance_')),
    );
    render(
      <EnergyView store={store} bindings={bindings} connection={{ sendMessagePromise } as never} />,
    );
    await act(async () => {});
    expect(screen.queryByTestId('energy-appliances')).toBeNull();
  });

  describe('flow hero', () => {
    function flowSetup(scenario: FlowScenario, at: string) {
      const now = Date.parse(at);
      vi.useFakeTimers({ now, toFake: ['Date'] });
      const demo = createEnergyDemo(now);
      const store = createEntityStore();
      store.update(
        Object.fromEntries(
          applyFlowScenario(Object.values(demo.states), scenario).map((s) => [s.entity_id, s]),
        ),
      );
      render(<EnergyView store={store} bindings={demo.bindings} />);
      return { store, demo };
    }
    it('noon: running heat pump + dishwasher next to the house, sorted by power', async () => {
      flowSetup('noon', '2026-06-02T13:00:00+02:00');
      await act(async () => {});
      const consumers = screen.getByTestId('energy-flow-consumers');
      const ids = Array.from(
        consumers.querySelectorAll('[data-testid^="energy-flow-consumer-"]'),
      ).map((el) => el.getAttribute('data-testid'));
      expect(ids).toEqual(['energy-flow-consumer-dishwasher', 'energy-flow-consumer-heat_pump']);
      expect(screen.getByTestId('energy-flow-headline').textContent).toBe(
        'Slunce pokrývá dům, nabíjí baterii a přebytek posílá do sítě',
      );
      expect(screen.getByTestId('energy-flow-pv').textContent).toContain('FV1 3,1 kW · FV2 2,6 kW');
      // Separate source → destination flows (HA energy card style), each with its own value.
      const flows = Array.from(document.querySelectorAll('g[data-testid^="energy-flow-edge-"]'))
        .map((el) => el.getAttribute('data-testid')!.slice(17))
        .filter((id) => id.includes('-'));
      expect(flows).toEqual(['pv-house', 'pv-battery', 'pv-grid']);
      // Physical topology: PV pairs run through the inverter hub, the hub shows its AC output.
      for (const id of flows)
        expect(screen.getByTestId(`energy-flow-edge-${id}`).dataset.via).toBe('hub');
      expect(screen.getByTestId('energy-flow-hub').textContent).toContain('4,3');
      expect(screen.getByTestId('energy-flow-hub-status').textContent).toContain('Normální');
      expect(screen.getByTestId('energy-flow-hub-temp').textContent).toMatch(/°C/);
      expect(screen.getByTestId('energy-flow-battery-temp').textContent).toContain('21');
      // No value on a wire: each sink names its source in the source colour (review 003).
      expect(document.querySelector('.ef-pill')).toBeNull();
      for (const id of ['house', 'battery', 'grid'])
        expect(screen.getByTestId(`energy-flow-${id}-sources`).textContent).toContain('ze slunce');
      expect(screen.getByTestId('energy-flow-house').textContent).toContain('3,6');
      expect(screen.getByTestId('energy-flow-battery').textContent).toContain('1,4');
      expect(screen.getByTestId('energy-flow-grid').textContent).toContain('0,7');
      // One line from the sun (merged lane), split inside the inverter; arrows on every lane.
      expect(document.querySelectorAll('[data-testid^="energy-flow-chev-pv-hub-"]')).toHaveLength(
        1,
      );
    });
    it('night: nothing running, grid feeds the house', async () => {
      flowSetup('night', '2026-06-02T02:00:00+02:00');
      await act(async () => {});
      expect(screen.getByTestId('energy-flow-consumers').textContent).toContain(
        'Žádný velký spotřebič neběží',
      );
      expect(screen.getByTestId('energy-flow-edge-grid-house')).toBeTruthy();
      expect(screen.queryByTestId('energy-flow-edge-pv-house')).toBeNull();
      expect(screen.queryByTestId('energy-flow-edge-battery-house')).toBeNull();
      expect(screen.getByTestId('energy-flow-headline').textContent).toBe('Dům bere ze sítě');
    });
    it('cheap night tariff: grid feeds the house and charges the battery', async () => {
      flowSetup('nightcharge', '2026-06-02T02:30:00+02:00');
      await act(async () => {});
      expect(screen.getByTestId('energy-flow-headline').textContent).toBe(
        'Síť napájí dům a nabíjí baterii',
      );
      expect(screen.getByTestId('energy-flow-battery').textContent).toContain('2,5');
      expect(screen.getByTestId('energy-flow-house').textContent).toContain('0,5');
      expect(screen.getByTestId('energy-flow-house-sources').textContent).toContain('ze sítě');
      expect(screen.queryByTestId('energy-flow-edge-pv-grid')).toBeNull();
      // Short labels (no clipping on 320 px): the battery says where the charge comes from.
      expect(screen.getByTestId('energy-flow-battery').textContent).toContain('nabíjí ze sítě');
      expect(screen.getByTestId('energy-flow-hub').textContent).toContain('bere ze sítě');
      // Hub value is a magnitude ('2,5 kW · bere ze sítě'), never a bare minus sign.
      expect(screen.getByTestId('energy-flow-hub').textContent).not.toContain('−');
    });
    it('consumer appears/disappears live; tap on a node opens the detail sheet', async () => {
      const { store, demo } = flowSetup('evening', '2026-06-02T19:30:00+02:00');
      await act(async () => {});
      expect(screen.getByTestId('energy-flow-consumer-coffee_maker')).toBeTruthy();
      const id = demo.bindings.energy_appliance_coffee_maker_power!;
      act(() => store.update({ [id]: { ...demo.states[id]!, state: 'unavailable' } }));
      expect(screen.getByTestId('energy-flow-consumer-coffee_maker').dataset.leaving).toBe('true');
      fireEvent.click(screen.getByTestId('energy-flow-node-grid'));
      const sheet = screen.getByTestId('energy-flow-sheet');
      expect(sheet.textContent).toContain('Fáze L1');
      fireEvent.click(within(sheet).getByRole('button', { name: 'Zavřít' }));
      expect(screen.queryByTestId('energy-flow-sheet')).toBeNull();
    });
    it('inverter fault: grid → house bypasses the hub, Czech error in the hub sheet', async () => {
      flowSetup('fault', '2026-06-02T13:00:00+02:00');
      await act(async () => {});
      expect(screen.getByTestId('energy-flow-headline').textContent).toBe(
        'Střídač hlásí poruchu – dům jede ze sítě',
      );
      expect(screen.getByTestId('energy-flow-edge-grid-house').dataset.via).toBe('bus');
      expect(screen.getByTestId('energy-flow-hub-status').textContent).toBe('Porucha');
      expect(screen.getByTestId('energy-flow-hub').textContent).toContain('izolace FV');
      fireEvent.click(screen.getByTestId('energy-flow-node-hub'));
      const sheet = screen.getByTestId('energy-flow-sheet');
      expect(sheet.textContent).toContain('Chyba: porucha izolace FV.');
      expect(sheet.textContent).toContain('AC výstup (do rozvaděče)');
      expect(sheet.textContent).toContain('FV stringy (DC)');
    });
    it('battery sheet: cell spread in mV, SoH and the temperature note', async () => {
      flowSetup('nightcharge', '2026-06-02T02:30:00+02:00');
      await act(async () => {});
      fireEvent.click(screen.getByTestId('energy-flow-node-battery'));
      const text = screen.getByTestId('energy-flow-sheet').textContent ?? '';
      expect(text).toContain('Rozdíl napětí článků18 mV');
      expect(text).toContain('Zdraví baterie (SoH)96 %');
      expect(text).toContain('pod 10 °C se nabíjí pomaleji');
    });
    it('mixed phases: two grid lines with their own values + per-phase grid detail', async () => {
      flowSetup('mixed', '2026-06-02T13:00:00+02:00');
      await act(async () => {});
      expect(screen.getByTestId('energy-flow-edge-grid-house').dataset.kw).toBe('0.8');
      expect(screen.getByTestId('energy-flow-edge-pv-grid').dataset.kw).toBe('2.1');
      fireEvent.click(screen.getByTestId('energy-flow-node-grid'));
      const note = screen.getByTestId('energy-flow-sheet-note').textContent ?? '';
      expect(note).toContain('Síť: odběr 0,8 kW / dodávka 2,1 kW, po fázích L1 +0,80');
      expect(screen.getByTestId('energy-flow-sheet').textContent).toContain(
        'Síť L2dodávka 1,05 kW',
      );
    });
  });
});
