import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  InfoTip,
  Breakdown,
  Button,
  Card,
  Chip,
  LiveStatus,
  PresenceStrip,
  ProgressRing,
  SegmentedControl,
  Sheet,
  Stepper,
  Switch,
  DayRibbon,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  runMutation,
  HeroSignal,
  Pill,
  SaveState,
  SignalCard,
  Sparkline,
  Stat,
  StatusBadge,
  StatusRow,
  Tile,
  ToastCard,
  Toaster,
  toast,
  useSaveState,
} from '@homebrain/ui';

type DataQuality = Parameters<typeof StatusBadge>[0]['quality'];

/**
 * Živý katalog sdílených prvků `@homebrain/ui`. Jen pro vývoj: vlastní vstup `catalog.html`,
 * build `pnpm --filter @homebrain/panel build:catalog` → `dist-catalog/` (do bundlu panelu se
 * nedostane – hlídá to scripts/check-bundle-size.mjs).
 */
type ThemeMode = 'both' | 'light' | 'dark';

function ToggleChipDemo() {
  const [on, setOn] = useState(true);
  return (
    <Chip pressed={on} onPressedChange={setOn}>
      notify.telefon
    </Chip>
  );
}

interface Spec {
  id: string;
  name: string;
  summary: string;
  importName: string;
  states: string[];
  doText: string;
  dontText: string;
  notes: string;
  render: () => ReactNode;
}

const specs: Spec[] = [
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
        Vyšší rezerva ponechá více energie pro výpadek. Obvykle 10–50 %.
      </InfoTip>
    ),
  },
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
          label="Poznal: Jan – dlaň ID 1002"
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
  {
    id: 'signal-card',
    name: 'SignalCard',
    summary: 'Signál z modulu pro Dnes: závažnost, titulek, kontext, hodnota, akce.',
    importName: 'SignalCard',
    states: ['critical', 'warning', 'notice', 'info', 'calm', 'stale', 'compact', 'akce zakázána'],
    doText: 'Titulek jako zjištění („Myčka dokončila“), kontext jako důvod.',
    dontText: 'Dva signály se stejnou informací – použijte alsoCount.',
    notes: 'Řazení řeší rank() v @homebrain/signals, ne komponenta.',
    render: () => (
      <div className="cat-col">
        <SignalCard
          id="demo-1"
          severity="warning"
          title="Zítra se vyváží plasty"
          context="Popelnici připravte dnes večer"
          actionLabel="Hotovo"
          onAction={() => toast.success('Označeno jako hotové')}
        />
        <SignalCard
          id="demo-2"
          severity="info"
          title="Levná elektřina od 13:00"
          value={{ v: '1,82', unit: 'Kč/kWh' }}
          compact
        />
      </div>
    ),
  },
  {
    id: 'hero-signal',
    name: 'HeroSignal',
    summary: 'Hlavní signál nahoře na Dnes / kiosku.',
    importName: 'HeroSignal',
    states: ['desktop', 'mobile', 'kiosk'],
    doText: 'Jen jeden na obrazovku.',
    dontText: 'Hero pro informaci bez akce nebo dopadu.',
    notes: 'Varianta kiosk má min. 16 px písmo.',
    render: () => (
      <HeroSignal
        id="hero"
        variant="desktop"
        severity="critical"
        title="Silný vítr od 18:00"
        context="Nárazy až 90 km/h · uklidit předměty z terasy"
      />
    ),
  },
  {
    id: 'day-ribbon',
    name: 'DayRibbon',
    summary: 'Denní pás: slunce, déšť, levné hodiny, svozy a události.',
    importName: 'DayRibbon',
    states: ['plný', 'slim', 's hodinovou teplotou'],
    doText: 'Bodové události bez konce – komponenta je rozprostře (spreadPointMarkers).',
    dontText: 'Popisky delší než 14 znaků (zkracuje shortRibbonLabel).',
    notes: 'Časy jsou hodiny dne (6–22, desetinné = minuty); počítá se v Europe/Prague.',
    render: () => (
      <DayRibbon
        start={6}
        end={22}
        now={13}
        sunrise={7}
        sunset={16.5}
        items={[
          { id: 'c', kind: 'cheap', from: 12, to: 15, label: 'Levně' },
          { id: 'r', kind: 'rain', from: 17, to: 19, label: 'Déšť' },
          { id: 'w', kind: 'waste', from: 20, label: 'Plasty' },
        ]}
      />
    ),
  },
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
            { key: 'name', title: 'Jméno', detail: 'Petra', state: 'done' },
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
  {
    id: 'presence-strip',
    name: 'PresenceStrip',
    summary:
      'Kdo je doma: čip na osobu se zelenou (doma) / červenou (pryč) tečkou – Dnes, kiosk, Rodina.',
    importName: 'PresenceStrip',
    states: ['doma', 'pryč', 'nevím (šedá, menší)', 'md', 'lg (kiosk)'],
    doText: 'Jen doma / pryč / nevím + jméno + barva avataru; stav vždy i textem a v aria-label.',
    dontText: 'Zóny, poloha, ETA, baterie, časová osa – vlastník chce jen jednoduchý indikátor.',
    notes: 'Bez osob nevykreslí nic. Data: usePeople(connection) z @homebrain/ha-client (živě).',
    render: () => (
      <div className="cat-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <PresenceStrip
          people={[
            { id: 'a', name: 'Jan', color: 'blue', status: 'home' },
            { id: 'b', name: 'Adámek', color: 'teal', status: 'away' },
            { id: 'c', name: 'Děda', color: 'indigo', status: 'unknown' },
          ]}
        />
        <PresenceStrip
          size="lg"
          people={[
            { id: 'd', name: 'Mamínka', color: 'pink', status: 'home' },
            { id: 'e', name: 'Babi', color: 'amber', status: 'away' },
          ]}
        />
      </div>
    ),
  },
  {
    id: 'progress-ring',
    name: 'ProgressRing',
    summary:
      'Kroužek průběhu / odpočtu živého zařízení (fritéza, minutky, hodnota signálu na Dnes).',
    importName: 'ProgressRing',
    states: ['accent', 'held (odpočet stojí)', 'ok (hotovo)', 'crit', 'muted'],
    doText: 'value = hotový podíl 0–1; čas jako obsah uprostřed (HTML, tabulární číslice).',
    dontText: 'Text uvnitř SVG; vlastní kopie kroužku v modulu.',
    notes: 'Bez `label` je dekorativní (aria-hidden). Modul tónuje přes --hb-ring-ink.',
    render: () => (
      <div className="cat-row">
        <ProgressRing value={0.55} size={112} thickness={8}>
          <b>8:42</b>
          <small>zbývá</small>
        </ProgressRing>
        <ProgressRing value={0.55} size={112} thickness={8} held tone="muted">
          <b>8:42</b>
          <small>stojí</small>
        </ProgressRing>
        <ProgressRing value={1} size={112} thickness={8} tone="ok">
          ✓
        </ProgressRing>
        <ProgressRing value={0.3} size={56} />
      </div>
    ),
  },
  {
    id: 'live-status',
    name: 'LiveStatus',
    summary: 'Velký živý stav probíhající akce zařízení (snímání, párování, test).',
    importName: 'LiveStatus',
    states: [
      'idle',
      'busy (točí se)',
      'busy + countdown (odpočet)',
      'steps (kompaktní kroky)',
      'ok',
      'error',
    ],
    doText:
      'Chyba = česky co se stalo + jedna rada, vedle tlačítko „Zkusit znovu“. Časové okno zařízení = `countdown` (kroužek se zbývajícími sekundami), fáze = `steps`.',
    dontText: 'Technické kódy chyb (timeout, modality_mismatch) bez překladu.',
    notes: 'role="status" + aria-live="polite". Na krátké uložení formuláře je SaveState.',
    render: () => (
      <div className="cat-col">
        <LiveStatus state="busy" title="Snímám pravou dlaň…">
          Držte v klidu, dokud se neozve potvrzení.
        </LiveStatus>
        <LiveStatus
          state="busy"
          title="Přibliž se"
          countdown={{ remaining: 17, total: 30 }}
          steps={[
            { key: 'cat-ready', title: 'Připraveno', state: 'done' },
            { key: 'cat-seen', title: 'Vidím', state: 'active' },
            { key: 'cat-scan', title: 'Snímám', state: 'todo' },
            { key: 'cat-save', title: 'Ukládám', state: 'todo' },
            { key: 'cat-done', title: 'Hotovo', state: 'todo' },
          ]}
        >
          Zápis: Jan · obličej – snímač něco vidí, ještě drobná korekce.
        </LiveStatus>
        <LiveStatus state="ok" title="Uloženo · ID 1003" />
        <LiveStatus state="error" title="Snímač uviděl něco jiného">
          Při zápisu dlaně zakryjte obličej dlaní.
        </LiveStatus>
      </div>
    ),
  },
];

function SwitchDemo() {
  const [on, setOn] = useState(true);
  const [warn, setWarn] = useState(false);
  return (
    <div className="cat-row">
      <Switch checked={on} onChange={setOn} label="Biometrické odemykání" />
      <Switch checked={warn} onChange={setWarn} tone="warn" label="Servisní režim" />
      <Switch checked={false} onChange={() => undefined} disabled label="Nedostupné" />
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
          title="Smazat Tomáš?"
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

const tokenGroups: Array<{ id: string; title: string; kind: string; tokens: string[] }> = [
  {
    id: 'colors',
    title: 'Barvy',
    kind: 'color',
    tokens: [
      '--hb-bg',
      '--hb-s1',
      '--hb-s2',
      '--hb-s3',
      '--hb-t1',
      '--hb-t2',
      '--hb-t3',
      '--hb-ac',
      '--hb-ok',
      '--hb-warn',
      '--hb-crit',
      '--hb-edge',
      '--hb-fill',
    ],
  },
  {
    id: 'map-colors',
    title: 'Barvy mapy robotů',
    kind: 'color',
    tokens: [
      '--hb-map-floor',
      '--hb-map-tone2',
      '--hb-map-tone3',
      '--hb-map-seam',
      '--hb-map-rim',
      '--hb-map-shade',
      '--hb-map-wall',
    ],
  },
  {
    id: 'spacing',
    title: 'Mezery',
    kind: 'space',
    tokens: [
      '--hb-sp-1',
      '--hb-sp-2',
      '--hb-sp-3',
      '--hb-sp-4',
      '--hb-sp-5',
      '--hb-sp-6',
      '--hb-sp-7',
      '--hb-sp-8',
    ],
  },
  {
    id: 'radius',
    title: 'Zaoblení',
    kind: 'radius',
    tokens: [
      '--hb-radius-xs',
      '--hb-radius-sm',
      '--hb-radius-md',
      '--hb-radius-lg',
      '--hb-radius-xl',
      '--hb-radius-pill',
    ],
  },
  {
    id: 'type',
    title: 'Typografie',
    kind: 'type',
    tokens: [
      '--hb-type-display',
      '--hb-type-headline',
      '--hb-type-title',
      '--hb-type-lead',
      '--hb-type-body',
      '--hb-type-caption',
      '--hb-type-axis',
    ],
  },
  {
    id: 'motion',
    title: 'Pohyb',
    kind: 'motion',
    tokens: ['--hb-dur-fast', '--hb-dur-base', '--hb-dur-slow', '--hb-ease-out', '--hb-ease'],
  },
];

/** Hodnotu tokenu čte z computed style v daném tématu (ref callback, ne stav). */
function TokenValue({ name }: { name: string }) {
  return (
    <code
      className="cat-val"
      ref={(el) => {
        if (el) el.textContent = getComputedStyle(el).getPropertyValue(name).trim() || '—';
      }}
    />
  );
}

function TokenSample({ kind, name }: { kind: string; name: string }) {
  const v = `var(${name})`;
  if (kind === 'color') return <span className="cat-swatch" style={{ background: v }} />;
  if (kind === 'space') return <span className="cat-bar" style={{ width: v }} />;
  if (kind === 'radius') return <span className="cat-radius" style={{ borderRadius: v }} />;
  if (kind === 'type')
    return (
      <span className="cat-type" style={{ fontSize: v }}>
        Příliš žluťoučký
      </span>
    );
  return <span className="cat-motion" style={{ transitionDuration: v }} />;
}

function Themed({ mode, children }: { mode: ThemeMode; children: ReactNode }) {
  const themes = mode === 'both' ? (['light', 'dark'] as const) : ([mode] as const);
  return (
    <div className="cat-panes" data-count={themes.length}>
      {themes.map((t) => (
        <div key={t} className="cat-pane" data-theme={t}>
          <span className="cat-pane-label">{t === 'light' ? 'Světlý' : 'Tmavý'}</span>
          {children}
        </div>
      ))}
    </div>
  );
}

export function Catalog() {
  const [mode, setMode] = useState<ThemeMode>('both');
  const toastTheme = mode === 'light' ? 'light' : 'dark';
  return (
    <div className="hb-catalog" data-testid="hb-catalog">
      <aside className="cat-nav" aria-label="Obsah katalogu">
        <p className="cat-brand">
          HomeBrain <span>Katalog</span>
        </p>
        <p className="cat-nav-h">Základy</p>
        {tokenGroups.map((g) => (
          <a key={g.id} href={`#${g.id}`}>
            {g.title}
          </a>
        ))}
        <p className="cat-nav-h">Komponenty ({specs.length})</p>
        {specs.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.name}
          </a>
        ))}
      </aside>
      <main className="cat-main">
        <header className="cat-head">
          <div>
            <h1>Katalog prvků a komponent</h1>
            <p>
              Sdílené primitivy z <code>@homebrain/ui</code> ve světlém i tmavém tématu. Pravidla
              textů a oznámení: <code>docs/ux/guidelines.md</code>.
            </p>
          </div>
          <div className="cat-seg" role="group" aria-label="Téma náhledů">
            {(['both', 'light', 'dark'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'both' ? 'Obě' : m === 'light' ? 'Světlé' : 'Tmavé'}
              </button>
            ))}
          </div>
        </header>

        <section className="cat-section" id="toast-live" aria-labelledby="toast-live-h">
          <h2 id="toast-live-h">Oznámení naživo</h2>
          <p className="cat-summary">
            Spouští skutečný <code>toast</code> → <code>&lt;Toaster /&gt;</code> (max 3, pauza při
            najetí myší, Esc/Tab dosáhne na akce).
          </p>
          <div className="cat-row">
            <button type="button" className="cat-btn" onClick={() => toast.success('Uloženo')}>
              toast.success
            </button>
            <button
              type="button"
              className="cat-btn"
              onClick={() =>
                toast.error('Nepodařilo se uložit', {
                  action: { label: 'Zkusit znovu', onAction: () => toast.success('Uloženo') },
                })
              }
            >
              toast.error
            </button>
            <button
              type="button"
              className="cat-btn"
              onClick={() => toast.info('Import dokončen', { description: 'Přidáno 12 vín' })}
            >
              toast.info
            </button>
            <button
              type="button"
              className="cat-btn"
              onClick={() =>
                toast.undo('Lahev odepsána', () => toast.info('Odpis vrácen'), { id: 'undo' })
              }
            >
              toast.undo
            </button>
            <button
              type="button"
              className="cat-btn"
              data-testid="cat-toast-stack"
              onClick={() => {
                toast.success('Hodnocení uloženo: 4 z 5', { id: 'a' });
                toast.undo('Lahev odepsána', () => undefined, { id: 'b' });
                toast.error('Nepodařilo se uložit', {
                  id: 'c',
                  description: 'Spojení s Home Assistantem se přerušilo',
                  action: { label: 'Zkusit znovu', onAction: () => undefined },
                });
              }}
            >
              Ukázat sadu
            </button>
          </div>
        </section>

        {tokenGroups.map((g) => (
          <section key={g.id} className="cat-section" id={g.id} aria-labelledby={`${g.id}-h`}>
            <h2 id={`${g.id}-h`}>{g.title}</h2>
            <Themed mode={mode}>
              <table className="cat-tokens">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Ukázka</th>
                    <th>Hodnota</th>
                  </tr>
                </thead>
                <tbody>
                  {g.tokens.map((t) => (
                    <tr key={t}>
                      <td>
                        <code>{t}</code>
                      </td>
                      <td>
                        <TokenSample kind={g.kind} name={t} />
                      </td>
                      <td>
                        <TokenValue name={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Themed>
          </section>
        ))}

        {specs.map((s) => (
          <section
            key={s.id}
            className="cat-section"
            id={s.id}
            aria-labelledby={`${s.id}-h`}
            data-testid="cat-component"
          >
            <h2 id={`${s.id}-h`}>{s.name}</h2>
            <p className="cat-summary">{s.summary}</p>
            <code className="cat-import">{`import { ${s.importName} } from '@homebrain/ui';`}</code>
            <Themed mode={mode}>{s.render()}</Themed>
            <div className="cat-meta">
              <div>
                <h3>Stavy</h3>
                <ul>
                  {s.states.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="cat-do">
                <h3>Ano</h3>
                <p>{s.doText}</p>
              </div>
              <div className="cat-dont">
                <h3>Ne</h3>
                <p>{s.dontText}</p>
              </div>
              <div>
                <h3>Poznámky</h3>
                <p>{s.notes}</p>
              </div>
            </div>
          </section>
        ))}
      </main>
      <div className="cat-toaster" data-theme={toastTheme}>
        <Toaster />
      </div>
    </div>
  );
}
