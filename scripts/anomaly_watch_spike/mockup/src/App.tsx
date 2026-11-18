import { useState } from 'react';
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
          <TierPill tier={top.tier} size="sm" />
        </div>
        <h2 className="aw-watch-title">{top.headline}</h2>
        <p className="aw-watch-context">{top.meta}</p>
        {top.phone_at && (
          <p className="aw-watch-sent aw-muted">Odesláno na telefon {hm(top.phone_at)}</p>
        )}
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
                  value={null}
                />
              ))}
            </section>
          ))}
        </div>
      )}
      <div className="aw-watch-foot">
        <Button variant="secondary" size="sm" onClick={() => navigate('detail')}>
          Otevřít hlídání
        </Button>
        <span className="aw-muted">{s.inventory}</span>
      </div>
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
  const [wasteDone, setWasteDone] = useState(false);
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
            7<small> °C</small>
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
            wasteDone
              ? 'Popelnice je připravená ke svozu.'
              : 'Připravte popelnici večer. Svoz bývá do 8:00.'
          }
          icon={<Icon name="bin" size={22} />}
          actionLabel={wasteDone ? undefined : 'Hotovo – vyvezeno'}
          onAction={() => setWasteDone(true)}
        />
        <SignalCard
          id="energy"
          severity="notice"
          title="Levný proud 13–15 h"
          context={
            dishwasherAffected
              ? 'Průměr 1,9 Kč/kWh. Vhodná doba na praní.'
              : 'Průměr 1,9 Kč/kWh. Vhodná doba na praní nebo mytí nádobí.'
          }
          icon={<Icon name="tariff" size={22} />}
        />
      </div>
      <div className="aw-chips" aria-label="Další informace">
        <Chip tone="neutral" icon={<Icon name="sun" size={16} />}>
          Počasí bez výstrah
        </Chip>
        <Chip tone="neutral" icon={<Icon name="battery" size={16} />}>
          Baterie 78 %
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

function BaselineBand({ points }: { points: Snapshot['temperature'] }) {
  const width = 480;
  const height = 112;
  const x = (minute: number) => (minute / 1440) * width;
  const y = (value: number) => 8 + ((30 - value) / 12) * (height - 16);
  const current = points.at(-1)!;
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
  const line = points.map((p) => `${x(p.minute)},${y(p.value)}`).join(' ');
  return (
    <figure className="aw-band" aria-label="Dnešní hodinový průměr teploty proti obvyklému rozmezí">
      <div className="aw-band-chart">
        <div className="aw-band-y" aria-hidden="true">
          <span>30°</span>
          <span>24°</span>
          <span>18°</span>
        </div>
        <div className="aw-band-plot">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <polygon points={band} className="aw-band-usual" />
            {[18, 24, 30].map((v) => (
              <line key={v} x1={0} x2={width} y1={y(v)} y2={y(v)} className="aw-band-grid" />
            ))}
            <line
              x1={x(current.minute)}
              x2={x(current.minute)}
              y1={0}
              y2={height}
              className="aw-band-now"
            />
            <polyline points={line} className="aw-band-today" />
          </svg>
          <span
            className="aw-band-dot"
            style={{
              left: `${current.minute / 14.4}%`,
              top: `${(y(current.value) / height) * 100}%`,
            }}
          />
          <span className="aw-band-tag" style={{ left: `${current.minute / 14.4}%` }}>
            teď
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

function SilenceTimeline({ gap, now }: { gap: NonNullable<Issue['gap']>; now: Date }) {
  return (
    <figure className="aw-gap">
      <figcaption>Obvykle nové hodnoty každých {dur(gap.interval)}</figcaption>
      <div className="aw-gap-track" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="aw-gap-times">
        <span>
          <b>{hm(gap.last)}</b>Poslední hodnota
        </span>
        <span>
          <b>{hm(gap.since)}</b>Začátek mezery
        </span>
        <span>
          <b>{hm(now)}</b>Teď
        </span>
      </div>
    </figure>
  );
}

function IssueCard({ i, s }: { i: Issue; s: Snapshot }) {
  return (
    <article className="hb-card aw-issue" data-tier={i.tier}>
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
      {i.value && <BaselineBand points={s.temperature} />}
      {i.gap && <SilenceTimeline gap={i.gap} now={s.now} />}
      {i.entities.length > 1 && (
        <details className="aw-affected">
          <summary>Dotčené hodnoty ({i.entities.length})</summary>
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
              ? `nejdřív ${hm(i.earliest[key]!)}`
              : i.value
                ? 'jen při extrému'
                : 'podle vývoje',
          state: i.tier === key ? 'active' : i.reached[key] ? 'done' : 'todo',
        }))}
      />
      <footer className="aw-issue-foot">
        {i.phone_at && (
          <span className="aw-sent">
            <Glyph name="phone" size={16} /> Odesláno na telefon {hm(i.phone_at)}
          </span>
        )}
        <div className="aw-actions">
          {i.tier === 'confirmed' ? (
            <>
              <Button variant="primary" size="sm">
                Vyřešeno
              </Button>
              <Button variant="secondary" size="sm">
                Vím o tom
              </Button>
              <Button variant="ghost" size="sm">
                Ztlumit na 7 dní
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm">
                To je v pořádku
              </Button>
              <Button variant="secondary" size="sm">
                Ztlumit na 7 dní
              </Button>
            </>
          )}
        </div>
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
            <span>{sent.gap && <>Bez dat od {hm(sent.gap.since)}. </>}Klepněte pro detail.</span>
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
          <span>Změna je mimo obvyklý průběh. Pozorování se zobrazí tady.</span>
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
        <Icon name="lock" size={16} /> Počítá se v Home Assistantu z vaší historie. Nic neodchází
        ven.
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
                <IssueCard key={i.key} i={i} s={s} />
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
