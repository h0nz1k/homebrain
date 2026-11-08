import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  getSession,
  navigatePanel,
  panelUrl,
  usePeople,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import { rank, type PreviousLayout, type RankedSignal } from '@homebrain/signals';
import {
  Chip,
  DayRibbon,
  HeroSignal,
  Pill,
  PresenceStrip,
  SignalCard,
  type RibbonItem,
} from '@homebrain/ui';
import { buildDayRibbonModel } from '../data/ribbonModel.js';
import { computeScene } from '../data/scene.js';
import { buildSummary, summaryCandidates } from '../data/summary.js';
import { TIME_ZONE, type TodayData } from '../data/types.js';
import {
  dataFreshness,
  filterTodayDataForScreen,
  formatAge,
  kioskLayoutFor,
  parseNightHours,
  pixelShift,
  PIXEL_SHIFT_INTERVAL_MS,
  type Freshness,
  type HomeBrainRole,
} from '../data/kiosk.js';
import { resolveTodaySignalFeeds, withSignalFeeds } from '../data/signalSources.js';
import { adapterFactorySource, isKioskRoute } from './runtime.js';
import { hasSunTimes } from '../data/time.js';
import { AmbientSky } from './AmbientSky.js';
import { SunArc } from './SunArc.js';
import { WeatherIcon } from './WeatherIcon.js';
import { TodayHome } from './TodayHome.js';
import { getTodayHomeApi } from '../data/home.js';
import { todayStyles } from './todayStyles.js';

function useMedia(query: string) {
  const media = useMemo(() => window.matchMedia(query), [query]);
  return useSyncExternalStore(
    (notify) => {
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => media.matches,
  );
}
const clockFormat = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
/** Kiosk data status: quiet when fresh, explicit when stale or offline (readable from 3 m). */
function KioskStatus({ freshness }: { freshness: Freshness }) {
  const label =
    freshness.state === 'offline'
      ? `Bez spojení s domácností · data ${formatAge(freshness.ageS)}`
      : freshness.state === 'stale'
        ? `Data nejsou aktuální · ${formatAge(freshness.ageS)}`
        : 'Aktuální';
  return (
    <Pill
      data-testid="ha-freshness"
      data-freshness={freshness.state}
      className={`today-ha today-kiosk-status today-kiosk-status-${freshness.state}`}
      dot
      // Red stays reserved for critical alerts; offline/stale are both amber with distinct text.
      tone={freshness.state === 'fresh' ? 'ok' : 'warn'}
      role="status"
    >
      {label}
    </Pill>
  );
}
const temperatureFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
function signalProps(signal: RankedSignal, connected: boolean, kiosk: boolean) {
  const action = signal.action;
  return {
    id: signal.id,
    severity: signal.severity,
    title: signal.title,
    context: signal.context,
    value: signal.value,
    stale: connected && signal.stale,
    alsoCount: signal.also.length,
    // Navigation is local; service actions remain disabled unless a host supplies execution.
    actionLabel: kiosk && action?.type !== 'navigate' ? undefined : action?.label,
    actionDisabledReason:
      action && action.type !== 'navigate'
        ? (signal.actionState?.reason ?? 'Akce není v tomto přehledu dostupná')
        : undefined,
    onAction:
      action?.type === 'navigate'
        ? () => {
            navigatePanel(action.href);
          }
        : undefined,
  };
}
export default function TodayView(context: Partial<ModuleViewProps> = {}) {
  const factory = useSyncExternalStore(adapterFactorySource.subscribe, adapterFactorySource.get);
  const adapter = useMemo(() => {
    const ctx =
      context.store && context.bindings
        ? { store: context.store, bindings: context.bindings, connection: context.connection }
        : undefined;
    return withSignalFeeds(
      factory(ctx),
      resolveTodaySignalFeeds({
        connection: context.connection,
        store: context.store,
        bindings: context.bindings,
      }),
    );
  }, [factory, context.store, context.bindings, context.connection]);
  const homeApi = useMemo(() => getTodayHomeApi(context.connection), [context.connection]);
  // „Kdo je doma“: live doma/pryč per person (renders nothing without configured persons).
  const people = usePeople(context.connection);
  // Role comes only from the server (ADR-0002); until it answers, nothing extra is unlocked.
  const [role, setRole] = useState<HomeBrainRole | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (context.connection)
      void getSession(context.connection).then((session) => {
        if (active && session) setRole(session.role);
      });
    return () => {
      active = false;
    };
  }, [context.connection]);
  const mobile = useMedia('(max-width: 760px)');
  const portrait = useMedia('(orientation: portrait)');
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const route = context.route?.path ?? location.pathname;
  const search = route.includes('?') ? route.slice(route.indexOf('?')) : location.search;
  const kiosk = context.kiosk || kioskLayoutFor(role, isKioskRoute(route.split('?')[0]!, search));
  const nightHours = useMemo(() => parseNightHours(search), [search]);
  const layout = kiosk ? 'kiosk' : mobile ? 'mobile' : 'desktop';
  // Shared wall display: per-person (health) and private modules never reach the kiosk.
  const visible = useCallback(
    (next: TodayData): TodayData => filterTodayDataForScreen(next, role, kiosk),
    [role, kiosk],
  );
  const [data, setData] = useState(() => visible(adapter.get()));
  const previous = useRef<PreviousLayout | undefined>(undefined);
  const [ranked, setRanked] = useState(() =>
    rank(data.signals, new Date(data.now), { layout, haConnected: data.ha.connected }),
  );
  useEffect(() => {
    const update = (raw: TodayData) => {
      const next = visible(raw);
      const result = rank(next.signals, new Date(next.now), {
        layout,
        previous: previous.current,
        haConnected: next.ha.connected,
      });
      previous.current = result.previous;
      setData(next);
      setRanked(result);
    };
    const stop = adapter.subscribe(update);
    update(adapter.get());
    const timer = setInterval(() => update(adapter.get()), 30_000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [adapter, layout, visible]);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!kiosk) return;
    const timer = setInterval(() => setShift((value) => value + 1), PIXEL_SHIFT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [kiosk]);
  const [slot, setSlot] = useState<HTMLElement | null>(() =>
    document.getElementById('hb-topbar-slot'),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => setSlot(document.getElementById('hb-topbar-slot')));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const sunKnown = hasSunTimes(data.sun);
  // Scene geometry needs instants; without `sun.sun` it degrades to a flat sky (no numbers shown).
  const scene = useMemo(
    () =>
      computeScene(
        sunKnown ? data : { ...data, sun: { sunrise: data.now, sunset: data.now } },
        data.now,
        nightHours,
      ),
    [data, nightHours, sunKnown],
  );
  const freshnessState = dataFreshness(data);
  const kioskPortrait = kiosk && portrait;
  const night = kiosk && scene.nightDim;
  const summary = buildSummary(data, ranked);
  const model = buildDayRibbonModel(data);
  // Events already shown as a hero/card stay on the ribbon only as a marker (no duplicate label).
  const shownSignals = new Set([ranked.hero, ...ranked.cards].map((signal) => signal?.id));
  // Calendar events: readable agenda row under the ribbon, the ribbon keeps only the marker.
  // Never on the wall tablet (calendars are not read there; defensive).
  const agenda = kiosk ? [] : data.ribbon.filter((entry) => entry.kind === 'event' && entry.agenda);
  const agendaIds = new Set(agenda.map((entry) => entry.id));
  // Entries without an end (waste reminder, point events) render as point markers, so markers
  // sharing a time (18:00 dinner + bin reminder) can be spread apart by the ribbon.
  const pointIds = new Set(data.ribbon.filter((entry) => !entry.to).map((entry) => entry.id));
  const items: RibbonItem[] = model.items.flatMap((item): RibbonItem[] =>
    item.type === 'now'
      ? []
      : item.type === 'band'
        ? [
            {
              id: item.id,
              kind: item.kind,
              from: item.startHour,
              ...(pointIds.has(item.id) ? {} : { to: item.endHour }),
              label: item.label,
              hideLabel:
                (!!item.signalId && shownSignals.has(item.signalId)) || agendaIds.has(item.id),
            },
          ]
        : [
            {
              id: item.id,
              kind: item.kind === 'sunset' ? 'sun' : item.kind,
              from: item.hour,
              label: item.label,
            },
          ],
  );
  const age = Math.max(
    0,
    Math.round((Date.parse(data.now) - Date.parse(data.ha.updatedAt)) / 1000),
  );
  const freshness = kiosk ? (
    <KioskStatus freshness={freshnessState} />
  ) : (
    <Pill
      data-testid="ha-freshness"
      className="today-ha"
      dot
      tone={!data.ha.connected ? 'crit' : Number.isFinite(age) && age > 120 ? 'warn' : 'ok'}
    >
      HA ·{' '}
      {!data.ha.connected
        ? 'odpojeno'
        : !Number.isFinite(age)
          ? 'připojeno'
          : `před ${age < 60 ? `${age} s` : `${Math.floor(age / 60)} min`}`}
    </Pill>
  );
  const chips = summaryCandidates(data, ranked).filter((signal) => signal.id !== summary.signalId);
  const highestSeverity = ranked.all[0]?.severity ?? 'calm';
  // Kiosk critical takeover: the alert goes above the ribbon so it reads first from 3 m.
  // Act-now signals (airfryer shake/done) lead on every screen: they lose meaning in minutes.
  const heroFirst = (kiosk && highestSeverity === 'critical') || ranked.hero?.immediate === true;
  const hero = ranked.hero && (
    <HeroSignal {...signalProps(ranked.hero, data.ha.connected, kiosk)} variant={layout} />
  );
  const daylightMinutes = sunKnown
    ? Math.round((Date.parse(data.sun.sunset) - Date.parse(data.sun.sunrise)) / 60000)
    : 0;
  const presence =
    !night && !(kiosk && highestSeverity === 'critical') ? (
      <PresenceStrip people={people} size={kiosk ? 'lg' : 'md'} className="today-presence" />
    ) : null;
  // Landscape kiosk (1280×800) has no spare row: the chips sit under the clock, inside the hero.
  const presenceInHero = kiosk && !kioskPortrait;
  const position = pixelShift(shift);
  return (
    <section
      className={`hb-today today-${layout}${ranked.hero ? ' today-busy' : ' today-calm'}${night ? ' today-night' : ''}${reducedMotion ? ' today-reduced-motion' : ''}${hidden ? ' today-paused' : ''}${kioskPortrait ? ' today-portrait' : ''}${kiosk && freshnessState.state !== 'fresh' ? ' today-stale' : ''}`}
      data-testid="today"
      data-layout={layout}
      data-state-severity={highestSeverity}
      data-night={String(night)}
      data-orientation={kiosk ? (portrait ? 'portrait' : 'landscape') : undefined}
      data-freshness={freshnessState.state}
      aria-label="Dnes"
    >
      <style>{todayStyles}</style>
      {kiosk && <AmbientSky scene={scene} reducedMotion={reducedMotion} />}
      <div
        className="today-content"
        style={kiosk ? { transform: `translate(${position[0]}px, ${position[1]}px)` } : undefined}
      >
        {!night && (
          <header className="today-header">
            <time dateTime={data.now}>{dateFormat.format(new Date(data.now))}</time>
            {kiosk || !slot ? freshness : createPortal(freshness, slot)}
          </header>
        )}
        {!presenceInHero && presence}
        <div className="today-hero" data-testid="today-hero">
          {!night && !mobile && !kioskPortrait && (
            <SunArc
              scene={scene}
              hideGlow={data.cloudCover >= 0.8 || highestSeverity === 'critical'}
            />
          )}
          <time className="today-clock" data-testid="today-clock" dateTime={data.now}>
            {clockFormat.format(new Date(data.now))}
          </time>
          <div className="today-weather">
            <div className="today-temperature" data-testid="today-temp">
              <WeatherIcon icon={data.station.icon} label={data.station.condition} />
              <span>
                {Number.isFinite(data.station.tempC)
                  ? temperatureFormat.format(data.station.tempC)
                  : '—'}
                <sup>°C</sup>
              </span>
            </div>
            {!night && (
              <>
                <div className="today-condition">{data.station.condition}</div>
                <div className="today-station">
                  Venku · stanice
                  {kiosk && freshnessState.state !== 'fresh'
                    ? ` · ${formatAge(freshnessState.ageS)}`
                    : ''}
                </div>
              </>
            )}
          </div>
          {presenceInHero && presence}
        </div>
        {night ? (
          <>
            <p className="today-tomorrow">
              {data.tomorrow ?? 'Zítra zatím nic nevyžaduje pozornost'}
            </p>
            {freshnessState.state !== 'fresh' && <KioskStatus freshness={freshnessState} />}
          </>
        ) : (
          <>
            <p className="today-summary" data-testid="today-summary">
              {summary.sentence}
            </p>
            {heroFirst && hero}
            <div className="today-ribbon-card" data-testid="ribbon-card">
              <div className="today-ribbon-heading">
                Průběh dne{' '}
                {sunKnown ? (
                  <span>
                    východ {clockFormat.format(new Date(data.sun.sunrise))} · západ{' '}
                    {clockFormat.format(new Date(data.sun.sunset))} ·{' '}
                    {Math.floor(daylightMinutes / 60)} h {daylightMinutes % 60} min světla
                  </span>
                ) : (
                  <span data-testid="sun-unavailable">
                    východ a západ slunce nejsou k dispozici
                  </span>
                )}
              </div>
              <DayRibbon
                slim={kiosk && highestSeverity === 'critical'}
                start={model.startHour}
                end={model.endHour}
                now={model.nowHour}
                sunrise={model.sunriseHour}
                sunset={model.sunsetHour}
                items={items}
                hourly={model.hourly.map((hour) => ({
                  h: hour.hour,
                  tempC: hour.tempC,
                  icon: <WeatherIcon icon={hour.icon} />,
                }))}
              />
              {!!agenda.length && (
                <ul
                  className="today-agenda"
                  data-testid="today-agenda"
                  aria-label="Dnes v kalendáři"
                >
                  {agenda.map((entry) => (
                    <li key={entry.id} data-testid="agenda-item">
                      <time dateTime={entry.from}>{entry.agenda!.time || 'celý den'}</time>
                      <span title={entry.agenda!.title}>{entry.agenda!.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!heroFirst && hero}
            {!!ranked.cards.length && (
              <div className="today-cards">
                {ranked.cards.map((signal) => (
                  <SignalCard
                    key={signal.id}
                    {...signalProps(signal, data.ha.connected, kiosk)}
                    compact={false}
                  />
                ))}
              </div>
            )}
            {!(kiosk && highestSeverity === 'critical') && (
              <TodayHome api={homeApi} kiosk={kiosk} />
            )}
            {!!chips.length && (
              <div className="today-chips" data-testid="status-chips">
                {chips.map((signal) => (
                  <Chip
                    data-testid="status-chip"
                    key={signal.id}
                    tone={signal.tone === 'opportunity' ? 'ok' : 'neutral'}
                  >
                    {signal.title}
                  </Chip>
                ))}
              </div>
            )}
            {ranked.more > 0 && (
              <footer className="today-footer" data-testid="today-footer">
                <a
                  data-testid="footer-more"
                  href={panelUrl('/today/all')}
                  target="_top"
                  onClick={(event) => {
                    event.preventDefault();
                    navigatePanel('/today/all');
                  }}
                >
                  Další {ranked.more} · Zobrazit vše
                </a>
              </footer>
            )}
          </>
        )}
      </div>
      <div className="today-night-overlay" aria-hidden="true" />
    </section>
  );
}
