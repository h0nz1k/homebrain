import { useEffect, useState } from 'react';
import { navigatePanel, navigateUp } from '@homebrain/ha-client';
import { Chip, EmptyState, toast } from '@homebrain/ui';
import { RecipesApiError, type RecipesApi } from '../api.js';
import { formatDuration, kroky, scaleIngredients, suroviny } from '../domain/scale.js';
import type { Ingredient, RecipeDraft, RecipesConfig, Step } from '../types.js';
import { Icon } from './parts.js';

const BASE = '/recipes';
const IMPORT_ERRORS: Record<string, string> = {
  IMPORT_URL_NOT_ALLOWED: 'Tahle adresa není povolená (jen veřejné https stránky).',
  IMPORT_NO_RECIPE: 'Na stránce jsem nenašel recept ve strukturovaných datech.',
  IMPORT_FETCH_FAILED: 'Stránku se nepodařilo stáhnout.',
  IMPORT_TOO_LARGE: 'Stránka je příliš velká.',
};

const EMPTY: RecipeDraft = {
  title: '',
  description: null,
  notes: null,
  servings: 4,
  prepSeconds: null,
  cookSeconds: null,
  totalSeconds: null,
  sourceUrl: null,
  sourceName: null,
  youtubeId: null,
  tags: [],
  ingredients: [],
  steps: [],
};

const UNIT_RE =
  /^(\d+(?:[.,]\d+)?|½|¼|¾|⅓)\s*(g|dkg|kg|ml|dl|l|lžíce|lžíci|lžička|lžičky|lžičku|hrnek|hrnku|ks|kusy|špetka|špetku|stroužek|stroužky)?\s+(.+)$/i;
/** Light client-side line parser for the manual form (server re-validates; import uses the full parser). */
export function parseIngredientLine(line: string, group: string | null = null): Ingredient {
  const m = UNIT_RE.exec(line.trim());
  if (!m) return { qty: null, unit: null, name: line.trim(), group, note: null, countable: false };
  const raw = m[1]!.replace(',', '.');
  const qty = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3 }[raw] ?? Number(raw);
  const unitRaw = (m[2] ?? '').toLowerCase();
  const unit =
    {
      lžíci: 'lžíce',
      lžičky: 'lžička',
      lžičku: 'lžička',
      hrnku: 'hrnek',
      kusy: 'ks',
      špetku: 'špetka',
      stroužky: 'stroužek',
    }[unitRaw] ??
    (unitRaw || null);
  return {
    qty,
    unit: unit === 'ks' ? null : unit,
    name: m[3]!.trim(),
    group,
    note: null,
    countable: !unit || unit === 'ks' || unit === 'stroužek',
  };
}
const DURATION_RE = /(\d+(?:[.,]\d+)?)\s*(minut[ay]?|min|hodin[ay]?|hod)\b|p[ůu]l\s+hodiny/i;
export function detectSeconds(text: string): number | null {
  const m = DURATION_RE.exec(text);
  if (!m) return null;
  if (!m[1]) return 1800;
  const n = Number(m[1].replace(',', '.'));
  return Math.round(/^h/i.test(m[2]!) ? n * 3600 : n * 60);
}

function draftToText(draft: RecipeDraft) {
  return {
    ingredients: draft.ingredients
      .map((i) => [i.qty ?? '', i.unit ?? '', i.name].filter((x) => x !== '').join(' '))
      .join('\n'),
    steps: draft.steps.map((s) => s.text).join('\n'),
  };
}

export function AddRecipe({
  api,
  config,
  editId,
}: {
  api: RecipesApi;
  config: RecipesConfig | null;
  editId?: string;
}) {
  const [mode, setMode] = useState<'url' | 'manual'>(editId ? 'manual' : 'url');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<(RecipeDraft & { photoUrl?: string | null }) | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft>(EMPTY);
  const [ingText, setIngText] = useState('');
  const [stepText, setStepText] = useState('');
  const [tagText, setTagText] = useState('');

  useEffect(() => {
    if (!editId) return;
    api
      .get(editId)
      .then((r) => {
        setDraft(r);
        const t = draftToText(r);
        setIngText(t.ingredients);
        setStepText(t.steps);
        setTagText(r.tags.join(', '));
      })
      .catch(() => toast.error('Recept se nepodařilo načíst'));
  }, [api, editId]);

  if (config && !config.canEdit) {
    return <div className="rc-empty">Recepty může přidávat jen správce.</div>;
  }

  const runImport = () => {
    setBusy(true);
    setError(null);
    api
      .importUrl(url.trim())
      .then((res) => {
        setPreview(res.preview);
        setDuplicate(res.duplicateOf);
      })
      .catch((err: unknown) =>
        setError(
          IMPORT_ERRORS[err instanceof RecipesApiError ? err.code : ''] ?? 'Import se nepodařil.',
        ),
      )
      .finally(() => setBusy(false));
  };
  const save = (recipe: RecipeDraft, photoUrl?: string | null) => {
    setBusy(true);
    const { photoUrl: _drop, ...clean } = recipe as RecipeDraft & { photoUrl?: string | null };
    void _drop;
    const call = editId ? api.update(editId, clean) : api.create(clean, photoUrl);
    call
      .then((saved) => {
        toast.success(editId ? 'Recept uložen' : 'Recept přidán');
        navigatePanel(`${BASE}/${saved.id}`, true);
      })
      .catch(() => toast.error('Recept se nepodařilo uložit'))
      .finally(() => setBusy(false));
  };
  const saveManual = () => {
    const ingredients = ingText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => parseIngredientLine(l));
    const steps: Step[] = stepText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((text, i) => ({
        text,
        group: null,
        timerSeconds: detectSeconds(text),
        videoTs: draft.steps[i]?.videoTs ?? null,
        airfryer: draft.steps[i]?.airfryer ?? null,
      }));
    if (!draft.title.trim()) {
      setError('Vyplňte název receptu.');
      return;
    }
    save({
      ...draft,
      ingredients,
      steps,
      tags: tagText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    });
  };

  const stepLines = stepText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const changeAirfryer = (index: number, airfryer: Step['airfryer']) => {
    setDraft((previous) => ({
      ...previous,
      steps: stepLines.map((text, i) => ({
        group: previous.steps[i]?.group ?? null,
        text,
        timerSeconds: previous.steps[i]?.timerSeconds ?? detectSeconds(text),
        videoTs: previous.steps[i]?.videoTs ?? null,
        airfryer: i === index ? airfryer : (previous.steps[i]?.airfryer ?? null),
      })),
    }));
  };

  return (
    <>
      <header className="rc-top">
        <button
          type="button"
          className="rc-ibtn"
          aria-label="Zpět"
          onClick={() => navigateUp(editId ? `${BASE}/${editId}` : BASE)}
        >
          <Icon name="back" />
        </button>
        <div className="rc-ttl">
          <h1>{editId ? 'Upravit recept' : 'Přidat recept'}</h1>
        </div>
        {!editId ? (
          <div className="rc-seg" style={{ marginLeft: 'auto' }}>
            <button type="button" aria-pressed={mode === 'url'} onClick={() => setMode('url')}>
              Z odkazu
            </button>
            <button
              type="button"
              aria-pressed={mode === 'manual'}
              onClick={() => setMode('manual')}
            >
              Ručně
            </button>
          </div>
        ) : null}
      </header>
      {mode === 'url' ? (
        <div className="rc-add" data-testid="recipes-import">
          <section className="rc-box">
            <h2>Vložte odkaz na recept</h2>
            <p className="sub">
              Načtu suroviny, postup, časy i fotku. Funguje s weby, které recept popisují
              strukturovaně (schema.org).
            </p>
            <form
              className="rc-field"
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim()) runImport();
              }}
            >
              <Icon name="search" />
              <input
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={url}
                aria-label="Adresa receptu"
                data-testid="recipes-import-url"
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                type="submit"
                className="rc-btn rc-pri"
                disabled={busy || !url.trim()}
                data-testid="recipes-import-go"
              >
                {busy ? 'Načítám…' : 'Načíst'}
              </button>
            </form>
            {error ? <p className="rc-err">{error}</p> : null}
            <div className="rc-howto">
              <b>Tip:</b> v telefonu klepněte u receptu na „Sdílet → Kopírovat odkaz“ a vložte ho
              sem. Fotka se uloží do Home Assistantu, ne na cizí server.
            </div>
            <details className="rc-settings">
              <summary>
                <Icon name="gear" /> Nastavení tabletu
              </summary>
              <MusicSettings api={api} />
              <TimerNotifySettings api={api} />
            </details>
          </section>
          <section className="rc-box rc-prev">
            {preview ? (
              <ImportPreviewCard
                preview={preview}
                duplicate={duplicate}
                busy={busy}
                onSave={() => save(preview, preview.photoUrl)}
                onEdit={() => {
                  setDraft(preview);
                  const t = draftToText(preview);
                  setIngText(t.ingredients);
                  setStepText(t.steps);
                  setTagText(preview.tags.join(', '));
                  setMode('manual');
                }}
              />
            ) : (
              <div className="rc-empty">Náhled receptu se objeví tady.</div>
            )}
          </section>
        </div>
      ) : (
        <div className="rc-add" data-testid="recipes-form">
          <section className="rc-box">
            <label className="rc-lbl2" htmlFor="rc-title">
              Název
            </label>
            <input
              id="rc-title"
              className="rc-inp"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <div className="rc-row3">
              <div>
                <label className="rc-lbl2" htmlFor="rc-serv">
                  Porce
                </label>
                <input
                  id="rc-serv"
                  className="rc-inp"
                  type="number"
                  min={1}
                  max={40}
                  value={draft.servings ?? ''}
                  onChange={(e) => setDraft({ ...draft, servings: Number(e.target.value) || null })}
                />
              </div>
              <div>
                <label className="rc-lbl2" htmlFor="rc-total">
                  Celkem (min)
                </label>
                <input
                  id="rc-total"
                  className="rc-inp"
                  type="number"
                  min={0}
                  value={draft.totalSeconds ? Math.round(draft.totalSeconds / 60) : ''}
                  onChange={(e) =>
                    setDraft({ ...draft, totalSeconds: Number(e.target.value) * 60 || null })
                  }
                />
              </div>
              <div>
                <label className="rc-lbl2" htmlFor="rc-tags">
                  Štítky
                </label>
                <input
                  id="rc-tags"
                  className="rc-inp"
                  value={tagText}
                  placeholder="polévka, rychlé"
                  onChange={(e) => setTagText(e.target.value)}
                />
              </div>
            </div>
            <label className="rc-lbl2" htmlFor="rc-ing">
              Suroviny (jedna na řádek, např. „2 lžíce mouky“)
            </label>
            <textarea
              id="rc-ing"
              className="rc-inp"
              value={ingText}
              onChange={(e) => setIngText(e.target.value)}
            />
          </section>
          <section className="rc-box">
            <label className="rc-lbl2" htmlFor="rc-steps">
              Postup (krok na řádek – časy jako „20 minut“ poznám sám)
            </label>
            <textarea
              id="rc-steps"
              className="rc-inp"
              style={{ minHeight: 260 }}
              value={stepText}
              onChange={(e) => setStepText(e.target.value)}
            />
            {stepLines.map((text, i) => {
              const action = draft.steps[i]?.airfryer;
              return (
                <fieldset className="rc-step-editor" key={i}>
                  <legend>Krok {i + 1}</legend>
                  <p>{text}</p>
                  <label className="rc-check-label">
                    <input
                      type="checkbox"
                      aria-label={`Fritéza u kroku ${i + 1}`}
                      checked={Boolean(action)}
                      onChange={(e) =>
                        changeAirfryer(
                          i,
                          e.target.checked ? { temperature: 180, minutes: 20, method: null } : null,
                        )
                      }
                    />
                    <Icon name="fryer" /> Přidat akci fritézy
                  </label>
                  {action ? (
                    <div className="rc-row3">
                      <label className="rc-lbl2">
                        Teplota (°C)
                        <input
                          className="rc-inp"
                          type="number"
                          min="40"
                          max="240"
                          aria-label={`Teplota kroku ${i + 1} (°C)`}
                          value={action.temperature}
                          onChange={(e) =>
                            changeAirfryer(i, { ...action, temperature: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="rc-lbl2">
                        Doba (min)
                        <input
                          className="rc-inp"
                          type="number"
                          min="1"
                          max="120"
                          aria-label={`Doba kroku ${i + 1} (min)`}
                          value={action.minutes}
                          onChange={(e) =>
                            changeAirfryer(i, { ...action, minutes: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="rc-lbl2">
                        Program
                        <select
                          className="rc-inp"
                          aria-label={`Program kroku ${i + 1}`}
                          value={action.method ?? ''}
                          onChange={(e) =>
                            changeAirfryer(i, { ...action, method: e.target.value || null })
                          }
                        >
                          <option value="">Beze změny</option>
                          {[
                            ...new Set([
                              ...(config?.airfryer.methods ?? []),
                              ...(action.method ? [action.method] : []),
                            ]),
                          ].map((method) => (
                            <option key={method}>{method}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                  <small>Spuštění se potvrzuje až při vaření. Uložení neovládá spotřebič.</small>
                </fieldset>
              );
            })}
            <label className="rc-lbl2" htmlFor="rc-yt">
              YouTube video (ID nebo odkaz, nepovinné)
            </label>
            <input
              id="rc-yt"
              className="rc-inp"
              value={draft.youtubeId ?? ''}
              onChange={(e) => {
                const m = /(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/.exec(e.target.value);
                setDraft({ ...draft, youtubeId: m?.[1] ?? (e.target.value.trim() || null) });
              }}
            />
            {error ? <p className="rc-err">{error}</p> : null}
            <div className="rc-foot">
              <button
                type="button"
                className="rc-btn rc-sec"
                onClick={() => navigateUp(editId ? `${BASE}/${editId}` : BASE)}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="rc-btn rc-pri"
                disabled={busy}
                data-testid="recipes-save"
                onClick={saveManual}
              >
                Uložit recept
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ImportPreviewCard({
  preview,
  duplicate,
  busy,
  onSave,
  onEdit,
}: {
  preview: RecipeDraft & { photoUrl?: string | null };
  duplicate: string | null;
  busy: boolean;
  onSave: () => void;
  onEdit: () => void;
}) {
  const ings = scaleIngredients(preview.ingredients, preview.servings, preview.servings ?? 1);
  const timed = preview.steps.filter((s) => s.timerSeconds).length;
  return (
    <div
      data-testid="recipes-preview"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <div className="rc-ph">
        {preview.photoUrl ? (
          <img src={preview.photoUrl} alt="" referrerPolicy="no-referrer" />
        ) : null}
      </div>
      <h3>{preview.title}</h3>
      <div className="rc-meta">
        {preview.totalSeconds ? <span>{formatDuration(preview.totalSeconds)}</span> : null}
        <i className="dot" />
        <span>{suroviny(preview.ingredients.length)}</span>
        <i className="dot" />
        <span>
          {kroky(preview.steps.length)}
          {timed ? ` · ${timed}× časovač` : ''}
        </span>
      </div>
      {preview.tags.length ? (
        <div className="rc-tagrow">
          {preview.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      ) : null}
      <ul className="rc-mini">
        {ings.slice(0, 10).map((i, k) => (
          <li key={k}>
            {i.name}
            {i.qtyText ? <b>{i.qtyText}</b> : null}
          </li>
        ))}
      </ul>
      {duplicate ? <p className="rc-err">Tento recept už máte uložený.</p> : null}
      <div className="rc-foot">
        <button type="button" className="rc-btn rc-sec" onClick={onEdit}>
          Upravit
        </button>
        <button
          type="button"
          className="rc-btn rc-pri"
          disabled={busy}
          data-testid="recipes-import-save"
          onClick={onSave}
        >
          <Icon name="check" /> Uložit recept
        </button>
      </div>
    </div>
  );
}

/** Admin: pick the Companion notify target of the kitchen tablet (music bar hidden until set). */
function MusicSettings({ api }: { api: RecipesApi }) {
  const [state, setState] = useState<{
    musicNotifyService: string | null;
    availableNotifyServices: string[];
  } | null>(null);
  useEffect(() => {
    api
      .settings()
      .then(setState)
      .catch(() => undefined);
  }, [api]);
  if (!state) return null;
  return (
    <div className="rc-howto">
      <label className="rc-lbl2" htmlFor="rc-notify" style={{ marginTop: 0 }}>
        <Icon name="music" /> Tablet pro hudbu (YouTube Music přes HA Companion)
      </label>
      <select
        id="rc-notify"
        className="rc-inp"
        value={state.musicNotifyService ?? ''}
        onChange={(e) => {
          const value = e.target.value || null;
          api
            .setSettings(value)
            .then(() => {
              setState({ ...state, musicNotifyService: value });
              toast.success(value ? 'Tablet pro hudbu nastaven' : 'Ovládání hudby vypnuto');
            })
            .catch(() => toast.error('Nastavení se nepodařilo uložit'));
        }}
      >
        <option value="">Nenastaveno – lišta hudby se nezobrazí</option>
        {state.availableNotifyServices.map((s) => (
          <option key={s} value={s}>
            notify.{s}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Admin: who gets „⏰ Minutka: … – hotovo“ from HA when a timer ends (default nobody). */
function TimerNotifySettings({ api }: { api: RecipesApi }) {
  const [state, setState] = useState<{ selected: string[]; available: string[] } | null>(null);
  useEffect(() => {
    api
      .settings()
      .then((s) =>
        setState({
          selected: s.timerNotifyTargets ?? [],
          available: s.availableTimerNotifyTargets ?? [],
        }),
      )
      .catch(() => undefined);
  }, [api]);
  if (!state) return null;
  const toggle = (target: string, on: boolean) => {
    const selected = on ? [...state.selected, target] : state.selected.filter((t) => t !== target);
    api
      .setTimerNotifyTargets(selected)
      .then(() => setState({ ...state, selected }))
      .catch(() => toast.error('Nastavení se nepodařilo uložit'));
  };
  return (
    <fieldset className="rc-howto rc-tnotify" data-testid="recipes-timer-notify">
      <legend className="rc-lbl2">
        <Icon name="timer" /> Upozornění na doběhlou minutku
      </legend>
      Minutky běží v Home Assistantu, takže doběhnou i při zavřeném tabletu. Vybraná zařízení
      dostanou zprávu „⏰ Minutka: … – hotovo“.
      {state.available.length ? (
        <div className="targets">
          {state.available.map((target) => (
            <Chip
              key={target}
              pressed={state.selected.includes(target)}
              onPressedChange={(on) => toggle(target, on)}
            >
              notify.{target}
            </Chip>
          ))}
        </div>
      ) : (
        <EmptyState title="Žádná notifikační služba">
          V Home Assistantu zatím není služba notify.
        </EmptyState>
      )}
    </fieldset>
  );
}
