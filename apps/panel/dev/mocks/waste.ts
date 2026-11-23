import type { DevHass, WsHandlers } from './shared.js';

/**
 * Odpady: synthetic pickup dataset. `?waste=stale|unavailable|bins-evening|bins-collected|
 * bins-review|bins-empty-weeks`; alternative sources `?waste=wcs|calendar|history|horizon`
 * (see `sourceScenario`).
 */
export function addWasteDemo({ hass, now }: DevHass) {
  const scenario = new URLSearchParams(location.search).get('waste');
  const wasteDayOffset = scenario === 'bins-evening' ? 1 : scenario === 'bins-collected' ? 7 : 0;
  const updatedAt = new Date(
    now.getTime() - (scenario === 'stale' ? 3 * 86400000 : 0),
  ).toISOString();
  function dateAfter(days: number) {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  const events = [
    { waste_type: 'paper', display_name: 'Papír', days: 0 },
    { waste_type: 'plastic', display_name: 'Plasty', days: 1 },
    { waste_type: 'glass', display_name: 'Sklo', days: 1 },
    { waste_type: 'bio', display_name: 'Bioodpad', days: 3 },
    { waste_type: 'mixed', display_name: 'Směsný odpad', days: 9, availability: 'tentative' },
    { waste_type: 'electro', display_name: 'Elektroodpad', days: 12, availability: 'cancelled' },
    {
      waste_type: 'bulky',
      display_name:
        'Objemný odpad – mimořádný svoz rozměrného vybavení domácností a starého zahradního nábytku',
      days: 20,
    },
    ...(scenario === 'bins-review'
      ? [
          { waste_type: 'hazardous', display_name: 'Nebezpečný odpad', days: 24 },
          { waste_type: 'paper', display_name: 'Papír', days: 8, availability: 'cancelled' },
        ]
      : []),
  ]
    .flatMap((event) => {
      if (scenario === 'bins-empty-weeks') return event.days < 7 ? [event] : [];
      // Explicit synthetic source events: the view never extrapolates real pickups.
      const recurring =
        event.availability !== 'cancelled' &&
        ['paper', 'plastic', 'glass', 'bio', 'mixed'].includes(event.waste_type);
      return recurring
        ? [0, 14]
            .filter((offset) => event.days + offset + wasteDayOffset < 28)
            .map((offset) => ({ ...event, days: event.days + offset }))
        : [event];
    })
    .map(({ days, ...event }, index) => ({
      ...event,
      id: `demo-${index}`,
      collection_date: dateAfter(days + wasteDayOffset),
      last_collection_date: dateAfter(
        scenario === 'bins-collected' ? 0 : days + wasteDayOffset - 14,
      ),
      availability:
        scenario === 'bins-review' && event.waste_type === 'electro'
          ? 'confirmed'
          : (event.availability ?? 'confirmed'),
      visual_token: `waste.${event.waste_type}`,
      source_updated_at: updatedAt,
    }));
  Object.assign(hass.states, {
    'sensor.demo_waste_dataset': {
      entity_id: 'sensor.demo_waste_dataset',
      state: scenario === 'unavailable' ? 'unavailable' : 'ready',
      last_updated: updatedAt,
      attributes: {
        waste_dashboard: {
          schema_version: 1,
          generated_at: now.toISOString(),
          source_status: scenario === 'stale' ? 'stale' : 'available',
          source_updated_at: updatedAt,
          events,
          notices: [],
        },
      },
    },
    'sensor.demo_waste_next': {
      entity_id: 'sensor.demo_waste_next',
      state: dateAfter(wasteDayOffset),
      last_updated: now.toISOString(),
      attributes: { friendly_name: 'Ukázkový svoz', waste_type: 'Papír' },
    },
  });
  return {
    bindings: {
      waste_dataset: 'sensor.demo_waste_dataset',
      waste_next: 'sensor.demo_waste_next',
    },
    /**
     * Alternativní zdroje (Refs #41): senzor ve formátu WCS a kalendář. Adds their states and
     * returns the WS handlers that replace the whole mock connection (null = default dataset).
     */
    sourceScenario(): WsHandlers | null {
      if (scenario === 'wcs') {
        hass.states['sensor.demo_waste_wcs'] = {
          entity_id: 'sensor.demo_waste_wcs',
          state: 'Papír',
          last_updated: now.toISOString(),
          attributes: {
            friendly_name: 'Ukázkový svoz WCS',
            [dateAfter(0)]: 'Papír',
            [dateAfter(1)]: 'Plasty, Sklo',
            [dateAfter(3)]: 'Bioodpad',
          },
        };
        return { 'homebrain/bindings/get': { waste: { waste_next: 'sensor.demo_waste_wcs' } } };
      }
      if (scenario === 'calendar') {
        hass.states['calendar.demo_waste'] = {
          entity_id: 'calendar.demo_waste',
          state: 'off',
          last_updated: new Date(now.getTime() - 10 * 86400000).toISOString(),
          attributes: { friendly_name: 'Ukázkový kalendář svozů' },
        };
        return {
          'homebrain/bindings/get': { waste: { waste_calendar: 'calendar.demo_waste' } },
          'calendar/event/subscribe': {
            events: [
              { start: { date: dateAfter(0) }, summary: 'Papír', uid: 'demo-1' },
              { start: { date: dateAfter(1) }, summary: 'Plasty', uid: 'demo-2' },
              { start: { date: dateAfter(1) }, summary: 'Sklo', uid: 'demo-3' },
              { start: { date: dateAfter(3) }, summary: 'Bioodpad', uid: 'demo-4' },
            ],
          },
        };
      }
      // Produkční tvar (WCS senzor od zítřka + kalendář s dnešním svozem + historie z integrace):
      // dnes Plasty, sklo jako „Barevne sklo“, minulé svozy přes WS homebrain/waste/history.
      // `?waste=horizon` = totéž, ale zveřejněný rozpis končí za 16 dní (upozornění „data končí“).
      if (scenario === 'history' || scenario === 'horizon') {
        const published: [number, string][] = [
          [1, 'Papir'],
          [2, 'Komunalni odpad'],
          [10, 'Barevne sklo'],
          [14, 'Plasty'],
          [15, 'Papir'],
          [16, 'Komunalni odpad'],
          [28, 'Plasty'],
          [29, 'Papir'],
          [30, 'Komunalni odpad'],
          [38, 'Barevne sklo'],
          [42, 'Plasty'],
          [44, 'Komunalni odpad'],
          [46, 'Elektro odpad'],
        ];
        const future =
          scenario === 'horizon' ? published.filter(([days]) => days <= 16) : published;
        const lastDays = Math.max(...future.map(([days]) => days));
        const past: [number, string][] = [
          [-84, 'Plasty'],
          [-83, 'Papir'],
          [-82, 'Komunalni odpad'],
          [-81, 'Barevne sklo'],
          [-73, 'Elektro odpad'],
          [-70, 'Plasty'],
          [-69, 'Papir'],
          [-68, 'Komunalni odpad'],
          [-56, 'Plasty'],
          [-55, 'Papir'],
          [-54, 'Komunalni odpad'],
          [-53, 'Barevne sklo'],
          [-42, 'Plasty'],
          [-41, 'Papir'],
          [-40, 'Komunalni odpad'],
          [-28, 'Plasty'],
          [-27, 'Papir'],
          [-26, 'Komunalni odpad'],
          [-25, 'Barevne sklo'],
          [-17, 'Elektro odpad'],
          [-14, 'Plasty'],
          [-13, 'Papir'],
          [-12, 'Komunalni odpad'],
          [-11, 'Nebezpecny odpad'],
          [0, 'Plasty'],
        ];
        hass.states['sensor.demo_waste_wcs'] = {
          entity_id: 'sensor.demo_waste_wcs',
          state: 'Papir',
          last_updated: now.toISOString(),
          attributes: {
            friendly_name: 'Odpady svoz',
            ...Object.fromEntries(future.map(([days, label]) => [dateAfter(days), label])),
          },
        };
        hass.states['calendar.demo_waste'] = {
          entity_id: 'calendar.demo_waste',
          state: 'on',
          last_updated: now.toISOString(),
          attributes: { friendly_name: 'Svoz odpadu' },
        };
        return {
          'homebrain/bindings/get': {
            waste: { waste_next: 'sensor.demo_waste_wcs', waste_calendar: 'calendar.demo_waste' },
          },
          'calendar/event/subscribe': {
            events: [[0, 'Plasty'] as [number, string], ...future].map(([days, summary]) => ({
              start: dateAfter(days),
              summary,
              uid: `${dateAfter(days)}-${summary}`,
            })),
          },
          'homebrain/waste/history': {
            events: past.map(([days, label]) => ({ date: dateAfter(days), label })),
            since: dateAfter(past[0]![0]),
            horizon: {
              status: lastDays < 30 ? 'ending' : 'ok',
              last_date: dateAfter(lastDays),
              days_left: lastDays,
              warn_days: 30,
              warning: lastDays < 30,
              types: [],
            },
          },
        };
      }
      return null;
    },
  };
}
