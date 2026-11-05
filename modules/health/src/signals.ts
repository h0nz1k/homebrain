import type { Signal } from '@homebrain/signals';
import { daysCs, hasNoHistory, trainingsCs, weekSlack, weeksCs } from './adapter.js';
import type { HealthModel } from './contract.js';

/**
 * Who is looking. Health data are per person (ADR-0002): only the owning person sees them.
 * Until per-person bindings exist the owning person is the HomeBrain owner; every other
 * audience (shared kiosk, guest, child, other adults) gets nothing – default deny.
 */
export type HealthAudience = 'owner' | 'adult' | 'child' | 'kiosk' | 'guest';

export const canSeeHealth = (audience: HealthAudience | undefined) => audience === 'owner';

/** Kiosk layout detection identical to the shell (`?kiosk=1` or a `/kiosk` path segment). */
export function isKioskLocation(path: string, search: string) {
  if (new URLSearchParams(search).get('kiosk') === '1') return true;
  return path.split('/').filter(Boolean).includes('kiosk');
}

export interface HealthSignalOptions {
  audience?: HealthAudience;
  /** Only warn in the last N days of the period. */
  lateWeekDays?: number;
}

/**
 * Health signals for Dnes (packages/signals format, read-only, navigate action only).
 * Silent unless the audience is the owner and the weekly data are current (`ok`/`partial`).
 * Wording stays generic and non-diagnostic (HEA-012).
 */
export function healthSignals(model: HealthModel, options: HealthSignalOptions = {}): Signal[] {
  const { audience = 'guest', lateWeekDays = 3 } = options;
  if (!canSeeHealth(audience)) return [];
  if ((model.status !== 'ok' && model.status !== 'partial') || model.stale || hasNoHistory(model))
    return [];
  if (model.week.goalMet.value !== false) return [];
  const slack = weekSlack(model);
  if (!slack || slack.remaining === 0 || slack.daysLeft > lateWeekDays) return [];
  const end = model.week.periodEndExclusive!;
  const source = {
    name: 'health_fitness',
    updated_at: model.lastSuccessAt ?? model.updatedAt ?? new Date(model.now).toISOString(),
    stale_after_s: 7 * 86_400,
  };
  const navigate = { type: 'navigate' as const, label: 'Zdraví', href: '/health' };
  const base = {
    module: 'health' as const,
    group: 'health.week',
    kind: 'deadline' as const,
    tone: 'risk' as const,
    valid_from: new Date(model.now).toISOString(),
    valid_to: new Date(Date.parse(end)).toISOString(),
    source,
    action: navigate,
  };
  const { remaining, usableDays } = slack;
  const value = {
    v: `${model.week.completed.value} / ${model.week.target.value}`,
    label: 'silové tréninky',
  };
  const signals: Signal[] = [];
  const left = `Zbývá ${trainingsCs(remaining)}, do konce týdne ${daysCs(slack.daysLeft)}.`;
  if (remaining > usableDays) {
    signals.push({
      ...base,
      id: `health.week.missed.${model.week.periodStart ?? end}`,
      severity: 'info',
      relevance: 0.3,
      title: 'Silové minimum tento týden nevyjde',
      context: left,
      value,
    });
  } else if (remaining === usableDays) {
    signals.push({
      ...base,
      id: `health.week.at_risk.${model.week.periodStart ?? end}`,
      severity: model.trainedToday ? 'notice' : 'warning',
      relevance: 0.6,
      title: model.trainedToday ? 'Zítra silový trénink' : 'Dnes silový trénink',
      context: `${left} Každý zbývající den je potřeba.`,
      value,
    });
  } else if (slack.daysLeft <= 2) {
    signals.push({
      ...base,
      id: `health.week.tight.${model.week.periodStart ?? end}`,
      severity: 'notice',
      relevance: 0.4,
      title: 'Silové minimum se blíží',
      context: left,
      value,
    });
  }
  const streak = model.streakWeeks.value;
  if (signals.length && streak !== null && streak >= 1 && remaining >= usableDays) {
    const lost = remaining > usableDays;
    signals.push({
      ...base,
      id: `health.streak.${lost ? 'ends' : 'at_risk'}.${model.week.periodStart ?? end}`,
      severity: lost ? 'info' : 'notice',
      relevance: 0.5,
      title: lost
        ? `Streak ${weeksCs(streak)} tento týden skončí`
        : `Streak ${weeksCs(streak)} v ohrožení`,
      context: lost
        ? 'Nový streak začne dalším splněným týdnem.'
        : 'Streak drží, pokud stihneš týdenní minimum.',
      value: { v: String(streak), unit: 'týd.', label: 'streak' },
    });
  }
  return signals;
}
