import { useState } from 'react';
import { Button, SegmentedControl, Sheet, Stepper, Switch } from '@homebrain/ui';
import type { Spec } from '../types';

function SwitchDemo() {
  const [on, setOn] = useState(true);
  const [warn, setWarn] = useState(false);
  return (
    <div className="cat-row">
      <Switch checked={on} onChange={setOn} label="Biometrické odemykání" />
      <Switch checked={warn} onChange={setWarn} tone="warn" label="Servisní režim" />
      <Switch checked={false} onChange={() => undefined} disabled label="Nedostupné" />
      <Switch checked readOnly label="Ze střídače (jen pro čtení)" />
      <Switch checked={false} readOnly size="sm" label="Vypnuto ze střídače" />
    </div>
  );
}

function SegDemo() {
  const [v, setV] = useState<'unlock' | 'open'>('unlock');
  return (
    <div className="cat-row">
      <SegmentedControl
        label="Akce"
        value={v}
        onChange={setV}
        options={[
          ['unlock', 'Odemknout'],
          ['open', 'Otevřít západku'],
        ]}
      />
      <SegmentedControl
        label="Akce (accent)"
        tone="accent"
        value={v}
        onChange={setV}
        options={[
          ['unlock', 'Odemknout'],
          ['open', 'Otevřít západku'],
        ]}
      />
    </div>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="cat-row">
      <Button onClick={() => setOpen(true)}>Otevřít potvrzení</Button>
      {open && (
        <Sheet
          variant="alert"
          title="Smazat Kuba?"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Zpět
              </Button>
              <Button variant="danger" onClick={() => setOpen(false)}>
                Smazat
              </Button>
            </>
          }
        >
          Ze snímače se smaže obličej i dlaně (ID 3). Vrátit to nejde.
        </Sheet>
      )}
    </div>
  );
}

/** Ovládací prvky, Sheet a průvodce. */
export const controlSpecs: Spec[] = [
  {
    id: 'switch',
    name: 'Switch',
    summary: 'Přepínač zapnuto/vypnuto, okamžitý účinek (bez Uložit).',
    importName: 'Switch',
    states: ['vypnuto', 'zapnuto', 'tone = accent | warn | ok', 'disabled'],
    doText: 'Popisek vedle přepínače říká, co zapnutí udělá.',
    dontText: 'Přepínač pro akci, která potřebuje potvrzení – na to Button + Sheet.',
    notes: 'role="switch", aria-checked; label je povinný (aria-label).',
    render: () => <SwitchDemo />,
  },
  {
    id: 'segmented',
    name: 'SegmentedControl',
    summary: 'Výběr jedné ze 2–4 krátkých možností.',
    importName: 'SegmentedControl',
    states: ['vybraná', 'nevybraná', 'disabled', 'size = sm', 'tone = accent'],
    doText: 'Krátké popisky (1–2 slova).',
    dontText: 'Víc než 4 možnosti – použijte seznam.',
    notes:
      'radiogroup + role=radio (aria-checked); viditelný štítek vlevo, hideLabel pro záložky. Stejné API jako Roboti (PR #97). tone="accent" vedle stisknutých Chipů (Roboti: Režim/Sání), aby výběr vypadal všude stejně. Nahradí wine-seg / wx-seg.',
    render: () => <SegDemo />,
  },
  {
    id: 'sheet',
    name: 'Sheet',
    summary:
      'Modální panel: na telefonu spodní sheet, na tabletu panel uprostřed. Varianta alert pro potvrzení.',
    importName: 'Sheet',
    states: ['dialog (md | lg)', 'alert', 'aside v hlavičce', 'footer s akcemi'],
    doText: 'Potvrzení nevratné akce: alert s „Zpět“ a danger tlačítkem.',
    dontText: 'Sheet v sheetu; dialog zavíraný klikem vedle uprostřed rozdělané práce.',
    notes:
      'Esc zavírá, fokus jde dovnitř a po zavření zpět. Zpět v HA řeší modul přes useBackClosable.',
    render: () => <SheetDemo />,
  },
  {
    id: 'stepper',
    name: 'Stepper',
    summary: 'Průběh vícekrokového průvodce (zápis osoby, párování).',
    importName: 'Stepper',
    states: ['todo', 'active', 'done', 'skipped', 'error'],
    doText: 'Krátké názvy kroků, stav kroku v detailu („uloženo · ID 1003“).',
    dontText: 'Víc než 5 kroků.',
    notes:
      'Na telefonu ukazuje jen čísla a název aktivního kroku. variant="instructions" = svislý číslovaný návod (Jak to opravit, údržba robota) s volitelným obrázkem u kroku.',
    render: () => (
      <div style={{ display: 'grid', gap: 24 }}>
        <Stepper
          steps={[
            { key: 'name', title: 'Jméno', detail: 'Lucie', state: 'done' },
            { key: 'face', title: 'Obličej', detail: 'uloženo · ID 2', state: 'done' },
            { key: 'right', title: 'Pravá dlaň', detail: 'snímám…', state: 'active' },
            { key: 'left', title: 'Levá dlaň', detail: 'volitelné', state: 'todo' },
          ]}
        />
        <Stepper
          variant="instructions"
          label="Jak to opravit"
          steps={[
            { key: '1', title: 'Robota otočte vzhůru nohama na měkkou podložku.', state: 'todo' },
            { key: '2', title: 'Sundejte kryt a vytáhněte kartáč.', state: 'todo' },
            { key: '3', title: 'Odstraňte namotané vlasy a kartáč vraťte.', state: 'todo' },
          ]}
        />
      </div>
    ),
  },
  {
    id: 'stepper-compact',
    name: 'Stepper compact + progress',
    summary: 'Tenká lišta fází v živé kartě; aktivní fáze se plní podle průběhu (fritéza).',
    importName: 'Stepper',
    states: ['todo', 'active + progress', 'done', 'error'],
    doText: 'Stejné fáze po celou dobu (Ohřev → Pečení → Hotovo), progress jen u aktivní.',
    dontText: 'Měnit počet nebo názvy kroků během běhu.',
    notes: 'progress 0–1 nastaví --hb-step-p; modul tónuje přes --hb-step-ink.',
    render: () => (
      <Stepper
        compact
        label="Průběh pečení"
        steps={[
          { key: 'heat', title: 'Ohřev', state: 'done' },
          { key: 'cook', title: 'Pečení', state: 'active', progress: 0.55 },
          { key: 'done', title: 'Hotovo', state: 'todo' },
        ]}
      />
    ),
  },
];
