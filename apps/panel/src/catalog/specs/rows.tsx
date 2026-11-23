import { Button, Sparkline, StatusRow, Tile } from '@homebrain/ui';
import type { Spec } from '../types';

/** Řádky stavů, dlaždice a mini trend. */
export const rowSpecs: Spec[] = [
  {
    id: 'status-row',
    name: 'StatusRow',
    summary: 'Řádek „popisek – hodnota – čas“ pro seznamy stavů.',
    importName: 'StatusRow',
    states: ['tone', 's časem', 'bez času', 'rich: icon + detail + action (živý feed)'],
    doText: 'Seznam do 6 řádků; delší seznamy seskupte.',
    dontText: 'Tabulka s rámečky kolem buněk.',
    notes: 'Čas ve formátu „před 5 min“ nebo „14:05“.',
    render: () => (
      <div className="cat-col">
        <StatusRow label="Myčka" value="Dokončeno" tone="ok" time="14:05" />
        <StatusRow label="Pračka" value="Běží · 38 min" tone="accent" />
        <StatusRow label="Odvlhčovač" value="Plná nádrž" tone="warn" time="před 5 min" />
        <StatusRow
          label="Poznal: Marek – dlaň ID 1002"
          value=""
          tone="accent"
          icon="✋"
          detail="Kterou ruku jste přiložili?"
          action={
            <>
              <Button size="sm">Pravá</Button>
              <Button size="sm">Levá</Button>
            </>
          }
        />
      </div>
    ),
  },
  {
    id: 'tile',
    name: 'Tile',
    summary:
      'Stejné dlaždice v mřížce (obličej · pravá · levá dlaň): ikona, popisek, jeden stavový řádek.',
    importName: 'Tile',
    states: [
      'tone ok/warn/crit/neutral',
      'empty (chybí – obrys)',
      'onPress = celá dlaždice je tlačítko',
      'disabled',
    ],
    doText:
      'Pevné pořadí slotů, aby šlo skenovat sloupcem napříč kartami; akci dejte na celou dlaždici.',
    dontText: 'Malé tlačítko uvnitř dlaždice nebo dlaždice různé výšky v jedné řadě.',
    notes:
      'Stav řeší tón + ikona + text (ne jen barva). Detail (věk, ID) patří do title/detailu, ne do popisku.',
    render: () => (
      <div className="cat-tiles">
        <Tile tone="ok" icon="🙂" label="Obličej" status="✓ zapsáno" detail="před 8 měs." />
        <Tile
          tone="warn"
          icon="✋"
          label="Pravá dlaň"
          status="Přezapsat"
          onPress={() => undefined}
        />
        <Tile empty icon="✋" label="Levá dlaň" status="+ Přidat" onPress={() => undefined} />
      </div>
    ),
  },
  {
    id: 'sparkline',
    name: 'Sparkline',
    summary: 'Mini trend bez os; barvu dědí z currentColor.',
    importName: 'Sparkline',
    states: ['linie', 'plocha (area)', 'jedna hodnota'],
    doText: 'Vedle aktuální hodnoty, ať je jasné, k čemu trend patří.',
    dontText: 'Text nebo popisky uvnitř SVG – patří do HTML.',
    notes: 'non-scaling-stroke: tloušťka čáry je stejná na mobilu i desktopu.',
    render: () => (
      <div className="cat-row" style={{ color: 'var(--hb-ac)' }}>
        <Sparkline values={[3, 4, 3.6, 5, 6.2, 5.8, 7, 6.4]} width={140} height={36} />
        <Sparkline values={[7, 6, 6.5, 5, 4.2, 4.8, 3]} width={140} height={36} area />
      </div>
    ),
  },
];
