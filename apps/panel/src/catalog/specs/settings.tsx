import { useState } from 'react';
import {
  Callout,
  Icon,
  iconNames,
  InfoTip,
  ListCell,
  Quantity,
  RangeStepper,
  Button,
  Sheet,
  toast,
} from '@homebrain/ui';
import type { Spec } from '../types';

function RangeStepperDemo() {
  const [value, setValue] = useState(20);
  return (
    <RangeStepper
      label="Rezerva baterie"
      value={value}
      onChange={setValue}
      min={10}
      max={50}
      step={5}
      unit="%"
      band={[10, 30]}
      bandLabel="běžně"
      current={20}
    />
  );
}

function RaisedSheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Otevřít detail</Button>
      {open && (
        <Sheet
          title="Rezerva při běžném provozu"
          isolation="strong"
          appearance="raised"
          placement="side"
          closeLabel="Zavřít"
          onClose={() => setOpen(false)}
          footer={<Button onClick={() => setOpen(false)}>Hotovo</Button>}
        >
          Silné ztmavení a rozostření pro soustředěný formulář; hlavička a patička zůstávají pevné.
        </Sheet>
      )}
    </>
  );
}

/** Nastavení a nápověda: řádek nastavení, upozornění, úprava hodnoty, detail, nápověda, ikony. */
export const settingsSpecs: Spec[] = [
  {
    id: 'list-cell',
    name: 'ListCell',
    summary:
      'Řádek nastavení: popisek a popis vlevo, hodnota vpravo, pevný slot pro šipku nebo zámek.',
    importName: 'ListCell',
    states: [
      'chevron (upravitelné)',
      'lock (jen čtení)',
      'muted (nepřipojeno)',
      'visual',
      'children',
    ],
    doText: 'Celý řádek je tlačítko, které otevře detail v Sheet.',
    dontText: 'Nepřidávejte do řádku vlastní tlačítko „Upravit“ ani ikonu nápovědy.',
    notes: 'Pevný koncový slot drží pravý okraj hodnot zarovnaný; aria-label = popisek + hodnota.',
    render: () => (
      <div style={{ maxWidth: 420 }}>
        <ListCell
          label="Rezerva při běžném provozu"
          value={<Quantity value={10} unit="%" />}
          trailing="chevron"
          aria-label="Rezerva při běžném provozu: 10 %"
          onClick={() => toast.info('Otevřít detail')}
        />
        <ListCell
          label="Provozní režim"
          value="Obecný"
          trailing="lock"
          lockLabel="Mění se v aplikaci SolarGo."
          lockText="ze střídače"
        />
      </div>
    ),
  },
  {
    id: 'callout',
    name: 'Callout',
    summary: 'Upozornění uvnitř karty s ikonou, jednou větou a volitelnou akcí.',
    importName: 'Callout',
    states: ['info', 'warn', 'action'],
    doText: 'Jedna věta o tom, co nesedí, a jedna akce, která to spraví.',
    dontText: 'Nestavte z Callout banner přes celou stránku.',
    notes: 'role="note"; tón přebírá sémantické tokeny (--hb-warn, --hb-ac).',
    render: () => (
      <Callout
        tone="warn"
        title="Limity přetoku se neshodují"
        action={
          <Button size="sm" variant="strong">
            Použít 0,08&nbsp;kW
          </Button>
        }
      >
        Střídač pustí do sítě nejvýš 80&nbsp;W, předpověď počítá s 5&nbsp;kW.
      </Callout>
    ),
  },
  {
    id: 'range-stepper',
    name: 'RangeStepper',
    summary: 'Velká hodnota s − / + a posuvníkem s vyznačeným doporučeným pásmem.',
    importName: 'RangeStepper',
    states: ['slider + band', 'jen − / + (jemný krok)', 'min/max disabled'],
    doText: 'Úprava jedné číselné hodnoty v Sheet, s doporučeným rozsahem.',
    dontText: 'Nepoužívejte pro volný text ani pro víc hodnot najednou.',
    notes: 'Posuvník jen do 400 kroků; číslo je spinbutton, tlačítka mají 48 px.',
    render: () => <RangeStepperDemo />,
  },
  {
    id: 'sheet-raised',
    name: 'Sheet (raised, side)',
    summary: 'Detail/úprava: zvednutý povrch, volitelně silné ztmavení a pevná hlavička.',
    importName: 'Sheet',
    states: ['appearance="raised"', 'placement="side"', 'isolation="strong"', 'closeLabel'],
    doText:
      'Soustředěný formulář s isolation=strong; scrolluje pouze obsah mezi hlavičkou a patičkou.',
    dontText: 'Dlouhé průvodce – ty patří do centrovaného dialogu.',
    notes: 'Zavírací tlačítko 44 px; úchyt jen pod 600 px.',
    render: () => <RaisedSheetDemo />,
  },
  {
    id: 'info-tip',
    name: 'InfoTip',
    summary: 'Kontextová nápověda klepnutím, najetím a fokusem.',
    importName: 'InfoTip',
    states: ['closed', 'open'],
    doText: 'Vysvětlete význam a důsledky nastavení.',
    dontText: 'Neschovávejte nezbytný popisek.',
    notes: 'Escape zavírá, tlačítko je dostupné klávesnicí.',
    render: () => (
      <InfoTip label="Rezerva baterie">
        Vyšší rezerva ponechá víc energie pro výpadek. Doporučeno 10–50&nbsp;%.
      </InfoTip>
    ),
  },
  {
    id: 'icon',
    name: 'Icon',
    summary: 'Sdílené linkové ikony (24 px, currentColor) pro sekce, stavy a akce.',
    importName: 'Icon',
    states: iconNames,
    doText: 'Doplňte ikonou nadpis sekce nebo stav (zámek u hodnot jen pro čtení).',
    dontText: 'Nekreslete v modulu vlastní kopii téže ikony.',
    notes: 'Bez `label` je dekorativní (aria-hidden); s `label` má roli img.',
    render: () => (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {iconNames.map((name) => (
          <Icon key={name} name={name} label={name} />
        ))}
      </div>
    ),
  },
];
