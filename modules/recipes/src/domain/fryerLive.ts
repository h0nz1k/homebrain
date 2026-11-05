/**
 * Live airfryer state (Philips HomeID integration and compatible entity sets).
 *
 * Entities are found by suffix next to the `*_cooking_status` sensor, so no household
 * entity ids live in the repo; an explicit `recipes_airfryer_status` binding wins.
 * Status values come from the integration (standby, idle, mainmenu, setting, precook,
 * parasetting, cooking, pause, user_action, maintain, finish, powersave, pairing).
 * Observed on a real cook: mainmenu → cooking → user_action (only while the drawer is out,
 * the device pauses) → cooking … → finish/maintain.
 */
export interface FryerStateLike {
  state: string;
  last_updated?: string;
  last_changed?: string;
  attributes?: Record<string, unknown>;
}

export type FryerRole =
  | 'status'
  | 'remaining'
  | 'total'
  | 'currentTemp'
  | 'targetTemp'
  | 'stage'
  | 'program'
  | 'method'
  | 'preheat'
  | 'drawer'
  | 'error'
  | 'power'
  | 'pause'
  | 'stop'
  | 'keepWarm';

/** Entity id = `<domain>.<prefix>_<suffix>` where prefix comes from the status sensor. */
export const FRYER_SUFFIXES: Record<FryerRole, readonly [domain: string, suffix: string]> = {
  status: ['sensor', 'cooking_status'],
  remaining: ['sensor', 'time_remaining'],
  total: ['sensor', 'total_cook_time'],
  currentTemp: ['sensor', 'current_temperature'],
  targetTemp: ['sensor', 'target_temperature'],
  stage: ['sensor', 'current_stage'],
  program: ['sensor', 'autocook_program'],
  method: ['select', 'cooking_method'],
  preheat: ['sensor', 'preheat_status'],
  drawer: ['binary_sensor', 'drawer'],
  error: ['sensor', 'error_code'],
  power: ['switch', 'power'],
  pause: ['button', 'pause'],
  stop: ['button', 'stop'],
  keepWarm: ['button', 'keep_warm'],
};

export type FryerEntities = Partial<Record<FryerRole, string>>;

const STATUS_SUFFIX = `_${FRYER_SUFFIXES.status[1]}`;

/**
 * Resolve the fryer entities. `bindings` may carry `recipes_airfryer_status` (status sensor)
 * and the existing `recipes_airfryer_drawer` / `recipes_airfryer_remaining` keys.
 */
export function detectFryerEntities(
  entityIds: Iterable<string>,
  bindings: Record<string, string | undefined> = {},
): FryerEntities | null {
  const ids = new Set(entityIds);
  let status = bindings.recipes_airfryer_status;
  if (!status) {
    status = [...ids]
      .filter((id) => id.startsWith('sensor.') && id.endsWith(STATUS_SUFFIX))
      .sort()[0];
  }
  if (!status || !status.endsWith(STATUS_SUFFIX)) return status ? { status } : null;
  const prefix = status.slice('sensor.'.length, -STATUS_SUFFIX.length);
  const out: FryerEntities = { status };
  for (const [role, [domain, suffix]] of Object.entries(FRYER_SUFFIXES) as Array<
    [FryerRole, readonly [string, string]]
  >) {
    if (role === 'status') continue;
    const id = `${domain}.${prefix}_${suffix}`;
    if (ids.has(id)) out[role] = id;
  }
  if (bindings.recipes_airfryer_drawer) out.drawer = bindings.recipes_airfryer_drawer;
  if (bindings.recipes_airfryer_remaining) out.remaining = bindings.recipes_airfryer_remaining;
  return out;
}

export type FryerPhase =
  | 'off'
  | 'idle'
  | 'preheat'
  | 'cooking'
  | 'action'
  | 'drawer'
  | 'paused'
  | 'done'
  | 'warm'
  | 'error';

export const FRYER_PHASE_LABEL: Record<FryerPhase, string> = {
  off: 'Vypnuto',
  idle: 'Připraveno',
  preheat: 'Předehřívá',
  cooking: 'Peče',
  action: 'Protřepejte jídlo',
  drawer: 'Šuplík otevřený',
  paused: 'Pozastaveno',
  done: 'Hotovo',
  warm: 'Udržuje teplé',
  error: 'Chyba',
};

const UNKNOWN = new Set(['unknown', 'unavailable', '']);

export interface FryerSnapshot {
  status?: FryerStateLike;
  drawer?: FryerStateLike;
  preheat?: FryerStateLike;
  error?: FryerStateLike;
  power?: FryerStateLike;
}

const isOn = (s?: FryerStateLike) =>
  s?.state === 'on' || s?.state === 'True' || s?.state === 'true';

/** Non-zero numeric `error_code` = device error. `product_error` is NOT used (undocumented flag). */
export function fryerErrorCode(error?: FryerStateLike): number | null {
  if (!error || UNKNOWN.has(error.state)) return null;
  const n = Number(error.state);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function fryerPhase(s: FryerSnapshot): FryerPhase {
  const status = s.status?.state ?? '';
  if (fryerErrorCode(s.error) !== null) return 'error';
  if (UNKNOWN.has(status) || s.power?.state === 'off') return 'off';
  const drawerOpen = isOn(s.drawer);
  switch (status) {
    case 'cooking':
      if (drawerOpen) return 'drawer';
      return isOn(s.preheat) ? 'preheat' : 'cooking';
    case 'user_action':
      // The device asks to shake/turn; once the drawer is out it waits for it to go back.
      return drawerOpen ? 'drawer' : 'action';
    case 'pause':
      return drawerOpen ? 'drawer' : 'paused';
    case 'finish':
      return 'done';
    case 'maintain':
      return 'warm';
    default:
      // standby, idle, mainmenu, setting, precook, … and any future value: nothing to show.
      return 'idle';
  }
}

/** Phases shown in Recepty / Dnes (off and idle stay hidden). */
export function fryerVisible(phase: FryerPhase): boolean {
  return phase !== 'off' && phase !== 'idle';
}

/** Phases that need someone in the kitchen. */
export function fryerNeedsAction(phase: FryerPhase): boolean {
  return phase === 'action' || phase === 'drawer' || phase === 'done' || phase === 'error';
}

const num = (s?: FryerStateLike): number | null => {
  if (!s || UNKNOWN.has(s.state)) return null;
  const n = Number(s.state);
  return Number.isFinite(n) ? n : null;
};

/**
 * Seconds left at `now`: the sensor value minus the time since HA last wrote it, so the
 * countdown runs smoothly between polls (10 s while cooking). Frozen when not counting down.
 */
export function fryerRemaining(
  remaining: FryerStateLike | undefined,
  phase: FryerPhase,
  now: number,
): number | null {
  const value = num(remaining);
  if (value === null) return null;
  if (phase !== 'cooking' && phase !== 'preheat') return Math.max(0, Math.round(value));
  const stamp = Date.parse(remaining?.last_updated ?? remaining?.last_changed ?? '');
  const elapsed = Number.isFinite(stamp) ? Math.max(0, (now - stamp) / 1000) : 0;
  return Math.max(0, Math.round(value - Math.min(elapsed, 60)));
}

/** 0…1 share of the cook already done (`total` in minutes). */
export function fryerProgress(remainingS: number | null, totalMin: number | null): number | null {
  if (remainingS === null || !totalMin || totalMin <= 0) return null;
  return Math.max(0, Math.min(1, 1 - remainingS / (totalMin * 60)));
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export interface FryerModel {
  phase: FryerPhase;
  label: string;
  remainingS: number | null;
  progress: number | null;
  currentTemp: number | null;
  targetTemp: number | null;
  stage: number | null;
  program: number | null;
  method: string | null;
  errorCode: number | null;
}

export type FryerStates = Partial<Record<FryerRole, FryerStateLike | undefined>>;

const METHOD_LABEL: Record<string, string> = {
  manual: 'Ruční',
  auto_cook: 'AutoCook',
  keep_warm: 'Udržování',
  recipe: 'Recept',
};

export function fryerModel(states: FryerStates, now: number): FryerModel {
  const phase = fryerPhase(states);
  const remainingS = fryerRemaining(states.remaining, phase, now);
  const method = states.method && !UNKNOWN.has(states.method.state) ? states.method.state : null;
  const errorCode = fryerErrorCode(states.error);
  return {
    phase,
    label: errorCode !== null ? `Chyba ${errorCode}` : FRYER_PHASE_LABEL[phase],
    remainingS,
    progress: phase === 'done' ? 1 : fryerProgress(remainingS, num(states.total)),
    currentTemp: num(states.currentTemp),
    targetTemp: num(states.targetTemp),
    stage: num(states.stage) || null,
    program: num(states.program) || null,
    method: method ? (METHOD_LABEL[method] ?? null) : null,
    errorCode,
  };
}

/** Short program line: „AutoCook 14 · fáze 2“. */
export function fryerProgramLine(m: FryerModel): string {
  const parts: string[] = [];
  if (m.method)
    parts.push(m.method === 'AutoCook' && m.program ? `AutoCook ${m.program}` : m.method);
  else if (m.program) parts.push(`Program ${m.program}`);
  if (m.stage) parts.push(`fáze ${m.stage}`);
  return parts.join(' · ');
}

export type FryerStepKey = 'preheat' | 'cook' | 'shake' | 'finish' | 'done';
export type FryerStepState = 'todo' | 'active' | 'done' | 'error';
export interface FryerStep {
  key: FryerStepKey;
  title: string;
  state: FryerStepState;
}

/** Phases of this cook seen so far (preheat / shake only appear once they really happened). */
export function fryerSeen(prev: readonly FryerPhase[], phase: FryerPhase): FryerPhase[] {
  if (phase === 'off' || phase === 'idle') return [];
  return prev.includes(phase) ? [...prev] : [...prev, phase];
}

/**
 * Phase timeline: Předehřátí → Pečení → Protřepat → Dopékání → Hotovo, only the phases that
 * exist for this cook (the device does not announce a shake in advance).
 */
export function fryerTimeline(phase: FryerPhase, seen: readonly FryerPhase[]): FryerStep[] {
  const had = (p: FryerPhase) => phase === p || seen.includes(p);
  const shake = had('action') || had('drawer');
  const finished = phase === 'done' || phase === 'warm';
  const current: FryerStepKey =
    phase === 'preheat'
      ? 'preheat'
      : phase === 'action' || phase === 'drawer'
        ? 'shake'
        : finished
          ? 'done'
          : shake
            ? 'finish'
            : 'cook';
  const keys: FryerStepKey[] = [];
  if (had('preheat')) keys.push('preheat');
  keys.push('cook');
  if (shake) keys.push('shake');
  if (shake && (current === 'finish' || finished)) keys.push('finish');
  keys.push('done');
  const title: Record<FryerStepKey, string> = {
    preheat: 'Předehřátí',
    cook: 'Pečení',
    shake: 'Protřepat',
    finish: 'Dopékání',
    done: 'Hotovo',
  };
  const at = keys.indexOf(current);
  return keys.map((key, i) => ({
    key,
    title: title[key],
    state:
      i < at || (finished && key === 'done')
        ? 'done'
        : i === at
          ? phase === 'error'
            ? 'error'
            : 'active'
          : 'todo',
  }));
}

/** Wall-clock time the cook ends („v 18:42“), null when the countdown is not running. */
export function fryerEta(m: FryerModel, now: number): string | null {
  if (m.remainingS === null || (m.phase !== 'cooking' && m.phase !== 'preheat')) return null;
  const d = new Date(now + m.remainingS * 1000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type FryerControl = 'pause' | 'stop' | 'keep_warm';

/** Which controls make sense now (cooking start is never offered from the live card). */
export function fryerControls(phase: FryerPhase): FryerControl[] {
  switch (phase) {
    case 'preheat':
    case 'cooking':
      return ['pause', 'stop'];
    case 'action':
    case 'drawer':
    case 'paused':
      return ['stop'];
    case 'done':
      return ['keep_warm', 'stop'];
    case 'warm':
      return ['stop'];
    default:
      return [];
  }
}
