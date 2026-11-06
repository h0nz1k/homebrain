import { czPlural } from '@homebrain/ui';
import type { ConsumableInfo, ConsumableKind } from './consumables.js';
import { TANK_GUIDE, extraGuideParts, guideFor, type GuidePart, type GuideSet } from './guides.js';
import type { TankInfo } from './model.js';

/**
 * „Roboti → Údržba“: ONE list for everything the owner maintains – counter parts (brushes,
 * filter, sensors, dock strainer/brush), dock tanks and guide-only parts (mops, wheel, dust bag…).
 * Every item renders as the same tile; only the state line differs. Items exist only when the
 * robot has the entity (counter/tank) or a private guide for the part.
 */
export type MaintGroupId = 'robot' | 'dock';
export type MaintTone = 'crit' | 'warn' | 'ok' | 'neutral';

export interface MaintItem {
  /** Unique per robot: consumable kind, tank key or guide part. */
  id: string;
  /** Guide opened on tap. */
  part: GuidePart;
  group: MaintGroupId;
  kind: 'counter' | 'tank' | 'guide';
  label: string;
  tone: MaintTone;
  /** State line: „Vyměnit za 12 dní“, „Doplnit“, „V pořádku“, „Pravidelně – návod“. */
  status: string;
  /** Counter only: service life left, 0–100. */
  percent: number | null;
  /** Tank only: false = needs action. */
  ok: boolean | null;
}

export interface MaintGroup {
  id: MaintGroupId;
  label: string;
  items: MaintItem[];
  /** Group-level problem the tiles cannot show (dock error code). */
  note: string | null;
}

export interface MaintSummary {
  tone: 'ok' | 'warn' | 'crit';
  /** Items (plus an uncovered dock error) that need the owner now or soon. */
  count: number;
  text: string;
}

const GROUP_OF: Record<GuidePart | TankInfo['key'], MaintGroupId> = {
  main_brush: 'robot',
  side_brush: 'robot',
  filter: 'robot',
  sensors: 'robot',
  mop: 'robot',
  wheel: 'robot',
  water_shortage: 'robot',
  dock_strainer: 'dock',
  dock_brush: 'dock',
  clean_water: 'dock',
  dirty_water: 'dock',
  cleaning_fluid: 'dock',
  dust_bag: 'dock',
};

const GROUP_LABEL: Record<MaintGroupId, string> = { robot: 'Robot', dock: 'Dok' };
const TONE_RANK: Record<MaintTone, number> = { crit: 0, warn: 1, ok: 2, neutral: 3 };

/** Most urgent first: red, amber, fine, guide-only; counters by life left; else stable. */
export function sortMaint(items: MaintItem[]): MaintItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        TONE_RANK[a.item.tone] - TONE_RANK[b.item.tone] ||
        (a.item.percent ?? 101) - (b.item.percent ?? 101) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

export interface MaintSource {
  consumables: ConsumableInfo[];
  tanks: TankInfo[];
  dockError: { title: string } | null;
}

export function maintenanceItems(robot: MaintSource, guides: GuideSet | null): MaintItem[] {
  const counters: MaintItem[] = robot.consumables.map((c) => ({
    id: c.kind,
    part: c.kind,
    group: GROUP_OF[c.kind],
    kind: 'counter',
    label: c.label,
    tone: c.tone,
    status: c.action,
    percent: c.percent,
    ok: null,
  }));
  const tanks: MaintItem[] = robot.tanks.map((t) => ({
    id: t.key,
    part: TANK_GUIDE[t.key] ?? 'clean_water',
    group: GROUP_OF[t.key],
    kind: 'tank',
    label: t.label,
    tone: t.ok ? 'ok' : 'crit',
    status: t.text,
    percent: null,
    ok: t.ok,
  }));
  const shown: string[] = [
    ...robot.consumables.map((c) => c.kind as ConsumableKind),
    ...robot.tanks.flatMap((t) => TANK_GUIDE[t.key] ?? []),
  ];
  const extra: MaintItem[] = extraGuideParts(guides, shown).map((part) => ({
    id: part,
    part,
    group: GROUP_OF[part],
    kind: 'guide',
    label: guideFor(guides, part).title,
    tone: 'neutral',
    status: 'Pravidelně – návod',
    percent: null,
    ok: null,
  }));
  return sortMaint([...counters, ...tanks, ...extra]);
}

/** „Robot“ then „Dok“; empty groups are dropped unless the dock reports an error. */
export function maintenanceGroups(items: MaintItem[], dockError: { title: string } | null) {
  return (['robot', 'dock'] as const)
    .map((id): MaintGroup => ({
      id,
      label: GROUP_LABEL[id],
      items: items.filter((item) => item.group === id),
      note: id === 'dock' && dockError ? dockError.title : null,
    }))
    .filter((group) => group.items.length > 0 || group.note);
}

export function maintenanceSummary(
  items: MaintItem[],
  dockError: { title: string } | null,
): MaintSummary {
  const due = items.filter((item) => item.tone === 'crit' || item.tone === 'warn');
  // A dock error that a red dock tank already explains is not counted twice.
  const dockUncovered =
    !!dockError && !items.some((i) => i.group === 'dock' && i.kind === 'tank' && i.tone === 'crit');
  const count = due.length + (dockUncovered ? 1 : 0);
  const tone =
    dockError || due.some((item) => item.tone === 'crit') ? 'crit' : count ? 'warn' : 'ok';
  const text = count
    ? `${count} ${czPlural(count, 'věc čeká', 'věci čekají', 'věcí čeká')}`
    : 'Vše v pořádku';
  return { tone, count, text };
}
