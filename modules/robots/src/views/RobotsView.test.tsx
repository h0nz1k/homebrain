// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { createEntityStore, type ConnectionLike } from '@homebrain/ha-client';
import { createRobotsDemo } from '../demo.js';
import { createSchedulesDemo } from '../schedules.js';
import { demoVectorMap } from '../map/demo.js';
import { Toaster } from '@homebrain/ui';
import RobotsView from './RobotsView.js';

afterEach(cleanup);

it('Údržba: klik na díl otevře návod; bez tlačítka resetu v HA jen „Hotovo“', async () => {
  const { sent } = setup();
  fireEvent.click(await screen.findByTestId('robots-guide-open-side_brush'));
  const sheet = screen.getByTestId('robots-guide');
  expect(sheet.textContent).toContain('obecný postup');
  expect(
    sheet.querySelectorAll('.hb-stepper[data-variant=instructions] li').length,
  ).toBeGreaterThan(2);
  // Generic fallback has no reset entity → only „Hotovo“ closes the sheet.
  expect(screen.queryByTestId('robots-guide-reset')).toBeNull();
  fireEvent.click(screen.getByText('Hotovo'));
  expect(screen.queryByTestId('robots-guide')).toBeNull();
  expect(sent).toEqual([]);
});

it('Údržba: reset tlačítko robota v HA se najde samo (bez soukromého návodu)', async () => {
  setup();
  fireEvent.click(await screen.findByTestId('robots-guide-open-main_brush'));
  fireEvent.click(screen.getByTestId('robots-guide-reset'));
  expect((await screen.findByTestId('robots-confirm')).textContent).toContain(
    'Vynulovat počítadlo: Hlavní kartáč',
  );
});

it('Údržba: díl po termínu má prázdný kroužek (ne plný) a souhrn rozliší čeká / brzy', async () => {
  setup();
  fireEvent.click(await screen.findByTestId('robots-floor-3'));
  const sensors = await screen.findByTestId('robots-part-sensors');
  expect(sensors.getAttribute('data-rb-tone')).toBe('crit');
  const ring = sensors.querySelector('.hb-ring');
  expect(ring?.getAttribute('data-value')).toBe('0.000');
  expect(ring?.querySelector('.hb-ring-arc')).toBeNull();
  expect(sensors.querySelector('.rb-maint-pct')?.textContent).toBe('0');
  // Red: sensors + dirty dock water; amber dock brush is only „brzy“.
  expect(screen.getByTestId('robots-maint-summary').textContent).toBe('2 věci čekají · 1 brzy');
  expect(screen.getByTestId('robots-part-dirty_water').textContent).toContain('Vylít');
});

function setup(vector: 'demo' | 'broken' | 'off' = 'off') {
  const demo = createRobotsDemo(Date.now());
  const store = createEntityStore();
  store.update(demo.states);
  const sent: Record<string, unknown>[] = [];
  const connection: ConnectionLike = {
    async sendMessagePromise<T>(message: { type: string }) {
      if (message.type === 'frontend/get_user_data') return { value: null } as T;
      if (message.type === 'frontend/set_user_data') return { success: true } as T;
      if (message.type === 'homebrain/robots/get') return demo.ws as T;
      if (message.type === 'homebrain/robots/presets/list') return { robots: {} } as T;
      if (message.type === 'homebrain/robots/schedules/list')
        return createSchedulesDemo().handlers['homebrain/robots/schedules/list']() as T;
      if (message.type === 'homebrain/robots/map') {
        const slot = (message as { slot?: number }).slot ?? 0;
        if (vector === 'off') return { available: false, reason: 'unsupported_ha' } as T;
        const result = demoVectorMap(slot, 0);
        if (vector === 'broken' && result.available) {
          // Passes validation but makes rendering throw → error boundary → PNG fallback.
          Object.defineProperty(result.map, 'floor', {
            get() {
              throw new Error('boom');
            },
          });
        }
        return result as T;
      }
      sent.push(message as Record<string, unknown>);
      return undefined as T;
    },
  };
  render(
    <>
      <RobotsView store={store} bindings={demo.bindings} connection={connection} />
      <Toaster />
    </>,
  );
  return { sent };
}

it('switches floors and shows the Czech fix for a robot error', async () => {
  setup();
  expect(await screen.findByTestId('robots-room-2')).toBeTruthy();
  expect(screen.getByTestId('robots-state').textContent).toBe('Uklízí místnosti');
  fireEvent.click(screen.getByTestId('robots-floor-2'));
  expect(screen.getByTestId('robots-problem').textContent).toContain('Zamotaný hlavní kartáč');
});

it('selects rooms in order and sends only after confirmation', async () => {
  const { sent } = setup();
  fireEvent.click(await screen.findByTestId('robots-room-3'));
  fireEvent.click(screen.getByTestId('robots-room-1'));
  expect(screen.getByTestId('robots-room-3').textContent).toMatch(/^1/);
  expect(screen.getByTestId('robots-room-1').textContent).toMatch(/^2/);
  fireEvent.click(screen.getByTestId('robots-start'));
  expect(screen.getByTestId('robots-confirm').textContent).toContain(
    '1. Jídelna → 2. Obývací pokoj',
  );
  expect(sent).toHaveLength(0);
  await act(async () => {
    fireEvent.click(screen.getByTestId('robots-confirm-send'));
  });
  // The backend applies the settings, waits for HA and only then starts (rooms in order).
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    type: 'homebrain/robots/start',
    slot: 1,
    rooms: [3, 1],
    settings: { passes: 1 },
  });
  expect((await screen.findAllByText(/Čekám na skutečný stav/)).length).toBeGreaterThan(0);
  expect(screen.getByTestId('robots-room-3').getAttribute('aria-pressed')).toBe('false');
});

it('resumes after a fixed error only through the confirmation sheet', async () => {
  const { sent } = setup();
  await screen.findByTestId('robots-room-2');
  fireEvent.click(screen.getByTestId('robots-floor-2'));
  fireEvent.click(screen.getByTestId('robots-fixed-resume'));
  expect(screen.getByTestId('robots-confirm').textContent).toContain('Zamotaný hlavní kartáč');
  expect(sent).toHaveLength(0);
  await act(async () => {
    fireEvent.click(screen.getByTestId('robots-confirm-send'));
  });
  expect(sent).toEqual([
    {
      type: 'call_service',
      domain: 'vacuum',
      service: 'start',
      service_data: {},
      target: { entity_id: 'vacuum.demo_robot_2' },
    },
  ]);
});

it('shows an empty state without bound robots', () => {
  render(<RobotsView store={createEntityStore()} bindings={{}} />);
  expect(screen.getByTestId('robots-empty').textContent).toContain('Robot 1–3');
});

it('vector map: tapping a room selects it in order, synced with the chips', async () => {
  setup('demo');
  const kitchen = await screen.findByTestId('robots-map-room-2');
  fireEvent.click(screen.getByTestId('robots-map-room-3'));
  fireEvent.click(kitchen);
  expect(screen.getByTestId('robots-room-3').textContent).toMatch(/^1/);
  expect(screen.getByTestId('robots-room-2').textContent).toMatch(/^2/);
  expect(kitchen.getAttribute('data-selected')).toBe('true');
  const label = document.querySelector('[data-rv-label="2"]');
  expect(label?.textContent).toBe('2Kuchyně');
  // Chip click removes it from the map again.
  fireEvent.click(screen.getByTestId('robots-room-2'));
  expect(kitchen.getAttribute('data-selected')).toBeNull();
  expect(screen.getByTestId('robots-map-robot')).toBeTruthy();
  expect(screen.queryByTestId('robots-map')).toBeNull();
});

it('falls back to the map image when vector data is unavailable', async () => {
  setup('off');
  expect(await screen.findByTestId('robots-map')).toBeTruthy();
  expect(screen.queryByTestId('robots-vector-map')).toBeNull();
});

it('falls back to the map image when the vector map fails to render', async () => {
  const error = console.error;
  console.error = () => {};
  try {
    setup('broken');
    expect(await screen.findByTestId('robots-map')).toBeTruthy();
    expect(screen.queryByTestId('robots-vector-map')).toBeNull();
  } finally {
    console.error = error;
  }
});
