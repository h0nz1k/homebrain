import type { EntityStore } from '@homebrain/ha-client';
import type { Signal } from '@homebrain/signals';
import {
  detectFryerEntities,
  formatCountdown,
  fryerModel,
  fryerNeedsAction,
  fryerVisible,
  type FryerEntities,
  type FryerModel,
  type FryerRole,
  type FryerStates,
} from './domain/fryerLive.js';

const RECIPES_PATH = '/homebrain-recepty';

/** Short act-now titles: the Dnes hero must stay two lines on a 390 px phone. */
const SIGNAL_TITLE: Partial<Record<FryerModel['phase'], string>> = {
  action: 'Protřepejte jídlo',
  drawer: 'Zasuňte šuplík',
};

/** Read every resolved fryer entity from the store. */
export function readFryerStates(
  store: Pick<EntityStore, 'getSnapshot'>,
  entities: FryerEntities,
): FryerStates {
  const out: FryerStates = {};
  for (const [role, id] of Object.entries(entities) as Array<[FryerRole, string]>) {
    out[role] = store.getSnapshot(id) as FryerStates[FryerRole];
  }
  return out;
}

/** Dnes signal while the fryer runs or needs someone; [] when off/idle. */
export function fryerSignals(model: FryerModel | null, now: number): Signal[] {
  if (!model || !fryerVisible(model.phase)) return [];
  const urgent = fryerNeedsAction(model.phase);
  const left =
    model.remainingS !== null && model.phase !== 'done' && model.phase !== 'warm'
      ? formatCountdown(model.remainingS)
      : null;
  const temp =
    model.currentTemp !== null
      ? `${Math.round(model.currentTemp)}${model.targetTemp ? ` / ${Math.round(model.targetTemp)}` : ''} °C`
      : null;
  const context =
    model.phase === 'action'
      ? 'Šuplík ven, protřepat nebo otočit a zpět – pečení pak samo pokračuje.'
      : model.phase === 'drawer'
        ? 'Pečení stojí, dokud šuplík nezasunete.'
        : model.phase === 'done'
          ? 'Pečení doběhlo, jídlo můžete vyndat.'
          : model.phase === 'warm'
            ? 'Jídlo se udržuje teplé.'
            : model.phase === 'error'
              ? 'Fritéza hlásí chybu, zkontrolujte ji.'
              : [temp, left ? `do konce ${left}` : null].filter(Boolean).join(' · ');
  return [
    {
      id: 'recipes.airfryer',
      module: 'recipes',
      group: 'recipes.airfryer',
      kind: 'state',
      // Shake/turn, drawer out, done and error need a hand now: warning hero above the ribbon.
      // A running fryer (preheat, cooking, keep warm) stays a visible card with the countdown.
      severity: urgent ? 'warning' : 'notice',
      ...(urgent ? { immediate: true } : {}),
      tone: model.phase === 'error' ? 'risk' : 'neutral',
      relevance: urgent ? 0.9 : 0.6,
      valid_from: new Date(now - 60_000).toISOString(),
      valid_to: new Date(now + 15 * 60_000).toISOString(),
      title: `Fritéza · ${SIGNAL_TITLE[model.phase] ?? model.label}`,
      context,
      ...(left ? { value: { v: left, label: 'do konce' } } : {}),
      action: { type: 'navigate', label: 'Otevřít fritézu', href: RECIPES_PATH },
      source: { name: 'Fritéza', updated_at: new Date(now).toISOString(), stale_after_s: 300 },
    },
  ];
}

export interface FryerSignalFeed {
  subscribe: (cb: (signals: Signal[]) => void) => () => void;
}

/**
 * Dnes signal source (registered by the panel): follows the entity store, so the card appears
 * with the first HA update after the fryer starts and disappears when it is switched off.
 */
export function recipesFryerTodaySignalSource(
  context?: { store?: EntityStore; bindings?: Record<string, string> },
  options: { clock?: () => number } = {},
): FryerSignalFeed | null {
  const store = context?.store;
  if (!store) return null;
  const { clock = Date.now } = options;
  return {
    subscribe: (cb) => {
      let last = '';
      const emit = () => {
        const entities = detectFryerEntities(store.entityIds(), context?.bindings);
        const model = entities ? fryerModel(readFryerStates(store, entities), clock()) : null;
        const signals = fryerSignals(model, clock());
        const key = JSON.stringify(signals.map((s) => [s.title, s.context, s.value?.v]));
        if (key !== last) {
          last = key;
          cb(signals);
        }
      };
      emit();
      return store.subscribeAll(emit);
    },
  };
}
