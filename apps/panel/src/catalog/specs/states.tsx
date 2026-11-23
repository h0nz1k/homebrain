import { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  runMutation,
} from '@homebrain/ui';
import type { Spec } from '../types';

function ConfirmDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="cat-row">
      <Button variant="danger" onClick={() => setOpen(true)} data-testid="cat-confirm-open">
        Smazat recept
      </Button>
      {open && (
        <ConfirmDialog
          title="Smazat recept „Svíčková“?"
          confirmLabel="Smazat"
          danger
          onConfirm={() =>
            runMutation(() => new Promise((r) => setTimeout(r, 600)), {
              key: 'catalog/confirm',
              success: 'Recept smazán',
            })
          }
          onClose={() => setOpen(false)}
          data-testid="cat-confirm"
        >
          Recept zmizí ze sbírky i z oblíbených. Vrátit to nejde.
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Prázdný stav, chyba, načítání a potvrzení. */
export const stateSpecs: Spec[] = [
  {
    id: 'empty-state',
    name: 'EmptyState',
    summary: 'Prázdný stav: co chybí a co s tím.',
    importName: 'EmptyState',
    states: ['jen nadpis', 's popisem'],
    doText: 'Nadpis = stav, popis = další krok („Přidejte první víno“).',
    dontText: '„Žádná data“ bez vysvětlení nebo s vykřičníkem.',
    notes: 'Moduly zatím mají vlastní -empty třídy (Energie, Víno, Počasí) → sjednotit.',
    render: () => (
      <EmptyState title="Zatím žádná vína">Přidejte první lahev ručně nebo importem.</EmptyState>
    ),
  },
  {
    id: 'error-state',
    name: 'ErrorState',
    summary: 'Načtení nebo akce selhala: co se stalo a „Zkusit znovu“.',
    importName: 'ErrorState',
    states: ['celá plocha s opakováním', 'compact (v kartě)', 'bez opakování'],
    doText: 'Nadpis = co není k dispozici, popis = proč / co udělat; retry jen když dává smysl.',
    dontText: 'Červený text v odstavci (`*-error`) nebo technická hláška bez kontextu.',
    notes:
      'role="alert"; jantarová, červená zůstává pro kritické signály. Migrováno: Počasí, Rodina.',
    render: () => (
      <div style={{ display: 'grid', gap: 16 }} data-testid="cat-error-state">
        <ErrorState title="Počasí není k dispozici" onRetry={() => {}}>
          Server HomeBrain neodpověděl do 10 s.
        </ErrorState>
        <ErrorState compact title="Historie se nenačetla" onRetry={() => {}}>
          Zkuste to za chvíli znovu.
        </ErrorState>
      </div>
    ),
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    summary: 'Načítání se zachovaným rozložením obsahu, který přijde.',
    importName: 'Skeleton',
    states: ['text', 'card', 'block'],
    doText: 'Tvar podobný budoucímu obsahu; popisek pro čtečky („Načítám recept…“).',
    dontText: 'Holé „Načítám…“ nebo spinner přes celou stránku.',
    notes:
      'role="status" + aria-busy; lesk jen 4× a ne při reduced motion. Migrováno: Recepty, Přístup, Rodina, Počasí.',
    render: () => (
      <div className="cat-row" data-testid="cat-skeleton" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Skeleton lines={4} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Skeleton variant="card" lines={2} height="96px" />
        </div>
      </div>
    ),
  },
  {
    id: 'confirm-dialog',
    name: 'ConfirmDialog',
    summary: 'Potvrzení akce: alertdialog s pastí fokusu, Esc a ochranou proti dvojkliku.',
    importName: 'ConfirmDialog',
    states: ['běžné', 'danger (fokus na Zpět)', 'probíhá', 'chyba → zůstane otevřené'],
    doText: 'Nadpis jako otázka, popis = důsledek; s runMutation pro zápis přes WS.',
    dontText: 'window.confirm() nebo vlastní Sheet s tlačítky v modulu.',
    notes: 'Postaveno na Sheet variant="alert". Migrováno: Recepty (smazání, fritéza), Přístup.',
    render: () => <ConfirmDemo />,
  },
];
