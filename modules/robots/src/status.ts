/** Roborock status enum (HA `sensor.*_status`) / vacuum state → Czech label and visual tone. */
export type RobotTone =
  | 'cleaning'
  | 'returning'
  | 'charging'
  | 'docked'
  | 'emptying'
  | 'washing'
  | 'paused'
  | 'error'
  | 'offline'
  | 'idle';

export interface RobotStatus {
  code: string;
  label: string;
  tone: RobotTone;
  /** Robot is out of the dock doing something (pause/return actions make sense). */
  busy: boolean;
}

const S: Record<string, [string, RobotTone]> = {
  starting: ['Startuje', 'cleaning'],
  cleaning: ['Uklízí', 'cleaning'],
  spot_cleaning: ['Uklízí místo', 'cleaning'],
  zoned_cleaning: ['Uklízí zónu', 'cleaning'],
  segment_cleaning: ['Uklízí místnosti', 'cleaning'],
  robot_status_mopping: ['Mopuje', 'cleaning'],
  clean_mop_cleaning: ['Vysává a mopuje', 'cleaning'],
  clean_mop_mopping: ['Mopuje', 'cleaning'],
  segment_mopping: ['Mopuje místnosti', 'cleaning'],
  segment_clean_mop_cleaning: ['Vysává a mopuje místnosti', 'cleaning'],
  segment_clean_mop_mopping: ['Mopuje místnosti', 'cleaning'],
  zoned_mopping: ['Mopuje zónu', 'cleaning'],
  zoned_clean_mop_cleaning: ['Vysává a mopuje zónu', 'cleaning'],
  zoned_clean_mop_mopping: ['Mopuje zónu', 'cleaning'],
  going_to_target: ['Jede na místo', 'cleaning'],
  mapping: ['Mapuje byt', 'cleaning'],
  patrol: ['Hlídkuje', 'cleaning'],
  remote_control_active: ['Dálkové ovládání', 'cleaning'],
  manual_mode: ['Ruční režim', 'cleaning'],
  egg_attack: ['Uklízí', 'cleaning'],
  returning_home: ['Vrací se do doku', 'returning'],
  docking: ['Zajíždí do doku', 'returning'],
  going_to_wash_the_mop: ['Jede si vyprat mop', 'returning'],
  back_to_dock_washing_duster: ['Jede si vyprat mop', 'returning'],
  charging: ['Nabíjí se', 'charging'],
  charging_complete: ['Nabito, čeká v doku', 'docked'],
  emptying_the_bin: ['Vysypává koš', 'emptying'],
  washing_the_mop: ['Pere mop', 'washing'],
  air_drying_stopping: ['Suší mop', 'washing'],
  attaching_the_mop: ['Nasazuje mop', 'washing'],
  detaching_the_mop: ['Sundává mop', 'washing'],
  paused: ['Pozastaveno', 'paused'],
  idle: ['Čeká', 'idle'],
  in_call: ['Hovor', 'idle'],
  error: ['Potřebuje pomoc', 'error'],
  charging_problem: ['Nenabíjí se', 'error'],
  charger_disconnected: ['Mimo dok', 'idle'],
  locked: ['Zamčeno', 'error'],
  updating: ['Aktualizuje firmware', 'docked'],
  shutting_down: ['Vypíná se', 'offline'],
  device_offline: ['Nedostupný', 'offline'],
};

/** Fallback from the generic HA vacuum state when no status sensor is bound. */
const VACUUM: Record<string, string> = {
  cleaning: 'cleaning',
  docked: 'charging_complete',
  returning: 'returning_home',
  paused: 'paused',
  idle: 'idle',
  error: 'error',
};

export function describeStatus(
  statusSensor: string | null | undefined,
  vacuumState: string | null | undefined,
): RobotStatus {
  let code = (statusSensor ?? '').toLowerCase();
  if (!(code in S)) code = VACUUM[(vacuumState ?? '').toLowerCase()] ?? '';
  if (!code)
    return {
      code: vacuumState ?? 'unavailable',
      label: 'Nedostupný',
      tone: 'offline',
      busy: false,
    };
  const [label, tone] = S[code]!;
  return {
    code,
    label,
    tone,
    busy: tone === 'cleaning' || tone === 'returning' || tone === 'paused',
  };
}
