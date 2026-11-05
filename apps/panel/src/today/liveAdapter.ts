/**
 * Live Dnes adapter (production): HA connection state, measured station values, sun times,
 * today's hourly blend and the day ribbon – all from data the other modules already read.
 *
 * WS commands used: `homebrain/bindings/get`, `homebrain/session/get`, `homebrain/weather/get`
 * (all in KIOSK_WS_COMMANDS). Calendar events (`calendar/event/subscribe`: waste calendar, and the
 * family/school calendars when the role sees Rodina) are read only for non-kiosk roles, and only
 * their title and time reach the ribbon. Energy prices, waste sensors and `sun.sun` come from the
 * entity store.
 * Missing data stays missing (NaN / empty strings / no ribbon item) – never fixture values.
 */
import {
  getBindings,
  getSession,
  type BindingsByModule,
  type EntityStateLike,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import type { TodayAdapter, TodayData } from '@homebrain/module-today';
import {
  createWsAdapter,
  type BlendPoint,
  type Condition,
  type WeatherAdapter,
  type WeatherSnapshot,
} from '@homebrain/module-weather';
import { parsePriceSeries, priceLevels, startOfLocalDay } from '@homebrain/module-energy';
import {
  adaptWasteEntities,
  calendarWindow,
  loadWasteCalendar,
  WASTE_CALENDAR_WINDOW_DAYS,
  type CalendarEventLike,
} from '@homebrain/module-waste';

type WeatherIcon = TodayData['station']['icon'];
type RibbonItem = TodayData['ribbon'][number];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const WEATHER_POLL_MS = 5 * MIN;
/** Store updates arrive on every HA entity change; re-rank Dnes at most this often. */
const STORE_EMIT_MS = 10_000;
const TIME_ZONE = 'Europe/Prague';
export const NO_WEATHER = 'Počasí není k dispozici';

export type LiveTodayOptions = {
  clock?: () => number;
  weatherPollMs?: number;
  timeZone?: string;
  /** Override the weather client (tests); default is the integration WS client. */
  weather?: WeatherAdapter;
};

const CONDITION_CS: Record<Condition, string> = {
  clear: 'jasno',
  partly: 'polojasno',
  cloudy: 'oblačno',
  overcast: 'zataženo',
  rain: 'déšť',
  heavy_rain: 'silný déšť',
  snow: 'sněžení',
  thunder: 'bouřky',
  fog: 'mlha',
  unknown: '',
};
const CONDITION_ICON: Record<Condition, WeatherIcon> = {
  clear: 'clear',
  partly: 'partly',
  cloudy: 'cloudy',
  overcast: 'cloudy',
  rain: 'rain',
  heavy_rain: 'rain',
  snow: 'snow',
  thunder: 'rain',
  fog: 'cloudy',
  unknown: 'cloudy',
};
const CONDITION_CLOUD: Partial<Record<Condition, number>> = {
  clear: 0.1,
  partly: 0.45,
  cloudy: 0.75,
  overcast: 0.95,
  rain: 0.9,
  heavy_rain: 1,
  snow: 0.9,
  thunder: 1,
  fog: 0.9,
};
/** HA `weather.*` entity states (fallback when the integration snapshot is unavailable). */
const HA_WEATHER_CONDITION: Record<string, Condition> = {
  sunny: 'clear',
  'clear-night': 'clear',
  partlycloudy: 'partly',
  cloudy: 'cloudy',
  fog: 'fog',
  rainy: 'rain',
  pouring: 'heavy_rain',
  'lightning-rainy': 'thunder',
  lightning: 'thunder',
  snowy: 'snow',
  'snowy-rainy': 'snow',
  hail: 'rain',
  windy: 'cloudy',
  'windy-variant': 'cloudy',
};
const NOWCAST_PROBABILITY = { high: 0.9, medium: 0.7, low: 0.5, uncertain: 0.4 } as const;
/** Family module bindings whose events go on the Dnes ribbon (docs/requirements/family.md). */
export const FAMILY_CALENDAR_KEYS = ['family_calendar_family', 'family_calendar_school'] as const;
/** Days of family calendar events to subscribe to (today plus a margin for any time zone). */
const FAMILY_CALENDAR_DAYS = 2;
const MAX_EVENTS = 4;
const MAX_EVENT_LABEL = 34;

function dayKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
}
function localHour(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return value('hour') + value('minute') / 60;
}
function hhmm(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms);
}
/** Local wall-clock `hour:00` of the day containing `ms`. */
function atLocalHour(ms: number, hour: number, timeZone: string): number {
  return startOfLocalDay(ms, timeZone) + hour * HOUR;
}
const iso = (ms: number) => new Date(ms).toISOString();
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Today's sunrise/sunset from `sun.sun` (`next_rising` / `next_setting`). */
export function sunToday(
  state: EntityStateLike | undefined,
  now: number,
  timeZone = TIME_ZONE,
): TodayData['sun'] {
  const pick = (attr: unknown): string => {
    if (typeof attr !== 'string') return '';
    let t = Date.parse(attr);
    if (!Number.isFinite(t)) return '';
    const today = dayKey(now, timeZone);
    // `next_*` is tomorrow once today's event passed; the day before differs by ~1–2 min.
    if (dayKey(t, timeZone) > today) t -= DAY;
    return dayKey(t, timeZone) === today ? iso(t) : '';
  };
  if (!state || state.state === 'unavailable' || state.state === 'unknown')
    return { sunrise: '', sunset: '' };
  return {
    sunrise: pick(state.attributes.next_rising),
    sunset: pick(state.attributes.next_setting),
  };
}

function isNight(ms: number, sun: TodayData['sun']): boolean {
  const rise = Date.parse(sun.sunrise);
  const set = Date.parse(sun.sunset);
  if (!Number.isFinite(rise) || !Number.isFinite(set)) return false;
  return ms < rise || ms > set;
}
function iconFor(condition: Condition, ms: number, sun: TodayData['sun']): WeatherIcon {
  const icon = CONDITION_ICON[condition];
  // No sun glyphs after dark (there is no cloudy-moon glyph; partly cloudy night → moon).
  return (icon === 'clear' || icon === 'partly') && isNight(ms, sun) ? 'moon' : icon;
}

function numericState(state: EntityStateLike | undefined): number | null {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return null;
  const value = Number(state.state);
  return state.state.trim() !== '' && Number.isFinite(value) ? value : null;
}

export function stationFrom(
  snapshot: WeatherSnapshot | null,
  bindings: Record<string, string>,
  getState: (id: string) => EntityStateLike | undefined,
  now: number,
  sun: TodayData['sun'],
): { station: TodayData['station']; condition: Condition | null } {
  let tempC = NaN;
  let updatedAt = '';
  const measured = snapshot?.station.values.t2m;
  const stationUsable =
    snapshot && snapshot.station.status !== 'unavailable' && snapshot.station.status !== 'unbound';
  if (stationUsable && measured && finite(measured.v)) {
    tempC = measured.v;
    updatedAt = measured.updated_at ?? snapshot.station.updated_at ?? snapshot.generated_at;
  }
  const tempEntity = bindings.weather_temperature
    ? getState(bindings.weather_temperature)
    : undefined;
  const forecastEntity = bindings.weather_forecast
    ? getState(bindings.weather_forecast)
    : undefined;
  if (!Number.isFinite(tempC)) {
    const fromSensor = numericState(tempEntity);
    const fromWeather = forecastEntity?.attributes.temperature;
    if (fromSensor !== null) {
      tempC = fromSensor;
      updatedAt = tempEntity!.last_updated;
    } else if (
      forecastEntity &&
      forecastEntity.state !== 'unavailable' &&
      forecastEntity.state !== 'unknown' &&
      finite(Number(fromWeather)) &&
      fromWeather !== null &&
      fromWeather !== ''
    ) {
      tempC = Number(fromWeather);
      updatedAt = forecastEntity.last_updated;
    }
  }
  let condition: Condition | null =
    snapshot && snapshot.current.condition !== 'unknown' ? snapshot.current.condition : null;
  if (!condition && forecastEntity) condition = HA_WEATHER_CONDITION[forecastEntity.state] ?? null;
  return {
    station: {
      tempC,
      updatedAt,
      condition: condition ? CONDITION_CS[condition] : NO_WEATHER,
      icon: condition ? iconFor(condition, now, sun) : 'cloudy',
    },
    condition,
  };
}

function todayPoints(snapshot: WeatherSnapshot | null, now: number, timeZone: string) {
  const today = dayKey(now, timeZone);
  return (snapshot?.hourly ?? []).filter((p) => {
    const t = Date.parse(p.t);
    return Number.isFinite(t) && dayKey(t, timeZone) === today;
  });
}

export function hourlyFrom(
  snapshot: WeatherSnapshot | null,
  now: number,
  sun: TodayData['sun'],
  timeZone = TIME_ZONE,
): TodayData['hourly'] {
  return todayPoints(snapshot, now, timeZone)
    .filter((p) => {
      const h = localHour(Date.parse(p.t), timeZone);
      return h >= 6 && h <= 21 && finite(p.t2m);
    })
    .map((p) => ({ time: p.t, tempC: p.t2m!, icon: iconFor(p.condition, Date.parse(p.t), sun) }));
}

function nearestPoint(snapshot: WeatherSnapshot | null, now: number): BlendPoint | undefined {
  let best: BlendPoint | undefined;
  let bestGap = 2 * HOUR;
  for (const p of snapshot?.hourly ?? []) {
    const gap = Math.abs(Date.parse(p.t) - now);
    if (gap < bestGap) [best, bestGap] = [p, gap];
  }
  return best;
}

/** Rain windows: radar nowcast first, then the hourly blend for the rest of today. */
export function rainRibbon(
  snapshot: WeatherSnapshot | null,
  now: number,
  timeZone = TIME_ZONE,
): RibbonItem[] {
  if (!snapshot) return [];
  const items: RibbonItem[] = [];
  const nc = snapshot.nowcast;
  let coveredUntil = now;
  if (nc.status === 'raining' || nc.status === 'stopping' || nc.status === 'soon') {
    const wet = nc.slots.filter((s) => finite(s.mmh) && s.mmh >= 0.1).map((s) => Date.parse(s.t));
    const from = nc.status === 'soon' ? now + (nc.eta_min ?? 0) * MIN : now;
    let to: number | null = null;
    if (nc.end_min !== null && nc.end_min !== undefined) to = now + nc.end_min * MIN;
    else if (wet.length) to = Math.max(...wet) + 10 * MIN;
    const end = to !== null && to > from ? to : from + HOUR;
    items.push({
      id: 'rain-nowcast',
      signalId: 'weather.nowcast.rain',
      kind: 'rain',
      from: iso(from),
      to: iso(end),
      label:
        nc.status === 'soon'
          ? `Déšť od ${hhmm(from, timeZone)}`
          : to !== null
            ? `Prší do ${hhmm(end, timeZone)}`
            : 'Prší',
    });
    coveredUntil = end;
  }
  // Hourly blend: contiguous wet hours of the rest of today, after the nowcast window.
  let run: { start: number; end: number } | null = null;
  const nowcastItem = items[0];
  const flush = () => {
    if (!run) return;
    // Blend rain right after the radar window extends it (one band, no contradicting labels).
    if (nowcastItem && run.start <= Date.parse(nowcastItem.to!)) {
      nowcastItem.to = iso(Math.max(run.end, Date.parse(nowcastItem.to!)));
      run = null;
      return;
    }
    const fromH = Math.round(localHour(run.start, timeZone));
    const toH = Math.round(localHour(run.end, timeZone)) || 24;
    items.push({
      id: `rain-${fromH}`,
      kind: 'rain',
      from: iso(run.start),
      to: iso(run.end),
      label: `Déšť ${fromH}–${toH} h`,
    });
    run = null;
  };
  for (const p of todayPoints(snapshot, now, timeZone)) {
    const start = Date.parse(p.t);
    const end = start + HOUR;
    const wet = (finite(p.precip) && p.precip >= 0.2) || (finite(p.pop) && p.pop >= 0.6);
    if (!wet || end <= coveredUntil) {
      flush();
      continue;
    }
    const clipped = Math.max(start, coveredUntil);
    if (run && run.end >= clipped) run.end = end;
    else {
      flush();
      run = { start: clipped, end };
    }
  }
  flush();
  if (nowcastItem?.label.startsWith('Prší do'))
    nowcastItem.label = `Prší do ${hhmm(Date.parse(nowcastItem.to!), timeZone)}`;
  return items;
}

const priceFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });

/** Cheap-price windows of today (relative quantile, same as the Energie module). */
export function cheapRibbon(
  price: EntityStateLike | undefined,
  now: number,
  timeZone = TIME_ZONE,
): RibbonItem[] {
  const today = dayKey(now, timeZone);
  const points = parsePriceSeries(price).filter((p) => dayKey(p.start, timeZone) === today);
  if (points.length < 4) return [];
  const level = priceLevels(points);
  const runs: Array<{ start: number; end: number; prices: number[] }> = [];
  for (const p of points) {
    if (level(p.price) !== 'cheap') continue;
    const last = runs[runs.length - 1];
    if (last && last.end === p.start) {
      last.end = p.end;
      last.prices.push(p.price);
    } else runs.push({ start: p.start, end: p.end, prices: [p.price] });
  }
  return runs
    .filter((r) => r.end > now && r.end - r.start >= HOUR)
    .slice(0, 3)
    .map((r) => {
      const mean = r.prices.reduce((a, b) => a + b, 0) / r.prices.length;
      return {
        id: `cheap-${r.start}`,
        kind: 'cheap' as const,
        from: iso(r.start),
        to: iso(r.end),
        label: `Levný proud ${hhmm(r.start, timeZone)}–${hhmm(r.end, timeZone)} · ${priceFormat.format(mean)} Kč`,
      };
    });
}

/** Waste pickups today (morning marker) and tomorrow (evening reminder). */
export function wasteRibbon(
  bindings: Record<string, string>,
  getState: (id: string) => EntityStateLike | undefined,
  now: number,
  calendarEvents: CalendarEventLike[] | 'error' | undefined,
  timeZone = TIME_ZONE,
): { items: RibbonItem[]; tomorrow?: string } {
  const schedule = adaptWasteEntities({ bindings, getState, now, timeZone, calendarEvents });
  if (schedule.quality === 'unavailable') return { items: [] };
  const names = (events: typeof schedule.today) =>
    [
      ...new Set(
        events
          .filter((e) => e.availability !== 'cancelled')
          .map((e) => e.display_name.toLocaleLowerCase('cs-CZ')),
      ),
    ].join(', ');
  const items: RibbonItem[] = [];
  const today = names(schedule.today);
  if (today)
    items.push({
      id: 'waste-today',
      kind: 'waste',
      from: iso(atLocalHour(now, 6, timeZone)),
      label: `Dnes svoz: ${today}`,
    });
  const tomorrow = names(schedule.tomorrow);
  if (tomorrow)
    items.push({
      id: 'waste-tomorrow',
      kind: 'waste',
      // Evening reminder marker (put the bin out), not a block over the evening.
      from: iso(atLocalHour(now, 18, timeZone)),
      label: `Zítra svoz: ${tomorrow}`,
    });
  return { items, tomorrow: tomorrow ? `Zítra svoz: ${tomorrow}` : undefined };
}

/** `calendar/event/subscribe` event; `end` is optional (HA always sends it, mocks may not). */
export type CalendarEntry = CalendarEventLike & {
  end?: string | { date?: string; dateTime?: string };
};
type CalendarFeed = CalendarEntry[] | 'error' | undefined;

function calendarValue(value: CalendarEntry['start'] | undefined): string {
  if (typeof value === 'string') return value;
  return value?.dateTime ?? value?.date ?? '';
}
const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
function eventLabel(summary: string | undefined): string {
  const text = (summary ?? '').replace(/\s+/g, ' ').trim() || 'Událost';
  return text.length > MAX_EVENT_LABEL ? `${text.slice(0, MAX_EVENT_LABEL - 1).trimEnd()}…` : text;
}

/**
 * Today's calendar events still ahead (or running) as ribbon markers: `9:30 Porada`, all-day
 * events at the start of the day. Only the title and the time are used – never description or
 * location (FAM-017). Duplicates across calendars collapse; at most MAX_EVENTS items.
 */
export function eventsRibbon(
  feeds: CalendarFeed[],
  now: number,
  timeZone = TIME_ZONE,
): RibbonItem[] {
  const today = dayKey(now, timeZone);
  const dayStart = startOfLocalDay(now, timeZone);
  const dayEnd = dayStart + DAY + 2 * HOUR; // DST-safe; dayKey below decides
  const seen = new Set<string>();
  const items: Array<RibbonItem & { sort: number }> = [];
  for (const feed of feeds) {
    if (!Array.isArray(feed)) continue;
    for (const event of feed) {
      const startRaw = calendarValue(event.start);
      const endRaw = calendarValue(event.end);
      const label = eventLabel(event.summary);
      let from: number;
      let text: string;
      let time = '';
      if (isDateOnly(startRaw)) {
        // All-day: [start, end) in dates; HA's `end` is exclusive.
        const endDate = isDateOnly(endRaw) && endRaw > startRaw ? endRaw : null;
        if (!(startRaw <= today && (endDate ? today < endDate : today === startRaw))) continue;
        from = atLocalHour(now, 6, timeZone);
        text = label;
      } else {
        const start = Date.parse(startRaw);
        if (!Number.isFinite(start)) continue;
        const parsedEnd = Date.parse(endRaw);
        const end = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd : start + HOUR;
        if (end <= now || start >= dayEnd) continue;
        if (start < dayStart) {
          // Started before today (multi-day): show it from the morning while it lasts.
          from = atLocalHour(now, 6, timeZone);
          text = label;
        } else {
          if (dayKey(start, timeZone) !== today) continue;
          from = start;
          time = hhmm(start, timeZone);
          text = `${time} ${label}`;
        }
      }
      const key = `${from}|${text.toLocaleLowerCase('cs-CZ')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: `event-${items.length}-${from}`,
        kind: 'event',
        from: iso(from),
        label: text,
        agenda: { time, title: label },
        sort: from,
      });
    }
  }
  return items
    .sort((a, b) => a.sort - b.sort)
    .slice(0, MAX_EVENTS)
    .map(({ sort, ...item }) => (void sort, item));
}

/** Stub data without any HA context (no store/connection): disconnected, nothing measured. */
function emptyData(now: number): TodayData {
  return {
    now: iso(now),
    station: { tempC: NaN, updatedAt: '', condition: NO_WEATHER, icon: 'cloudy' },
    sun: { sunrise: '', sunset: '' },
    cloudCover: 0.5,
    windy: false,
    hourly: [],
    ribbon: [],
    signals: [],
    ha: { connected: false, updatedAt: '' },
  };
}

export function createLiveTodayAdapter(
  context?: ModuleViewProps,
  options: LiveTodayOptions = {},
): TodayAdapter {
  const clock = options.clock ?? Date.now;
  const timeZone = options.timeZone ?? TIME_ZONE;
  const pollMs = options.weatherPollMs ?? WEATHER_POLL_MS;
  if (!context?.store) {
    const get = () => emptyData(clock());
    return { get, subscribe: (cb) => (cb(get()), () => undefined) };
  }
  const { store, connection } = context;
  const weather = options.weather ?? (connection ? createWsAdapter(connection) : null);
  let snapshot: WeatherSnapshot | null = null;
  let bindings: BindingsByModule = {};
  let kiosk: boolean | null = null; // null = role not known yet → restrictive
  let familyVisible = false;
  /** Loaded events per calendar entity (waste + family calendars). */
  const calendarEvents = new Map<string, CalendarEntry[] | 'error'>();
  const familyCalendarIds = () =>
    kiosk === false && familyVisible
      ? FAMILY_CALENDAR_KEYS.map((key) => bindings.family?.[key]?.trim()).filter(
          (id): id is string => !!id,
        )
      : [];
  let connectedSince = connection?.connected === false ? null : clock();

  const build = (): TodayData => {
    const now = clock();
    const getState = (id: string) => store.getSnapshot(id);
    const sun = sunToday(getState('sun.sun'), now, timeZone);
    const weatherBindings = bindings.weather ?? {};
    const { station, condition } = stationFrom(snapshot, weatherBindings, getState, now, sun);
    const point = nearestPoint(snapshot, now);
    const cloud = finite(point?.cloud)
      ? point.cloud / 100
      : condition
        ? CONDITION_CLOUD[condition]
        : undefined;
    const gust = snapshot?.current.gust ?? point?.gust ?? null;
    const wind = snapshot?.current.wind ?? point?.wind ?? null;
    const nc = snapshot?.nowcast;
    const rain =
      nc && (nc.status === 'soon' || nc.status === 'raining' || nc.status === 'stopping')
        ? {
            probability: NOWCAST_PROBABILITY[nc.confidence ?? 'medium'] ?? 0.7,
            inMinutes: nc.status === 'soon' ? Math.max(0, nc.eta_min ?? 0) : 0,
          }
        : undefined;
    const priceId = bindings.energy?.energy_spot_price_electricity?.trim();
    const wasteCalendarId = bindings.waste?.waste_calendar?.trim();
    const waste = wasteRibbon(
      bindings.waste ?? {},
      getState,
      now,
      wasteCalendarId ? calendarEvents.get(wasteCalendarId) : undefined,
      timeZone,
    );
    const ribbon = [
      ...cheapRibbon(priceId ? getState(priceId) : undefined, now, timeZone),
      ...rainRibbon(snapshot, now, timeZone),
      ...waste.items,
      ...eventsRibbon(
        familyCalendarIds().map((id) => calendarEvents.get(id)),
        now,
        timeZone,
      ),
    ].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
    const connected = connection ? connection.connected !== false : false;
    const storeAt = typeof store.lastUpdatedAt === 'function' ? store.lastUpdatedAt() : null;
    // Last entity store update (HA pushes `hass` on every change); before the first one, the
    // time the connection came up.
    const lastSeen = storeAt ?? (connected ? connectedSince : null);
    return {
      now: iso(now),
      station,
      sun,
      cloudCover: cloud ?? 0.5,
      ...(rain ? { rain } : {}),
      windy: (finite(gust) && gust >= 15) || (finite(wind) && wind >= 10),
      hourly: hourlyFrom(snapshot, now, sun, timeZone),
      ribbon,
      signals: [],
      ha: { connected, updatedAt: lastSeen ? iso(lastSeen) : '' },
      ...(waste.tomorrow ? { tomorrow: waste.tomorrow } : {}),
    };
  };

  const listeners = new Set<(data: TodayData) => void>();
  let stop: (() => void) | null = null;
  const emit = () => {
    if (!listeners.size) return;
    const data = build();
    listeners.forEach((cb) => cb(data));
  };

  const start = () => {
    let active = true;
    let weatherTimer: ReturnType<typeof setTimeout> | undefined;
    let storeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastStoreEmit = 0;
    /** entity_id → unsubscribe (a no-op until the subscription resolves). */
    const calendarSubs = new Map<string, () => void>();

    const syncCalendars = () => {
      const wasteId = bindings.waste?.waste_calendar?.trim();
      // Kiosk may call only KIOSK_WS_COMMANDS: calendars stay off the wall display.
      const wanted = new Map<string, number>();
      if (connection && kiosk === false) {
        for (const id of familyCalendarIds()) wanted.set(id, FAMILY_CALENDAR_DAYS);
        if (wasteId) wanted.set(wasteId, WASTE_CALENDAR_WINDOW_DAYS);
      }
      for (const [id, stopSub] of calendarSubs)
        if (!wanted.has(id)) {
          stopSub();
          calendarSubs.delete(id);
          calendarEvents.delete(id);
        }
      if (!connection) return;
      for (const [id, days] of wanted) {
        if (calendarSubs.has(id)) continue;
        const token = () => undefined;
        calendarSubs.set(id, token);
        const current = () => active && calendarSubs.get(id) === token;
        void loadWasteCalendar(connection, id, calendarWindow(clock(), days), (events) => {
          if (!current()) return;
          calendarEvents.set(id, events);
          emit();
        }).then(
          (unsubscribe) => {
            if (current()) calendarSubs.set(id, unsubscribe);
            else unsubscribe();
          },
          () => {
            if (!current()) return;
            calendarEvents.set(id, 'error');
            emit();
          },
        );
      }
    };
    const loadContext = async () => {
      if (!connection) return;
      const [nextBindings, session] = await Promise.all([
        getBindings(connection).catch(() => null),
        getSession(connection),
      ]);
      if (!active) return;
      if (nextBindings) bindings = nextBindings;
      if (session) {
        kiosk = session.role === 'kiosk' || session.kiosk;
        familyVisible = session.visibleModules.includes('family');
      }
      syncCalendars();
      emit();
    };
    const tickWeather = async () => {
      if (weatherTimer) clearTimeout(weatherTimer);
      if (!weather) return;
      try {
        const next = await weather.fetch();
        if (active) snapshot = next;
      } catch {
        // Unauthorized / integration down: drop the snapshot (honest empty state).
        if (active) snapshot = null;
      }
      if (!active) return;
      emit();
      if (pollMs > 0) weatherTimer = setTimeout(() => void tickWeather(), pollMs);
    };
    const onReady = () => {
      connectedSince = clock();
      emit();
      void loadContext();
      void tickWeather();
    };
    const onDisconnected = () => {
      connectedSince = null;
      emit();
    };
    const onStore = () => {
      const elapsed = clock() - lastStoreEmit;
      if (elapsed >= STORE_EMIT_MS) {
        lastStoreEmit = clock();
        emit();
      } else if (!storeTimer)
        storeTimer = setTimeout(() => {
          storeTimer = undefined;
          lastStoreEmit = clock();
          emit();
        }, STORE_EMIT_MS - elapsed);
    };
    connection?.addEventListener?.('ready', onReady);
    connection?.addEventListener?.('disconnected', onDisconnected);
    const unsubStore =
      typeof store.subscribeAll === 'function' ? store.subscribeAll(onStore) : () => {};
    void loadContext();
    void tickWeather();
    return () => {
      active = false;
      if (weatherTimer) clearTimeout(weatherTimer);
      if (storeTimer) clearTimeout(storeTimer);
      calendarSubs.forEach((stopSub) => stopSub());
      calendarSubs.clear();
      unsubStore();
      connection?.removeEventListener?.('ready', onReady);
      connection?.removeEventListener?.('disconnected', onDisconnected);
    };
  };

  return {
    get: build,
    subscribe: (cb) => {
      listeners.add(cb);
      if (!stop) stop = start();
      cb(build());
      return () => {
        listeners.delete(cb);
        if (!listeners.size && stop) {
          stop();
          stop = null;
        }
      };
    },
  };
}
