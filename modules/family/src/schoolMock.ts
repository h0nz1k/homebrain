import { schoolDay, schoolDayOffset, schoolWeek, type SchoolSnapshot } from '@homebrain/ha-client';

export type SchoolScenario = 'off' | 'full' | 'holiday' | 'empty' | 'stale';

export function mockSchool(
  scenario: SchoolScenario,
  role: string,
  now: Date,
  kids: Array<{ id: string; grade?: number | null }> = [{ id: 'syn', grade: 4 }],
): SchoolSnapshot {
  const today = schoolDay(now);
  const days = schoolWeek(today);
  // Shaped like real canteen menus: capitalised soup names, main with its side dish.
  const menu = [
    ['Mrkvová', 'Cizrnové placičky, bramborová kaše'],
    ['Hovězí vývar s nudlemi', 'Zapečené brambory s dýní'],
    ['Čočková', 'Kuskus s pečenou zeleninou'],
    ['Zeleninová s kroupami', 'Fazolové karbanátky, vařené brambory'],
    ['Hrachová', 'Těstoviny s hráškem a sýrem'],
  ] as const;
  const enabled = scenario !== 'off' && role !== 'guest';
  const ids = kids.map((kid) => kid.id);
  const tomorrow = schoolDayOffset(today, 1);
  return {
    enabled,
    updated_at: enabled
      ? new Date(now.getTime() - (scenario === 'stale' ? 86_400_000 : 3_600_000)).toISOString()
      : null,
    lunch:
      enabled && scenario !== 'empty'
        ? days.flatMap((date, i) =>
            scenario === 'holiday' && date === today
              ? []
              : [
                  {
                    date,
                    main: menu[i]![1],
                    soup: menu[i]![0],
                    sides: ['Okurkový salát'],
                    allergens: ['lepek', 'vejce'],
                  },
                ],
          )
        : [],
    events: enabled
      ? [
          {
            date: today,
            end_date: null,
            title: 'Školní výstava',
            grades: null,
            person_ids: ids,
          },
          {
            date: tomorrow,
            end_date: null,
            title: '4. třída – divadlo',
            grades: [4],
            person_ids: kids.filter((kid) => kid.grade === 4).map((kid) => kid.id),
          },
          {
            date: tomorrow,
            end_date: null,
            title: '9. ročník – exkurze',
            grades: [9],
            person_ids: [],
          },
        ].filter((event) => role === 'owner' || role === 'adult' || event.person_ids.length)
      : [],
    dates:
      enabled && ['owner', 'adult', 'kiosk'].includes(role)
        ? [{ date: schoolDayOffset(today, 2), title: 'Třídní schůzky' }]
        : [],
  };
}
