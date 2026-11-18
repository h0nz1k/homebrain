import { createElement, type ComponentType, type ReactNode } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';

/** Level of the Hlídání domu card on Dnes: shown from a suspicion up, `null` = no card. */
export type TodayWatchLevel = 'confirmed' | 'suspicion' | null;

export interface TodayWatchCardProps {
  connection?: ConnectionLike;
  layout: 'kiosk' | 'mobile' | 'desktop';
  onLevel?: (level: TodayWatchLevel) => void;
}

let card: ComponentType<TodayWatchCardProps> | null = null;

/**
 * The panel registers the Hlídání domu card (module `anomaly`); Dnes renders it under the clock,
 * ahead of the everyday cards. Kept as a slot so Dnes does not depend on the module package.
 */
export function setTodayWatchCard(next: ComponentType<TodayWatchCardProps> | null): void {
  card = next;
}

export function getTodayWatchCard(): ComponentType<TodayWatchCardProps> | null {
  return card;
}

/** The registered card as an element (`null` when no module registered one). */
export function renderTodayWatchCard(props: TodayWatchCardProps): ReactNode {
  return card ? createElement(card, props) : null;
}
