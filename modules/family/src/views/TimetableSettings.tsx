import { useEffect, useRef, useState } from 'react';
import { useBackClosable, type TimetableAfternoon, type TimetableBell } from '@homebrain/ha-client';
import { Button } from '@homebrain/ui';
import type { TimetableChildSettings, TimetableSettings } from '../types.js';

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá'];
const DAY_NAMES = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek'];
const PERIODS = 9;
const SUBJECTS = ['Čj', 'M', 'Aj', 'Vl', 'Př', 'Tv', 'Vv', 'Hv', 'Pč', 'Inf'];
const UPPER = ['D', 'Z', 'F', 'Ch', 'Nj', 'Rj'];

export const emptyChild = (): TimetableChildSettings => ({
  days: Array.from({ length: DAYS.length }, () => []),
  afternoon_days: null,
});

/** Trailing empty periods are not stored. */
export function normalizeTimetable(settings: TimetableSettings): TimetableSettings {
  const trim = <T,>(rows: T[], empty: (row: T) => boolean) => {
    const copy = [...rows];
    while (copy.length && empty(copy[copy.length - 1]!)) copy.pop();
    return copy;
  };
  const complete = (bell: TimetableBell | null) => (bell?.start && bell.end ? bell : null);
  const afternoon = settings.afternoon && {
    ...settings.afternoon,
    lunch: complete(settings.afternoon.lunch),
    periods: settings.afternoon.periods.filter((row) => row.start && row.end),
  };
  return {
    ...settings,
    bells: trim(settings.bells.map(complete), (bell) => !bell),
    afternoon,
    free: settings.free
      .filter((row) => row.start && row.label.trim())
      .map((row) => ({ ...row, end: row.end && row.end >= row.start ? row.end : row.start })),
    items: Object.fromEntries(Object.entries(settings.items).filter(([subject]) => subject.trim())),
    children: Object.fromEntries(
      Object.entries(settings.children).map(([id, child]) => [
        id,
        { ...child, days: child.days.map((day) => trim(day, (subject) => !subject.trim())) },
      ]),
    ),
  };
}

export function lessonCount(child: TimetableChildSettings | undefined): number {
  return child?.days.flat().filter((subject) => subject.trim()).length ?? 0;
}

function effectiveAfternoon(settings: TimetableSettings): TimetableAfternoon | null {
  return settings.afternoon ?? settings.imported?.afternoon ?? null;
}

function derivedDays(variant: TimetableAfternoon | null, grade: number | null | undefined) {
  if (variant?.weekday == null || !variant.periods.length) return [];
  return !variant.grades || (grade != null && variant.grades.includes(grade))
    ? [variant.weekday]
    : [];
}

function EditorHead({ title, intro, onDone }: { title: string; intro: string; onDone(): void }) {
  useBackClosable(onDone);
  return (
    <>
      <Button variant="ghost" className="fam-person-back" onClick={onDone}>
        ‹&nbsp; Hotovo
      </Button>
      <div className="fam-person-settings-intro">
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
    </>
  );
}

/** Po–Pá × hodiny: tap a cell, then a subject chip (the selection moves to the next period). */
export function TimetableChildEditor({
  name,
  grade,
  child,
  settings,
  onChange,
  onDone,
}: {
  name: string;
  grade: number | null | undefined;
  child: TimetableChildSettings;
  settings: TimetableSettings;
  onChange(child: TimetableChildSettings): void;
  onDone(): void;
}) {
  const [cell, setCell] = useState({ day: 0, period: 0 });
  const [custom, setCustom] = useState('');
  const grid = useRef<HTMLTableElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  // The sticky subject picker covers the bottom of the screen: keep the selected cell above it.
  useEffect(() => {
    if (!moved.current) return;
    const button = grid.current?.querySelector<HTMLElement>(
      `[data-testid="timetable-cell-${cell.day}-${cell.period + 1}"]`,
    );
    if (!button) return;
    button.style.scrollMarginBottom = `${(picker.current?.offsetHeight ?? 0) + 24}px`;
    button.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [cell]);
  const subject = (day: number, period: number) => child.days[day]?.[period] ?? '';
  const used = child.days.flat().filter(Boolean);
  const chips = [
    ...new Set([
      ...SUBJECTS,
      ...((grade ?? 9) > 5 ? UPPER : []),
      ...Object.keys(settings.items),
      ...used,
    ]),
  ];
  const put = (value: string) => {
    const days = child.days.map((day) => [...day]);
    const row = days[cell.day]!;
    while (row.length <= cell.period) row.push('');
    row[cell.period] = value;
    onChange({ ...child, days });
    moved.current = true;
    setCell(({ day, period }) =>
      period + 1 < PERIODS
        ? { day, period: period + 1 }
        : { day: (day + 1) % DAYS.length, period: 0 },
    );
  };
  const variant = effectiveAfternoon(settings);
  const afternoon = child.afternoon_days ?? derivedDays(variant, grade);
  const toggleDay = (day: number) =>
    onChange({
      ...child,
      afternoon_days: afternoon.includes(day)
        ? afternoon.filter((d) => d !== day)
        : [...afternoon, day].sort(),
    });
  const selected = subject(cell.day, cell.period);

  return (
    <section
      className="fam-person-view fam-person-settings fam-tt-editor"
      data-testid="timetable-editor"
    >
      <EditorHead
        title={`Rozvrh · ${name}`}
        intro="Klepněte na hodinu a pak na předmět. Výběr se posune na další hodinu, dvouhodinovky tak vyplníte dvěma klepnutími."
        onDone={onDone}
      />
      <div className="fam-person-surface fam-tt-grid-wrap">
        <table className="fam-tt-grid" ref={grid}>
          <caption className="fam-sr">Rozvrh hodin {name}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="fam-sr">Hodina</span>
              </th>
              {DAYS.map((day) => (
                <th scope="col" key={day}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PERIODS }, (_, period) => (
              <tr key={period}>
                <th scope="row">{period + 1}.</th>
                {DAYS.map((day, d) => {
                  const value = subject(d, period);
                  const active = cell.day === d && cell.period === period;
                  return (
                    <td key={day}>
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={`${DAY_NAMES[d]} ${period + 1}. hodina: ${value || 'prázdná'}`}
                        data-testid={`timetable-cell-${d}-${period + 1}`}
                        onClick={() => {
                          moved.current = true;
                          setCell({ day: d, period });
                        }}
                      >
                        {value || <span aria-hidden="true">·</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="fam-person-surface fam-tt-chips"
        role="group"
        aria-label="Předmět"
        ref={picker}
      >
        <p>
          {DAY_NAMES[cell.day]} · {cell.period + 1}. hodina{selected && `: ${selected}`}
        </p>
        <div>
          {chips.map((chip) => (
            <button
              type="button"
              key={chip}
              className="fam-tt-chip"
              aria-pressed={chip === selected}
              onClick={() => put(chip)}
            >
              {chip}
            </button>
          ))}
          <button type="button" className="fam-tt-chip" onClick={() => put('')}>
            Volno
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (custom.trim()) put(custom.trim());
            setCustom('');
          }}
        >
          <label>
            Jiný předmět
            <input
              value={custom}
              maxLength={8}
              placeholder="např. Etv"
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
          <Button type="submit">Vložit</Button>
        </form>
      </div>
      {variant && (
        <fieldset className="fam-person-surface fam-tt-days">
          <legend>Odpolední zvonění</legend>
          <small data-testid="timetable-afternoon-hint">
            {child.afternoon_days == null ? 'Automaticky podle nastavení školy' : 'Vybráno ručně'}
            {': '}
            {afternoon.length ? afternoon.map((d) => DAYS[d]).join(', ') : 'žádný den'}
            {child.afternoon_days == null && '. Klepnutím vyberete dny ručně.'}
          </small>
          <div>
            {DAYS.map((day, d) => {
              const on = afternoon.includes(d);
              return (
                <button
                  type="button"
                  key={day}
                  className="fam-tt-chip fam-tt-day"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[d]}
                  onClick={() => toggleDay(d)}
                >
                  {on && <span aria-hidden="true">✓ </span>}
                  {day}
                </button>
              );
            })}
          </div>
          {child.afternoon_days != null && (
            <Button onClick={() => onChange({ ...child, afternoon_days: null })}>
              Podle školy
            </Button>
          )}
        </fieldset>
      )}
    </section>
  );
}

function TimeRange({
  label,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  value: TimetableBell | null;
  onChange(value: TimetableBell | null): void;
  onRemove?: () => void;
}) {
  return (
    <div className="fam-tt-range" role="group" aria-label={label}>
      <span>{label}</span>
      <input
        type="time"
        aria-label={`${label} od`}
        value={value?.start ?? ''}
        required={!!value?.end}
        onChange={(event) =>
          onChange(
            event.target.value || value?.end
              ? { start: event.target.value, end: value?.end ?? '' }
              : null,
          )
        }
      />
      <input
        type="time"
        aria-label={`${label} do`}
        value={value?.end ?? ''}
        required={!!value?.start}
        onChange={(event) =>
          onChange(
            event.target.value || value?.start
              ? { start: value?.start ?? '', end: event.target.value }
              : null,
          )
        }
      />
      {onRemove && (
        <button
          type="button"
          className="fam-tt-remove"
          aria-label={`Odebrat ${label}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** School-wide: bells, afternoon variant, public holidays, free ranges and „co s sebou“. */
export function TimetableSchoolEditor({
  settings,
  calendars,
  onChange,
  onDone,
}: {
  settings: TimetableSettings;
  calendars: Array<{ entity_id: string; name: string }>;
  onChange(settings: TimetableSettings): void;
  onDone(): void;
}) {
  const patch = (next: Partial<TimetableSettings>) => onChange({ ...settings, ...next });
  const imported = settings.imported;
  const manualBells = settings.bells.length > 0;
  const bells = manualBells ? settings.bells : (imported?.bells ?? []);
  const setBell = (index: number, bell: TimetableBell | null) => {
    const next = Array.from(
      { length: Math.max(bells.length, index + 1) },
      (_, i) => bells[i] ?? null,
    );
    next[index] = bell;
    patch({ bells: next });
  };
  const variant = effectiveAfternoon(settings);
  const setVariant = (next: Partial<TimetableAfternoon>) =>
    patch({
      afternoon: { weekday: null, grades: null, lunch: null, periods: [], ...variant, ...next },
    });
  const items = Object.entries(settings.items);
  const setItems = (rows: Array<[string, string]>) => patch({ items: Object.fromEntries(rows) });
  const autoName =
    calendars.find((cal) => cal.entity_id === settings.auto_holiday_calendar)?.name ??
    settings.auto_holiday_calendar;

  return (
    <section
      className="fam-person-view fam-person-settings fam-tt-editor"
      data-testid="timetable-school-editor"
    >
      <EditorHead
        title="Zvonění a volné dny"
        intro="Platí pro celou školu. Ruční úpravy mají přednost před školním webem."
        onDone={onDone}
      />
      <fieldset className="fam-person-surface fam-tt-bells">
        <legend>Zvonění</legend>
        <small>
          {manualBells
            ? 'Upraveno ručně.'
            : imported?.bells.length
              ? 'Načteno ze školního webu. Úpravou se uloží jako ruční.'
              : 'Zadejte časy hodin nebo odkaz na zvonění v nastavení školního webu.'}
        </small>
        {Array.from({ length: PERIODS }, (_, i) => (
          <TimeRange
            key={i}
            label={`${i + 1}. hodina`}
            value={bells[i] ?? null}
            onChange={(bell) => setBell(i, bell)}
          />
        ))}
        {manualBells && !!imported?.bells.length && (
          <Button onClick={() => patch({ bells: [] })}>Použít školní web</Button>
        )}
      </fieldset>
      <fieldset className="fam-person-surface fam-tt-bells">
        <legend>Odpolední zvonění</legend>
        <small>
          Jiné časy pro vybraný den (např. středa pro 8.–9. ročník). Dítě je může mít i v jiné dny –
          nastavíte je v jeho rozvrhu.
        </small>
        <label className="fam-tt-check">
          <input
            type="checkbox"
            checked={!!variant}
            onChange={(event) =>
              patch({
                afternoon: event.target.checked
                  ? { weekday: 2, grades: null, lunch: null, periods: [] }
                  : null,
              })
            }
          />
          Škola má odpolední vyučování
        </label>
        {variant && (
          <>
            <label>
              Den
              <select
                value={variant.weekday ?? ''}
                onChange={(event) =>
                  setVariant({
                    weekday: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              >
                <option value="">Jen ručně u dítěte</option>
                {DAY_NAMES.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ročníky (prázdné = všechny)
              <input
                inputMode="numeric"
                placeholder="8, 9"
                value={variant.grades?.join(', ') ?? ''}
                onChange={(event) => {
                  const grades = [...new Set(event.target.value.match(/[1-9]/g)?.map(Number))];
                  setVariant({ grades: grades.length ? grades.sort() : null });
                }}
              />
            </label>
            <TimeRange
              label="Polední přestávka"
              value={variant.lunch}
              onChange={(lunch) => setVariant({ lunch })}
            />
            {variant.periods.map((row, i) => (
              <div className="fam-tt-afternoon" key={i}>
                <select
                  aria-label="Hodina"
                  value={row.period}
                  onChange={(event) =>
                    setVariant({
                      periods: variant.periods.map((p, j) =>
                        j === i ? { ...p, period: Number(event.target.value) } : p,
                      ),
                    })
                  }
                >
                  {Array.from({ length: PERIODS }, (_, p) => (
                    <option key={p} value={p + 1}>
                      {p + 1}.
                    </option>
                  ))}
                </select>
                <TimeRange
                  label={`${row.period}. hodina odpoledne`}
                  value={row}
                  onChange={(bell) =>
                    setVariant({
                      periods: variant.periods.map((p, j) =>
                        j === i ? { ...p, start: bell?.start ?? '', end: bell?.end ?? '' } : p,
                      ),
                    })
                  }
                  onRemove={() =>
                    setVariant({ periods: variant.periods.filter((_, j) => j !== i) })
                  }
                />
              </div>
            ))}
            <Button
              onClick={() => {
                const last = variant.periods[variant.periods.length - 1];
                setVariant({
                  periods: [
                    ...variant.periods,
                    { period: Math.min(PERIODS, (last?.period ?? 5) + 1), start: '', end: '' },
                  ],
                });
              }}
            >
              Přidat hodinu
            </Button>
          </>
        )}
      </fieldset>
      <fieldset className="fam-person-surface">
        <legend>Státní svátky</legend>
        <label>
          Kalendář svátků
          <select
            value={settings.holiday_calendar}
            onChange={(event) => patch({ holiday_calendar: event.target.value })}
          >
            <option value="auto">Automaticky{autoName ? ` (${autoName})` : ' (nenalezen)'}</option>
            <option value="">Nepoužívat</option>
            {calendars.map((cal) => (
              <option key={cal.entity_id} value={cal.entity_id}>
                {cal.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <fieldset className="fam-person-surface fam-tt-free" data-testid="timetable-free">
        <legend>Prázdniny a volno</legend>
        <small>Termíny ze školního webu se za volno nepočítají.</small>
        {settings.free.map((row, i) => (
          <div className="fam-tt-free-row" key={i}>
            <label>
              Název
              <input
                required
                maxLength={60}
                value={row.label}
                onChange={(event) =>
                  patch({
                    free: settings.free.map((r, j) =>
                      j === i ? { ...r, label: event.target.value } : r,
                    ),
                  })
                }
              />
            </label>
            <label>
              Od
              <input
                type="date"
                required
                value={row.start}
                onChange={(event) =>
                  patch({
                    free: settings.free.map((r, j) =>
                      j === i
                        ? {
                            ...r,
                            start: event.target.value,
                            end: r.end < event.target.value ? event.target.value : r.end,
                          }
                        : r,
                    ),
                  })
                }
              />
            </label>
            <label>
              Do
              <input
                type="date"
                required
                min={row.start}
                value={row.end}
                onChange={(event) =>
                  patch({
                    free: settings.free.map((r, j) =>
                      j === i ? { ...r, end: event.target.value } : r,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="fam-tt-remove"
              aria-label={`Odebrat ${row.label || 'volno'}`}
              onClick={() => patch({ free: settings.free.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
        ))}
        <Button
          onClick={() => patch({ free: [...settings.free, { start: '', end: '', label: '' }] })}
        >
          Přidat volno
        </Button>
      </fieldset>
      <fieldset className="fam-person-surface fam-tt-items" data-testid="timetable-items">
        <legend>Co s sebou</legend>
        <small>Připomene se večer před dnem s tímto předmětem. Prázdné = nic.</small>
        {items.map(([subject, item], i) => (
          <div className="fam-tt-item" key={i}>
            <input
              aria-label="Předmět"
              required
              maxLength={8}
              value={subject}
              onChange={(event) =>
                setItems(items.map((row, j) => (j === i ? [event.target.value, row[1]] : row)))
              }
            />
            <input
              aria-label={`S sebou na ${subject}`}
              maxLength={80}
              placeholder="—"
              value={item}
              onChange={(event) =>
                setItems(items.map((row, j) => (j === i ? [row[0], event.target.value] : row)))
              }
            />
            <button
              type="button"
              className="fam-tt-remove"
              aria-label={`Odebrat ${subject}`}
              onClick={() => setItems(items.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <Button onClick={() => setItems([...items, ['', '']])}>Přidat předmět</Button>
      </fieldset>
    </section>
  );
}
