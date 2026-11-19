export type FamilyRole = 'owner' | 'adult' | 'child' | 'kiosk' | 'guest';
export type ChoreState = 'todo' | 'claimed' | 'done' | 'overdue';

export interface FamilySwapToday {
  kind: 'pending_give' | 'transferred_out' | 'transferred_in';
  label: string;
  partner_name?: string;
  muted?: boolean;
}

export interface FamilyEvent {
  id: string;
  calendar: string;
  source: string;
  kind: 'family' | 'school';
  summary: string;
  start: string;
  end: string;
  all_day: boolean;
  location?: string;
  description?: string;
}
export interface FamilyChore {
  id: string;
  name: string;
  state: ChoreState;
  points: number | null;
  due: string | null;
  can_claim: boolean;
  can_approve: boolean;
  can_request_swap?: boolean;
  swap_unavailable_reason?: string | null;
  swap_today?: FamilySwapToday | null;
  counts_today?: boolean;
  carried_days?: number;
  rotation_turn?: string | null;
}
/** A chore of a later day (ChoreOps groups `this_week` / `other`): shown, not claimable yet. */
export interface FamilyUpcomingChore {
  id: string;
  name: string;
  points: number | null;
  due: string | null;
  /** ChoreOps `primary_group`. */
  group: 'this_week' | 'other';
}
export interface PointsSummary {
  kid_name: string;
  balance: number | null;
  earned_today: number | null;
  earned_week: number | null;
  earned_month: number | null;
  spent_month: number | null;
  net_month: number | null;
  earned_all_time: number | null;
  spent_all_time: number | null;
  longest_streak: number | null;
  top_chore_month: string | null;
  sources_month: Record<string, number | null>;
}
export interface FamilyKid {
  id: string;
  kid_uuid?: string;
  name: string;
  points: number | null;
  points_today: number | null;
  points_summary?: PointsSummary;
  chores: FamilyChore[];
  /** Planned chores of the next days, sorted by due (older backends omit it). */
  upcoming?: FamilyUpcomingChore[];
}
export interface FamilyApproval {
  kind: 'completion' | 'swap';
  type_label: string;
  kid_id?: string;
  kid_name?: string;
  chore_id?: string;
  chore_name?: string;
  points?: number | null;
  due?: string | null;
  request_id?: string;
  requester_name?: string;
  from_kid_id?: string;
  to_kid_id?: string;
  revision?: number;
}
export interface ShoppingItem {
  uid: string;
  summary: string;
  done: boolean;
}
export interface FamilyCapabilities {
  can_create_chore: boolean;
  can_swap: boolean;
  can_view_points: boolean;
}
export interface PointsHistory {
  entries: Array<Record<string, unknown>>;
  chart: { days: string[]; earned: number[]; max: number; coverage_complete: boolean };
  truncated: boolean;
  generated_at: string;
}
export interface FamilySnapshot {
  role: FamilyRole;
  revision?: number;
  capabilities?: FamilyCapabilities;
  calendars: Array<{ entity_id: string; name: string; kind: 'family' | 'school' }>;
  events: FamilyEvent[];
  kids: FamilyKid[];
  members?: FamilyMember[];
  free_chores?: FreeChore[];
  shopping: { entity_id: string; name: string; items: ShoppingItem[] } | null;
  pending_approvals?: FamilyApproval[];
  swap_requests?: Array<Record<string, unknown>>;
  swap_badges?: Array<{ text: string; kid: string }>;
  errors: string[];
  generated_at: string;
}

export type Recurrence = 'once' | 'daily' | 'daily_multi' | 'weekly';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface CreateChoreInput {
  client_request_id: string;
  name: string;
  points: number;
  assignees: string[];
  recurrence: Recurrence;
  weekdays?: Weekday[];
  first_date: string;
  due_time: string;
  /** `daily_multi`: all due times of the day, ascending („12:00“, „19:00“). */
  times?: string[];
  icon?: string;
}

export interface SwapRequestInput {
  client_request_id: string;
  chore: string;
  from_kid: string;
  to_kid: string;
  local_date: string;
  direction?: 'give' | 'take';
  expected_revision?: number;
}

export type MemberRole = 'owner' | 'adult' | 'child';
export type WifiPresence = { kind: 'home' | 'away' };
// Later sources can extend presence without treating a calendar entry as a location.
export type FamilyPresence = WifiPresence | { kind: 'derived'; source: 'school_timetable' };

export interface ChoreCounts {
  total: number;
  done: number;
  pending: number;
  open: number;
}

export interface MissedChore {
  id: string;
  name: string;
  date: string | null;
}

export interface PersonHistoryEntry {
  date: string;
  name: string;
  points: number | null;
}

export interface FamilyMember extends FamilyKid {
  role: MemberRole;
  color: number;
  presence: FamilyPresence | null;
  own: boolean;
  counts: ChoreCounts;
  points_week: number | null;
  missed: MissedChore[];
}

export interface FreeChore {
  name: string;
  points: number | null;
  due: string | null;
  assignees: Array<{ member: string; chore: string; can_claim: boolean }>;
}

export interface PersonSettings {
  choreops_user_id: string;
  role: MemberRole;
  color: number;
  person: string | null;
  tracker: string | null;
}

export interface PersonsSettings {
  persons: Array<PersonSettings & { name: string; configured: boolean }>;
  candidates: {
    people: Array<{ id: string; name: string }>;
    trackers: Array<{ id: string; name: string }>;
  };
}
