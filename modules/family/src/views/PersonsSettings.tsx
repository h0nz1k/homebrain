import { useEffect, useState } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button } from '@homebrain/ui';
import type { FamilyApi } from '../api.js';
import type {
  PersonSettings,
  PersonsSettings as Settings,
  SchoolSettings,
  TimetableSettings,
} from '../types.js';
import { personColor } from './PersonView.js';
import {
  TimetableChildEditor,
  TimetableSchoolEditor,
  emptyChild,
  lessonCount,
  normalizeTimetable,
} from './TimetableSettings.js';

export function PersonsSettings({
  api,
  onBack,
  onSaved,
}: {
  api: FamilyApi;
  onBack(): void;
  onSaved(): void;
}) {
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /** Timetable sub-page: a child's grid or the school-wide bells / free days. */
  const [editing, setEditing] = useState<string | 'school' | null>(null);
  useBackClosable(onBack);

  useEffect(() => {
    let active = true;
    void api.personsSettings().then(
      (value) => {
        if (active) setData(value);
      },
      () => {
        if (active) setError('Nastavení osob se nepodařilo načíst.');
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  const change = (id: string, fields: Partial<PersonSettings>) =>
    setData(
      (current) =>
        current && {
          ...current,
          persons: current.persons.map((p) =>
            p.choreops_user_id === id ? { ...p, ...fields } : p,
          ),
        },
    );

  const changeSchool = (patch: Partial<SchoolSettings>) =>
    setData((current) =>
      current?.school ? { ...current, school: { ...current.school, ...patch } } : current,
    );

  const changeTimetable = (next: TimetableSettings) =>
    setData((current) => current && { ...current, timetable: next });

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.savePersons(
        data.persons.map(({ choreops_user_id, role, color, person, tracker, grade }) => ({
          choreops_user_id,
          role,
          color,
          person,
          tracker,
          grade: role === 'child' ? grade : null,
        })),
        data.school,
        data.timetable && normalizeTimetable(data.timetable),
      );
      setData(result);
      onSaved();
    } catch {
      setError('Nastavení osob se nepodařilo uložit.');
    } finally {
      setSaving(false);
    }
  };

  const timetable = data?.timetable;
  if (timetable && editing === 'school')
    return (
      <TimetableSchoolEditor
        settings={timetable}
        calendars={data.candidates.calendars ?? []}
        onChange={changeTimetable}
        onDone={() => setEditing(null)}
      />
    );
  const editedChild = data?.persons.find((p) => p.choreops_user_id === editing);
  if (timetable && editedChild)
    return (
      <TimetableChildEditor
        name={editedChild.name}
        grade={editedChild.grade}
        child={timetable.children[editedChild.choreops_user_id] ?? emptyChild()}
        settings={timetable}
        onChange={(child) =>
          changeTimetable({
            ...timetable,
            children: { ...timetable.children, [editedChild.choreops_user_id]: child },
          })
        }
        onDone={() => setEditing(null)}
      />
    );

  return (
    <section className="fam-person-view fam-person-settings" data-testid="family-person-settings">
      <Button variant="ghost" className="fam-person-back" onClick={onBack}>
        ‹&nbsp; Zpět
      </Button>
      <div className="fam-person-settings-intro">
        <h1>Nastavení osob</h1>
        <p>
          Přiřaďte členy k osobám v Home Assistantu a vyberte UniFi zařízení pro stav doma/pryč.
        </p>
        <p>Dospělí sbírají body pro radost (bez kapesného).</p>
      </div>
      {!data && !error && <p>Načítám nastavení osob…</p>}
      {error && (
        <p className="fam-err" role="alert">
          {error}
        </p>
      )}
      {data && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {data.persons.map((member) => (
            <fieldset
              className="fam-person-surface"
              key={member.choreops_user_id}
              disabled={saving}
            >
              <legend>
                <i aria-hidden="true" style={{ background: personColor(member.color) }} />
                {member.name}
              </legend>
              <label>
                Role v rodině
                <select
                  value={member.role}
                  onChange={(event) =>
                    change(member.choreops_user_id, {
                      role: event.target.value as PersonSettings['role'],
                    })
                  }
                >
                  <option value="child">Dítě</option>
                  <option value="adult">Dospělý</option>
                  <option value="owner">Vlastník</option>
                </select>
              </label>
              {member.role === 'child' && (
                <label>
                  Ročník
                  <select
                    value={member.grade ?? ''}
                    onChange={(event) =>
                      change(member.choreops_user_id, {
                        grade: Number(event.target.value) || null,
                      })
                    }
                  >
                    <option value="">Bez ročníku</option>
                    {Array.from({ length: 9 }, (_, i) => (
                      <option value={i + 1} key={i + 1}>
                        {i + 1}.
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Barva
                <select
                  value={member.color}
                  onChange={(event) =>
                    change(member.choreops_user_id, { color: Number(event.target.value) })
                  }
                >
                  <option value={1}>Modrá</option>
                  <option value={2}>Orchidejová</option>
                  <option value={3}>Fialová</option>
                  <option value={4}>Tyrkysová</option>
                </select>
              </label>
              <label>
                Osoba v Home Assistantu
                <select
                  value={member.person ?? ''}
                  onChange={(event) =>
                    change(member.choreops_user_id, { person: event.target.value || null })
                  }
                >
                  <option value="">Bez přiřazení</option>
                  {data.candidates.people.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Zařízení UniFi
                <select
                  value={member.tracker ?? ''}
                  onChange={(event) =>
                    change(member.choreops_user_id, { tracker: event.target.value || null })
                  }
                >
                  <option value="">Bez přiřazení</option>
                  {data.candidates.trackers.map((tracker) => (
                    <option value={tracker.id} key={tracker.id}>
                      {tracker.name}
                    </option>
                  ))}
                </select>
              </label>
              {member.role === 'child' && timetable && (
                <div className="fam-tt-open">
                  <span>
                    Škola
                    <small>
                      {lessonCount(timetable.children[member.choreops_user_id])
                        ? `Rozvrh: ${lessonCount(timetable.children[member.choreops_user_id])} hodin týdně`
                        : 'Rozvrh není vyplněný'}
                    </small>
                  </span>
                  <Button
                    data-testid="timetable-open"
                    onClick={() => setEditing(member.choreops_user_id)}
                  >
                    Rozvrh hodin
                  </Button>
                </div>
              )}
              {!member.configured && <small>Čeká na potvrzení.</small>}
            </fieldset>
          ))}
          {data.school && (
            <fieldset className="fam-person-surface" disabled={saving}>
              <legend>Školní web</legend>
              {(
                [
                  ['menu_url', 'Odkaz na jídelníčky (PDF)'],
                  ['events_url', 'Odkaz na plánované akce'],
                  ['dates_url', 'Odkaz na důležité termíny'],
                  ['bells_url', 'Odkaz na zvonění (časový rozvrh vyučování)'],
                ] as const
              ).map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    type="url"
                    maxLength={500}
                    value={data.school?.[field] ?? ''}
                    onChange={(event) => changeSchool({ [field]: event.target.value })}
                  />
                </label>
              ))}
              <label>
                Připomenout (dní předem)
                <input
                  type="number"
                  min={0}
                  max={365}
                  required
                  value={data.school.reminder_days}
                  onChange={(event) => changeSchool({ reminder_days: Number(event.target.value) })}
                />
              </label>
            </fieldset>
          )}
          {timetable && (
            <fieldset className="fam-person-surface" disabled={saving}>
              <legend>Rozvrh – celá škola</legend>
              <small>
                {timetable.free.length
                  ? `Volno: ${timetable.free.map((row) => row.label).join(', ')}`
                  : 'Zvonění, odpolední vyučování, prázdniny a co s sebou.'}
              </small>
              <Button data-testid="timetable-school-open" onClick={() => setEditing('school')}>
                Zvonění a volné dny
              </Button>
            </fieldset>
          )}
          {(data.persons.length > 0 || data.school) && (
            <Button type="submit" variant="primary" disabled={saving}>
              Uložit
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
