import { DayRibbon, HeroSignal, SignalCard, toast } from '@homebrain/ui';
import type { Spec } from '../types';

/** Signály pro Dnes a denní pás. */
export const signalSpecs: Spec[] = [
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
];
