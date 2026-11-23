import { useEffect, useState } from 'react';
import { Card } from '@homebrain/ui';
import type { HeatingApi } from '../../api.js';
import {
  changeSettingLabel,
  curveAt,
  fmtNum,
  fmtT,
  formatChangeValue,
  formatChangeWhen,
} from '../../model.js';
import type { HeatingChangeEntry, HeatingSnapshot } from '../../types.js';
import { CurveChart, ScheduleRibbon } from '../charts.js';
import { PoolFishCard, SettingsCard, WeekProgramsCard } from '../ModesCards.js';

function ChangesCard({ api }: { api: HeatingApi }) {
  const [rows, setRows] = useState<HeatingChangeEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!api.changes) return;
    void api.changes().then(setRows, () => setRows([]));
  }, [api]);
  const visible = expanded ? rows.slice(0, 200) : rows.slice(0, 10);
  if (!rows.length) return null;
  return (
    <Card className="ht-card" data-testid="heating-changes-card">
      <header className="ht-ch">
        <h3>Změny nastavení</h3>
      </header>
      <ul className="ht-changes">
        {visible.map((e) => (
          <li key={`${e.ts}-${e.key}`}>
            <span className="ht-change-line">
              <span className="ht-change-when">{formatChangeWhen(e.ts)}</span>
              <span className="ht-muted" aria-hidden="true">
                {' · '}
              </span>
              <span className="ht-change-label">{changeSettingLabel(e)}:</span>{' '}
              <span className="ht-change-values">
                {formatChangeValue(e.old, e.key)} → {formatChangeValue(e.new, e.key)}
              </span>
            </span>
            {e.late && (
              <span className="ht-change-late">
                zjištěno později – změna proběhla mimo HomeBrain, čas je přibližný
              </span>
            )}
          </li>
        ))}
      </ul>
      {rows.length > 10 && (
        <button type="button" className="ht-link" onClick={() => setExpanded((x) => !x)}>
          {expanded ? 'Zobrazit méně' : 'Zobrazit vše'}
        </button>
      )}
      <p className="ht-muted">Regulace sama nezaznamenává, kdo změnu udělal.</p>
    </Card>
  );
}

export function ModesTab({ snap, api }: { snap: HeatingSnapshot; api: HeatingApi }) {
  const out = snap.curve.outdoor_now ?? snap.outdoor.temp;
  const y = out === null ? null : curveAt(snap.curve.points, out);
  const d = new Date();
  const mode = snap.mode;
  const rows: Array<[string, string, boolean | null]> = [
    [
      'Sezóna',
      `${mode.season === 'winter' ? 'zima (topení)' : mode.season === 'summer' ? 'léto (jen teplá voda)' : 'neznámá'}${mode.auto_season ? ' · přepíná se samo' : ''}`,
      null,
    ],
    [
      'Hlavní vypínač',
      mode.main_switch === null ? 'neznámo' : mode.main_switch ? 'zapnuto' : 'vypnuto',
      mode.main_switch,
    ],
    [
      'Útlum',
      mode.setback_active === null ? 'neznámo' : mode.setback_active ? 'právě běží' : 'teď ne',
      mode.setback_active,
    ],
    [
      'Tarif (HDO)',
      mode.hdo_low_tariff === null ? 'neznámý' : mode.hdo_low_tariff ? 'nízký' : 'vysoký',
      mode.hdo_low_tariff,
    ],
  ];
  return (
    <>
      <p className="ht-lock" data-testid="heating-readonly">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" />
          <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>{' '}
        Jen pro čtení. Úpravy teplot a programů přidáme později – bezpečně a s potvrzením.
      </p>
      <div className="ht-row">
        <Card className="ht-card ht-grow" data-testid="heating-curve-card">
          <header className="ht-ch">
            <h3>Ekvitermní křivka</h3>
            <span className="ht-muted">cíl nádrže podle venkovní teploty</span>
          </header>
          <CurveChart
            points={snap.curve.points}
            now={out !== null && y !== null ? { x: out, y } : null}
          />
          {out !== null && y !== null && (
            <p className="ht-insight">
              Venku je {fmtT(out)}, takže regulace chce v nádrži {fmtT(y, 0)}
              {snap.tank.hysteresis !== null
                ? ` – kompresor naskočí pod ${fmtT(y, 0)} a nahřívá do ${fmtT(y + snap.tank.hysteresis, 0)}`
                : ''}
              . Čím je venku chladněji, tím teplejší voda jde do radiátorů.
            </p>
          )}
        </Card>
        <Card className="ht-card ht-side" data-testid="heating-modes">
          <header className="ht-ch">
            <h3>Režimy</h3>
          </header>
          <ul className="ht-kv">
            {rows.map(([k, v, flag]) => (
              <li key={k}>
                <span>{k}</span>
                <b data-on={flag === true ? '' : undefined}>{v}</b>
              </li>
            ))}
            <li>
              <span>Teplá voda</span>
              <b>
                cíl {fmtT(snap.dhw.target, 0)}, dohřev pod {fmtT(snap.dhw.reheat_below, 0)}
              </b>
            </li>
            <li>
              <span>Doma (chodba)</span>
              <b>
                cíl {fmtT(snap.house.ref_target)} ± {fmtNum(snap.house.hysteresis)}
                {'\u202f°C'}
              </b>
            </li>
          </ul>
        </Card>
      </div>
      <SettingsCard snap={snap} />
      {snap.schedules.every((s) => !s.week) && snap.schedules.length ? (
        // older backend without the weekly program: today's ribbon only
        <Card className="ht-card">
          <header className="ht-ch">
            <h3>Programy</h3>
            <span className="ht-muted">týdenní program, dnes</span>
          </header>
          <ScheduleRibbon schedules={snap.schedules} nowMin={d.getHours() * 60 + d.getMinutes()} />
        </Card>
      ) : (
        <WeekProgramsCard snap={snap} now={d} />
      )}
      <PoolFishCard snap={snap} now={d} />
      <ChangesCard api={api} />
    </>
  );
}
