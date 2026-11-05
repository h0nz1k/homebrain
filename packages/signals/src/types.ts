export type Severity = 'critical' | 'warning' | 'notice' | 'info' | 'calm';
export const SEVERITY_RANK = { critical: 4, warning: 3, notice: 2, info: 1, calm: 0 } as const;
export type SignalKind = 'event' | 'deadline' | 'window' | 'state';
export type ModuleId = 'weather' | 'energy' | 'waste' | 'calendar' | 'health' | 'wine' | 'system';
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
  value?: { v: string; unit?: string; label?: string };
  action?: Action;
  source: SignalSource;
  related?: string[];
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
