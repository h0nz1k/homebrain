import { fold, reasonCs } from './domain.js';
import type { Modality } from './types.js';

/**
 * Live enrolment progress from BioLock firmware (biolock-firmware#9, `esphome.biolock_enroll_progress`
 * + `sensor.biolock_prubeh_zapisu`). Older firmware sends none of it – the panel then keeps the
 * pending → result banner driven by `enrolled` / `enroll_retry`.
 */
export type ProgressState =
  | 'armed'
  | 'waiting_presence'
  | 'detected'
  | 'capturing'
  | 'saving'
  | 'retrying'
  | 'done'
  | 'failed';
const STATES: ReadonlySet<string> = new Set<ProgressState>([
  'armed',
  'waiting_presence',
  'detected',
  'capturing',
  'saving',
  'retrying',
  'done',
  'failed',
]);

export interface EnrollProgressData {
  request_id?: string;
  modality?: string;
  state?: string;
  hint?: string;
  remaining_s?: number;
  text?: string;
  name?: string;
  reason?: string;
  ts?: string;
}

export interface ProgressTrack {
  requestId: string;
  modality?: Modality;
  name: string;
  state: ProgressState;
  hint: string;
  /** Firmware Czech text (same as `sensor.biolock_napoveda_zapisu`). */
  text: string;
  reason?: string;
  /** Seconds left at `receivedAt` (null = unknown). */
  remaining: number | null;
  /** Longest remaining seen = the enrolment window (countdown ring scale). */
  total: number | null;
  receivedAt: number;
  startedAt: number;
  /** Furthest step reached (0 Připraveno … 4 Hotovo) – failed marks it as the error step. */
  reached: number;
  /** Set when the panel started this enrolment (= the expectation's `at`). */
  own?: number;
}

/** The panel just asked the firmware to enrol `name`/`modality` (request_id is firmware-made). */
export interface ProgressExpect {
  name: string;
  modality: Modality;
  at: number;
}
const EXPECT_MS = 60_000;

const asModality = (m: string | undefined): Modality | undefined =>
  m === 'face' || m === 'palm' ? m : undefined;
const STEP_OF: Record<ProgressState, number> = {
  armed: 0,
  waiting_presence: 0,
  detected: 1,
  retrying: 1,
  capturing: 2,
  saving: 3,
  done: 4,
  failed: -1,
};

export const isActive = (t: ProgressTrack | null | undefined): boolean =>
  Boolean(t) && t!.state !== 'done' && t!.state !== 'failed';

export function progressReducer(
  prev: ProgressTrack | null,
  input: { time: string | number; data: EnrollProgressData },
  expect?: ProgressExpect | null,
): ProgressTrack | null {
  const d = input.data;
  if (!d.state || !STATES.has(d.state)) return prev; // idle / unknown
  const state = d.state as ProgressState;
  const now = typeof input.time === 'number' ? input.time : Date.parse(input.time);
  const rid = d.request_id || prev?.requestId || 'unknown';
  const same = prev && prev.requestId === rid;
  // ordered per request: nothing after the result (late duplicates, reconnect replays)
  if (same && !isActive(prev) && state !== 'done' && state !== 'failed') return prev;
  const remaining =
    state === 'done' || state === 'failed'
      ? 0
      : typeof d.remaining_s === 'number' && Number.isFinite(d.remaining_s)
        ? Math.max(0, d.remaining_s)
        : same
          ? remainingAt(prev, now)
          : null;
  const step = STEP_OF[state];
  if (same) {
    return {
      ...prev,
      modality: asModality(d.modality) ?? prev.modality,
      name: d.name ?? prev.name,
      state,
      hint: d.hint ?? (state === prev.state ? prev.hint : ''),
      text: d.text ?? (state === prev.state ? prev.text : ''),
      reason: d.reason ?? (state === 'failed' ? d.hint : undefined),
      remaining,
      total: Math.max(prev.total ?? 0, remaining ?? 0) || null,
      receivedAt: now,
      reached: Math.max(prev.reached, step),
    };
  }
  const modality = asModality(d.modality);
  const name = d.name ?? '';
  const own =
    expect &&
    modality === expect.modality &&
    fold(name) === fold(expect.name) &&
    now - expect.at < EXPECT_MS &&
    now >= expect.at - 5000
      ? expect.at
      : undefined;
  return {
    requestId: rid,
    modality,
    name,
    state,
    hint: d.hint ?? '',
    text: d.text ?? '',
    reason: d.reason ?? (state === 'failed' ? d.hint : undefined),
    remaining,
    total: remaining || null,
    receivedAt: now,
    startedAt: now,
    reached: Math.max(0, step),
    ...(own !== undefined ? { own } : {}),
  };
}

/** Smooth local countdown between the ~1/s firmware updates (seconds, fractional). */
export function remainingAt(t: ProgressTrack | null | undefined, now: number): number | null {
  if (!t || !isActive(t) || t.remaining === null) return null;
  return Math.max(0, t.remaining - (now - t.receivedAt) / 1000);
}

const HINT_CS: Record<string, string> = {
  hold_still: 'Vidím obličej – nehýbej se',
  no_face: 'Nevidím obličej – postav se před snímač',
  move_down: 'Posuň obličej níž',
  move_up: 'Posuň obličej výš',
  move_left: 'Posuň obličej doprostřed před snímač',
  move_right: 'Posuň obličej doprostřed před snímač',
  too_far: 'Přibliž se',
  too_close: 'Jsi moc blízko – oddal se',
  occluded: 'Odkryj obličej (vlasy, brýle, rouška)',
  turn_head: 'Dívej se přímo do snímače',
  show_palm: 'Ukaž dlaň snímači',
  face_not_palm: 'Vidím obličej – schovej ho a ukaž dlaň',
};
/** Left/right is in sensor coordinates and unverified on hardware: never show a direction. */
const GENERIC_HINTS = new Set(['move_left', 'move_right']);

function stateText(t: ProgressTrack): string {
  const palm = t.modality === 'palm';
  switch (t.state) {
    case 'armed':
      return 'Připravuji snímač…';
    case 'waiting_presence':
      return palm ? 'Ukaž dlaň snímači' : 'Postav se před snímač';
    case 'detected':
      return HINT_CS[t.hint] ?? (palm ? 'Ukaž dlaň snímači' : 'Postav se před snímač');
    case 'capturing':
      return palm ? 'Vidím dlaň – nehýbej se' : 'Vidím obličej – nehýbej se';
    case 'saving':
      return 'Ukládám…';
    case 'retrying':
      return palm
        ? 'Zachycen obličej místo dlaně – zkouším znovu'
        : 'Zachycena dlaň místo obličeje – zkouším znovu';
    case 'done':
      return 'Hotovo – zapsáno';
    case 'failed':
      return reasonCs(t.reason).text;
  }
}

const DETAIL_CS: Partial<Record<ProgressState, string>> = {
  armed: 'Snímač přepíná do zápisu, chvilku strpení.',
  waiting_presence: 'Snímač zatím nic nevidí.',
  detected: 'Snímač něco vidí, ještě drobná korekce.',
  capturing: 'Snímač zachytává – vydrž, dokud nebude hotovo.',
  saving: 'Zachyceno, ukládám do paměti snímače.',
  retrying: 'Okno zápisu běží dál, zkus to ještě jednou.',
};

export interface ProgressCopy {
  tone: 'busy' | 'ok' | 'error';
  /** Big state line (firmware text when present). */
  title: string;
  detail?: string;
}
export function progressCopy(t: ProgressTrack): ProgressCopy {
  const generic = t.state === 'detected' && GENERIC_HINTS.has(t.hint);
  if (t.state === 'failed') {
    const r = reasonCs(t.reason);
    return { tone: 'error', title: t.text || r.text, detail: r.tip };
  }
  const title = generic ? HINT_CS[t.hint]! : t.text || stateText(t);
  return {
    tone: t.state === 'done' ? 'ok' : 'busy',
    title,
    detail: DETAIL_CS[t.state],
  };
}

const STEP_TITLES = ['Připraveno', 'Vidím', 'Snímám', 'Ukládám', 'Hotovo'] as const;
export type ProgressStepState = 'todo' | 'active' | 'done' | 'error';
export function progressSteps(t: ProgressTrack) {
  const cur = t.state === 'failed' ? t.reached : STEP_OF[t.state];
  return STEP_TITLES.map((title, i) => {
    const state: ProgressStepState =
      t.state === 'done'
        ? 'done'
        : i < cur
          ? 'done'
          : i === cur
            ? t.state === 'failed'
              ? 'error'
              : 'active'
            : 'todo';
    return { key: `enrol-${i}`, title, state };
  });
}

/** Panel opened mid-enrolment and the event stream started later: seed from the entities. */
export function trackFromEntities(
  e: { progress?: string; hint?: string; remaining?: string },
  now: number,
): ProgressTrack | null {
  if (!e.progress || !STATES.has(e.progress)) return null;
  const t = progressReducer(null, {
    time: now,
    data: {
      request_id: 'entity',
      state: e.progress,
      text: e.hint && e.hint !== 'unknown' && e.hint !== 'unavailable' ? e.hint : undefined,
      remaining_s:
        e.remaining !== undefined && e.remaining !== '' ? Number(e.remaining) : undefined,
    },
  });
  return isActive(t) ? t : null;
}

/** The firmware refused because service mode is off → offer to switch it on (with confirm). */
export const needsServiceMode = (reason: string | undefined) =>
  reason === 'service_mode_off' || reason === 'service_mode_required';

/** An `enrolled` result at `time` belongs to this progress track (not an older enrolment). */
export const sameEnrolment = (t: ProgressTrack, time: string) =>
  Date.parse(time) >= t.startedAt - 2000;

/** Czech diagnostics label for `sensor.biolock_prubeh_zapisu`. */
export const PROGRESS_STATE_CS: Record<string, string> = {
  idle: 'Nic neprobíhá',
  armed: 'Připravuje snímač',
  waiting_presence: 'Čeká na osobu',
  detected: 'Vidí, radí korekci',
  capturing: 'Snímá',
  saving: 'Ukládá',
  retrying: 'Zkouší znovu',
  done: 'Poslední zápis hotový',
  failed: 'Poslední zápis selhal',
};
