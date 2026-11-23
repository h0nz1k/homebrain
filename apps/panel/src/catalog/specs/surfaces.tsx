import { useState } from 'react';
import { Breakdown, Button, Card, Chip, Pill, Stat, StatusBadge } from '@homebrain/ui';
import type { Spec } from '../types';

type DataQuality = Parameters<typeof StatusBadge>[0]['quality'];

function ToggleChipDemo() {
  const [on, setOn] = useState(true);
  return (
    <Chip pressed={on} onPressedChange={setOn}>
      notify.telefon
    </Chip>
  );
}

/** Plochy, hodnoty, štítky a tlačítka. */
export const surfaceSpecs: Spec[] = [
  {
    id: 'card',
    name: 'Card',
    summary: 'Základní plocha obsahu. Varianta solid pro data, glass na živé obloze (Dnes, kiosk).',
    importName: 'Card',
    states: ['solid', 'glass', 'tone = critical | warning | notice | info | calm'],
    doText: 'Jedna úroveň karet; uvnitř oddělujte obsah mezerou nebo hairline.',
    dontText: 'Karta v kartě s vlastním rámečkem – působí jako „krabice v krabici“.',
    notes: 'Odsazení a zaoblení bere z tokenů (--hb-radius-card, --hb-sp-*).',
    render: () => (
      <div className="cat-row">
        <Card style={{ minWidth: 180 }}>
          <Stat label="Spotřeba dnes" value="12,4" unit="kWh" />
        </Card>
        <Card variant="glass" style={{ minWidth: 180 }}>
          <Stat label="Venku" value="7,2" unit="°C" />
        </Card>
        <Card tone="warning" style={{ minWidth: 180 }}>
          <Stat label="Vlhkost sklepa" value="78" unit="%" />
        </Card>
      </div>
    ),
  },
  {
    id: 'stat',
    name: 'Stat',
    summary: 'Popisek + hodnota + jednotka. Nejmenší stavební kámen přehledů.',
    importName: 'Stat',
    states: ['s jednotkou', 'bez jednotky'],
    doText: 'Hodnotu formátujte česky (desetinná čárka, mezera před jednotkou).',
    dontText: 'Popisek velkými písmeny nebo s dvojtečkou.',
    notes: 'Čísla mají tabular-nums, takže se při změně neposouvají.',
    render: () => (
      <div className="cat-row">
        <Stat label="Baterie" value="64" unit="%" />
        <Stat label="Lahví ve sklepě" value="128" />
      </div>
    ),
  },
  {
    id: 'breakdown',
    name: 'Breakdown',
    summary: 'Rozpis částek: popisek s detailem vlevo, hodnota vpravo, volitelný součet.',
    importName: 'Breakdown',
    states: [
      's detailem',
      'bez detailu',
      's řádkem Celkem',
      's proporčním pruhem (amount + color)',
    ],
    doText: 'Krátké popisky, detail výpočtu do druhého řádku (např. „12,4 kWh × 4,59 Kč“).',
    dontText: 'Rámečky kolem řádků nebo tabulka s hlavičkou – rozpis je text, ne mřížka.',
    notes: 'Čísla mají tabular-nums; řádky dělí jen hairline. Použito v kartě Náklady (Energie).',
    render: () => (
      <div className="cat-row" style={{ minWidth: 280 }}>
        <Breakdown
          label="Rozpis nákladů"
          items={[
            {
              key: 'vt',
              label: 'Vysoký tarif',
              detail: '2,1 kWh × 5,12 Kč',
              value: '11 Kč',
              amount: 11,
              color: 'var(--hb-warn)',
            },
            {
              key: 'nt',
              label: 'Nízký tarif',
              detail: '9,8 kWh × 4,31 Kč',
              value: '42 Kč',
              amount: 42,
              color: 'var(--hb-energy-grid)',
            },
            {
              key: 'fixed',
              label: 'Stálé platby',
              detail: 'poměrná část z 840 Kč/měs.',
              value: '28 Kč',
              amount: 28,
              color: 'var(--hb-t3)',
            },
          ]}
          total={{ label: 'Celkem', value: '81 Kč' }}
        />
      </div>
    ),
  },
  {
    id: 'status-badge',
    name: 'StatusBadge',
    summary: 'Kvalita dat ze senzoru (DataQuality kontrakt).',
    importName: 'StatusBadge',
    states: ['ok', 'stale', 'unavailable', 'invalid_unit', 'unverified_polarity'],
    doText: 'Ukazujte jen u hodnot, kde kvalita mění rozhodnutí.',
    dontText: 'Badge „Aktuální“ u každé hodnoty na obrazovce.',
    notes: 'Texty jsou pevné v komponentě, moduly je nepřekládají.',
    render: () => (
      <div className="cat-row">
        {(
          ['ok', 'stale', 'unavailable', 'invalid_unit', 'unverified_polarity'] as DataQuality[]
        ).map((q) => (
          <StatusBadge key={q} quality={q} />
        ))}
      </div>
    ),
  },
  {
    id: 'pill',
    name: 'Pill',
    summary: 'Stavový štítek s tónem, volitelně tečka nebo ikona.',
    importName: 'Pill',
    states: ['neutral', 'accent', 'ok', 'warn', 'crit', 'dot', 'icon', 'sm'],
    doText: 'Krátký stav (1–2 slova): „Nabíjí“, „Svoz zítra“.',
    dontText: 'Celé věty nebo akce – na akci patří tlačítko.',
    notes: 'Tón nese i text, ne jen barva (přístupnost).',
    render: () => (
      <div className="cat-row">
        <Pill>Neutrální</Pill>
        <Pill tone="accent">Info</Pill>
        <Pill tone="ok" dot>
          V pořádku
        </Pill>
        <Pill tone="warn" dot>
          Pozor
        </Pill>
        <Pill tone="crit" dot>
          Porucha
        </Pill>
        <Pill tone="ok" dot size="sm">
          Střídač 22 °C
        </Pill>
      </div>
    ),
  },
  {
    id: 'chip',
    name: 'Chip',
    summary: 'Pill pro filtry a metadata (stejné API, jemnější vzhled).',
    importName: 'Chip',
    states: [
      'neutral',
      'accent',
      'ok',
      'warn',
      'crit',
      'pressed',
      'badge',
      'soft',
      'toned toggle',
      'disabled',
    ],
    doText:
      'Filtry v řádku, ať se zalomí bez ořezu. look="soft" = sdílený jazyk výběru (tón + linka + text v akcentu) tam, kde výběr ukazuje i mapa nebo SegmentedControl tone="accent".',
    dontText: 'Vlastní .x-chip v modulu – použijte Chip a className.',
    notes: 'Energie, Víno a Dnes mají zatím vlastní čipy → sjednotit (viz revize).',
    render: () => (
      <div className="cat-row">
        <Chip>Červené</Chip>
        <Chip tone="accent">Moravské</Chip>
        <Chip tone="ok">Pít nyní</Chip>
        <Chip tone="warn">Brzy vrchol</Chip>
        <ToggleChipDemo />
        <Chip pressed badge={1} badgeLabel="pořadí 1" onPress={() => undefined}>
          Kuchyně
        </Chip>
        <Chip pressed look="soft" badge={2} badgeLabel="pořadí 2" onPress={() => undefined}>
          Jídelna
        </Chip>
        <Chip pressed={false} tone="warn" onPress={() => undefined}>
          Údržba
        </Chip>
        <Chip pressed tone="warn" look="soft" onPress={() => undefined}>
          Údržba
        </Chip>
      </div>
    ),
  },
  {
    id: 'button',
    name: 'Button',
    summary:
      'Akční tlačítko: primary (jedna hlavní akce), secondary (výchozí, vedlejší), strong (kontrastní v upozornění), ghost (tichá), danger (nevratný krok, vždy s potvrzením).',
    importName: 'Button',
    states: [
      'primary',
      'contrast="high"',
      'secondary',
      'strong',
      'ghost',
      'danger',
      'sm',
      'lg',
      'block',
      'loading',
      'disabled',
    ],
    doText: 'Sloveso na tlačítku: „Uložit“, „Ztišit“, „+1 min“. Dotykový cíl 44 px (sm 36 px).',
    dontText: 'Vlastní .x-btn v modulu – Recepty a Víno mají zatím rc-btn/wine-btn → sjednotit.',
    notes:
      'Ikona přes prop icon; ikonová tlačítka potřebují aria-label. loading = spinner + aria-busy, klik blokovaný.',
    render: () => (
      <div className="cat-row">
        <Button variant="primary">Začít vařit</Button>
        <Button variant="primary" contrast="high">
          Vyšší kontrast
        </Button>
        <Button>Pozastavit</Button>
        <Button variant="ghost">Zrušit</Button>
        <Button variant="strong">Otevřít</Button>
        <Button variant="danger">Smazat</Button>
        <Button size="sm">+1 min</Button>
        <Button loading>Ukládám</Button>
        <Button disabled>Nedostupné</Button>
      </div>
    ),
  },
];
