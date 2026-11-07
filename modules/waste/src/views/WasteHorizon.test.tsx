// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEntityStore, type ConnectionLike, type EntityStateLike } from '@homebrain/ha-client';
import type { WasteCollectionEvent } from '../contract.js';
import WasteView from './WasteView.js';

const instant = '2030-07-18T08:00:00Z';
const bindings = { waste_dataset: 'sensor.waste' };

function dated(date: string, waste_type: WasteCollectionEvent['waste_type']): WasteCollectionEvent {
  return {
    id: `${waste_type}-${date}`,
    waste_type,
    display_name: waste_type === 'plastic' ? 'Plasty' : 'Papír',
    collection_date: date,
    availability: 'confirmed',
    visual_token: `waste.${waste_type}`,
    source_updated_at: instant,
  };
}

const horizon = {
  status: 'ending',
  last_date: '2030-07-30',
  days_left: 12,
  warn_days: 30,
  warning: true,
  types: [
    { label: 'Plasty', last_date: '2030-07-04', days_left: -14 },
    { label: 'Papír', last_date: '2030-07-30', days_left: 12 },
  ],
};

async function setup(
  upcoming: WasteCollectionEvent[],
  opts: { kiosk?: boolean; response?: unknown; connection?: boolean } = {},
) {
  const store = createEntityStore();
  const entity: EntityStateLike = {
    entity_id: 'sensor.waste',
    state: 'ready',
    last_updated: instant,
    attributes: {
      waste_dashboard: {
        schema_version: 1,
        generated_at: instant,
        source_status: 'available',
        source_updated_at: instant,
        events: upcoming,
        notices: [],
      },
    },
  };
  store.update({ 'sensor.waste': entity });
  const response = opts.response ?? {
    events: [
      { date: '2030-07-02', label: 'Papír' },
      { date: '2030-07-04', label: 'Plasty' },
    ],
    horizon,
  };
  const connection = {
    sendMessagePromise: vi.fn(async () => response),
  } as unknown as ConnectionLike;
  render(
    <WasteView
      store={store}
      bindings={bindings}
      kiosk={opts.kiosk}
      connection={opts.connection === false ? undefined : connection}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('admin vidí klidné upozornění na konec svozových dat s radou Co s tím', async () => {
  await setup([dated('2030-07-30', 'paper')]);
  const notice = screen.getByRole('region', { name: 'Konec svozových dat' });
  expect(notice.textContent).toContain('Svozový kalendář končí 30. 7. – doplňte rozpis na 2030');
  expect(within(notice).getByText('Co s tím')).toBeDefined();
  expect(notice.getAttribute('data-severity')).toBe('info');
});

it('typ bez dalšího známého svozu ukáže „další termín zatím neznámý“, ne prázdno', async () => {
  await setup([dated('2030-07-30', 'paper')]);
  const history = screen.getByRole('region', { name: 'Naposledy vyvezeno' });
  const plastic = within(history).getByText('Plasty').closest('li')!;
  expect(plastic.textContent).toContain('Další termín zatím neznámý');
  const paper = within(history).getByText('Papír').closest('li')!;
  expect(paper.textContent).not.toContain('neznámý');
});

it('kiosk ani panel bez odpovědi backendu (ne-admin) upozornění nevidí', async () => {
  await setup([dated('2030-07-30', 'paper')], { kiosk: true });
  expect(screen.queryByRole('region', { name: 'Konec svozových dat' })).toBeNull();
  cleanup();
  await setup([dated('2030-07-30', 'paper')], { connection: false });
  expect(screen.queryByRole('region', { name: 'Konec svozových dat' })).toBeNull();
});

it('dost dat = žádné upozornění', async () => {
  await setup([dated('2030-07-30', 'paper')], {
    response: { events: [], horizon: { ...horizon, status: 'ok', warning: false } },
  });
  expect(screen.queryByRole('region', { name: 'Konec svozových dat' })).toBeNull();
});

it('po konci dat hero neukazuje vymyšlený termín, jen že další svozy nejsou známé', async () => {
  await setup([], {
    response: {
      events: [{ date: '2030-07-04', label: 'Plasty' }],
      horizon: { ...horizon, status: 'ended', last_date: '2030-07-04', days_left: -14 },
    },
  });
  const hero = screen.getByRole('region', { name: 'Příští svoz' });
  expect(hero.textContent).toContain('Další svozy zatím nejsou známé');
  expect(hero.textContent).not.toContain('Žádné naplánované svozy');
  expect(hero.querySelector('time')).toBeNull();
  expect(screen.getByRole('region', { name: 'Konec svozových dat' }).textContent).toContain(
    'Svozový kalendář skončil 4. 7. – doplňte rozpis na 2030',
  );
});
