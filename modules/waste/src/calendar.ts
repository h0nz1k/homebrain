import { useEffect, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import type { CalendarEventLike } from './adapter.js';

/** Okno načítaných událostí kalendáře svozů. */
export const WASTE_CALENDAR_WINDOW_DAYS = 120;

const DAY_MS = 86400000;

/**
 * Okno nezávislé na časovém pásmu prohlížeče: od půlnoci UTC předchozího dne do `days + 1`
 * dní dopředu. Rezerva ±1 den pokryje libovolné pásmo; minulé termíny i tak odfiltruje
 * adaptér podle data v pásmu domácnosti (`referenceDate`).
 */
export function calendarWindow(now: number, days = WASTE_CALENDAR_WINDOW_DAYS) {
  const start = Math.floor(now / DAY_MS) * DAY_MS - DAY_MS;
  const end = start + (days + 2) * DAY_MS;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

function eventList(value: unknown): CalendarEventLike[] | null {
  return Array.isArray(value)
    ? value.filter(
        (event): event is CalendarEventLike =>
          !!event && typeof event === 'object' && 'start' in (event as object),
      )
    : null;
}

/**
 * Události `calendar.*` čte primárně read-only WS `calendar/event/subscribe` (živé změny,
 * kontrola práv k entitě). Bez podpory odběru (starší HA, mocky) použije `calendar.get_events`
 * s `return_response` přes WS `call_service` – služba nic nezapisuje.
 */
export async function loadWasteCalendar(
  connection: ConnectionLike,
  entityId: string,
  window: { start: string; end: string },
  onEvents: (events: CalendarEventLike[]) => void,
): Promise<() => void> {
  if (connection.subscribeMessage) {
    try {
      const message = { type: 'calendar/event/subscribe', entity_id: entityId, ...window };
      // Po výpadku spojení (uspání mobilu, restart HA) odběr obnoví knihovna WS.
      const unsubscribe = await connection.subscribeMessage<{ events?: unknown }>(
        (update) => onEvents(eventList(update?.events) ?? []),
        message,
        { resubscribe: true },
      );
      return () => void unsubscribe();
    } catch {
      // fallback níže
    }
  }
  const message = {
    type: 'call_service',
    domain: 'calendar',
    service: 'get_events',
    target: { entity_id: entityId },
    service_data: { start_date_time: window.start, end_date_time: window.end },
    return_response: true,
  };
  const fetchEvents = async () => {
    const result = await connection.sendMessagePromise<{
      response?: Record<string, { events?: unknown }>;
    }>(message);
    const events = eventList(result?.response?.[entityId]?.events);
    if (!events) throw new Error('Neplatná odpověď kalendáře');
    return events;
  };
  onEvents(await fetchEvents());
  // Jednorázové čtení po znovupřipojení zopakuje (mezitím mohly přibýt změny).
  const refresh = () => {
    fetchEvents().then(onEvents, () => undefined);
  };
  connection.addEventListener?.('ready', refresh);
  return () => connection.removeEventListener?.('ready', refresh);
}

export function useWasteCalendar(
  connection: ConnectionLike | undefined,
  entityId: string | undefined,
  dayKey: string,
): CalendarEventLike[] | 'error' | undefined {
  const requestKey = `${entityId ?? ''}|${dayKey}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    events: CalendarEventLike[] | 'error';
  }>();
  useEffect(() => {
    if (!entityId || !connection) return;
    let active = true;
    let stop: (() => void) | undefined;
    const update = (events: CalendarEventLike[] | 'error') => {
      if (active) setLoaded({ key: requestKey, events });
    };
    loadWasteCalendar(
      connection,
      entityId,
      calendarWindow(Date.parse(`${dayKey}T12:00:00Z`)),
      update,
    ).then(
      (unsubscribe) => {
        if (active) stop = unsubscribe;
        else unsubscribe();
      },
      () => update('error'),
    );
    return () => {
      active = false;
      stop?.();
    };
  }, [connection, entityId, dayKey, requestKey]);
  if (!entityId) return undefined;
  if (!connection) return 'error';
  return loaded?.key === requestKey ? loaded.events : undefined;
}
