import type { ConnectionLike } from '@homebrain/ha-client';
import { ServiceNotAllowedError } from '@homebrain/ha-client';

/** Every HA service the Roboti panel may call (AGENTS.md rule 4, label writes-to-ha). */
export const ROBOT_SERVICE_ALLOWLIST = [
  'vacuum.send_command',
  'vacuum.start',
  'vacuum.pause',
  'vacuum.return_to_base',
  'vacuum.set_fan_speed',
  'select.select_option',
] as const;
export type RobotService = (typeof ROBOT_SERVICE_ALLOWLIST)[number];

export interface ServiceCallPlan {
  service: RobotService;
  entityId: string;
  data?: Record<string, unknown>;
  /** Czech line for the confirmation sheet. */
  summary: string;
}

export type CleanMode = 'vacuum' | 'mop' | 'both';
export const CLEAN_MODE_LABELS: Record<CleanMode, string> = {
  vacuum: 'Vysát',
  mop: 'Mopovat',
  both: 'Obojí',
};
const MODE_OPTION: Record<CleanMode, string> = {
  vacuum: 'vacuum',
  mop: 'mop',
  both: 'vac_and_mop',
};

/** Map the select's current option back to a mode (unknown/custom → null). */
export function modeFromOption(option: string | null | undefined): CleanMode | null {
  const entry = Object.entries(MODE_OPTION).find(([, value]) => value === option);
  return entry ? (entry[0] as CleanMode) : null;
}
export function modeOptionAvailable(mode: CleanMode, options: string[]): boolean {
  return options.includes(MODE_OPTION[mode]);
}

export const FAN_LABELS: Record<string, string> = {
  quiet: 'Tiché',
  balanced: 'Vyvážené',
  turbo: 'Turbo',
  max: 'Max',
  max_plus: 'Max+',
  smart_mode: 'Chytré',
};
const CORE_FANS = ['quiet', 'balanced', 'turbo', 'max'];
/** Fan speeds shown as segments in power order: the 4 core ones + the current one (Max+, Chytré). */
export function fanChoices(list: string[], current: string | null = null): string[] {
  return Object.keys(FAN_LABELS).filter(
    (speed) => list.includes(speed) && (CORE_FANS.includes(speed) || speed === current),
  );
}

/**
 * Mop water (HA Roborock `select.*_mop_intensity`, key water_box_mode). Option keys are the
 * integration's state keys; models expose different subsets, shown in this power order.
 */
export const WATER_LABELS: Record<string, string> = {
  off: 'Bez vody',
  slight: 'Minimum',
  min: 'Minimum',
  low: 'Nízká',
  mild: 'Nízká',
  medium: 'Střední',
  moderate: 'Střední',
  standard: 'Střední',
  high: 'Vysoká',
  intense: 'Vysoká',
  max: 'Maximum',
  extreme: 'Maximum',
  custom: 'Vlastní',
  custom_water_flow: 'Vlastní',
  smart_mode: 'Chytré',
};
/** Mop route (HA Roborock `select.*_mop_mode`): speed vs thoroughness. */
export const MOP_ROUTE_LABELS: Record<string, string> = {
  fast: 'Rychle',
  standard: 'Standardně',
  deep: 'Důkladně',
  deep_plus: 'Důkladně+',
  custom: 'Vlastní',
  smart_mode: 'Chytré',
};
const WATER_CORE = [
  'off',
  'slight',
  'min',
  'low',
  'mild',
  'medium',
  'moderate',
  'standard',
  'high',
  'intense',
  'max',
  'extreme',
];
const ROUTE_CORE = ['fast', 'standard', 'deep', 'deep_plus'];
/**
 * Segments for a select: known options in power order (app-only modes like „custom“ only
 * when they are the current value), at most one option per label (mild/low both = „Nízká“).
 */
export function selectChoices(
  options: string[],
  current: string | null,
  labels: Record<string, string>,
  core: string[],
): string[] {
  const seen = new Set<string>();
  return Object.keys(labels).filter((key) => {
    if (!options.includes(key) || !(core.includes(key) || key === current)) return false;
    const label = labels[key]!;
    if (seen.has(label) && key !== current) return false;
    seen.add(label);
    return true;
  });
}
export const waterChoices = (options: string[], current: string | null) =>
  selectChoices(options, current, WATER_LABELS, WATER_CORE);
export const mopRouteChoices = (options: string[], current: string | null) =>
  selectChoices(options, current, MOP_ROUTE_LABELS, ROUTE_CORE);
export const modeMops = (mode: CleanMode | null) => mode === 'mop' || mode === 'both';

/** One optional select change („Voda: Vysoká“) – only when the value really changes. */
export interface SelectChange {
  entity: string | null;
  value: string | null;
  current: string | null;
}

export interface CleanPlanInput {
  vacuum: string;
  rooms: { id: number; name: string }[];
  mode: CleanMode | null;
  currentMode: CleanMode | null;
  modeSelect: string | null;
  fan: string | null;
  currentFan: string | null;
  /** Passes per room (`repeat` of app_segment_clean, 1–3 in the Roborock app). */
  repeat?: number;
  water?: SelectChange;
  mopRoute?: SelectChange;
}

/** „Uklidit vybrané“: optional mode + suction change, then rooms in the chosen order. */
export function planCleanRooms(input: CleanPlanInput): ServiceCallPlan[] {
  const plan: ServiceCallPlan[] = [];
  if (input.mode && input.modeSelect && input.mode !== input.currentMode)
    plan.push({
      service: 'select.select_option',
      entityId: input.modeSelect,
      data: { option: MODE_OPTION[input.mode] },
      summary: `Režim: ${CLEAN_MODE_LABELS[input.mode]}`,
    });
  if (input.fan && input.fan !== input.currentFan)
    plan.push({
      service: 'vacuum.set_fan_speed',
      entityId: input.vacuum,
      data: { fan_speed: input.fan },
      summary: `Sání: ${FAN_LABELS[input.fan] ?? input.fan}`,
    });
  // Water + mop route only matter when the run mops.
  const mops = modeMops(input.mode ?? input.currentMode);
  for (const [change, title, labels] of [
    [input.water, 'Voda', WATER_LABELS],
    [input.mopRoute, 'Mopování', MOP_ROUTE_LABELS],
  ] as const)
    if (mops && change?.entity && change.value && change.value !== change.current)
      plan.push({
        service: 'select.select_option',
        entityId: change.entity,
        data: { option: change.value },
        summary: `${title}: ${labels[change.value] ?? change.value}`,
      });
  if (input.rooms.length)
    plan.push({
      service: 'vacuum.send_command',
      entityId: input.vacuum,
      data: {
        command: 'app_segment_clean',
        params: [{ segments: input.rooms.map((room) => room.id), repeat: input.repeat ?? 1 }],
      },
      summary: `Uklidit: ${input.rooms.map((room, index) => `${index + 1}. ${room.name}`).join(' → ')}${(input.repeat ?? 1) > 1 ? ` · ${input.repeat}× každou` : ''}`,
    });
  return plan;
}

export function planSimple(action: 'pause' | 'resume' | 'home', vacuum: string): ServiceCallPlan[] {
  const map = {
    pause: ['vacuum.pause', 'Pozastavit úklid'],
    resume: ['vacuum.start', 'Pokračovat v úklidu'],
    home: ['vacuum.return_to_base', 'Poslat zpět do doku'],
  } as const;
  const [service, summary] = map[action];
  return [{ service, entityId: vacuum, summary }];
}

/**
 * „Hotovo – pokračovat“ under a robot error: the user confirms the fix (brush freed, tank
 * emptied …) and the robot resumes via the allowlisted `vacuum.start`. Nothing is sent
 * before the confirmation sheet; the error itself is cleared by the robot, not by us.
 */
export function planResumeAfterFix(vacuum: string, problem: string): ServiceCallPlan[] {
  return [
    {
      service: 'vacuum.start',
      entityId: vacuum,
      summary: `Závada „${problem}“ je odstraněná – pokračovat v úklidu`,
    },
  ];
}

/** Sends the plan in order through HA `call_service`; rejects anything off the allowlist. */
export async function runPlan(connection: ConnectionLike, plan: ServiceCallPlan[]): Promise<void> {
  const allowed = new Set<string>(ROBOT_SERVICE_ALLOWLIST);
  for (const step of plan)
    if (!allowed.has(step.service)) throw new ServiceNotAllowedError(step.service);
  for (const step of plan) {
    const [domain, service] = step.service.split('.') as [string, string];
    const message = {
      type: 'call_service',
      domain,
      service,
      service_data: step.data ?? {},
      target: { entity_id: step.entityId },
    };
    await connection.sendMessagePromise(message);
  }
}
