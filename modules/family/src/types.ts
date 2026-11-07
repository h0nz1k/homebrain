export type FamilyRole = 'owner' | 'adult' | 'child' | 'kiosk' | 'guest';
export type ChoreState = 'todo' | 'claimed' | 'done' | 'overdue';

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
}
export interface FamilyKid {
  id: string;
  name: string;
  points: number | null;
  points_today: number | null;
  chores: FamilyChore[];
}
export interface ShoppingItem {
  uid: string;
  summary: string;
  done: boolean;
}
export interface FamilySnapshot {
  role: FamilyRole;
  calendars: Array<{ entity_id: string; name: string; kind: 'family' | 'school' }>;
  events: FamilyEvent[];
  kids: FamilyKid[];
  shopping: { entity_id: string; name: string; items: ShoppingItem[] } | null;
  errors: string[];
  generated_at: string;
}
