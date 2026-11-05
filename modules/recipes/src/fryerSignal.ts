import type { ConnectionLike, EntityStore } from '@homebrain/ha-client';
import { getRecipesApi } from './api.js';
import { cachedProgramName, resolveProgramName } from './fryerProgram.js';
import type { Signal } from '@homebrain/signals';
import {
  detectFryerEntities,
  formatCountdown,
  fryerModel,
  fryerNeedsAction,
  fryerProgramLine,
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

/** One short instruction per phase – the same copy in Recepty and on Dnes (vykání). */
export const FRYER_HINT: Partial<Record<FryerModel['phase'], string>> = {
  action: 'Vytáhněte koš, protřepejte nebo otočte jídlo a zasuňte ho zpět. Pečení pak naváže samo.',
  drawer: 'Po protřepání koš zasuňte, fritéza sama naváže.',
  paused: 'Pokračovat lze na fritéze.',
  done: 'Jídlo je hotové, můžete ho vyndat.',
  warm: 'Jídlo se udržuje teplé.',
  error: 'Vypněte fritézu, zkontrolujte koš a zapněte ji znovu. Když chyba trvá, odpojte ji na minutu ze zásuvky.',
};

/** Countdown stopped by the device (drawer out, paused): shown but secondary. */
export const fryerHeld = (phase: FryerModel['phase']) =>
  phase === 'action' || phase === 'drawer' || phase === 'paused';

/** Dnes signal while the fryer runs or needs someone; [] when off/idle. */
export function fryerSignals(
  model: FryerModel | null,
  now: number,
  programName?: string | null,
): Signal[] {
  if (!model || !fryerVisible(model.phase)) return [];
  const urgent = fryerNeedsAction(model.phase);
  const held = fryerHeld(model.phase);
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
      ? 'Vytáhněte koš, protřepejte a zasuňte zpět – pečení naváže samo.'
      : model.phase === 'drawer'
        ? 'Pečení stojí a čeká na vás.'
        : model.phase === 'cooking' || model.phase === 'preheat'
          ? [temp, fryerProgramLine(model, programName)].filter(Boolean).join(' · ')
          : (FRYER_HINT[model.phase] ?? '');
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
      title: `Fritéza · ${
        model.phase === 'error'
          ? `Chyba ${model.errorCode ?? ''}`.trim()
          : (SIGNAL_TITLE[model.phase] ?? model.label)
      }`,
      context,
      ...(left
        ? {
            value: {
              v: left,
              label: held ? (model.phase === 'paused' ? 'pozastaveno' : 'stojí') : 'do konce',
              ...(model.progress !== null ? { progress: model.progress } : {}),
              ...(held ? { held: true } : {}),
            },
          }
        : {}),
      action: { type: 'navigate', label: 'Detail fritézy', href: RECIPES_PATH },
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
  context?: {
    store?: EntityStore;
    bindings?: Record<string, string>;
    connection?: ConnectionLike;
  },
  options: { clock?: () => number } = {},
): FryerSignalFeed | null {
  const store = context?.store;
  if (!store) return null;
  const { clock = Date.now } = options;
  return {
    subscribe: (cb) => {
      let last = '';
      const asked = new Set<number>();
      let closed = false;
      const emit = () => {
        if (closed) return;
        const entities = detectFryerEntities(store.entityIds(), context?.bindings);
        const model = entities ? fryerModel(readFryerStates(store, entities), clock()) : null;
        const program = model?.program ?? null;
        if (program && !cachedProgramName(program) && !asked.has(program)) {
          asked.add(program);
          void resolveProgramName(getRecipesApi(context?.connection), program).then(
            (name) => name && emit(),
          );
        }
        const signals = fryerSignals(model, clock(), cachedProgramName(program));
        const key = JSON.stringify(signals.map((s) => [s.title, s.context, s.value?.v]));
        if (key !== last) {
          last = key;
          cb(signals);
        }
      };
      emit();
      const off = store.subscribeAll(emit);
      return () => {
        closed = true;
        off();
      };
    },
  };
}
