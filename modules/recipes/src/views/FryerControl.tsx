import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { navigateUp, useBackClosable, type EntityStore } from '@homebrain/ha-client';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  SegmentedControl,
  Sheet,
  Switch,
  toast,
} from '@homebrain/ui';
import { RecipesApiError, type FryerApi, type RecipesApi } from '../api.js';
import {
  DEFAULT_MANUAL,
  blockerText,
  favouriteLine,
  favouriteToManual,
  liveBlockers,
  startLabel,
  startRequest,
  stepSetting,
  validateFavourite,
  type FryerFavourite,
  type FryerFavouriteDraft,
  type FryerInfo,
  type FryerLimits,
  type ManualSettings,
  type SettingKey,
} from '../domain/fryerManual.js';
import { detectFryerEntities, fryerPhase, fryerVisible } from '../domain/fryerLive.js';
import { readFryerStates } from '../fryerSignal.js';
import { FryerLiveCard } from './FryerLive.js';
import { FryerVisual } from './FryerPhoto.js';
import { Icon } from './parts.js';

type Tab = 'manual' | 'favourites' | 'presets';
const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['manual', 'Ručně'],
  ['favourites', 'Oblíbené'],
  ['presets', 'Předvolby'],
];

const errorCode = (err: unknown) => (err instanceof RecipesApiError ? err.code : 'DEVICE_FAILED');

function useStoreVersion(store: EntityStore) {
  return useSyncExternalStore(
    (cb) => store.subscribeAll(cb),
    () => store.lastUpdatedAt(),
    () => store.lastUpdatedAt(),
  );
}

/** −/+ row for one setting (temperature in 5 °C steps). */
function SettingRow({
  k,
  label,
  hint,
  value,
  unit,
  limits,
  disabled,
  onChange,
}: {
  k: SettingKey;
  label: string;
  hint?: string;
  value: number;
  unit: string;
  limits: FryerLimits;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const [low, high] = limits[k];
  return (
    <div className="rcf-row" data-testid={`fryer-row-${k}`}>
      <span className="rcf-row-l">
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      <div className="rc-stepper" role="group" aria-label={label}>
        <button
          type="button"
          aria-label={`${label} méně`}
          disabled={disabled || value <= low}
          onClick={() => onChange(stepSetting(k, value, -1, limits))}
        >
          <Icon name="minus" />
        </button>
        <output className="v" data-testid={`fryer-${k}`} aria-live="polite">
          {value} {unit}
        </output>
        <button
          type="button"
          aria-label={`${label} více`}
          disabled={disabled || value >= high}
          onClick={() => onChange(stepSetting(k, value, 1, limits))}
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}

function SettingsForm({
  value,
  info,
  disabled,
  onChange,
}: {
  value: ManualSettings;
  info: FryerInfo;
  disabled?: boolean;
  onChange: (next: ManualSettings) => void;
}) {
  const set = (patch: Partial<ManualSettings>) => onChange({ ...value, ...patch });
  return (
    <div className="rcf-form">
      <SettingRow
        k="temperature"
        label="Teplota"
        unit="°C"
        value={value.temperature}
        limits={info.limits}
        disabled={disabled}
        onChange={(temperature) => set({ temperature })}
      />
      {info.capabilities.probe ? (
        <div className="rcf-row">
          <span className="rcf-row-l">
            Pečení podle sondy
            <small>Fritéza skončí, až jídlo uvnitř dosáhne teploty.</small>
          </span>
          <Switch
            label="Pečení podle sondy"
            checked={value.probe}
            disabled={disabled}
            data-testid="fryer-probe"
            onChange={(probe) => set({ probe })}
          />
        </div>
      ) : null}
      {/* Probe mode replaces the time: the core temperature ends the cooking, not a clock. */}
      {info.capabilities.probe && value.probe ? (
        <SettingRow
          k="probe_temperature"
          label="Teplota jídla (sonda)"
          hint="Čas určí sonda"
          unit="°C"
          value={value.probe_temperature}
          limits={info.limits}
          disabled={disabled}
          onChange={(probe_temperature) => set({ probe_temperature })}
        />
      ) : (
        <SettingRow
          k="minutes"
          label="Čas"
          unit="min"
          value={value.minutes}
          limits={info.limits}
          disabled={disabled}
          onChange={(minutes) => set({ minutes })}
        />
      )}
      {info.capabilities.airSpeed ? (
        <div className="rcf-row">
          <span className="rcf-row-l">
            Vzduch
            <small>Slabý na pečivo, silný na hranolky a maso.</small>
          </span>
          <SegmentedControl
            label="Proudění vzduchu"
            hideLabel
            size="sm"
            disabled={disabled}
            value={value.air_speed <= 1 ? '1' : '2'}
            options={[
              ['1', 'Slabé'],
              ['2', 'Silné'],
            ]}
            onChange={(v) => set({ air_speed: Number(v) })}
          />
        </div>
      ) : null}
    </div>
  );
}

function summary(s: ManualSettings) {
  return favouriteLine({
    temperature: s.temperature,
    minutes: s.minutes,
    air_speed: s.air_speed,
    probe_temperature: s.probe ? s.probe_temperature : null,
  });
}

function StartConfirm({
  fryer,
  settings,
  name,
  onClose,
}: {
  fryer: FryerApi;
  settings: ManualSettings;
  name?: string;
  onClose: () => void;
}) {
  useBackClosable(onClose);
  return (
    <ConfirmDialog
      title={name ? `Spustit „${name}“?` : 'Spustit fritézu?'}
      confirmLabel="Spustit"
      confirmIcon={<Icon name="play" />}
      data-testid="fryer-start-dialog"
      confirmTestId="fryer-start-confirm"
      onConfirm={async () => {
        try {
          const res = await fryer.start(startRequest(settings));
          if (res.verified) {
            toast.success(
              settings.probe
                ? `Fritéza peče · sonda ${settings.probe_temperature} °C`
                : `Fritéza peče · ${settings.minutes} min`,
            );
          } else toast.info('Příkaz odeslán, fritéza zatím start nepotvrdila');
          return true;
        } catch (err) {
          toast.error(blockerText(errorCode(err)));
          return false;
        }
      }}
      onClose={onClose}
    >
      {summary(settings)}. Je v šuplíku jídlo a je zasunutý?
    </ConfirmDialog>
  );
}

function FavouriteSheet({
  fryer,
  info,
  initial,
  onSaved,
  onClose,
}: {
  fryer: FryerApi;
  info: FryerInfo;
  initial: FryerFavouriteDraft;
  onSaved: (list: FryerFavourite[]) => void;
  onClose: () => void;
}) {
  useBackClosable(onClose);
  const [name, setName] = useState(initial.name);
  const [settings, setSettings] = useState<ManualSettings>(
    favouriteToManual({ ...initial, id: initial.id ?? '' }),
  );
  const [busy, setBusy] = useState(false);
  const draft: FryerFavouriteDraft = {
    ...(initial.id ? { id: initial.id } : {}),
    name,
    temperature: settings.temperature,
    minutes: settings.minutes,
    air_speed: settings.air_speed,
    probe_temperature: settings.probe ? settings.probe_temperature : null,
  };
  const problem = validateFavourite(draft, info.limits);
  const save = () => {
    setBusy(true);
    fryer
      .saveFavourite(draft)
      .then((list) => {
        onSaved(list);
        toast.success('Oblíbené uloženo');
        onClose();
      })
      .catch((err: unknown) => toast.error(blockerText(errorCode(err))))
      .finally(() => setBusy(false));
  };
  return (
    <Sheet
      title={initial.id ? 'Upravit oblíbené' : 'Nové oblíbené'}
      onClose={onClose}
      data-testid="fryer-fav-sheet"
      footer={
        <Button
          variant="primary"
          block
          loading={busy}
          disabled={Boolean(problem)}
          data-testid="fryer-fav-save"
          onClick={save}
        >
          Uložit
        </Button>
      }
    >
      <label className="rcf-name">
        <span>Název</span>
        <input
          value={name}
          maxLength={40}
          placeholder="Např. Hranolky"
          data-testid="fryer-fav-name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <SettingsForm value={settings} info={info} onChange={setSettings} />
      {problem && name ? <p className="rcf-err">{problem}</p> : null}
    </Sheet>
  );
}

function Blocker({ code, onStop }: { code: string; onStop?: () => void }) {
  return (
    <div className="rcf-note" data-testid="fryer-blocker" data-code={code} role="status">
      <Icon name={code === 'AIRFRYER_DRAWER_OPEN' ? 'drawer' : 'alert'} />
      <span>{blockerText(code)}</span>
      {onStop ? (
        <Button size="sm" variant="danger" data-testid="fryer-stop" onClick={onStop}>
          Zastavit
        </Button>
      ) : null}
    </div>
  );
}

export function FryerRoute({ api, store }: { api: RecipesApi; store: EntityStore }) {
  const fryer = api.fryer;
  const [info, setInfo] = useState<FryerInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('manual');
  const [settings, setSettings] = useState<ManualSettings>(DEFAULT_MANUAL);
  const [confirm, setConfirm] = useState<{ settings: ManualSettings; name?: string } | null>(null);
  const [editing, setEditing] = useState<FryerFavouriteDraft | null>(null);
  const [removing, setRemoving] = useState<FryerFavourite | null>(null);
  const [stopping, setStopping] = useState(false);
  useStoreVersion(store);
  const load = useCallback(() => {
    fryer
      ?.get()
      .then((i) => (setInfo(i), setFailed(false)))
      .catch(() => setFailed(true));
  }, [fryer]);
  useEffect(load, [load]);

  // Same sub-page header as Přidat recept: icon-only back (the app bar already says Recepty).
  const back = (
    <button
      type="button"
      className="rc-ibtn"
      aria-label="Zpět na recepty"
      data-testid="fryer-back"
      onClick={() => navigateUp('/recipes')}
    >
      <Icon name="back" />
    </button>
  );
  if (!fryer || failed || (info && !info.configured)) {
    return (
      <section className="rcf" data-testid="fryer-view">
        <header className="rcf-top">{back}</header>
        <EmptyState title="Fritéza není připojená">
          Přidejte fritézu do Home Assistantu (integrace Philips HomeID), pak ji tady půjde
          spouštět.
        </EmptyState>
      </section>
    );
  }
  if (!info) return <section className="rcf" data-testid="fryer-view" aria-busy="true" />;

  const read = (id: string) => store.getSnapshot(id)?.state;
  const blockers = liveBlockers(info.entities, read);
  const busy = blockers.includes('AIRFRYER_BUSY');
  const can = info.canControl;
  const status = read(info.entities.status ?? '');
  const runningNow = status === 'cooking' || status === 'pause' || status === 'user_action';
  // Same detection as the live card: while it shows the fryer, the page hero steps aside.
  const liveEntities = detectFryerEntities(
    store.entityIds(),
    info.entities.status ? { recipes_airfryer_status: info.entities.status } : {},
  );
  const liveShown =
    liveEntities !== null && fryerVisible(fryerPhase(readFryerStates(store, liveEntities)));
  const control = (action: 'add_time', minutes: number) =>
    fryer
      .control(action, { minutes })
      .then((r) => toast.success(`Čas prodloužen na ${r.minutes ?? ''} min`))
      .catch((err: unknown) => toast.error(blockerText(errorCode(err))));
  const fav = info.favourites;

  return (
    <section className="rcf" data-testid="fryer-view">
      <header className="rcf-top">
        {back}
        <div className="rcf-ttl">
          <h1>Fritéza</h1>
          <p>Spuštění bez receptu</p>
        </div>
        {liveShown ? null : (
          // Calm idle hero: the owner's product photo (or the SVG fallback), no state effects.
          <div className="rcf-hero" data-testid="fryer-hero">
            <FryerVisual phase="idle" className="rcf-hero-art" />
          </div>
        )}
      </header>
      <FryerLiveCard
        api={api}
        store={store}
        statusEntity={info.entities.status}
        allowed={can}
        extra={
          can && runningNow && info.capabilities.addTime ? (
            <div className="rcf-add" role="group" aria-label="Přidat čas">
              <span>Přidat čas</span>
              <Button
                size="sm"
                data-testid="fryer-add-1"
                onClick={() => void control('add_time', 1)}
              >
                +1 min
              </Button>
              <Button
                size="sm"
                data-testid="fryer-add-5"
                onClick={() => void control('add_time', 5)}
              >
                +5 min
              </Button>
            </div>
          ) : null
        }
      />
      {!can ? (
        <p className="rcf-note" data-testid="fryer-readonly">
          <Icon name="alert" />
          <span>Fritézu může spustit jen dospělý. Tady vidíte, jak peče.</span>
        </p>
      ) : null}
      {busy ? null : (
        <SegmentedControl
          className="rcf-tabs"
          label="Způsob spuštění"
          hideLabel
          value={tab}
          options={TABS}
          onChange={setTab}
        />
      )}

      {tab === 'manual' && !busy ? (
        <div className="rcf-panel" data-testid="fryer-manual">
          <SettingsForm value={settings} info={info} disabled={!can} onChange={setSettings} />
          {can && blockers.length ? (
            <Blocker code={blockers[0]!} onStop={busy ? () => setStopping(true) : undefined} />
          ) : null}
          {can ? (
            <div className="rcf-cta">
              <Button
                variant="primary"
                size="lg"
                block
                icon={<Icon name="play" />}
                disabled={blockers.length > 0}
                data-testid="fryer-start"
                onClick={() => setConfirm({ settings })}
              >
                {startLabel(settings)}
              </Button>
              <Button
                variant="ghost"
                icon={<Icon name="heart" />}
                data-testid="fryer-save-fav"
                onClick={() =>
                  setEditing({
                    name: '',
                    temperature: settings.temperature,
                    minutes: settings.minutes,
                    air_speed: settings.air_speed,
                    probe_temperature: settings.probe ? settings.probe_temperature : null,
                  })
                }
              >
                Uložit do oblíbených
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'favourites' && !busy ? (
        <div className="rcf-panel" data-testid="fryer-favourites">
          {can && blockers.length ? (
            <Blocker code={blockers[0]!} onStop={busy ? () => setStopping(true) : undefined} />
          ) : null}
          {fav.length === 0 ? (
            <EmptyState title="Zatím žádné oblíbené">
              Uložte si nastavení, které často používáte – třeba hranolky na 200 °C a 18 minut.
            </EmptyState>
          ) : (
            <ul className="rcf-favs">
              {fav.map((f) => (
                <li key={f.id} className="rcf-fav" data-testid="fryer-fav">
                  <div className="rcf-fav-t">
                    <b>{f.name}</b>
                    <span>{favouriteLine(f)}</span>
                  </div>
                  {can ? (
                    <div className="rcf-fav-a">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Upravit ${f.name}`}
                        icon={<Icon name="edit" />}
                        onClick={() => setEditing(f)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Smazat ${f.name}`}
                        icon={<Icon name="trash" />}
                        onClick={() => setRemoving(f)}
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Icon name="play" />}
                        disabled={blockers.length > 0}
                        data-testid="fryer-fav-start"
                        onClick={() => setConfirm({ settings: favouriteToManual(f), name: f.name })}
                      >
                        Spustit
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {can ? (
            <Button
              icon={<Icon name="plus" />}
              data-testid="fryer-fav-add"
              onClick={() =>
                setEditing({
                  name: '',
                  temperature: 200,
                  minutes: 18,
                  air_speed: 2,
                  probe_temperature: null,
                })
              }
            >
              Nové oblíbené
            </Button>
          ) : null}
        </div>
      ) : null}

      {tab === 'presets' && !busy ? (
        <div className="rcf-panel" data-testid="fryer-presets">
          {info.presets.supported ? null : (
            <EmptyState title="Vestavěné programy spustíte jen na fritéze">
              Tahle fritéza je připojená přes cloud a její programy (hranolky, kuře, ryba…) na dálku
              spustit nejde. Uložte si vlastní nastavení do oblíbených – spustíte ho jedním
              klepnutím.
            </EmptyState>
          )}
          <Button icon={<Icon name="heart" />} onClick={() => setTab('favourites')}>
            Otevřít oblíbené
          </Button>
        </div>
      ) : null}

      {confirm ? (
        <StartConfirm
          fryer={fryer}
          settings={confirm.settings}
          name={confirm.name}
          onClose={() => setConfirm(null)}
        />
      ) : null}
      {editing ? (
        <FavouriteSheet
          fryer={fryer}
          info={info}
          initial={editing}
          onSaved={(favourites) => setInfo({ ...info, favourites })}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {removing ? (
        <RemoveFavourite
          fryer={fryer}
          favourite={removing}
          onDone={(favourites) => setInfo({ ...info, favourites })}
          onClose={() => setRemoving(null)}
        />
      ) : null}
      {stopping ? <StopFryer fryer={fryer} onClose={() => setStopping(false)} /> : null}
    </section>
  );
}

function RemoveFavourite({
  fryer,
  favourite,
  onDone,
  onClose,
}: {
  fryer: FryerApi;
  favourite: FryerFavourite;
  onDone: (list: FryerFavourite[]) => void;
  onClose: () => void;
}) {
  useBackClosable(onClose);
  return (
    <ConfirmDialog
      title={`Smazat „${favourite.name}“?`}
      confirmLabel="Smazat"
      danger
      confirmTestId="fryer-fav-delete-confirm"
      onConfirm={async () => onDone(await fryer.deleteFavourite(favourite.id))}
      onClose={onClose}
    >
      Oblíbené nastavení zmizí na všech zařízeních.
    </ConfirmDialog>
  );
}

function StopFryer({ fryer, onClose }: { fryer: FryerApi; onClose: () => void }) {
  useBackClosable(onClose);
  return (
    <ConfirmDialog
      title="Zastavit fritézu?"
      confirmLabel="Zastavit"
      cancelLabel="Nechat péct"
      danger
      confirmTestId="fryer-stop-confirm"
      onConfirm={async () => {
        await fryer.control('stop', { confirmed: true });
        toast.success('Fritéza zastavena');
      }}
      onClose={onClose}
    >
      Probíhající příprava skončí.
    </ConfirmDialog>
  );
}

export const fryerControlStyles = `
.rcf { display:flex; flex-direction:column; gap:16px; padding:8px 32px 32px; max-width:760px; }
.rcf-top { display:flex; align-items:center; gap:12px; padding-top:14px; }
.rcf-top .rc-ibtn { flex:none; }
.rcf-ttl { min-width:0; }
.rcf-hero { margin-left:auto; flex:none; display:grid; place-items:center; height:168px; padding-right:8px; }
.rcf-hero-art.rc-fp { --rc-fp-h:156px; }
.rcf-hero-art.rc-fa { height:156px; width:auto; }
.rcf-hero .rc-fp[data-phase='idle'] .rc-fp-img { opacity:1; filter:drop-shadow(0 0 1px color-mix(in srgb, var(--hb-t1) 26%, transparent)) drop-shadow(0 10px 16px rgb(0 0 0 / .22)); }
.rcf-ttl h1 { margin:0; font-size:28px; font-weight:680; letter-spacing:-.02em; }
.rcf-ttl p { margin:2px 0 0; color:var(--hb-t2); font-size:14px; }
.rcf-tabs { align-self:stretch; }
.rcf-panel { display:flex; flex-direction:column; gap:14px; padding:18px; border-radius:var(--hb-radius-lg, 20px); background:var(--hb-s1); box-shadow:var(--hb-elev-1); }
.rcf-form { display:flex; flex-direction:column; gap:4px; }
.rcf-row { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:68px; padding:12px 0; box-sizing:border-box; border-bottom:1px solid color-mix(in srgb, var(--hb-t1) 8%, transparent); }
.rcf-row:last-child { border-bottom:0; }
.rcf-row-l { display:flex; flex-direction:column; font-size:16px; font-weight:600; }
.rcf-row-l small { font-size:13px; font-weight:400; color:var(--hb-t2); margin-top:2px; }
.rcf .rc-stepper button:disabled { opacity:.4; cursor:not-allowed; }
.rcf .rc-stepper { height:44px; padding:3px; }
.rcf .rc-stepper button { width:38px; height:38px; }
.rcf .rc-stepper .v { min-width:88px; }
.rcf-cta { display:flex; flex-direction:column; gap:6px; }
.rcf-note { display:flex; align-items:center; gap:10px; margin:0; padding:12px 14px; border-radius:14px; font-size:14px; line-height:1.4; background:color-mix(in srgb, var(--hb-warn, #d97706) 14%, var(--hb-s1)); }
.rcf-note > span { flex:1; }
.rcf-note .rc-i { width:20px; height:20px; flex:none; }
.rcf-add { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:14px; font-weight:550; color:var(--hb-t2); }
.rcf-add > span { flex:1 1 auto; }
.rcf-favs { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
.rcf-fav { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:16px; background:color-mix(in srgb, var(--hb-t1) 5%, var(--hb-s1)); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 10%, transparent); flex-wrap:wrap; }
.rcf-fav-t { flex:1; min-width:160px; display:flex; flex-direction:column; gap:2px; }
.rcf-fav-t b { font-size:16px; font-weight:620; }
.rcf-fav-t span { font-size:14px; color:var(--hb-t2); }
.rcf-fav-a { display:flex; align-items:center; gap:4px; margin-left:auto; }
.rcf-name { display:flex; flex-direction:column; gap:6px; font-size:14px; font-weight:600; margin-bottom:8px; }
.rcf-name input { height:48px; padding:0 14px; border-radius:12px; border:0; font:inherit; font-weight:500; font-size:16px; color:var(--hb-t1); background:color-mix(in srgb, var(--hb-t1) 7%, var(--hb-s1)); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 12%, transparent); box-sizing:border-box; width:100%; }
.rcf-err { margin:8px 0 0; color:var(--hb-crit, #dc2626); font-size:14px; }
.rcf-hint { margin:0; color:var(--hb-t2); font-size:14px; }
@media (max-width: 700px) {
  .rcf { padding:4px 16px 24px; gap:14px; }
  .rcf-ttl h1 { font-size:24px; }
  .rcf-top { padding-top:6px; }
  .rcf-hero { height:112px; padding-right:4px; }
  .rcf-hero-art.rc-fp { --rc-fp-h:104px; }
  .rcf-hero-art.rc-fa { height:104px; }
  .rcf-panel { padding:14px; }
  .rcf .rc-stepper .v { min-width:76px; }
}
`;
