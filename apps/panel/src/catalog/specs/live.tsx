import { LiveStatus, PresenceStrip, ProgressRing } from '@homebrain/ui';
import type { Spec } from '../types';

/** Přítomnost a živý stav zařízení. */
export const liveSpecs: Spec[] = [
  {
    id: 'presence-strip',
    name: 'PresenceStrip',
    summary:
      'Kdo je doma: čip na osobu se zelenou (doma) / červenou (pryč) tečkou – Dnes, kiosk, Rodina.',
    importName: 'PresenceStrip',
    states: ['doma', 'pryč', 'neznámo (šedá)', 'md', 'lg (kiosk)'],
    doText: 'Jen doma / pryč / neznámo + jméno + barva avataru; stav vždy i textem a v aria-label.',
    dontText: 'Zóny, poloha, ETA, baterie, časová osa – vlastník chce jen jednoduchý indikátor.',
    notes: 'Bez osob nevykreslí nic. Data: usePeople(connection) z @homebrain/ha-client (živě).',
    render: () => (
      <div className="cat-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <PresenceStrip
          people={[
            { id: 'a', name: 'Marek', color: 'blue', status: 'home' },
            { id: 'b', name: 'Kuba', color: 'teal', status: 'away' },
            { id: 'c', name: 'Děda', color: 'slate', status: 'unknown' },
          ]}
        />
        <PresenceStrip
          size="lg"
          people={[
            { id: 'd', name: 'Lucie', color: 'pink', status: 'home' },
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
          Zápis: Marek · obličej – snímač něco vidí, ještě drobná korekce.
        </LiveStatus>
        <LiveStatus state="ok" title="Uloženo · ID 1003" />
        <LiveStatus state="error" title="Snímač uviděl něco jiného">
          Při zápisu dlaně zakryjte obličej dlaní.
        </LiveStatus>
      </div>
    ),
  },
];
