export type Severity = 'critical' | 'warning' | 'notice' | 'info' | 'calm';
export const SEVERITY_RANK = { critical: 4, warning: 3, notice: 2, info: 1, calm: 0 } as const;
export type SignalKind = 'event' | 'deadline' | 'window' | 'state';
export type ModuleId =
  | 'weather'
  | 'energy'
  | 'waste'
  | 'calendar'
  | 'health'
  | 'wine'
  | 'recipes'
  | 'network'
  | 'heating'
  | 'system';
export type Tone = 'risk' | 'opportunity' | 'neutral';
export type Action =
  | { type: 'navigate'; label: string; href: string }
  | { type: 'service'; label: string; service: string; target: string; confirm: boolean }
  | { type: 'ack'; label: string };
export interface SignalSource {
  name: string;
  updated_at: string;
  stale_after_s: number;
}
export interface Signal {
  id: string;
  module: ModuleId;
  group?: string;
  severity: Severity;
  tone?: Tone;
  kind: SignalKind;
  relevance: number;
  valid_from: string;
  valid_to: string;
  title: string;
  context: string;
  /**
   * Headline value. `progress` (0…1 done) draws a countdown ring next to it; `held` marks a
   * stopped countdown (drawer out, paused) so it stays secondary to the instruction.
   */
  value?: { v: string; unit?: string; label?: string; progress?: number; held?: boolean };
  action?: Action;
  source: SignalSource;
  related?: string[];
  /**
   * Someone has to act within minutes (airfryer „Protřepej“, „Hotovo“). As the hero it goes
   * above the day ribbon so it is in the first viewport on phones too.
   */
  immediate?: boolean;
}
export interface RankedSignal extends Signal {
  u: number;
  p: number;
  also: RankedSignal[];
  stale: boolean;
  ageS: number;
  actionState: { enabled: boolean; reason?: string } | undefined;
  relatedContext?: string[];
}
