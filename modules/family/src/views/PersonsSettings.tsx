import { useEffect, useState } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button } from '@homebrain/ui';
import type { FamilyApi } from '../api.js';
import type { PersonSettings, PersonsSettings as Settings } from '../types.js';
import { personColor } from './PersonView.js';

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

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.savePersons(
        data.persons.map(({ choreops_user_id, role, color, person, tracker }) => ({
          choreops_user_id,
          role,
          color,
          person,
          tracker,
        })),
      );
      setData(result);
      onSaved();
    } catch {
      setError('Nastavení osob se nepodařilo uložit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="fam-person-view fam-person-settings" data-testid="family-person-settings">
      <Button variant="ghost" className="fam-person-back" onClick={onBack}>
        ‹&nbsp; Rodina
      </Button>
      <h1>Nastavení osob</h1>
      <p>
        Přiřaďte členy z ChoreOps k osobám v Home Assistantu a vyberte UniFi zařízení pro stav
        doma/pryč.
      </p>
      <p>Dospělí sbírají body pro radost (bez kapesného).</p>
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
              {!member.configured && <small>Čeká na potvrzení.</small>}
            </fieldset>
          ))}
          {data.persons.length > 0 && (
            <Button type="submit" variant="primary" disabled={saving}>
              Uložit
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
