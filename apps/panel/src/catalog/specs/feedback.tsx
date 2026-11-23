import { useState } from 'react';
import { SaveState, ToastCard, useSaveState } from '@homebrain/ui';
import type { Spec } from '../types';

function SaveDemo() {
  const { status, run } = useSaveState();
  const [fail, setFail] = useState(false);
  const save = () =>
    void run(
      () =>
        new Promise<void>((resolve, reject) =>
          setTimeout(() => (fail ? reject(new Error('x')) : resolve()), 900),
        ),
    ).catch(() => undefined);
  return (
    <div className="cat-row">
      <button type="button" className="cat-btn" onClick={save}>
        Uložit
      </button>
      <label className="cat-check">
        <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />
        simulovat chybu
      </label>
      <SaveState status={status} onRetry={save} />
    </div>
  );
}

/** Oznámení a stav ukládání. */
export const feedbackSpecs: Spec[] = [
  {
    id: 'toast',
    name: 'Toast',
    summary:
      'Jednotné oznámení o výsledku akce. toast.success | error | info | undo – jediný <Toaster /> v shellu.',
    importName: 'toast, useToast, Toaster, ToastCard',
    states: [
      'success (4 s)',
      'error (6 s, aria-live assertive)',
      'info (4 s)',
      'undo (6 s, ukazatel průběhu)',
      'max 3 nad sebou',
      'pauza při najetí / fokusu',
      'stejné id = nahrazení',
    ],
    doText: '„Uloženo“, „Nepodařilo se uložit“ + akce „Zkusit znovu“. Sloveso/výsledek první.',
    dontText: 'Vlastní .x-toast v modulu, vykřičníky, technické chyby („Error 500“).',
    notes:
      'Mobil: dole uprostřed nad tab barem a safe-area. Desktop: vpravo dole. Reduced motion: bez animací.',
    render: () => (
      <div className="cat-col">
        <ToastCard kind="success" message="Uloženo" preview />
        <ToastCard
          kind="error"
          message="Nepodařilo se uložit"
          description="Spojení s Home Assistantem se přerušilo"
          action={{ label: 'Zkusit znovu', onAction: () => undefined }}
          preview
        />
        <ToastCard kind="info" message="Import dokončen" description="Přidáno 12 vín" preview />
        <ToastCard
          kind="undo"
          message="Lahev odepsána"
          action={{ label: 'Vrátit', onAction: () => undefined }}
          preview
        />
      </div>
    ),
  },
  {
    id: 'save-state',
    name: 'SaveState',
    summary: 'Inline stav ukládání ve formuláři: Ukládám… → Uloženo ✓ (+ useSaveState).',
    importName: 'SaveState, useSaveState',
    states: ['idle', 'saving', 'saved', 'error + zkusit znovu'],
    doText: 'U polí, kde uživatel ve formuláři zůstává (automatické ukládání).',
    dontText: 'SaveState i toast pro tutéž akci – jedno nebo druhé.',
    notes: '„Uloženo“ zmizí po 2 s; chyba zůstává, dokud uživatel nezačne znovu.',
    render: () => (
      <div className="cat-col">
        <SaveState status="saving" />
        <SaveState status="saved" />
        <SaveState status="error" onRetry={() => undefined} />
        <SaveDemo />
      </div>
    ),
  },
];
