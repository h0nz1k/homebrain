import { useId, useState } from 'react';
import {
  Button,
  Card,
  Chip,
  Icon,
  ListCell,
  Pill,
  SegmentedControl,
  SignalCard,
  StatusRow,
  Stepper,
  Switch,
  Tile,
} from '@homebrain/ui';
import { Glyph } from './glyphs';
import {
  DEVICES,
  TIER_LABEL,
  TIER_TONE,
  snapshot,
  TIERS,
  TIER_RANK,
  USUAL,
  dur,
  hm,
  values,
  type Issue,
  type Snapshot,
  type StateKey,
  type TierKey,
} from './model';

const params = new URLSearchParams(location.search);
const STATE = (params.get('state') ?? 'confirmed') as StateKey;
const VIEW = params.get('view') ?? 'detail';
const DATE = 'pondělí 9. listopadu';

const tone = (t: TierKey) => TIER_TONE[t];

function TierPill({ tier, size }: { tier: TierKey; size?: 'sm' | 'md' }) {
  return (
    <Pill
      tone={tone(tier)}
      dot={tier !== 'confirmed'}
      variant={tier === 'confirmed' ? 'solid' : 'soft'}
      size={size}
    >
      {TIER_LABEL[tier]}
    </Pill>
  );
}

function headline(s: Snapshot): { title: string; sub: string; tone: 'ok' | TierKey } {
  const { confirmed, suspicion, observation } = s.counts;
  if (confirmed)
    return {
      title: confirmed === 1 ? '1 porucha' : `${confirmed} poruchy`,
      sub: [suspicion && `${suspicion} podezření`, observation && `${observation} pozorování`]
        .filter(Boolean)
        .join(' · '),
      tone: 'confirmed',
    };
  if (suspicion)
    return {
      title: suspicion === 1 ? '1 podezření' : `${suspicion} podezření`,
      sub: 'Sleduji další vývoj',
      tone: 'suspicion',
    };
  if (observation)
    return {
      title: `${observation} pozorování`,
      sub: 'Změny zatím vyhodnocuji',
      tone: 'observation',
    };
  return { title: 'Vše v pořádku', sub: 'Nic neobvyklého za posledních 24 h', tone: 'ok' };
}

/* ------------------------------------------------------------------ Dnes */
function WatchCard({ s }: { s: Snapshot }) {
  const [top, ...rest] = s.issues;
  const severity = top.tier === 'confirmed' ? 'warning' : 'notice';
  const other = TIERS.slice()
    .reverse()
    .map((tier) => ({
      tier,
      issues: rest.filter((issue) => issue.tier === tier),
    }))
    .filter(({ issues }) => issues.length);
  const groupTitle = {
    confirmed: 'Další poruchy',
    suspicion: 'Další podezření',
    observation: 'Další pozorování',
  };
  return (
    <article
      className="hb-card aw-watch"
      data-variant="glass"
      data-severity={severity}
      data-tier={top.tier}
    >
      <div className="aw-watch-primary">
        <div className="aw-watch-head">
          <span className="aw-orb" data-tone={tone(top.tier)}>
            <Glyph name={top.glyph} size={22} />
          </span>
          <span className="aw-eyebrow">Hlídání domu</span>
        </div>
        <div className="aw-watch-titlerow">
          <h2 className="aw-watch-title">{top.headline}</h2>
          <TierPill tier={top.tier} />
        </div>
        <p className="aw-watch-context">{top.meta}</p>
        <p className="aw-watch-sent">Aktualizováno {s.time}</p>
        <div className="aw-watch-foot">
          {/* The anomaly outranks every chore on the page. */}
          <Button
            variant="primary"
            className="aw-cta"
            data-tone={top.tier}
            onClick={() => navigate('detail')}
          >
            Otevřít hlídání
          </Button>
          {top.phone_at ? (
            <span className="aw-watch-phone">
              <Glyph name="phone" size={18} /> Odesláno na telefon v {hm(top.phone_at)}
            </span>
          ) : (
            <span className="aw-muted">{s.inventory}</span>
          )}
        </div>
      </div>
      {other.length > 0 && (
        <div className="aw-watch-list">
          {other.map(({ tier, issues }) => (
            <section key={tier}>
              <h3>
                {groupTitle[tier]} ({issues.length})
              </h3>
              {issues.map((i) => (
                <StatusRow
                  key={i.key}
                  icon={<Glyph name={i.glyph} size={18} />}
                  tone={tone(i.tier)}
                  label={i.headline}
                  detail={`od ${i.from}`}
                  value={null}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

function navigate(view: string) {
  const next = new URL(location.href);
  next.searchParams.set('view', view);
  location.href = next.href;
}

function Dnes({ s }: { s: Snapshot }) {
  const card = s.counts.confirmed + s.counts.suspicion > 0;
  const chip =
    s.counts.observation && !card ? (
      <Chip tone="accent" icon={<Glyph name="pulse" size={16} />}>
        Dům · {s.counts.observation} pozorování
      </Chip>
    ) : !card ? (
      <Chip tone="ok" icon={<Glyph name="shield" size={16} />}>
        Dům v pořádku
      </Chip>
    ) : null;
  const [binOut, setBinOut] = useState(false);
  // The bin button exists only from 17:00 the evening before collection.
  const binDue = Number(s.time.split(':')[0]) >= 17;
  const dishwasherAffected = s.issues.some((i) => i.device_ids.includes('dev_dishwasher'));
  return (
    <div className="aw-page aw-dnes" data-watch={card ? s.issues[0].tier : undefined}>
      <section className="hb-card aw-hero" data-variant="glass">
        <div className="aw-hero-time">
          <span className="aw-clock">{s.time}</span>
          <span className="aw-date">{DATE}</span>
        </div>
        <div className="aw-hero-wx">
          <span className="aw-temp">
            7<small> °C</small>
          </span>
          <span className="aw-muted">polojasno</span>
        </div>
        {!s.counts.confirmed && <p className="aw-summary-line">Odpoledne polojasno</p>}
      </section>
      {card ? <WatchCard s={s} /> : <div className="aw-watch-note">{chip}</div>}
      <div className="aw-cards">
        <SignalCard
          id="waste"
          severity="notice"
          title="Zítra svoz papíru"
          context={
            binOut
              ? 'Popelnice je venku.'
              : binDue
                ? 'Svoz bývá do 8:00.'
                : 'Popelnici připravte večer, svoz bývá do 8:00. Připomenu v 17:00.'
          }
          icon={<Icon name="bin" size={22} />}
          actionLabel={binDue && !binOut ? 'Popelnice je venku' : undefined}
          onAction={() => setBinOut(true)}
        />
        <SignalCard
          id="energy"
          severity="notice"
          title="Levný proud dnes 13–15 h"
          context={
            dishwasherAffected
              ? 'Průměr 1,9 Kč/kWh. Hodí se na praní. Myčka teď nehlásí stav, mytí odložte.'
              : 'Průměr 1,9 Kč/kWh. Vhodná doba na praní nebo mytí nádobí.'
          }
          icon={<Icon name="tariff" size={22} />}
        />
      </div>
      <div className="aw-chips" aria-label="Další informace">
        <Chip tone="neutral" icon={<Icon name="sun" size={16} />}>
          Počasí bez výstrah
        </Chip>
        <Chip tone="neutral" icon={<Icon name="battery" size={16} />}>
          Baterie domu 78 %
        </Chip>
        <Chip tone="neutral" icon={<Icon name="calendar" size={16} />}>
          Odpoledne 2 události
        </Chip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ detail */
function HealthStrip({ s }: { s: Snapshot }) {
  const legend = { ok: 'V pořádku', ...TIER_LABEL };
  return (
    <figure className="aw-strip">
      <div
        className="aw-strip-bars"
        role="img"
        aria-label="Nejvyšší úroveň hlášení v jednotlivých hodinách"
      >
        {s.health.map((tier, k) => (
          <span
            key={k}
            data-tier={tier}
            title={`${hm(new Date(+s.now - (23 - k) * 3_600_000))} · ${legend[tier]}`}
          />
        ))}
      </div>
      <div className="aw-strip-axis">
        <span>před 24 h</span>
        <span>teď</span>
      </div>
      <figcaption className="aw-strip-legend">
        {(['ok', ...TIERS] as const).map((tier) => (
          <span key={tier}>
            <i data-tier={tier} />
            {legend[tier]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

const minuteOfDay = (d: Date) => {
  const [h, m] = hm(d).split(':').map(Number);
  return h * 60 + m;
};

function BaselineBand({ points, now }: { points: Snapshot['temperature']; now: Date }) {
  const id = useId();
  const width = 480;
  const height = 112;
  const x = (minute: number) => (minute / 1440) * width;
  const y = (value: number) => 8 + ((30 - value) / 12) * (height - 16);
  const nowMinute = minuteOfDay(now);
  const nowX = x(nowMinute);
  const current = [...points].reverse().find((p) => p.minute <= nowMinute) ?? points.at(-1)!;
  const usual = [USUAL[0], ...USUAL, USUAL[23]].map((bounds, i) => ({
    ...bounds,
    minute: i === 0 ? 0 : i === 25 ? 1440 : (i - 0.5) * 60,
  }));
  const band = [
    ...usual.map((p) => `${x(p.minute)},${y(p.hi)}`),
    ...usual
      .slice()
      .reverse()
      .map((p) => `${x(p.minute)},${y(p.lo)}`),
  ].join(' ');
  const edge = (key: 'hi' | 'lo') => usual.map((p) => `${x(p.minute)},${y(p[key])}`).join(' ');
  const line = points
    .filter((p) => p.minute <= nowMinute)
    .map((p) => `${x(p.minute)},${y(p.value)}`)
    .join(' ');
  const past = `${id}-past`;
  const future = `${id}-future`;
  return (
    <figure className="aw-band" aria-label="Dnešní hodinový průměr teploty proti obvyklému rozmezí">
      <div className="aw-band-chart">
        <div className="aw-band-y" aria-hidden="true">
          <span>30 °C</span>
          <span>24 °C</span>
          <span>18 °C</span>
        </div>
        <div className="aw-band-plot">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <clipPath id={past}>
                <rect x={0} y={0} width={nowX} height={height} />
              </clipPath>
              <clipPath id={future}>
                <rect x={nowX} y={0} width={width - nowX} height={height} />
              </clipPath>
            </defs>
            {[18, 21, 24, 27, 30].map((v) => (
              <line key={v} x1={0} x2={width} y1={y(v)} y2={y(v)} className="aw-band-grid" />
            ))}
            <polygon points={band} className="aw-band-usual" clipPath={`url(#${past})`} />
            {/* After 'teď' the usual band is only a forecast: faded with dashed edges. */}
            <g clipPath={`url(#${future})`}>
              <polygon points={band} className="aw-band-usual aw-band-ahead" />
              <polyline points={edge('hi')} className="aw-band-edge" />
              <polyline points={edge('lo')} className="aw-band-edge" />
            </g>
            <line x1={nowX} x2={nowX} y1={0} y2={height} className="aw-band-now" />
            <polyline points={line} className="aw-band-today" />
          </svg>
          <span
            className="aw-band-dot"
            style={{
              left: `${(current.minute / 1440) * 100}%`,
              top: `${(y(current.value) / height) * 100}%`,
            }}
          />
          <span className="aw-band-tag" style={{ left: `${(nowMinute / 1440) * 100}%` }}>
            teď {hm(now)}
          </span>
        </div>
        <div className="aw-band-axis" aria-hidden="true">
          <span>0:00</span>
          <span>6:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
      <figcaption>
        <span>
          <i className="aw-key-usual" />
          Obvyklé rozmezí
        </span>
        <span>
          <i className="aw-key-today" />
          Dnes · hodinový průměr
        </span>
      </figcaption>
    </figure>
  );
}

const HOUR = 3_600_000;
/** Shared 4h window, so a longer gap is visibly longer on every card. */
const GAP_WINDOW = 4 * HOUR;

function SilenceTimeline({ gap, now }: { gap: NonNullable<Issue['gap']>; now: Date }) {
  const end = +now;
  const start = end - GAP_WINDOW;
  const step = gap.interval * 60_000;
  const last = +new Date(gap.last);
  const pos = (t: number) => ((t - start) / (end - start)) * 100;
  const hours: number[] = [];
  // Hour labels keep clear of the 'teď' label at the right end.
  for (let t = Math.ceil(start / HOUR) * HOUR; t <= end; t += HOUR) hours.push(t);
  const labelled = hours.filter((t) => end - t >= 0.3 * GAP_WINDOW);
  const received: number[] = [];
  for (let t = last; t >= start; t -= step) received.push(t);
  const expected: number[] = [];
  for (let t = last + step; t <= end; t += step) expected.push(t);
  const lastPos = pos(last);
  return (
    <figure className="aw-gap">
      <figcaption>
        <b>
          Od {hm(gap.last)} chybí {expected.length} hlášení
        </b>
        <span>obvykle hlásí každých {dur(gap.interval)}</span>
      </figcaption>
      <div className="aw-gap-scale" aria-hidden="true">
        <div className="aw-gap-events">
          <span
            style={{ left: `${lastPos}%` }}
            data-align={lastPos < 25 ? 'start' : lastPos > 70 ? 'end' : 'center'}
          >
            poslední hodnota <b>{hm(gap.last)}</b>
          </span>
        </div>
        <div className="aw-gap-track">
          <span className="aw-gap-data" style={{ width: `${lastPos}%` }} />
          <span className="aw-gap-missing" style={{ left: `${lastPos}%` }} />
          {hours.map((t) => (
            <i key={t} className="aw-gap-hour" style={{ left: `${pos(t)}%` }} />
          ))}
          {received.map((t) => (
            <i key={t} className="aw-gap-got" style={{ left: `${pos(t)}%` }} />
          ))}
          {expected.map((t) => (
            <i key={t} className="aw-gap-miss" style={{ left: `${pos(t)}%` }} />
          ))}
          <i className="aw-gap-last" style={{ left: `${lastPos}%` }} />
        </div>
        <div className="aw-gap-hours">
          {labelled.map((t) => (
            <span key={t} style={{ left: `${pos(t)}%` }}>
              {hm(t)}
            </span>
          ))}
          <span className="aw-gap-now">
            teď <b>{hm(now)}</b>
          </span>
        </div>
      </div>
    </figure>
  );
}

function Chevron() {
  return (
    <svg className="aw-chevron" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <path
        d="m6 9 6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A half-width card left alone in the last grid row takes the full width instead. */
function lone(list: Issue[], i: Issue) {
  const half = list.filter((x) => x.tier !== 'confirmed');
  return half.length % 2 === 1 && half.at(-1) === i;
}

function IssueCard({ i, s, wide }: { i: Issue; s: Snapshot; wide?: boolean }) {
  const fault = i.tier === 'confirmed';
  return (
    <article className="hb-card aw-issue" data-tier={i.tier} data-wide={wide || undefined}>
      <header className="aw-issue-head">
        <span className="aw-orb" data-tone={tone(i.tier)}>
          <Glyph name={i.glyph} size={22} />
        </span>
        <div className="aw-issue-copy">
          <h3>{i.headline}</h3>
          <p>{i.meta}</p>
        </div>
        <TierPill tier={i.tier} />
      </header>
      {i.why && <p className="aw-why">{i.why}</p>}
      {i.value && <BaselineBand points={s.temperature} now={s.now} />}
      {i.gap && <SilenceTimeline gap={i.gap} now={s.now} />}
      {i.entities.length > 1 && (
        <details className="aw-affected">
          <summary>
            Dotčené hodnoty ({i.entities.length})
            <Chevron />
          </summary>
          <div className="aw-entities" aria-label="Dotčené entity">
            {i.entities.map((e) => (
              <span key={e} className="aw-entity">
                <i className="aw-entity-dot" />
                {e}
              </span>
            ))}
          </div>
        </details>
      )}
      <Stepper
        label="Vývoj hlášení"
        steps={TIERS.map((key) => ({
          key,
          title: TIER_LABEL[key],
          detail: i.reached[key]
            ? hm(i.reached[key]!)
            : i.earliest[key]
              ? `nejdřív ${hm(i.earliest[key]!)}`
              : i.value
                ? 'jen při extrému'
                : 'podle vývoje',
          state: i.tier === key ? 'active' : i.reached[key] ? 'done' : 'todo',
        }))}
      />
      <footer className="aw-issue-foot">
        {i.phone_at && (
          <span className="aw-sent">
            <Glyph name="phone" size={16} /> Odesláno na telefon v {hm(i.phone_at)}
          </span>
        )}
        <div className="aw-actions">
          {fault ? (
            <>
              <Button variant="primary" size="sm">
                Vyřešeno
              </Button>
              <Button variant="secondary" size="sm">
                Otevřít zařízení
              </Button>
              <Button variant="secondary" size="sm">
                Vím o tom
              </Button>
            </>
          ) : (
            <Button variant="strong" size="sm">
              To je v pořádku
            </Button>
          )}
          <button type="button" className="aw-link">
            Ztlumit na 7 dní
          </button>
        </div>
        {fault && <p className="aw-hint">„Vím o tom“ = už nepřipomínat, hlídat dál.</p>}
      </footer>
    </article>
  );
}

function PhoneCard({ s }: { s: Snapshot }) {
  const sent = s.issues.find((i) => i.phone_at);
  const [enabled, setEnabled] = useState(true);
  return (
    <Card className="aw-side">
      <h2 className="aw-h2">Na telefon</h2>
      {sent ? (
        <div className="aw-push" aria-label="Náhled oznámení">
          <span className="aw-push-app">
            <Glyph name="home" size={16} />
          </span>
          <div>
            <div className="aw-push-top">
              <b>HomeBrain</b>
              <span>{hm(sent.phone_at!)}</span>
            </div>
            <strong>{sent.headline}</strong>
            <span>{sent.gap && <>Bez dat od {hm(sent.gap.last)}. </>}Klepněte pro detail.</span>
          </div>
        </div>
      ) : (
        <p className="aw-muted aw-pad">
          Zatím nic neodešlo. Na telefon jdou jen potvrzené poruchy.
        </p>
      )}
      <div className="aw-cells">
        <ListCell
          label="Posílat potvrzené poruchy"
          value={
            <Switch checked={enabled} label="Posílat potvrzené poruchy" onChange={setEnabled} />
          }
        />
        <ListCell
          label="Tichý režim"
          description="Oznámení o trvajících poruchách dorazí ráno"
          value="22:00–7:00"
          trailing="chevron"
        />
        <ListCell label="Opakovat nejdřív za" value="24 h" trailing="chevron" />
      </div>
    </Card>
  );
}

function HowCard() {
  return (
    <Card className="aw-side">
      <h2 className="aw-h2">Jak hlídám</h2>
      <ol className="aw-how">
        <li>
          <TierPill tier="observation" size="sm" />
          <span>Změna je mimo obvyklý průběh. Pozorování ukážu jen tady.</span>
        </li>
        <li>
          <TierPill tier="suspicion" size="sm" />
          <span>Změna trvá déle nebo se opakuje. Ukážu to i v přehledu Dnes.</span>
        </li>
        <li>
          <TierPill tier="confirmed" size="sm" />
          <span>Pošlu na telefon (v tichém režimu až ráno).</span>
        </li>
      </ol>
      <p className="aw-privacy">
        <Icon name="lock" size={16} /> Výpočet běží doma v Home Assistantu, ven jdou jen oznámení na
        telefon.
      </p>
    </Card>
  );
}

function DevicesCard({ s }: { s: Snapshot }) {
  const affected = new Map<string, TierKey>();
  for (const issue of s.issues) {
    for (const id of issue.device_ids) {
      if (TIER_RANK[issue.tier] > TIER_RANK[affected.get(id) ?? 'ok']) affected.set(id, issue.tier);
    }
  }
  const devices = DEVICES.slice().sort(
    (a, b) => TIER_RANK[affected.get(b.id) ?? 'ok'] - TIER_RANK[affected.get(a.id) ?? 'ok'],
  );
  return (
    <Card className="aw-side aw-devices">
      <h2 className="aw-h2">Hlídaná zařízení</h2>
      <p className="aw-muted aw-pad">
        {devices.length - affected.size} v pořádku
        {affected.size > 0 && ` · ${affected.size} s hlášením`}
      </p>
      <div className="aw-tiles">
        {devices.map((d) => {
          const tier = affected.get(d.id);
          return (
            <Tile
              key={d.id}
              tone={tier ? tone(tier) : 'neutral'}
              icon={<Glyph name={d.glyph} size={18} />}
              label={d.name}
              status={tier ? TIER_LABEL[tier] : values(d.count)}
              detail={tier ? values(d.count) : undefined}
            />
          );
        })}
      </div>
    </Card>
  );
}

function Detail({ s }: { s: Snapshot }) {
  const h = headline(s);
  const [filter, setFilter] = useState('all');
  const visible = filter === 'all' ? s.issues : s.issues.filter((i) => i.tier === filter);
  const n = s.issues.length;
  return (
    <div className="aw-page aw-detail">
      <header className="aw-top">
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon name="arrow" size={18} />}
          aria-label="Zpět na Dnes"
          onClick={() => navigate('dnes')}
          className="aw-back"
        />
        <div>
          <h1>Hlídání domu</h1>
          <p className="aw-muted">Aktualizováno {s.time} · z historie Home Assistantu</p>
        </div>
      </header>
      <div className="aw-layout">
        <main className="aw-main">
          <section className="hb-card aw-status" data-variant="glass" data-tone={h.tone}>
            <span
              className="aw-orb aw-orb-lg"
              data-tone={h.tone === 'ok' ? 'ok' : tone(h.tone as TierKey)}
            >
              <Glyph
                name={h.tone === 'ok' || h.tone === 'observation' ? 'shield' : 'pulse'}
                size={30}
              />
            </span>
            <div className="aw-status-copy">
              <h2>{h.title}</h2>
              {h.sub && <p>{h.sub}</p>}
              <p className="aw-muted">{s.inventory}</p>
            </div>
            <HealthStrip s={s} />
          </section>

          {n > 1 && (
            <SegmentedControl
              label="Filtr"
              hideLabel
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                ['all', `Vše ${n}`],
                ...TIERS.slice()
                  .reverse()
                  .filter((tier) => s.counts[tier])
                  .map((tier): [string, string] => [
                    tier,
                    `${tier === 'confirmed' ? 'Poruchy' : TIER_LABEL[tier]} ${s.counts[tier]}`,
                  ]),
              ]}
            />
          )}

          {n === 0 ? (
            <DevicesCard s={s} />
          ) : (
            <div className="aw-issues">
              {visible.map((i) => (
                <IssueCard key={i.key} i={i} s={s} wide={lone(visible, i)} />
              ))}
            </div>
          )}
        </main>
        <aside className="aw-rail">
          <PhoneCard s={s} />
          {n > 0 && <DevicesCard s={s} />}
          <HowCard />
        </aside>
      </div>
    </div>
  );
}

export function App() {
  const s = snapshot(STATE);
  return VIEW === 'dnes' ? <Dnes s={s} /> : <Detail s={s} />;
}
