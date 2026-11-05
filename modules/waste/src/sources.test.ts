import { describe, expect, it, vi } from 'vitest';
import type { ConnectionLike, EntityStateLike } from '@homebrain/ha-client';
import {
  adaptWasteEntities,
  detectWasteSensorFormat,
  selectWasteEntityIds,
  type CalendarEventLike,
} from './adapter.js';
import { calendarWindow, loadWasteCalendar } from './calendar.js';
import typeState from './__fixtures__/sources/type-state-sensor.json';
import dateState from './__fixtures__/sources/date-state-sensor.json';
import calendarSubscribe from './__fixtures__/sources/calendar-subscribe.json';
import calendarGetEvents from './__fixtures__/sources/calendar-get-events.json';

const now = Date.parse('2030-07-18T08:00:00Z');
const wcs = typeState as unknown as EntityStateLike;
const legacy = dateState as unknown as EntityStateLike;
const calendarState: EntityStateLike = {
  entity_id: 'calendar.demo_waste',
  state: 'off',
  attributes: {},
  last_updated: '2030-06-01T00:00:00Z',
};
function adapt(
  bindings: Record<string, string>,
  states: EntityStateLike[],
  calendarEvents?: CalendarEventLike[] | 'error',
) {
  const map = new Map(states.map((state) => [state.entity_id, state]));
  return adaptWasteEntities({ bindings, getState: (id) => map.get(id), now, calendarEvents });
}
const summary = (events: { collection_date: string; waste_type: string; display_name: string }[]) =>
  events.map((event) => `${event.collection_date} ${event.waste_type} ${event.display_name}`);

describe('detekce formátu senzoru (Refs #41)', () => {
  it('rozliší stav = datum, stav = typ a neplatný senzor', () => {
    expect(detectWasteSensorFormat(legacy)).toBe('date-state');
    expect(detectWasteSensorFormat(wcs)).toBe('type-state');
    expect(detectWasteSensorFormat({ ...wcs, attributes: { waste_type: 'Plasty' } })).toBe(
      'invalid',
    );
    expect(detectWasteSensorFormat({ ...legacy, state: '2030-07-19T00:00:00+02:00' })).toBe(
      'date-state',
    );
  });
});

describe('senzor stav = typ, termíny v atributech', () => {
  it('vytvoří svozy z klíčů atributů, rozdělí více typů a vynechá minulost i šum', () => {
    const schedule = adapt({ waste_next: wcs.entity_id }, [wcs]);
    expect(schedule.quality).toBe('ok');
    expect(schedule.notices).not.toContain('Neplatné datum svozu');
    expect(summary(schedule.upcoming)).toEqual([
      '2030-07-19 plastic Plasty',
      '2030-07-22 glass Sklo',
      '2030-07-22 paper Papír',
      '2030-07-25 other Kovy',
      '2030-08-01 mixed Směsný odpad',
    ]);
    expect(schedule.tomorrow.map((event) => event.waste_type)).toEqual(['plastic']);
    expect(new Set(schedule.upcoming.map((event) => event.id)).size).toBe(5);
  });
  it('původní formát zůstává funkční a deduplikuje se se WCS senzorem', () => {
    const schedule = adapt({ waste_next: legacy.entity_id, waste_next_wcs: wcs.entity_id }, [
      legacy,
      wcs,
    ]);
    expect(
      schedule.upcoming.filter((event) => event.collection_date === '2030-07-19'),
    ).toHaveLength(1);
  });
});

describe('kalendář jako zdroj', () => {
  const events = calendarSubscribe.events as CalendarEventLike[];
  it('selectWasteEntityIds zahrne kalendář', () => {
    expect(selectWasteEntityIds({ waste_calendar: 'calendar.demo_waste' })).toEqual([
      'calendar.demo_waste',
    ]);
  });
  it('mapuje celodenní i časové události v místním čase a odmítne neplatné', () => {
    const schedule = adapt({ waste_calendar: calendarState.entity_id }, [calendarState], events);
    expect(schedule.quality).toBe('ok');
    expect(summary(schedule.upcoming)).toEqual([
      '2030-07-19 plastic Plasty',
      '2030-07-22 bio Bioodpad',
      '2030-07-24 glass Sklo',
      '2030-07-24 paper Papír',
    ]);
    expect(schedule.rejectedCount).toBe(2);
  });
  it('nenačtený kalendář není chyba, selhání dá českou notice', () => {
    expect(adapt({ waste_calendar: calendarState.entity_id }, [calendarState]).notices).toEqual([]);
    const failed = adapt({ waste_calendar: calendarState.entity_id }, [calendarState], 'error');
    expect(failed.notices).toContain('Kalendář svozů není dostupný');
    expect(failed.upcoming).toEqual([]);
  });
  it('nedostupná entita kalendáře => unavailable', () => {
    const schedule = adapt(
      { waste_calendar: calendarState.entity_id },
      [{ ...calendarState, state: 'unavailable' }],
      events,
    );
    expect(schedule.quality).toBe('unavailable');
  });
  it('kalendář se slučuje se senzorem bez duplicit', () => {
    const schedule = adapt(
      { waste_next: wcs.entity_id, waste_calendar: calendarState.entity_id },
      [wcs, calendarState],
      events,
    );
    expect(
      schedule.upcoming.filter((event) => event.collection_date === '2030-07-19'),
    ).toHaveLength(1);
  });
});

describe('loadWasteCalendar', () => {
  const window = calendarWindow(now);
  it('odebírá calendar/event/subscribe', async () => {
    const unsubscribe = vi.fn();
    const connection: ConnectionLike = {
      sendMessagePromise: vi.fn(),
      subscribeMessage: vi.fn(async (callback: (message: unknown) => void) => {
        callback(calendarSubscribe);
        return unsubscribe;
      }) as ConnectionLike['subscribeMessage'],
    };
    const received: CalendarEventLike[][] = [];
    const stop = await loadWasteCalendar(connection, 'calendar.demo_waste', window, (events) =>
      received.push(events),
    );
    expect(connection.subscribeMessage).toHaveBeenCalledWith(
      expect.any(Function),
      {
        type: 'calendar/event/subscribe',
        entity_id: 'calendar.demo_waste',
        ...window,
      },
      { resubscribe: true },
    );
    expect(received[0]).toHaveLength(6);
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
  it('bez odběru použije calendar.get_events s return_response', async () => {
    const sendMessagePromise = vi.fn(async () => calendarGetEvents);
    const received: CalendarEventLike[][] = [];
    await loadWasteCalendar(
      { sendMessagePromise } as unknown as ConnectionLike,
      'calendar.demo_waste',
      window,
      (events) => received.push(events),
    );
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'call_service',
        domain: 'calendar',
        service: 'get_events',
        return_response: true,
      }),
    );
    const schedule = adapt(
      { waste_calendar: calendarState.entity_id },
      [calendarState],
      received[0],
    );
    expect(summary(schedule.upcoming)).toEqual([
      '2030-07-19 plastic Plasty',
      '2030-07-23 bulky Objemný odpad',
    ]);
  });
  it('fallback get_events po znovupřipojení (ready) načte události znovu', async () => {
    const sendMessagePromise = vi.fn(async () => calendarGetEvents);
    const listeners = new Set<() => void>();
    const connection = {
      sendMessagePromise,
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    } as unknown as ConnectionLike;
    const received: CalendarEventLike[][] = [];
    const stop = await loadWasteCalendar(connection, 'calendar.demo_waste', window, (events) =>
      received.push(events),
    );
    expect(listeners.size).toBe(1);
    for (const listener of listeners) listener();
    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(sendMessagePromise).toHaveBeenCalledTimes(2);
    stop();
    expect(listeners.size).toBe(0);
  });
  it('okno kalendáře nezávisí na pásmu prohlížeče a pokrývá dnešek s rezervou', () => {
    const { start, end } = calendarWindow(Date.parse('2030-07-18T12:00:00Z'), 10);
    expect(start).toBe('2030-07-17T00:00:00.000Z');
    expect(end).toBe('2030-07-29T00:00:00.000Z');
  });
  it('událost bez uid má stabilní ID podle data (nezávislé na pořadí)', () => {
    const events: CalendarEventLike[] = [
      { start: { date: '2030-07-19' }, summary: 'Plasty' },
      { start: { date: '2030-07-23' }, summary: 'Papír' },
    ];
    const ids = (list: CalendarEventLike[]) =>
      adapt({ waste_calendar: calendarState.entity_id }, [calendarState], list)
        .upcoming.map((event) => event.id)
        .sort();
    expect(ids(events)).toEqual(ids([...events].reverse()));
    expect(ids(events.slice(1))).toEqual(ids(events).filter((id) => id.includes('2030-07-23')));
  });
  it('neplatná odpověď vyhodí chybu', async () => {
    await expect(
      loadWasteCalendar(
        { sendMessagePromise: async () => ({}) } as unknown as ConnectionLike,
        'calendar.demo_waste',
        window,
        () => {},
      ),
    ).rejects.toThrow();
  });
});
