// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEntityStore, type EntityStateLike } from '@homebrain/ha-client';
import type { WasteCollectionEvent, WasteDashboardDataset } from '../contract.js';
import WasteView from './WasteView.js';
import { wasteStyles } from './wasteStyles.js';

const instant = '2030-07-18T08:00:00Z';
const bindings = { waste_dataset: 'sensor.waste' };
function event(
  days: number,
  availability: WasteCollectionEvent['availability'] = 'confirmed',
): WasteCollectionEvent {
  return {
    id: `event-${days}`,
    waste_type: (
      [
        'paper',
        'plastic',
        'glass',
        'mixed',
        'bio',
        'electro',
        'bulky',
        'hazardous',
        'other',
      ] as const
    )[days % 9]!,
    display_name: `Papír ${days}`,
    collection_date: `2030-07-${18 + days}`,
    availability,
    visual_token: 'waste.paper',
    source_updated_at: instant,
  };
}
function setup(
  events: WasteCollectionEvent[] = [],
  source_status: WasteDashboardDataset['source_status'] = 'available',
  state = 'ready',
) {
  const store = createEntityStore();
  const entity: EntityStateLike = {
    entity_id: 'sensor.waste',
    state,
    last_updated: instant,
    attributes: {
      waste_dashboard: {
        schema_version: 1,
        generated_at: instant,
        source_status,
        source_updated_at: instant,
        events,
        notices: ['Ověřte svoz u obce'],
      },
    },
  };
  store.update({ 'sensor.waste': entity });
  render(<WasteView store={store} bindings={bindings} />);
  return { store, entity };
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
it('zvýrazní dnešní a zítřejší svoz', () => {
  setup([event(0), event(1)]);
  expect(screen.queryByTestId('waste-today')).toBeNull();
  expect(screen.getByTestId('waste-tomorrow').textContent).toContain('Svoz zítra: Papír 1');
  expect(screen.getByText('Připravte popelnice večer')).toBeDefined();
  const items = within(screen.getByRole('list', { name: 'Nejbližší svozy' })).getAllByRole(
    'listitem',
  );
  expect(items[0]?.className).toBe('is-tomorrow');
  expect(items[0]?.querySelector('.wb-bin--paper')).toBeNull();
}, 15000);
it('řadí svozy a skloňuje relativní data včetně předběžného termínu', () => {
  setup([
    { ...event(9, 'tentative'), waste_type: 'hazardous', visual_token: 'waste.hazardous' },
    event(4),
    event(3),
    event(2),
    event(1),
    event(0),
    event(5),
  ]);
  const items = within(screen.getByRole('list', { name: 'Nejbližší svozy' })).getAllByRole(
    'listitem',
  );
  ['Zítra', '2 dny', '3 dny', '4 dny', '5 dní', '9 dní'].forEach((text, index) =>
    expect(items[index]?.textContent).toContain(text),
  );
  expect(items[5]?.querySelector('.wb-date-tentative')?.textContent).toBe('9 dní');
  expect(items[5]?.querySelector('.wb-date-tentative')?.getAttribute('title')).toBe(
    'předběžný termín',
  );
  expect(items[0]?.textContent).toContain('pátek 19. 7.');
});
it('ukáže zastaralost a čas aktualizace', () => {
  setup([], 'stale');
  expect(screen.getByText('Zastaralé')).toBeDefined();
  expect(screen.getByText(/Data mohou být zastaralá/).textContent).toContain('18. 7. 2030');
});
it('ukáže nedostupnost i oznámení', () => {
  setup([], 'unavailable');
  expect(screen.getByText('Nedostupné')).toBeDefined();
  expect(screen.getByText('Data svozu nejsou momentálně dostupná')).toBeDefined();
  expect(screen.getByText('Ověřte svoz u obce')).toBeDefined();
});
it('vysvětlí chybějící vazby', () => {
  render(<WasteView store={createEntityStore()} bindings={{}} />);
  expect(screen.getByText('Není nastavena vazba na entitu odpadů')).toBeDefined();
});
it('oddělí zrušené svozy a ukáže prázdný stav', () => {
  setup([event(3, 'cancelled')]);
  expect(screen.getByText('Žádné naplánované svozy')).toBeDefined();
  expect(screen.getByText('Dnes ani zítra se nic nevyváží')).toBeDefined();
  const region = screen.getByRole('region', { name: 'Zrušené svozy' });
  expect(within(region).getByText('Papír 3').closest('s')).toBeNull();
});
it('reaguje na změnu každé vázané entity a na minutový časovač', () => {
  const store = createEntityStore();
  const first: EntityStateLike = {
    entity_id: 'sensor.first',
    state: '2030-07-18',
    attributes: { waste_type: 'Papír' },
    last_updated: instant,
  };
  const second = {
    ...first,
    entity_id: 'sensor.second',
    state: '2030-07-19',
    attributes: { waste_type: 'Sklo' },
  };
  store.update({ [first.entity_id]: first, [second.entity_id]: second });
  render(
    <WasteView
      store={store}
      bindings={{ waste_next: first.entity_id, waste_next_glass: second.entity_id }}
    />,
  );
  expect(screen.getByTestId('waste-tomorrow').textContent).toContain('Sklo');
  act(() =>
    store.update({
      [first.entity_id]: first,
      [second.entity_id]: { ...second, state: '2030-07-21' },
    }),
  );
  expect(screen.queryByTestId('waste-tomorrow')).toBeNull();
  act(() => vi.advanceTimersByTime(37 * 3600000));
  expect(screen.getByText('Zastaralé')).toBeDefined();
});
it('ukáže nejbližší svoz každého typu', () => {
  setup(Array.from({ length: 10 }, (_, index) => event(index)));
  expect(
    within(screen.getByRole('list', { name: 'Nejbližší svozy' })).getAllByRole('listitem'),
  ).toHaveLength(8);
});

it('ignoruje aktualizace nesouvisejících entit', () => {
  const store = createEntityStore();
  const entity: EntityStateLike = {
    entity_id: 'sensor.paper',
    state: '2030-07-18',
    attributes: { waste_type: 'Papír' },
    last_updated: instant,
  };
  store.update({ [entity.entity_id]: entity });
  const onRender = vi.fn();
  render(
    <Profiler id="waste" onRender={onRender}>
      <WasteView store={store} bindings={{ waste_next: entity.entity_id }} />
    </Profiler>,
  );
  const renders = onRender.mock.calls.length;
  act(() =>
    store.update({
      [entity.entity_id]: entity,
      'sensor.unrelated': { ...entity, entity_id: 'sensor.unrelated' },
    }),
  );
  expect(onRender).toHaveBeenCalledTimes(renders);
});

it('ukáže společný svoz v hero a čtyři týdny v ose', () => {
  setup([
    { ...event(0), display_name: 'Papír' },
    {
      ...event(0),
      id: 'another-type',
      waste_type: 'plastic',
      display_name: 'Plasty',
      visual_token: 'waste.plastic',
    },
  ]);
  const hero = screen.getByRole('region', { name: 'Příští svoz' });
  expect(within(hero).getByText('Také Plasty')).toBeDefined();
  // Červenec 2030 začíná pondělím: 5 týdnů po 7 dnech, jeden řádek názvů dnů.
  const calendar = screen.getByRole('region', { name: 'Kalendář svozů' });
  expect(calendar.querySelectorAll('.wb-day')).toHaveLength(35);
  expect(calendar.querySelectorAll('.wb-month-head span')).toHaveLength(7);
  expect(within(calendar).getByText('červenec 2030')).toBeDefined();
});
it('připomínky přepíná lokálně a pamatuje si volbu', () => {
  vi.setSystemTime(new Date('2030-07-18T18:30:00Z'));
  setup([event(1)]);
  const reminders = screen.getByRole('complementary', { name: 'Připomínky' });
  expect(within(reminders).getByRole('status').textContent).toBe('Vyvezte dnes večer');
  const toggle = within(reminders).getByRole('switch', { name: 'Večer před svozem · 20:00' });
  fireEvent.click(toggle);
  expect(within(reminders).queryByRole('status')).toBeNull();
  expect(JSON.parse(localStorage.getItem('hb-waste-reminders')!)).toEqual({ evening: false });
  cleanup();
  setup([event(1)]);
  expect(
    (screen.getByRole('switch', { name: 'Večer před svozem · 20:00' }) as HTMLInputElement).checked,
  ).toBe(false);
});

it('places same-day mini bins in one slot and includes cancelled pickups', () => {
  setup([event(0), { ...event(0), id: 'second', waste_type: 'plastic' }, event(1, 'cancelled')]);
  const timeline = screen.getByRole('region', { name: 'Kalendář svozů' });
  const slot = timeline.querySelector('[aria-current="date"] .wb-mini-stack');
  expect(slot?.querySelectorAll('.wb-bin')).toHaveLength(2);
  expect(timeline.querySelectorAll('.wb-mini-stack')).toHaveLength(2);
  expect(timeline.querySelector('[data-availability="cancelled"]')?.className).toContain(
    'wb-muted',
  );
  expect(timeline.querySelector('[data-availability="cancelled"] .wb-strike')).not.toBeNull();
  // Zrušený svoz v legendě ani v počtu svozů měsíce není.
  expect(within(timeline).getByRole('list', { name: 'Typy svozů v měsíci' }).children).toHaveLength(
    2,
  );
  expect(within(timeline).getByText('0 z 2 svozů proběhlo')).toBeDefined();
  expect(screen.queryByRole('heading', { name: 'Odpady' })).toBeNull();
});

it('uses one bin and an overflow badge for busy days, keeping cancellation visible', () => {
  setup([
    event(0),
    { ...event(0), id: 'second', waste_type: 'plastic' },
    { ...event(0, 'cancelled'), id: 'cancelled', waste_type: 'glass' },
  ]);
  const slot = screen
    .getByRole('region', { name: 'Kalendář svozů' })
    .querySelector('[aria-current="date"] .wb-mini-stack');
  expect(slot?.querySelectorAll('.wb-bin')).toHaveLength(1);
  expect(slot?.querySelector('[data-availability="cancelled"]')).not.toBeNull();
  expect(slot?.querySelector('.wb-more')?.textContent).toBe('+2');
});

it('starts the carousel with a different fraction from the hero', () => {
  setup([event(0), event(1), { ...event(9), id: 'paper-next' }]);
  const hero = screen.getByRole('region', { name: 'Příští svoz' });
  expect(hero.querySelector('.wb-bin--paper')).not.toBeNull();
  const list = screen.getByRole('list', { name: 'Nejbližší svozy' });
  expect(list.querySelector('.wb-bin--paper')).toBeNull();
  expect(list.querySelector('li .wb-bin--plastic')).not.toBeNull();
});

it.each(['electro', 'bulky', 'hazardous', 'other'] as const)(
  'hides cycle progress for irregular %s even with a previous date',
  (type) => {
    setup([{ ...event(0), waste_type: type, last_collection_date: '2030-07-04' }]);
    expect(screen.queryByRole('progressbar')).toBeNull();
  },
);
it('shows actual elapsed cycle in hero and cards, hides unknown cycles and marks urgency', () => {
  setup([
    { ...event(0), last_collection_date: '2030-07-04' },
    { ...event(1), last_collection_date: '2030-07-05' },
    event(2),
  ]);
  const hero = screen.getByRole('region', { name: 'Příští svoz' });
  expect(hero.className).toContain('is-today');
  // Dnešní svoz: bez pruhu cyklu a bez duplicitní pilulky „Dnes se vyváží“.
  expect(within(hero).queryByRole('progressbar')).toBeNull();
  expect(within(hero).queryByText('Dnes se vyváží')).toBeNull();
  expect(hero.querySelector('.wb-pill')).toBeNull();
  const cards = screen.getByRole('list', { name: 'Nejbližší svozy' }).querySelectorAll('li');
  expect(cards[0]?.className).toBe('is-tomorrow');
  expect(cards[0]?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('93');
  expect(cards[1]?.querySelector('[role="progressbar"]')).toBeNull();
  expect(cards[1]?.className).toBe('');
});
it('uses the owner wording early on collection morning and at the evening reminder', () => {
  vi.setSystemTime(new Date('2030-07-18T03:00:00Z'));
  setup([event(0)]);
  expect(screen.getByText('Vyvezte hned ráno')).toBeDefined();
});

it('renders every source pickup in the four-week window, including repeated types', () => {
  const dates = ['2030-07-18', '2030-08-01', '2030-08-11', '2030-08-12'];
  setup([
    ...dates.map((date, index) => ({
      ...event(0),
      id: `repeat-${index}`,
      collection_date: date,
      last_collection_date: index === 1 ? '2030-07-18' : '2030-07-04',
    })),
    { ...event(2), last_collection_date: '2030-06-29' },
  ]);
  const timeline = screen.getByRole('region', { name: 'Kalendář svozů' });
  // Červenec: jen 18. 7. (1. 8. leží mimo měsíc, v mřížce je bez nádob).
  expect(timeline.querySelectorAll('.wb-bin--paper')).toHaveLength(1);
  expect(timeline.querySelector('time[datetime="2030-08-12"]')).toBeNull();
  fireEvent.click(within(timeline).getByRole('button', { name: 'Další měsíc' }));
  expect(within(timeline).getByText('srpen 2030')).toBeDefined();
  expect(timeline.querySelectorAll('.wb-bin--paper')).toHaveLength(3);
  expect(screen.getByText('Cyklus svozu · 21 dní')).toBeDefined();
});

function dated(date: string, waste_type: WasteCollectionEvent['waste_type'] = 'plastic') {
  return {
    ...event(0),
    id: `${waste_type}-${date}`,
    waste_type,
    display_name: waste_type === 'plastic' ? 'Plasty' : 'Papír',
    collection_date: date,
  };
}
const historyEvents = [
  dated('2030-05-16'),
  dated('2030-06-06'),
  dated('2030-06-27'),
  dated('2030-07-04'),
  dated('2030-07-18'),
  dated('2030-08-08'),
];

it('listuje kalendář do minulosti až k nejstaršímu záznamu a zpět tlačítkem Dnes', () => {
  setup(historyEvents);
  const calendar = screen.getByRole('region', { name: 'Kalendář svozů' });
  const prev = within(calendar).getByRole('button', { name: 'Předchozí měsíc' });
  expect(within(calendar).queryByRole('button', { name: 'Dnes' })).toBeNull();
  fireEvent.click(prev);
  expect(within(calendar).getByText('červen 2030')).toBeDefined();
  const june = calendar.querySelector('.wb-day:has(time[datetime="2030-06-06"])');
  expect(june?.className).toContain('is-past');
  expect(june?.querySelector('.wb-done .wb-check')).not.toBeNull();
  expect(within(calendar).getByText('2 svozy v historii')).toBeDefined();
  fireEvent.click(prev);
  expect(within(calendar).getByText('květen 2030')).toBeDefined();
  expect((prev as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(calendar).getByRole('button', { name: 'Dnes' }));
  expect(within(calendar).getByText('červenec 2030')).toBeDefined();
  fireEvent.keyDown(calendar, { key: 'ArrowRight' });
  expect(within(calendar).getByText('srpen 2030')).toBeDefined();
  expect(
    (within(calendar).getByRole('button', { name: 'Další měsíc' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it('swipe gestem (pointer events) mění měsíc, svislý tah ne', () => {
  setup(historyEvents);
  const calendar = screen.getByRole('region', { name: 'Kalendář svozů' });
  const surface = () => calendar.querySelector('.wb-month')!;
  const swipe = (from: [number, number], to: [number, number]) => {
    const init = { pointerId: 7, button: 0, pointerType: 'touch' };
    fireEvent.pointerDown(surface(), { ...init, clientX: from[0], clientY: from[1] });
    fireEvent.pointerMove(surface(), {
      ...init,
      clientX: (from[0] + to[0]) / 2,
      clientY: (from[1] + to[1]) / 2,
    });
    // Dotyk: prohlížeč předá implicitní capture z dítěte na plochu (bublá jako lostpointercapture).
    fireEvent.lostPointerCapture(surface().querySelector('time')!, init);
    fireEvent.pointerMove(surface(), { ...init, clientX: to[0], clientY: to[1] });
    fireEvent.pointerUp(surface(), { ...init, clientX: to[0], clientY: to[1] });
  };
  swipe([100, 200], [260, 210]);
  expect(surface().getAttribute('data-month')).toBe('2030-06');
  swipe([260, 200], [100, 205]);
  expect(surface().getAttribute('data-month')).toBe('2030-07');
  swipe([200, 100], [190, 300]);
  expect(surface().getAttribute('data-month')).toBe('2030-07');
  swipe([200, 200], [180, 200]);
  expect(surface().getAttribute('data-month')).toBe('2030-07');
  swipe([260, 200], [60, 200]);
  expect(surface().getAttribute('data-month')).toBe('2030-08');
  // Za posledním termínem už se neposune.
  swipe([260, 200], [60, 200]);
  expect(surface().getAttribute('data-month')).toBe('2030-08');
});

it('odpoledne po svozu přepne hero na další termín a dnešek ukáže jako vyvezený', () => {
  vi.setSystemTime(new Date('2030-07-18T13:30:00Z'));
  setup([...historyEvents, dated('2030-07-19', 'paper')]);
  const hero = screen.getByRole('region', { name: 'Příští svoz' });
  expect(within(hero).getByRole('heading').textContent).toContain('Papír');
  expect(within(hero).getByTestId('waste-collected-today').textContent).toBe(
    'Dnes vyvezeno: Plasty',
  );
  // Zítřejší papír je už v hero, čip „Svoz zítra“ by ho jen opakoval.
  expect(within(hero).queryByTestId('waste-tomorrow')).toBeNull();
  const history = screen.getByRole('region', { name: 'Naposledy vyvezeno' });
  expect(within(history).getByText('Plasty')).toBeDefined();
  expect(within(history).getByText('dnes')).toBeDefined();
  const today = screen
    .getByRole('region', { name: 'Kalendář svozů' })
    .querySelector('[aria-current="date"]');
  expect(today?.querySelector('.wb-check')).not.toBeNull();
  expect(today?.querySelector('time')?.getAttribute('aria-label')).toContain('vyvezeno');
});

it('dopoledne v den svozu drží dnešek v hero s posledním svozem', () => {
  setup(historyEvents);
  const hero = screen.getByRole('region', { name: 'Příští svoz' });
  expect(within(hero).queryByText('Dnes se vyváží')).toBeNull();
  expect(hero.querySelector('.wb-pill')).toBeNull();
  expect(within(hero).getByText('před 14 dny')).toBeDefined();
  expect(hero.querySelector('.wb-last-date')?.textContent).toBe(' · 4.\u00a07.');
  // Týdenní pás v hero: dnešek s plastem.
  const strip = hero.querySelector('ol[aria-label="Příštích 7 dní"]')!;
  expect(strip.querySelector('[aria-current="date"] .wb-bin--plastic')).not.toBeNull();
});

it('tabletový karusel „Další svozy“ začíná první kartou (bez záporného okraje, scrollLeft = 0)', () => {
  const writes: number[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
  Object.defineProperty(HTMLUListElement.prototype, 'scrollLeft', {
    configurable: true,
    get: () => 291,
    set: (value: number) => writes.push(value),
  });
  try {
    setup([event(1), event(2), event(3)]);
    expect(screen.getByRole('list', { name: 'Nejbližší svozy' })).toBeDefined();
    expect(writes).toContain(0);
  } finally {
    delete (HTMLUListElement.prototype as { scrollLeft?: number }).scrollLeft;
    if (descriptor) Object.defineProperty(Element.prototype, 'scrollLeft', descriptor);
  }
  expect(wasteStyles).not.toMatch(/\.wb-fleet\s*\{[^}]*margin-inline:\s*-/);
});

function mediaBlock(query: string) {
  const start = wasteStyles.indexOf(`@media (${query})`);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = wasteStyles.indexOf('{', start); index < wasteStyles.length; index += 1) {
    if (wasteStyles[index] === '{') depth += 1;
    if (wasteStyles[index] === '}' && --depth === 0) return wasteStyles.slice(start, index);
  }
  throw new Error(`neuzavřený blok ${query}`);
}

it('na telefonu jsou „Další svozy“ svislý seznam bez karuselu, desktop zůstává mřížkou', () => {
  const phone = mediaBlock('max-width: 760px');
  const fleet = /\.wb-fleet\s*\{([^}]*)\}/.exec(phone)?.[1] ?? '';
  expect(fleet).toMatch(/flex-direction:\s*column/);
  expect(fleet).toMatch(/overflow:\s*visible/);
  expect(fleet).toMatch(/scroll-snap-type:\s*none/);
  expect(phone).toMatch(/\.wb-fleet > li\s*\{[^}]*scroll-snap-align:\s*none/);
  expect(phone).not.toMatch(/scroll-snap-type:\s*x/);
  // Tablet/desktop beze změny: vodorovný karusel, od 1100 px mřížka.
  expect(wasteStyles).toMatch(
    /^\.wb-fleet \{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory/m,
  );
  expect(wasteStyles).toMatch(/@media \(min-width: 1100px\) \{\s*\.wb-fleet \{ display: grid;/);
});

it('karty „Další svozy“ píší „Naposledy“ stejně jako hero (před X dny · d. m.)', () => {
  setup([...historyEvents, dated('2030-07-04', 'paper'), dated('2030-07-25', 'paper')]);
  const hero = screen.getByRole('region', { name: 'Příští svoz' });
  expect(hero.querySelector('.wb-last')?.textContent).toBe('Naposledy před 14 dny · 4.\u00a07.');
  const card = within(screen.getByRole('list', { name: 'Nejbližší svozy' })).getByRole('listitem');
  expect(card.querySelector('.wb-type')?.textContent).toBe('Papír');
  expect(card.querySelector('.wb-last')?.textContent).toBe('Naposledy před 14 dny · 4.\u00a07.');
  expect(within(card).getByText('před 14 dny').getAttribute('aria-label')).toContain('4. 7.');
});

it('nebezpečný odpad má vlastní barvu, odlišnou od směsného a ostatního', () => {
  const tokens = readFileSync(
    join(import.meta.dirname, '../../../../packages/ui/src/tokens.css'),
    'utf8',
  );
  const color = (type: string) =>
    new RegExp(`--hb-waste-${type}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens)?.[1]?.toLowerCase();
  const hazardous = color('hazardous');
  expect(hazardous).toMatch(/^#/);
  for (const other of ['mixed', 'other', 'bulky', 'electro', 'plastic'])
    expect(color(other)).not.toBe(hazardous);
});

it('dlouhý název objemného odpadu: krátký popisek, detail menším řádkem, celý text v title a legendě', () => {
  const long =
    'Objemný odpad – mimořádný svoz rozměrného vybavení domácností a starého zahradního nábytku';
  setup([
    dated('2030-07-25', 'paper'),
    { ...dated('2030-07-29', 'paper'), id: 'bulky-1', waste_type: 'bulky', display_name: long },
  ]);
  const cards = within(screen.getByRole('list', { name: 'Nejbližší svozy' })).getAllByRole(
    'listitem',
  );
  const bulky = cards.find((card) => card.textContent?.includes('Objemný odpad'))!;
  const type = bulky.querySelector('.wb-type')!;
  expect(type.getAttribute('title')).toBe(long);
  expect(type.querySelector('.wb-card-name')?.textContent).toBe('Objemný odpad');
  expect(type.querySelector('.wb-type-detail')?.textContent).toBe(
    'mimořádný svoz rozměrného vybavení domácností a starého zahradního nábytku',
  );
  const legend = screen.getByRole('list', { name: 'Typy svozů v měsíci' });
  const item = within(legend)
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('title') === long)!;
  expect(item.textContent).toBe('Objemný odpad');
  // Legenda: řádky zarovnané nahoru, tečka nesmí zúžit (flex-shrink 0), detail max. 2 řádky.
  expect(wasteStyles).toMatch(/\.wb-legend li \{[^}]*align-items: flex-start/);
  expect(wasteStyles).toMatch(/\.wb-legend i \{[^}]*flex: 0 0 8px/);
  expect(wasteStyles).toMatch(/\.wb-type-detail \{[^}]*-webkit-line-clamp: 2/);
  expect(wasteStyles).not.toMatch(/\.wb-card-name \{ display: block; -webkit-line-clamp: none/);
});
