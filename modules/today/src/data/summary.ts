import type { RankResult, RankedSignal } from '@homebrain/signals';
import type { TodayData } from './types.js';
import { TIME_ZONE } from './types.js';
import { localHourFraction } from './time.js';

/** Information already represented by the hero, cards or ribbon has one home. Refs #37. */
export function summaryCandidates(data: TodayData, ranked: RankResult): RankedSignal[] {
  const shown = new Set(
    [ranked.hero, ...ranked.cards].filter((s) => s !== null).map((s) => s.module),
  );
  return [...ranked.info, ...ranked.calm].filter((signal) => {
    if (
      shown.has(signal.module) ||
      signal.kind === 'event' ||
      /°\s*[Cc]/.test(signal.title) ||
      ['system', 'weather', 'calendar'].includes(signal.module)
    )
      return false;
    const kind =
      signal.module === 'waste'
        ? 'waste'
        : signal.module === 'energy' && signal.kind === 'window'
          ? 'cheap'
          : undefined;
    return !kind || !data.ribbon.some((item) => item.kind === kind);
  });
}
/**
 * `suppressCalm`: something needs action outside the signals (meat to take off the heat) —
 * the calm mood („Klidný den/večer“) is dropped; an empty sentence hides the summary.
 */
export function buildSummary(
  data: TodayData,
  ranked: RankResult,
  { suppressCalm = false }: { suppressCalm?: boolean } = {},
) {
  const hour = localHourFraction(data.now, TIME_ZONE);
  const critical = ranked.all.some((s) => s.severity === 'critical');
  const warning = ranked.all.some((s) => s.severity === 'warning');
  const mood = critical
    ? 'Kritická situace'
    : warning
      ? hour < 12
        ? 'Rušné ráno'
        : 'Pozor'
      : hour >= 18 || hour < 6
        ? 'Klidný večer'
        : 'Klidný den';
  const signal = summaryCandidates(data, ranked).find((s) => s.severity === 'info');
  const calm = !critical && !warning;
  if (calm && suppressCalm)
    return {
      sentence: signal?.title ?? '',
      signalId: signal?.id,
      footer: { hiddenCount: ranked.more },
    };
  return {
    sentence: signal ? `${mood} · ${signal.title}` : mood,
    signalId: signal?.id,
    footer: { hiddenCount: ranked.more },
  };
}
