import { KitchenSheet } from './Sheet';
import { useEffect, useState } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button, toast } from '@homebrain/ui';
import type { KitchenApi } from './api';
import type { Candidate, KitchenConfig, KitchenSnapshot, MediaItem } from './types';
import { filterPlaylists } from './state';

export function Artwork({
  item,
  index = 0,
}: {
  item: Pick<MediaItem, 'image' | 'name'>;
  index?: number;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="kn-art"
      style={{
        background: `linear-gradient(${130 + index * 31}deg, hsl(${205 + index * 47} 36% 38%), hsl(${265 + index * 37} 24% 23%))`,
      }}
      aria-hidden="true"
    >
      {item.image && !failed ? (
        <img src={item.image} alt="" onError={() => setFailed(true)} referrerPolicy="no-referrer" />
      ) : (
        <span className="kn-art-lines">♫</span>
      )}
    </span>
  );
}
export function Picker({
  api,
  provider,
  title,
  selected = [],
  max = 1,
  radio = false,
  onChoose,
  onClose,
}: {
  api: KitchenApi;
  provider?: string;
  title: string;
  selected?: MediaItem[];
  max?: number;
  radio?: boolean;
  onChoose: (items: MediaItem[]) => void;
  onClose: () => void;
}) {
  useBackClosable(onClose);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(provider ?? '');
  const [chosen, setChosen] = useState(selected);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState<number | null>(null);
  const load = async (next = 0) => {
    setBusy(true);
    setError('');
    try {
      const result = radio ? await api.radios(query.trim()) : await api.playlists('', next);
      setItems((old) => (next ? [...old, ...result.items] : result.items));
      setOffset(result.next_offset);
    } catch {
      setError('Knihovna není dostupná. Zkuste to znovu.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const initial = setTimeout(() => {
      if (!radio) void load();
    }, 0);
    return () => clearTimeout(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const providers = [...new Set(items.flatMap((i) => i.providers))];
  return (
    <KitchenSheet
      title={title}
      onClose={onClose}
      footer={
        max > 1 ? (
          <Button
            disabled={busy}
            onClick={() => {
              onChoose(chosen);
              onClose();
            }}
          >
            Použít výběr ({chosen.length}/{max})
          </Button>
        ) : undefined
      }
    >
      <div className="kn-form">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (radio && query.trim()) void load();
          }}
        >
          <label>
            Hledat {radio ? 'rádio' : 'playlist'}
            <input value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {radio ? (
            <Button type="submit" disabled={busy || !query.trim()}>
              Vyhledat
            </Button>
          ) : (
            <label>
              Poskytovatel
              <select
                aria-label="Poskytovatel"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">Všechny účty / poskytovatelé</option>
                {[...new Set([filter, ...providers])].filter(Boolean).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
        </form>
        {error ? (
          <p role="alert">
            {error} <Button onClick={() => void load()}>Zkusit znovu</Button>
          </p>
        ) : null}
        {busy ? <p role="status">Načítám knihovnu…</p> : null}
        {!busy && !items.length ? (
          <p>
            Žádné položky.{' '}
            {radio
              ? 'Vyhledejte stanici podle názvu.'
              : 'Přidejte playlisty do knihovny Music Assistantu.'}
          </p>
        ) : null}
        {filter && items.some((i) => !i.providers.length) ? (
          <p>
            U části playlistů Music Assistant účet neuvádí. Vybrané playlisty přiřaďte ke své osobní
            řadě.
          </p>
        ) : null}
        <div className="kn-picker-grid">
          {filterPlaylists(items, filter, radio ? '' : query).map((item, i) => {
            const checked = chosen.some((c) => c.uri === item.uri);
            return (
              <button
                type="button"
                key={item.uri}
                aria-pressed={checked}
                disabled={!checked && max > 1 && chosen.length >= max}
                onClick={() => {
                  if (max === 1) {
                    onChoose([item]);
                    onClose();
                  } else
                    setChosen((old) =>
                      checked ? old.filter((c) => c.uri !== item.uri) : [...old, item],
                    );
                }}
              >
                <Artwork item={item} index={i} />
                <span>{item.name}</span>
                {checked ? <span>✓</span> : null}
              </button>
            );
          })}
        </div>
        {offset !== null ? (
          <Button disabled={busy} onClick={() => void load(offset)}>
            Načíst další
          </Button>
        ) : null}
      </div>
    </KitchenSheet>
  );
}
function EntitySelect({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string | null;
  items: Candidate[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Nenastaveno</option>
        {value && !items.some((i) => i.entity_id === value) ? (
          <option value={value}>Nedostupná entita ({value})</option>
        ) : null}
        {items.map((i) => (
          <option key={i.entity_id} value={i.entity_id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Settings({
  api,
  snapshot,
  onSaved,
  onClose,
}: {
  api: KitchenApi;
  snapshot: KitchenSnapshot;
  onSaved: () => void;
  onClose: () => void;
}) {
  useBackClosable(onClose);
  const [cfg, setCfg] = useState<KitchenConfig>(() => structuredClone(snapshot.config));
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<'radios' | 'more_radios' | number | null>(null);
  const patch = (p: Partial<KitchenConfig>) => setCfg((old) => ({ ...old, ...p }));
  const person = (i: number, p: Partial<KitchenConfig['persons'][number]>) =>
    patch({ persons: cfg.persons.map((v, n) => (n === i ? { ...v, ...p } : v)) });
  const candidates = snapshot.candidates;
  if (!snapshot.is_admin || !candidates) return null;
  return (
    <KitchenSheet
      title="Nastavení kuchyně"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.save(cfg);
              toast.success('Nastavení uloženo');
              onSaved();
              onClose();
            } catch {
              toast.error(
                'Nastavení se nepodařilo uložit. Zkontrolujte hodnoty a zkuste to znovu.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Uložit nastavení
        </Button>
      }
    >
      <div className="kn-form" data-testid="kitchen-settings">
        <EntitySelect
          label="Výstup · přehrávač Music Assistantu"
          value={cfg.player}
          items={candidates.players}
          onChange={(player) => patch({ player })}
        />
        {!candidates.players.length ? (
          <p>
            Nejprve přidejte přehrávač do Music Assistantu. USB reproduktor je výstup tabletu, sám
            není přehrávačem HA.
          </p>
        ) : null}
        {(['radios', 'more_radios'] as const).map((key) => (
          <section key={key}>
            <h3>{key === 'radios' ? 'Pět hlavních rádií' : 'Další rádia (nejvýše 10)'}</h3>
            <Button onClick={() => setPicker(key)}>Vyhledat a vybrat rádia</Button>
            {cfg[key].map((r, i) => (
              <div className="kn-setting-row" key={r.uri}>
                <span>
                  {i + 1}. {r.name}
                </span>
                <Button
                  aria-label={`Odebrat ${r.name}`}
                  onClick={() => patch({ [key]: cfg[key].filter((x) => x.uri !== r.uri) })}
                >
                  Odebrat
                </Button>
              </div>
            ))}
          </section>
        ))}
        {cfg.persons.map((p, i) => (
          <fieldset key={i}>
            <legend>Osobní knihovna {i + 1}</legend>
            <label>
              Název řady
              <input
                value={p.name}
                maxLength={40}
                onChange={(e) => person(i, { name: e.target.value })}
              />
            </label>
            <EntitySelect
              label="Osoba v Home Assistantu"
              value={p.person_entity}
              items={candidates.persons}
              onChange={(person_entity) => person(i, { person_entity })}
            />
            <label>
              Označení hudebního účtu
              <input
                value={p.provider}
                maxLength={120}
                placeholder="Např. Osobní účet"
                onChange={(e) => person(i, { provider: e.target.value, playlists: [] })}
              />
            </label>
            <Button onClick={() => setPicker(i)}>
              Vybrat pět playlistů ({p.playlists.length}/5)
            </Button>
            <p>{p.playlists.map((x) => x.name).join(' · ') || 'Žádné playlisty'}</p>
            <label>
              Odkaz na aplikaci YouTube
              <input
                value={p.youtube_url}
                maxLength={1024}
                onChange={(e) => person(i, { youtube_url: e.target.value })}
              />
            </label>
            <Button
              disabled={cfg.persons.length <= 1}
              onClick={() => patch({ persons: cfg.persons.filter((_, n) => n !== i) })}
            >
              Odebrat osobu
            </Button>
          </fieldset>
        ))}
        <Button
          disabled={cfg.persons.length >= 6}
          onClick={() =>
            patch({
              persons: [
                ...cfg.persons,
                {
                  name: 'Další osoba',
                  person_entity: null,
                  provider: '',
                  playlists: [],
                  youtube_url: 'vnd.youtube://',
                },
              ],
            })
          }
        >
          Přidat osobu
        </Button>
        <EntitySelect
          label="Baterie tabletu (%)"
          value={cfg.battery_sensor}
          items={candidates.sensors}
          onChange={(battery_sensor) => patch({ battery_sensor })}
        />
        <EntitySelect
          label="Stav nabíjení tabletu"
          value={cfg.battery_state_sensor}
          items={candidates.sensors}
          onChange={(battery_state_sensor) => patch({ battery_state_sensor })}
        />
        <label>
          Odkaz na aplikaci MEATER
          <input
            value={cfg.meater_url}
            maxLength={1024}
            onChange={(e) => patch({ meater_url: e.target.value })}
          />
        </label>
        <label>
          Odpočinek masa (min)
          <input
            type="number"
            min={1}
            max={120}
            value={cfg.rest_minutes}
            onChange={(e) => patch({ rest_minutes: Number(e.target.value) })}
          />
        </label>
        <p>Přepnutí účtu Google provedete uvnitř aplikace YouTube.</p>
      </div>
      {picker !== null ? (
        <Picker
          api={api}
          title={typeof picker === 'number' ? 'Osobní playlisty' : 'Vybrat rádia'}
          radio={typeof picker !== 'number'}
          provider={typeof picker === 'number' ? cfg.persons[picker]!.provider : ''}
          selected={typeof picker === 'number' ? cfg.persons[picker]!.playlists : cfg[picker]}
          max={picker === 'more_radios' ? 10 : 5}
          onChoose={(items) => {
            if (typeof picker === 'number') person(picker, { playlists: items });
            else patch({ [picker]: items });
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </KitchenSheet>
  );
}
