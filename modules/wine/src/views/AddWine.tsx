import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import type { StillSugar, WineColorCode, WineRecord, WineType } from '../domain/index.js';
import { SPARKLING_SUGAR, STILL_SUGAR, SUGAR_CS } from '../domain/index.js';
import { newOperationId } from '../api.js';
import type { WineApi } from '../api.js';
import {
  draftFromProposal,
  draftToWine,
  emptyDraft,
  normalizeEan,
  vivinoSearchUrl,
} from '../lookup.js';
import type {
  DraftErrors,
  LookupInput,
  LookupProposal,
  LookupProviderInfo,
  LookupResult,
  WineDraft,
} from '../lookup.js';
import { WineBottle } from './BottleArt.js';
import { errorText } from './Detail.js';
import { preparePhoto as defaultPreparePhoto } from './image.js';
import type { PreparePhoto } from './image.js';
import { Icon } from './parts.js';
import type { IconName } from './parts.js';
import {
  AI_HINT_CS,
  AI_NO_PHOTO_CS,
  COLOR_CS,
  TYPE_CS,
  bottles,
  lookupErrorText,
} from './labels.js';
import {
  CAMERA_ERROR_CS,
  cameraError,
  decodeImageFile,
  getDecoder,
  openCamera,
} from './scanner.js';
import type { CameraError } from './scanner.js';

type Step = 'start' | 'scan' | 'results' | 'form' | 'stock';
const COLORS: WineColorCode[] = ['white', 'red', 'rose', 'orange'];
const TYPES: WineType[] = ['still', 'sparkling', 'semi_sparkling'];
const PROVIDER_SHORT: Record<string, string> = {
  local: 'Vaše vinotéka',
  znovin: 'Znovín',
  openfoodfacts: 'Open Food Facts',
  web: 'Stránky výrobců',
  ai_task: 'AI',
};
const STATUS_CS: Record<string, string> = {
  ok: 'nalezeno',
  empty: 'nic',
  error: 'chyba',
  skipped: 'přeskočeno',
  unavailable: 'nedostupné',
};
/** Legal label terms offered in the „Obsah cukru“ field (EU 2019/33 Annex III A + B). */
const SUGAR_TERMS = [...STILL_SUGAR, ...SPARKLING_SUGAR].map((s) =>
  STILL_SUGAR.includes(s as StillSugar) ? SUGAR_CS[s].toLowerCase() : SUGAR_CS[s],
);
const FIELD_LABEL: Partial<Record<keyof WineDraft, string>> = {
  name: 'name',
  labelName: 'labelName',
  producer: 'producer',
  vintage: 'vintage',
  color: 'color',
  wineType: 'wineType',
  grapes: 'grapeVarieties',
  country: 'country',
  region: 'region',
  sweetness: 'sweetness',
  residualSugar: 'residualSugarGl',
  volumeMl: 'volumeMl',
  alcoholPct: 'alcoholPct',
  ean: 'ean',
};

const today = () => new Date().toISOString().slice(0, 10);

/** Pseudo record so proposals reuse the bottle tile (photo or colour-matched SVG). */
function previewRecord(p: LookupProposal | null, d: WineDraft, photo: string | null): WineRecord {
  const at = '1970-01-01T00:00:00Z';
  return {
    id: 'preview',
    name: d.name || p?.fields.name || 'Nové víno',
    producer: d.producer,
    vintage: null,
    wineType: d.wineType,
    color: d.color,
    grapeVarieties: [],
    country: null,
    region: null,
    sweetness: null,
    volumeMl: 750,
    alcoholPct: null,
    quantity: 0,
    location: null,
    acquiredOn: null,
    purchasePrice: null,
    personalRating: null,
    personalNote: null,
    status: 'in_stock',
    image: photo
      ? { localPath: photo, sourceUrl: null, licenseStatus: 'approved', url: photo }
      : null,
    source: {
      provider: 'local',
      externalProductId: null,
      batch: null,
      sourceUrl: null,
      fetchedAt: null,
    },
    confidence: 'manual',
    createdAt: at,
    updatedAt: at,
  };
}

function proposalRecord(p: LookupProposal): WineRecord {
  const f = p.fields;
  const base = previewRecord(p, emptyDraft(''), p.imageUrl);
  return {
    ...base,
    name: f.name ?? 'Víno',
    producer: f.producer ?? '',
    color: f.color ?? 'white',
    wineType: f.wineType ?? 'still',
  };
}

function confidenceLabel(p: LookupProposal, byEan: boolean): [string, 'ok' | 'soft'] {
  if (p.confidence === 'matched' || p.confidence === 'verified')
    return [byEan && p.fields.ean ? 'Shoda podle EAN' : 'Shoda', 'ok'];
  return [p.provider === 'ai_task' ? 'Přečteno AI' : 'Odhad', 'soft'];
}

function subline(p: LookupProposal) {
  const f = p.fields;
  return [
    f.producer,
    f.vintage ?? (f.wineType === 'sparkling' ? 'NV' : null),
    f.color ? COLOR_CS[f.color] : null,
    f.volumeMl ? `${(f.volumeMl / 1000).toLocaleString('cs-CZ')} l` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function AiHint({
  info,
  testId = 'wine-add-ai-hint',
}: {
  info?: LookupProviderInfo;
  testId?: string;
}) {
  const noPhoto = info?.available && info.photo === false;
  return (
    <div className="wine-sheet-hint" role="note" data-testid={testId}>
      <span className="wine-sheet-hint-ico" aria-hidden="true">
        <Icon name="sparkle" size={18} />
      </span>
      <span>
        <strong>{noPhoto ? 'AI neumí číst fotky' : 'Rozpoznání fotky není zapnuté'}</strong>
        <span>{noPhoto ? AI_NO_PHOTO_CS : AI_HINT_CS}</span>
      </span>
    </div>
  );
}

function Field({
  label,
  error,
  inferred,
  children,
  wide,
}: {
  label: string;
  error?: string;
  inferred?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className="wine-ff" data-wide={wide || undefined} data-error={error ? true : undefined}>
      <span className="wine-ff-l">
        {label}
        {inferred && (
          <span className="wine-ff-tag" title="Odhadnuto z textu – zkontrolujte">
            odhad
          </span>
        )}
      </span>
      {children}
      {error && (
        <span className="wine-ff-err" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

function Seg<T extends string>({
  label,
  value,
  options,
  names,
  onChange,
  testId,
  inferred,
}: {
  label: string;
  value: T;
  options: T[];
  names: Record<T, string>;
  onChange: (v: T) => void;
  testId: string;
  inferred?: boolean;
}) {
  return (
    <fieldset className="wine-ff wine-ff--seg" data-wide data-testid={testId}>
      <legend className="wine-ff-l">
        {label}
        {inferred && <span className="wine-ff-tag">odhad</span>}
      </legend>
      <div className="wine-seg">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            data-value={o}
          >
            {names[o]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** EAN camera scanner (BarcodeDetector → lazy ZXing) with manual entry + still-photo fallback. */
function Scanner({ onEan, busy }: { onEan: (ean: string) => void; busy: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'live' | CameraError>('starting');
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const onEanRef = useRef(onEan);
  useEffect(() => {
    onEanRef.current = onEan;
  });
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await openCamera();
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setState('live');
        const decoder = await getDecoder();
        setEngine(decoder.kind);
        const tick = async () => {
          if (stopped) return;
          const v = videoRef.current;
          if (v && v.videoWidth) {
            // centre band where the user aims the barcode, downscaled for speed
            const w = Math.min(960, v.videoWidth);
            const h = Math.round((w / v.videoWidth) * v.videoHeight * 0.6);
            canvas.width = w;
            canvas.height = h;
            const sy = v.videoHeight * 0.2;
            canvas
              .getContext('2d', { willReadFrequently: true })
              ?.drawImage(v, 0, sy, v.videoWidth, v.videoHeight * 0.6, 0, 0, w, h);
            const ean = await decoder.decode(canvas).catch(() => null);
            if (ean && !stopped) {
              globalThis.navigator?.vibrate?.(40);
              onEanRef.current(ean);
              return;
            }
          }
          timer = setTimeout(() => void tick(), 220);
        };
        void tick();
      } catch (err) {
        if (stopped) return;
        const name = (err as { name?: string } | null)?.name;
        setState(name === 'InsecureContext' ? 'insecure' : cameraError(err));
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const submit = () => {
    const ean = normalizeEan(manual);
    if (!ean) {
      setManualError(
        manual.replace(/\D/g, '').length < 8
          ? 'EAN má 8 nebo 13 číslic.'
          : 'Kontrolní číslice nesedí – zkontrolujte číslo.',
      );
      return;
    }
    setManualError(null);
    onEan(ean);
  };
  const live = state === 'live' || state === 'starting';
  return (
    <div className="wine-scan" data-testid="wine-add-scanner" data-state={state}>
      <div className="wine-scan-view" data-live={live || undefined}>
        <video ref={videoRef} muted playsInline aria-label="Náhled kamery" />
        {live ? (
          <>
            <span className="wine-scan-frame" aria-hidden="true">
              <span className="wine-scan-line" />
            </span>
            <span className="wine-scan-cap" role="status">
              {state === 'starting' ? 'Spouštím kameru…' : 'Namiřte kameru na čárový kód na lahvi'}
            </span>
          </>
        ) : (
          <span className="wine-scan-off" role="alert" data-testid="wine-add-camera-error">
            <Icon name="camera" size={26} />
            {CAMERA_ERROR_CS[state]}
          </span>
        )}
      </div>
      {engine && <span className="wine-sr">Čtečka: {engine}</span>}
      <form
        className="wine-scan-manual"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Nebo zadejte EAN ručně" error={manualError ?? undefined} wide>
          <span className="wine-inline">
            <input
              inputMode="numeric"
              autoComplete="off"
              placeholder="např. 8006220001669"
              maxLength={18}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              data-testid="wine-add-ean"
            />
            <button
              type="submit"
              className="wine-btn wine-btn--primary"
              disabled={busy || !manual.trim()}
              data-testid="wine-add-ean-go"
            >
              Dohledat
            </button>
          </span>
        </Field>
      </form>
      <label className="wine-btn wine-btn--ghost wine-file wine-scan-still">
        <Icon name="upload" size={18} /> Načíst kód z fotky
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void decodeImageFile(file).then(
              (ean) => (ean ? onEan(ean) : setManualError('Na fotce jsme čárový kód nenašli.')),
              () => setManualError('Fotku se nepodařilo přečíst.'),
            );
          }}
        />
      </label>
    </div>
  );
}

export interface AddWineSheetProps {
  api: WineApi;
  wines: WineRecord[];
  onClose: () => void;
  onCreated: (wine: WineRecord, message: string) => void;
  onOpenWine: (wineId: string) => void;
  /** Injected in tests (jsdom has no canvas). */
  preparePhoto?: PreparePhoto;
  initialStep?: Step;
}

/** „Přidat víno“: bottom sheet on mobile, side sheet on desktop (#81). Nothing saves unconfirmed. */
export function AddWineSheet({
  api,
  wines,
  onClose,
  onCreated,
  onOpenWine,
  preparePhoto = defaultPreparePhoto,
  initialStep = 'start',
}: AddWineSheetProps) {
  const [step, setStep] = useState<Step>(initialStep);
  const [history, setHistory] = useState<Step[]>([]);
  const [providers, setProviders] = useState<LookupProviderInfo[] | null>(null);
  const [query, setQuery] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{
    busy: boolean;
    label: string;
    byEan: boolean;
    byPhoto: boolean;
    result?: LookupResult;
    error?: string;
  } | null>(null);
  const [proposal, setProposal] = useState<LookupProposal | null>(null);
  const [draft, setDraft] = useState<WineDraft>(() => emptyDraft(today()));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [photoChoice, setPhotoChoice] = useState<'source' | 'own' | 'none'>('none');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addQty, setAddQty] = useState(1);
  const opId = useRef<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useBackClosable(onClose);
  useEffect(() => {
    let live = true;
    api.lookupProviders().then(
      (list) => live && setProviders(list),
      () => live && setProviders([]),
    );
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [api]);
  useEffect(() => {
    sheetRef.current?.querySelector('.wine-sheet-body')?.scrollTo?.({ top: 0 });
  }, [step]);

  const ai = providers?.find((p) => p.id === 'ai_task');
  const aiPhoto = Boolean(ai?.available && ai.photo !== false);
  const zones = useMemo(
    () =>
      [
        ...new Set(wines.map((w) => w.location?.zone).filter((z): z is string => Boolean(z))),
      ].sort(),
    [wines],
  );

  const go = (next: Step) => {
    setHistory((h) => [...h, step]);
    setStep(next);
  };
  const back = () => {
    const prev = history.at(-1);
    setHistory((h) => h.slice(0, -1));
    setStep(prev ?? 'start');
  };

  async function runLookup(input: LookupInput, label: string) {
    const byEan = Boolean(input.ean);
    setLookup({ busy: true, label, byEan, byPhoto: Boolean(input.photo) });
    if (step !== 'results') go('results');
    try {
      const result = await api.lookup(input);
      setLookup({ busy: false, label, byEan, byPhoto: Boolean(input.photo), result });
    } catch (err) {
      setLookup({
        busy: false,
        label,
        byEan,
        byPhoto: Boolean(input.photo),
        error: lookupErrorText(err, errorText(err)),
      });
    }
  }
  const searchText = () => {
    const q = query.trim();
    if (!q) return;
    const ean = normalizeEan(q);
    void runLookup(ean ? { ean } : { query: q }, q);
  };
  async function takePhoto(file: File | undefined, recognise: boolean) {
    if (!file) return;
    setPhotoError(null);
    try {
      const url = await preparePhoto(file);
      setPhoto(url);
      setPhotoChoice('own');
      if (recognise && aiPhoto) void runLookup({ photo: url }, 'fotka etikety');
    } catch {
      setPhotoError('Fotku se nepodařilo zpracovat – zkuste jiný snímek.');
    }
  }
  const choose = (p: LookupProposal | null) => {
    setProposal(p);
    setErrors({});
    setSaveError(null);
    opId.current = null;
    if (p?.existing) {
      setAddQty(1);
      go('stock');
      return;
    }
    const base = emptyDraft(today());
    setDraft(p ? draftFromProposal(p, { ...base, ean: lookup?.byEan ? lookup.label : '' }) : base);
    setPhotoChoice(photo ? 'own' : p?.imageUrl ? 'source' : 'none');
    go('form');
  };
  const set = <K extends keyof WineDraft>(key: K, value: WineDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const inferred = (key: keyof WineDraft) =>
    Boolean(proposal && FIELD_LABEL[key] && proposal.inferred.includes(FIELD_LABEL[key]!));

  async function save() {
    const { wine, errors: errs } = draftToWine(draft, proposal);
    setErrors(errs);
    if (!wine) {
      const first = Object.keys(errs)[0];
      sheetRef.current
        ?.querySelector(`[data-field="${first}"]`)
        ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    setSaving(true);
    setSaveError(null);
    opId.current ??= newOperationId();
    try {
      const res = await api.create(wine, opId.current);
      let saved = res.wine;
      let note = '';
      const image =
        photoChoice === 'own' && photo
          ? { photo }
          : photoChoice === 'source' && proposal?.imageUrl
            ? { imageUrl: proposal.imageUrl }
            : null;
      if (image) {
        try {
          saved = await api.setImage(saved.id, image);
        } catch {
          note = ' Fotku se nepodařilo uložit, přidejte ji později v detailu.';
        }
      }
      onCreated(saved, `Přidáno: ${saved.name} (${bottles(saved.quantity)}).${note}`);
    } catch (err) {
      setSaveError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  async function stockIn() {
    const ex = proposal?.existing;
    if (!ex) return;
    setSaving(true);
    setSaveError(null);
    opId.current ??= newOperationId();
    try {
      const res = await api.correct({
        wineId: ex.wineId,
        quantity: ex.quantity + addQty,
        reason: 'Naskladnění',
        sourceOperationId: opId.current,
      });
      onCreated(
        res.wine,
        `Naskladněno ${bottles(addQty)}: ${res.wine.name}. Skladem ${res.wine.quantity} ks.`,
      );
    } catch (err) {
      setSaveError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const title: Record<Step, string> = {
    start: 'Přidat víno',
    scan: 'Skenovat čárový kód',
    results: 'Návrhy',
    form: proposal ? 'Zkontrolovat a uložit' : 'Nové víno',
    stock: 'Víno už máte',
  };
  const proposals = lookup?.result?.proposals ?? [];
  const statuses = lookup?.result?.providers ?? [];
  const aiStatus = statuses.find((s) => s.id === 'ai_task');

  const photoInput = (
    recognise: boolean,
    testId: string,
    children: ReactNode,
    className: string,
    disabled?: boolean,
  ) => (
    <label className={className} data-testid={testId} aria-disabled={disabled || undefined}>
      {children}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void takePhoto(file, recognise);
        }}
      />
    </label>
  );

  const tile = (icon: IconName, label: string, sub: string, extra?: ReactNode) => (
    <>
      <span className="wine-tile-ico" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <span className="wine-tile-t">
        <strong>{label}</strong>
        <span>{sub}</span>
      </span>
      {extra}
    </>
  );

  return (
    <div className="wine-sheet-backdrop" onClick={onClose} data-testid="wine-add-backdrop">
      <div
        ref={sheetRef}
        className="wine-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wine-add-title"
        data-testid="wine-add"
        data-step={step}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="wine-grabber" aria-hidden="true" />
        <header className="wine-sheet-head">
          {step !== 'start' ? (
            <button
              type="button"
              className="wine-iconbtn"
              aria-label="Zpět"
              onClick={back}
              data-testid="wine-add-back"
            >
              <Icon name="back" />
            </button>
          ) : (
            <span className="wine-sheet-badge" aria-hidden="true">
              <Icon name="plus" size={18} />
            </span>
          )}
          <h2 id="wine-add-title">{title[step]}</h2>
          <button
            type="button"
            className="wine-iconbtn wine-sheet-x"
            aria-label="Zavřít"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="wine-sheet-body">
          {step === 'start' && (
            <>
              <form
                className="wine-sheet-search"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  searchText();
                }}
              >
                <label className="wine-search wine-search--xl">
                  <Icon name="search" />
                  <span className="wine-sr">Název, vinařství nebo EAN</span>
                  <input
                    type="search"
                    enterKeyHint="search"
                    placeholder="Název nebo EAN"
                    value={query}
                    maxLength={200}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="wine-add-query"
                    autoFocus
                  />
                </label>
                <button
                  type="submit"
                  className="wine-btn wine-btn--primary"
                  disabled={!query.trim()}
                  data-testid="wine-add-search"
                >
                  Dohledat
                </button>
              </form>
              <div className="wine-tiles2">
                <button
                  type="button"
                  className="wine-tile"
                  onClick={() => go('scan')}
                  data-testid="wine-add-scan"
                >
                  {tile('barcode', 'Skenovat EAN', 'Čárový kód na zadní etiketě')}
                </button>
                {photoInput(
                  true,
                  'wine-add-photo',
                  tile(
                    'camera',
                    'Vyfotit etiketu',
                    aiPhoto ? 'AI přečte údaje z fotky' : 'Vyžaduje AI v Home Assistantu',
                    !aiPhoto && providers ? (
                      <span className="wine-tile-tag" data-testid="wine-add-ai-off">
                        Nedostupné
                      </span>
                    ) : undefined,
                  ),
                  'wine-tile wine-file',
                  !aiPhoto,
                )}
                <button
                  type="button"
                  className="wine-tile"
                  onClick={() => choose(null)}
                  data-testid="wine-add-manual"
                >
                  {tile('pencil', 'Vyplnit ručně', 'Funguje i bez internetu')}
                </button>
              </div>
              {providers && !aiPhoto && <AiHint info={ai} />}
              {photoError && (
                <p className="wine-error" role="alert">
                  {photoError}
                </p>
              )}
              {providers && providers.length > 0 && (
                <div className="wine-sources" data-testid="wine-add-providers">
                  <span className="wine-lbl">Hledáme v</span>
                  <ul>
                    {providers.map((p) => (
                      <li key={p.id} data-available={p.available || undefined}>
                        <span className="wine-dot" aria-hidden="true" />
                        {PROVIDER_SHORT[p.id] ?? p.label}
                        {!p.available && <span className="wine-sr"> (nedostupné)</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="wine-muted">Nic se neuloží, dokud návrh nepotvrdíte.</p>
                </div>
              )}
            </>
          )}

          {step === 'scan' && (
            <Scanner busy={Boolean(lookup?.busy)} onEan={(ean) => void runLookup({ ean }, ean)} />
          )}

          {step === 'results' && lookup && (
            <section
              className="wine-results"
              aria-busy={lookup.busy}
              data-testid="wine-add-results"
            >
              <p className="wine-results-q">
                {lookup.busy ? 'Hledám' : 'Výsledky'} pro <strong>„{lookup.label}“</strong>
              </p>
              {lookup.busy && (
                <ul className="wine-props-list" aria-hidden="true">
                  {[0, 1].map((n) => (
                    <li key={n} className="wine-proposal wine-proposal--skel">
                      <span className="wine-skel wine-skel--img" />
                      <span className="wine-proposal-t">
                        <span className="wine-skel wine-skel--l" />
                        <span className="wine-skel wine-skel--s" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {lookup.error && (
                <p className="wine-error" role="alert">
                  {lookup.error}
                </p>
              )}
              {!lookup.busy && proposals.length > 0 && (
                <ul className="wine-props-list">
                  {proposals.map((p, n) => {
                    const [conf, tone] = confidenceLabel(p, lookup.byEan);
                    return (
                      <li key={`${p.provider}-${n}`}>
                        <button
                          type="button"
                          className="wine-proposal"
                          onClick={() => choose(p)}
                          data-testid="wine-add-proposal"
                          data-provider={p.provider}
                        >
                          <span className="wine-proposal-img">
                            <WineBottle wine={proposalRecord(p)} height={92} decorative />
                          </span>
                          <span className="wine-proposal-t">
                            <strong>{p.fields.name ?? 'Bez názvu'}</strong>
                            {p.fields.labelName && (
                              <span className="wine-proposal-lab">{p.fields.labelName}</span>
                            )}
                            <span className="wine-proposal-sub">{subline(p)}</span>
                            <span className="wine-chips">
                              <span className="wine-chip" data-tone={tone}>
                                {tone === 'ok' && <Icon name="check" size={14} />}
                                {conf}
                              </span>
                              <span className="wine-chip">{p.providerLabel}</span>
                              {p.existing && (
                                <span className="wine-chip" data-tone="accent">
                                  Už máte {p.existing.quantity} ks
                                </span>
                              )}
                            </span>
                          </span>
                          <Icon name="chevron" size={18} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!lookup.busy && !lookup.error && !proposals.length && (
                <div className="wine-results-empty" data-testid="wine-add-empty">
                  <strong>Nic jsme nenašli</strong>
                  <span>Zkuste jiný název, naskenujte EAN, nebo víno vyplňte ručně.</span>
                </div>
              )}
              {!lookup.busy && lookup.byPhoto && aiStatus?.status === 'unavailable' && (
                <AiHint info={ai} />
              )}
              {!lookup.busy && (
                <button
                  type="button"
                  className="wine-btn wine-btn--ghost wine-results-manual"
                  onClick={() => choose(null)}
                  data-testid="wine-add-manual-2"
                >
                  <Icon name="pencil" size={18} /> Vyplnit ručně
                </button>
              )}
              {!lookup.busy && statuses.length > 0 && (
                <ul className="wine-statuses" aria-label="Zdroje" data-testid="wine-add-statuses">
                  {statuses.map((s) => (
                    <li key={s.id} data-status={s.status}>
                      <span className="wine-dot" aria-hidden="true" />
                      {PROVIDER_SHORT[s.id] ?? s.label}: {STATUS_CS[s.status] ?? s.status}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {step === 'stock' && proposal?.existing && (
            <section className="wine-stockin" data-testid="wine-add-existing">
              <div className="wine-stockin-card">
                <span className="wine-proposal-img">
                  <WineBottle
                    wine={
                      wines.find((w) => w.id === proposal.existing!.wineId) ??
                      proposalRecord(proposal)
                    }
                    height={120}
                    decorative
                  />
                </span>
                <span className="wine-proposal-t">
                  <strong>{proposal.existing.name}</strong>
                  <span className="wine-proposal-sub">
                    {[proposal.existing.producer, proposal.existing.vintage ?? 'bez ročníku'].join(
                      ' · ',
                    )}
                  </span>
                  <span className="wine-chip" data-tone="accent">
                    Skladem {proposal.existing.quantity} ks
                  </span>
                </span>
              </div>
              <div className="wine-ff" data-wide>
                <span className="wine-ff-l">Kolik lahví přidat</span>
                <Stepper value={addQty} min={1} onChange={setAddQty} testId="wine-add-stock-qty" />
              </div>
              <div className="wine-actions-row wine-actions-row--start">
                <button
                  type="button"
                  className="wine-btn wine-btn--ghost"
                  onClick={() => onOpenWine(proposal.existing!.wineId)}
                >
                  Otevřít detail
                </button>
                <button
                  type="button"
                  className="wine-btn wine-btn--ghost"
                  onClick={() => {
                    const p = { ...proposal, existing: null };
                    setProposal(p);
                    setDraft(draftFromProposal(p, emptyDraft(today())));
                    setStep('form');
                  }}
                >
                  Přidat jako jiné víno
                </button>
              </div>
            </section>
          )}

          {step === 'form' && (
            <form
              className="wine-addform"
              id="wine-addform"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              data-testid="wine-add-form"
            >
              <div className="wine-addform-hero">
                <span className="wine-addform-photo">
                  <WineBottle
                    wine={previewRecord(
                      proposal,
                      draft,
                      photoChoice === 'own'
                        ? photo
                        : photoChoice === 'source'
                          ? (proposal?.imageUrl ?? null)
                          : null,
                    )}
                    height={132}
                    decorative
                  />
                </span>
                <span className="wine-addform-src">
                  {proposal ? (
                    <>
                      <span className="wine-lbl">Návrh</span>
                      <strong data-testid="wine-add-source">{proposal.providerLabel}</strong>
                      <span className="wine-chips">
                        <span
                          className="wine-chip"
                          data-tone={confidenceLabel(proposal, Boolean(lookup?.byEan))[1]}
                        >
                          {confidenceLabel(proposal, Boolean(lookup?.byEan))[0]}
                        </span>
                        {proposal.inferred.length > 0 && (
                          <span className="wine-chip">{proposal.inferred.length}× odhad</span>
                        )}
                      </span>
                      <span className="wine-addform-links">
                        {proposal.sourceUrl && (
                          <a href={proposal.sourceUrl} target="_blank" rel="noopener noreferrer">
                            Zdroj <Icon name="external" size={14} />
                          </a>
                        )}
                        <a
                          href={proposal.vivinoUrl ?? vivinoSearchUrl(proposal.fields)}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="wine-add-vivino"
                        >
                          Vivino <Icon name="external" size={14} />
                        </a>
                      </span>
                      {proposal.note && <span className="wine-muted">{proposal.note}</span>}
                    </>
                  ) : (
                    <>
                      <span className="wine-lbl">Ruční zadání</span>
                      <strong>Vyplňte, co znáte</strong>
                      <span className="wine-muted">Povinný je jen název a vinařství.</span>
                    </>
                  )}
                </span>
              </div>

              <fieldset className="wine-fs">
                <legend>Víno</legend>
                <div className="wine-fgrid">
                  <Field label="Název *" error={errors.name} inferred={inferred('name')} wide>
                    <input
                      data-field="name"
                      value={draft.name}
                      maxLength={200}
                      onChange={(e) => set('name', e.target.value)}
                      data-testid="wine-add-f-name"
                    />
                  </Field>
                  <Field
                    label="Vinařství *"
                    error={errors.producer}
                    inferred={inferred('producer')}
                    wide
                  >
                    <input
                      data-field="producer"
                      value={draft.producer}
                      maxLength={200}
                      onChange={(e) => set('producer', e.target.value)}
                      data-testid="wine-add-f-producer"
                    />
                  </Field>
                  <Field label="Ročník" error={errors.vintage}>
                    <input
                      data-field="vintage"
                      inputMode="numeric"
                      placeholder="NV"
                      value={draft.vintage}
                      maxLength={4}
                      onChange={(e) => set('vintage', e.target.value)}
                      data-testid="wine-add-f-vintage"
                    />
                  </Field>
                  <Field label="EAN" error={errors.ean}>
                    <input
                      data-field="ean"
                      inputMode="numeric"
                      value={draft.ean}
                      maxLength={18}
                      onChange={(e) => set('ean', e.target.value)}
                      data-testid="wine-add-f-ean"
                    />
                  </Field>
                  <Seg
                    label="Barva"
                    value={draft.color}
                    options={COLORS}
                    names={COLOR_CS}
                    onChange={(v) => set('color', v)}
                    testId="wine-add-f-color"
                    inferred={inferred('color')}
                  />
                  <Seg
                    label="Typ"
                    value={draft.wineType}
                    options={TYPES}
                    names={TYPE_CS}
                    onChange={(v) => set('wineType', v)}
                    testId="wine-add-f-type"
                    inferred={inferred('wineType')}
                  />
                </div>
              </fieldset>

              <fieldset className="wine-fs">
                <legend>Původ a styl</legend>
                <div className="wine-fgrid">
                  <Field label="Země" inferred={inferred('country')}>
                    <input
                      value={draft.country}
                      maxLength={80}
                      onChange={(e) => set('country', e.target.value)}
                    />
                  </Field>
                  <Field label="Oblast" inferred={inferred('region')}>
                    <input
                      value={draft.region}
                      maxLength={120}
                      onChange={(e) => set('region', e.target.value)}
                    />
                  </Field>
                  <Field label="Odrůdy (oddělte čárkou)" inferred={inferred('grapes')} wide>
                    <input
                      value={draft.grapes}
                      maxLength={300}
                      onChange={(e) => set('grapes', e.target.value)}
                    />
                  </Field>
                  <Field label="Obsah cukru" inferred={inferred('sweetness')}>
                    <input
                      value={draft.sweetness}
                      maxLength={60}
                      placeholder="suché, polosuché, Brut…"
                      list="wine-sugar-terms"
                      onChange={(e) => set('sweetness', e.target.value)}
                    />
                    <datalist id="wine-sugar-terms">
                      {SUGAR_TERMS.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </Field>
                  <Field
                    label="Zbytkový cukr g/l"
                    inferred={inferred('residualSugar')}
                    error={errors.residualSugar}
                  >
                    <input
                      value={draft.residualSugar}
                      inputMode="decimal"
                      maxLength={8}
                      placeholder="např. 2,1"
                      data-field="residualSugar"
                      data-testid="wine-add-residual-sugar"
                      onChange={(e) => set('residualSugar', e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Alkohol %"
                    error={errors.alcoholPct}
                    inferred={inferred('alcoholPct')}
                  >
                    <input
                      data-field="alcoholPct"
                      inputMode="decimal"
                      value={draft.alcoholPct}
                      maxLength={5}
                      onChange={(e) => set('alcoholPct', e.target.value)}
                    />
                  </Field>
                  <Field label="Objem (ml)" error={errors.volumeMl} inferred={inferred('volumeMl')}>
                    <input
                      data-field="volumeMl"
                      inputMode="numeric"
                      value={draft.volumeMl}
                      maxLength={5}
                      onChange={(e) => set('volumeMl', e.target.value)}
                    />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="wine-fs">
                <legend>Ve sklepě</legend>
                <div className="wine-fgrid">
                  <div className="wine-ff" data-field="quantity">
                    <span className="wine-ff-l">Počet lahví</span>
                    <Stepper
                      value={draft.quantity}
                      min={0}
                      onChange={(v) => set('quantity', v)}
                      testId="wine-add-f-qty"
                    />
                  </div>
                  <Field label="Cena za lahev (Kč)" error={errors.price}>
                    <input
                      data-field="price"
                      inputMode="decimal"
                      placeholder="volitelné"
                      value={draft.price}
                      maxLength={9}
                      onChange={(e) => set('price', e.target.value)}
                      data-testid="wine-add-f-price"
                    />
                  </Field>
                  <Field label="Pořízeno" error={errors.acquiredOn}>
                    <input
                      type="date"
                      data-field="acquiredOn"
                      value={draft.acquiredOn}
                      onChange={(e) => set('acquiredOn', e.target.value)}
                    />
                  </Field>
                  <Field label="Zóna">
                    <input
                      list="wine-add-zones"
                      value={draft.zone}
                      maxLength={60}
                      placeholder={zones[0] ?? 'např. Zóna A'}
                      onChange={(e) => set('zone', e.target.value)}
                      data-testid="wine-add-f-zone"
                    />
                    <datalist id="wine-add-zones">
                      {zones.map((z) => (
                        <option key={z} value={z} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Poznámka" wide>
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={draft.note}
                      onChange={(e) => set('note', e.target.value)}
                    />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="wine-fs">
                <legend>Fotka lahve</legend>
                <div className="wine-photo-opts" role="radiogroup" aria-label="Fotka lahve">
                  {proposal?.imageUrl && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={photoChoice === 'source'}
                      onClick={() => setPhotoChoice('source')}
                      data-testid="wine-add-photo-source"
                    >
                      <Icon name="check" size={16} /> Ze zdroje (
                      {PROVIDER_SHORT[proposal.provider] ?? proposal.providerLabel})
                    </button>
                  )}
                  {photo && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={photoChoice === 'own'}
                      onClick={() => setPhotoChoice('own')}
                      data-testid="wine-add-photo-own"
                    >
                      <Icon name="check" size={16} /> Moje fotka
                    </button>
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={photoChoice === 'none'}
                    onClick={() => setPhotoChoice('none')}
                  >
                    <Icon name="check" size={16} /> Bez fotky
                  </button>
                  {photoInput(
                    false,
                    'wine-add-photo-take',
                    <>
                      <Icon name="camera" size={16} /> {photo ? 'Jiná fotka' : 'Vyfotit lahev'}
                    </>,
                    'wine-photo-take wine-file',
                  )}
                </div>
                {photoChoice === 'source' && (
                  <p className="wine-muted wine-fine">
                    Fotka ze zdroje se po potvrzení uloží jen lokálně v Home Assistantu (soukromé
                    použití, zdroj zůstane uvedený).
                  </p>
                )}
                {photoError && (
                  <p className="wine-error" role="alert">
                    {photoError}
                  </p>
                )}
              </fieldset>
            </form>
          )}
        </div>
        {(step === 'form' || step === 'stock') && (
          <footer className="wine-sheet-foot">
            {saveError && (
              <p className="wine-error" role="alert">
                {saveError}
              </p>
            )}
            {step === 'form' ? (
              <button
                type="submit"
                form="wine-addform"
                className="wine-btn wine-btn--primary wine-btn--lg"
                disabled={saving}
                data-testid="wine-add-save"
              >
                {saving
                  ? 'Ukládám…'
                  : draft.quantity > 0
                    ? `Uložit do vinotéky · ${bottles(draft.quantity)}`
                    : 'Uložit do vinotéky'}
              </button>
            ) : (
              <button
                type="button"
                className="wine-btn wine-btn--primary wine-btn--lg"
                disabled={saving}
                onClick={() => void stockIn()}
                data-testid="wine-add-stock"
              >
                {saving ? 'Ukládám…' : `Naskladnit +${addQty}`}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

function Stepper({
  value,
  min,
  onChange,
  testId,
}: {
  value: number;
  min: number;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <span className="wine-stepper wine-stepper--lg" role="group" aria-label="Počet lahví">
      <button
        type="button"
        aria-label="Méně"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <output aria-live="polite" data-testid={testId}>
        {value}
      </output>
      <button
        type="button"
        aria-label="Více"
        disabled={value >= 999}
        onClick={() => onChange(Math.min(999, value + 1))}
      >
        +
      </button>
    </span>
  );
}
