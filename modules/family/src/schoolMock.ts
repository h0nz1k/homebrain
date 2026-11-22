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
  const mains = [
    'Cizrnové placičky',
    'Zapečené brambory s dýní',
    'Kuskus s pečenou zeleninou',
    'Fazolové karbanátky',
    'Těstoviny s hráškem',
  ];
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
                    main: mains[i]!,
                    soup: 'Mrkvová',
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
