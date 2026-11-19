import { useEffect, useMemo, useState } from 'react';
import { navigatePanel, type ConnectionLike } from '@homebrain/ha-client';
import { Button, Chip, StatusRow } from '@homebrain/ui';
import { getAnomalyApi } from '../api.js';
import {
  TIER_TONE,
  TIERS,
  affectedInventory,
  byUrgency,
  headline,
  meta,
  reportGlyph,
  rowDetail,
  tierCount,
} from '../copy.js';
import type { AnomalySnapshot, TierKey } from '../types.js';
import { TierPill } from './TierPill.js';
import { Glyph } from './glyphs.js';
import { anomalyStyles } from './styles.js';

const POLL_MS = 60_000;
export const ANOMALY_PATH = '/anomaly';

export type WatchLevel = 'confirmed' | 'suspicion' | null;

export interface WatchCardProps {
  connection?: ConnectionLike;
  layout: 'kiosk' | 'mobile' | 'desktop';
  /**
   * The clock shown on the screen (Dnes passes its own `now`): every duration on the card counts
   * up to it, so „10:40“ on the clock and „1 h 11 min od posledního hlášení“ always agree. Without
   * it the snapshot's evaluation time is used.
   */
  now?: string;
  /** Tells Dnes whether the card is shown (it shrinks the clock and makes room on the kiosk). */
  onLevel?: (level: WatchLevel) => void;
}

const GROUP_TITLE: Record<TierKey, string> = {
  confirmed: 'Další poruchy',
  suspicion: 'Další podezření',
  observation: 'Další pozorování',
};

function RowChevron() {
  return (
    <svg className="aw-row-chevron" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        d="m9 6 6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Dnes: „Hlídání domu“ card from a suspicion up, a quiet chip otherwise (summary API only). */
export function AnomalyWatchCard({ connection, layout, now, onLevel }: WatchCardProps) {
  const api = useMemo(() => getAnomalyApi(connection), [connection]);
  const [snap, setSnap] = useState<AnomalySnapshot | null>(null);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const tick = () =>
      api.summary().then(
        (s) => alive && setSnap(s),
        () => alive && setSnap(null), // no permission / module off: Dnes simply has no card
      );
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [api]);
  // most urgent first (soonest escalation to Porucha), the same order as the detail page
  const open = (snap?.reports ?? [])
    .filter((r) => r.hidden === null && r.tier !== 'observation' && r.scope !== 'system')
    .sort(byUrgency);
  const level: WatchLevel = open[0]
    ? open[0].tier === 'confirmed'
      ? 'confirmed'
      : 'suspicion'
    : null;
  useEffect(() => {
    onLevel?.(level);
  }, [level, onLevel]);
  if (!snap || !snap.ready) return null;

  const kiosk = layout === 'kiosk';
  const clock = now ?? snap.now;
  if (!level) {
    const observations = snap.counts.observation;
    return (
      <div className="aw aw-watch-note">
        <style>{anomalyStyles}</style>
        {observations ? (
          <Chip tone="accent" icon={<Glyph name="pulse" size={16} />} data-testid="aw-watch-chip">
            Dům · {observations}&nbsp;pozorování
          </Chip>
        ) : (
          <Chip tone="ok" icon={<Glyph name="shield" size={16} />} data-testid="aw-watch-chip">
            Dům v pořádku
          </Chip>
        )}
      </div>
    );
  }

  const [top, ...rest] = open;
  // The kiosk shows at most two side items, so the card fits 1280×800 with the clock.
  const sideLimit = kiosk ? 2 : 3;
  const groups = TIERS.slice()
    .reverse()
    .map((tier) => ({ tier, items: rest.filter((r) => r.tier === tier) }))
    .filter((g) => g.items.length)
    .reduce<{ tier: TierKey; items: typeof rest; visible: typeof rest }[]>((acc, g) => {
      const used = acc.reduce((n, x) => n + x.visible.length, 0);
      return [...acc, { ...g, visible: g.items.slice(0, Math.max(0, sideLimit - used)) }];
    }, [])
    .filter((g) => g.visible.length);
  return (
    <article
      className="aw hb-card aw-watch"
      data-variant="glass"
      data-tier={top!.tier}
      data-layout={layout}
      data-has-list={groups.length ? '' : undefined}
      data-testid="aw-watch"
    >
      <style>{anomalyStyles}</style>
      <div className="aw-watch-primary">
        <div className="aw-watch-head">
          <span className="aw-orb" data-tone={TIER_TONE[top!.tier]}>
            <Glyph name={reportGlyph(top!)} size={22} />
          </span>
          <span className="aw-eyebrow">Hlídání domu</span>
          {/* kiosk: the pill sits in the eyebrow row, so the big title never wraps around it, and
              carries the count („3 podezření“) – the wall tablet has no detail to open */}
          {kiosk && <TierPill tier={top!.tier} label={tierCount(snap.counts, top!.tier)} />}
        </div>
        <div className="aw-watch-titlerow">
          <h2 className="aw-watch-title" data-testid="aw-watch-title">
            {headline(top!)}
          </h2>
          {!kiosk && <TierPill tier={top!.tier} />}
        </div>
        <p className="aw-watch-context" data-testid="aw-watch-meta">
          {meta(top!, clock)
            .split(' · ')
            .map((part, i) => (
              <span key={i} className="aw-part">
                {i > 0 && <span className="aw-sep"> · </span>}
                {part}
              </span>
            ))}
        </p>
        <div className="aw-watch-foot">
          {!kiosk && (
            <Button
              variant={top!.tier === 'confirmed' ? 'primary' : 'secondary'}
              className="aw-cta"
              data-tone={top!.tier}
              data-testid="aw-watch-cta"
              onClick={() => navigatePanel(ANOMALY_PATH)}
            >
              Otevřít hlídání
            </Button>
          )}
          <span className="aw-muted" data-testid="aw-watch-inventory">
            {affectedInventory(
              (snap.reports ?? []).filter((r) => r.hidden === null),
              snap.watched,
            )}
          </span>
        </div>
      </div>
      {groups.length > 0 && (
        <div className="aw-watch-list" data-testid="aw-watch-list">
          {groups.map(({ tier, items, visible }) => {
            return (
              <section key={tier}>
                <h3>
                  {GROUP_TITLE[tier]} ({items.length})
                </h3>
                {visible.map((r) =>
                  kiosk ? (
                    // The wall tablet cannot open the detail: a plain, muted row.
                    <StatusRow
                      key={r.key}
                      icon={<Glyph name={reportGlyph(r)} size={18} />}
                      tone={TIER_TONE[r.tier]}
                      label={headline(r)}
                      detail={rowDetail(r, clock)}
                      value={null}
                      data-testid="aw-watch-item"
                    />
                  ) : (
                    // Same look as a StatusRow, but the whole row opens the detail (chevron).
                    <button
                      key={r.key}
                      type="button"
                      className="hb-status-row aw-watch-row"
                      data-rich=""
                      data-tone={TIER_TONE[r.tier]}
                      data-testid="aw-watch-item"
                      onClick={() => navigatePanel(ANOMALY_PATH)}
                    >
                      <span className="hb-status-row-icon" aria-hidden="true">
                        <Glyph name={reportGlyph(r)} size={18} />
                      </span>
                      <span className="hb-status-row-copy">
                        <span className="hb-status-row-label">{headline(r)}</span>
                        <small>{rowDetail(r, clock)}</small>
                      </span>
                      <RowChevron />
                    </button>
                  ),
                )}
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}
