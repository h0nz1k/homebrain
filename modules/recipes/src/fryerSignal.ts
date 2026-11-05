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
      ? 'Vytáhněte šuplík, protřepejte nebo otočte jídlo a vraťte ho zpět.'
      : model.phase === 'drawer'
        ? 'Fritéza čeká – po protřepání šuplík zasuňte, pečení pokračuje.'
        : model.phase === 'done'
          ? 'Pečení doběhlo, jídlo můžete vyndat.'
          : model.phase === 'warm'
            ? 'Jídlo se udržuje teplé.'
            : model.phase === 'error'
              ? 'Fritéza hlásí chybu, zkontrolujte ji.'
              : [temp, left ? `zbývá ${left}` : null].filter(Boolean).join(' · ');
  return [
    {
      id: 'recipes.airfryer',
      module: 'recipes',
      group: 'recipes.airfryer',
      kind: 'state',
      // Shake/turn and drawer-out are time-critical in the kitchen: warning puts them in the hero.
      severity:
        model.phase === 'error' || model.phase === 'action' || model.phase === 'drawer'
          ? 'warning'
          : urgent
            ? 'notice'
            : 'info',
      tone: model.phase === 'error' ? 'risk' : 'neutral',
      relevance: urgent ? 0.8 : 0.45,
      valid_from: new Date(now - 60_000).toISOString(),
      valid_to: new Date(now + 15 * 60_000).toISOString(),
      title: `Fritéza · ${model.label}`,
      context,
      ...(left ? { value: { v: left, label: 'zbývá' } } : {}),
      action: { type: 'navigate', label: 'Recepty', href: RECIPES_PATH },
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
